import { useState, useCallback } from "react";
import { querySQL } from "../lib/db";

export function useShareCalculator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateShares = useCallback(async (targetType, targetId, isPenetrate) => {
    if (!targetId) return [];
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch all necessary edges and nodes
      const [
        poolMembers,
        projectInvestors,
        approvedTransactions,
        investors,
        pools
      ] = await Promise.all([
        querySQL(`SELECT * FROM pool_members WHERE status = 'active'`),
        querySQL(`SELECT * FROM project_investors WHERE status = 'active'`),
        querySQL(`SELECT * FROM transactions t WHERE t.status = 'approved'`),
        querySQL(`SELECT * FROM investors`),
        querySQL(`SELECT * FROM pools`)
      ]);

      const investorMap = new Map(investors.map(i => [i.id, i.name]));
      const poolMap = new Map(pools.map(p => [p.id, p.name]));
      // 机构池 ID 集合，用于判断是否需要继续向上穿透
      const poolIds = new Set(pools.map(p => p.id));

      const getEntityName = (id) => {
        return investorMap.get(id) || poolMap.get(id) || "未知实体";
      };

      const getPoolMemberShares = (poolId) => {
        const members = poolMembers.filter(pm => pm.pool_id === poolId);
        const calledByInvestor = new Map();
        approvedTransactions
          .filter(tx => (
            tx.pool_id === poolId &&
            ["capital_call", "pool_transfer_in"].includes(tx.type)
          ))
          .forEach(tx => {
            const investorId = tx.investor_id || tx.related_pool_id;
            if (!investorId) return;
            calledByInvestor.set(investorId, (calledByInvestor.get(investorId) || 0) + Number(tx.amount || 0));
          });
        const liveTotalCalled = [...calledByInvestor.values()].reduce((sum, amount) => sum + amount, 0);
        const storedTotalCalled = members.reduce((sum, pm) => sum + Number(pm.called_amount || 0), 0);
        return members.map(pm => ({
          ...pm,
          calculated_share: liveTotalCalled > 0
            ? (Number(calledByInvestor.get(pm.investor_id) || 0) / liveTotalCalled) * 100
            : storedTotalCalled > 0
              ? (Number(pm.called_amount || 0) / storedTotalCalled) * 100
              : Number(pm.share_pct || 0)
        }));
      };

      const getProjectInvestorShares = (projectId) => {
        const rows = projectInvestors.filter(pi => pi.project_id === projectId);
        const investedByInvestor = new Map();
        approvedTransactions
          .filter(tx => tx.project_id === projectId && tx.type === "investment")
          .forEach(tx => {
            if (!tx.investor_id) return;
            investedByInvestor.set(tx.investor_id, (investedByInvestor.get(tx.investor_id) || 0) + Number(tx.amount || 0));
          });
        const liveTotalInvested = [...investedByInvestor.values()].reduce((sum, amount) => sum + amount, 0);
        const storedTotalInvested = rows.reduce((sum, pi) => sum + Number(pi.invested_amount || 0), 0);
        return rows.map(pi => ({
          ...pi,
          calculated_share: liveTotalInvested > 0
            ? (Number(investedByInvestor.get(pi.investor_id) || 0) / liveTotalInvested) * 100
            : storedTotalInvested > 0
              ? (Number(pi.invested_amount || 0) / storedTotalInvested) * 100
              : 0
        })).filter(pi => Number(pi.calculated_share || 0) > 0);
      };

      // 2. Determine initial direct allocations
      let allocations = []; // { id, share, type: 'investor' | 'pool' }

      if (targetType === "project") {
        const pInv = getProjectInvestorShares(targetId);
        if (pInv.length === 0) throw new Error("该项目当前无已审核实缴资金，无法分配");

        allocations = pInv.map(pi => {
          // investor_id in project_investors can be pool or investor
          const type = poolIds.has(pi.investor_id) ? 'pool' : 'investor';
          return { id: pi.investor_id, share: Number(pi.calculated_share || 0), type };
        });
      } else if (targetType === "pool") {
        // 直接出资方现在统一在 pool_members 中（包括母池）
        const pMembers = getPoolMemberShares(targetId);
        
        allocations = pMembers.map(pm => ({ 
          id: pm.investor_id, 
          share: Number(pm.calculated_share || 0), 
          type: poolIds.has(pm.investor_id) ? 'pool' : 'investor' 
        }));
      }

      // 3. Process penetration if needed
      if (!isPenetrate) {
        // Just return the direct allocations
        return allocations.map(a => ({
          investor_id: a.id,
          investor_name: getEntityName(a.id),
          entity_type: a.type,
          direct_share: a.share,
          indirect_share: 0,
          effective_share: a.share
        })).filter(a => a.effective_share > 0);
      }

      // Penetration mode: Resolve pools down to individual investors
      let finalShares = new Map(); // entity_id -> { direct, indirect, type }

      const addFinalShare = (id, share, isDirectLevel, type = "investor") => {
        const existing = finalShares.get(id) || { direct: 0, indirect: 0, type };
        existing.type = type;
        if (isDirectLevel) {
          existing.direct += share;
        } else {
          existing.indirect += share;
        }
        finalShares.set(id, existing);
      };

      // Helper for recursive traversal
      const penetratePool = (poolId, currentMultiplier, isDirectLevel) => {
        // Find direct members of this pool (could be individuals or parent pools)
        const pMembers = getPoolMemberShares(poolId);
        const hasSplittableMembers = pMembers.some(pm => Number(pm.calculated_share || 0) > 0);
        if (!hasSplittableMembers) {
          addFinalShare(poolId, currentMultiplier * 100, isDirectLevel, "pool");
          return;
        }
        for (const pm of pMembers) {
          const rawShare = Number(pm.calculated_share || 0) * currentMultiplier;
          if (rawShare > 0) {
            if (poolIds.has(pm.investor_id)) {
              // 是母池，继续递归
              penetratePool(pm.investor_id, rawShare / 100.0, false);
            } else {
              // 是最终投资者
              addFinalShare(pm.investor_id, rawShare, isDirectLevel, "investor");
            }
          }
        }
      };

      // Process initial allocations
      for (const alloc of allocations) {
        if (alloc.type === 'investor') {
          addFinalShare(alloc.id, alloc.share, true, "investor");
        } else if (alloc.type === 'pool') {
          // It's a pool, penetrate it. 
          penetratePool(alloc.id, alloc.share / 100.0, false);
        }
      }

      // Format output
      const result = [];
      for (const [id, shares] of finalShares.entries()) {
        const effective = shares.direct + shares.indirect;
        if (effective > 0) {
          result.push({
            investor_id: id,
            investor_name: getEntityName(id),
            entity_type: shares.type || "investor",
            direct_share: shares.direct,
            indirect_share: shares.indirect,
            effective_share: effective
          });
        }
      }
      
      // Sort by effective share descending
      return result.sort((a, b) => b.effective_share - a.effective_share);

    } catch (err) {
      console.error("计算有效份额失败:", err);
      setError(err.message || "计算有效份额失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    calculateShares
  };
}
export default useShareCalculator;
