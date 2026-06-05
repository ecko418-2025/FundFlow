import { useState, useEffect, useCallback } from "react";
import { querySQL } from "../lib/db";

export function usePools() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await querySQL("SELECT * FROM pools ORDER BY created_at DESC");
      setPools(data);
    } catch (err) {
      setError(err.message || "获取资金池失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  /**
   * 获取资金池详情，包括关联的直接成员、项目以及池间投资
   */
  const getPoolDetail = async (poolId) => {
    try {
      // 1. 获取基本信息
      const poolInfoResult = await querySQL("SELECT * FROM pools WHERE id = ?", [poolId]);
      if (poolInfoResult.length === 0) {
        throw new Error("资金池不存在");
      }
      const pool = poolInfoResult[0];

      // 2. 获取直接成员列表 (pool_members)
      const members = await querySQL(
        `SELECT pm.*, i.name AS investor_name, i.type AS investor_type 
         FROM pool_members pm 
         JOIN investors i ON pm.investor_id = i.id 
         WHERE pm.pool_id = ?`,
         [poolId]
      );

      // 3. 获取池下的项目 (projects)
      const projects = await querySQL(
        "SELECT * FROM projects WHERE pool_id = ? ORDER BY created_at DESC",
        [poolId]
      );

      // 4. 获取作为母池，对外投资的子池 (pool_investments -> child_pools)
      let childInvestments = await querySQL(
        `SELECT pi.*, p.name AS child_pool_name 
         FROM pool_investments pi 
         JOIN pools p ON pi.child_pool_id = p.id 
         WHERE pi.parent_pool_id = ?`,
         [poolId]
      );

      // 5. 获取作为子池，接受哪些母池的投资 (pool_investments -> parent_pools)
      let parentInvestments = await querySQL(
        `SELECT pi.*, p.name AS parent_pool_name 
         FROM pool_investments pi 
         JOIN pools p ON pi.parent_pool_id = p.id 
         WHERE pi.child_pool_id = ?`,
         [poolId]
      );

      // 6. 动态计算层级流水的实际到账和占比
      const allTxs = await querySQL("select t.*, p.name as pool_name from transactions t join pools p on t.pool_id = p.id left join projects pr on t.project_id = pr.id");
      
      const getTotalReceived = (pid) => {
        return allTxs.filter(t => t.pool_id === pid && t.direction === 'in' && (t.type === 'capital_call' || t.type === 'pool_transfer_in'))
                     .reduce((sum, t) => sum + Number(t.amount), 0);
      };

      childInvestments = childInvestments.map(pi => {
        const childTotal = getTotalReceived(pi.child_pool_id);
        const actualInvested = allTxs.filter(t => t.pool_id === pi.child_pool_id && t.type === 'pool_transfer_in' && t.related_pool_id === pi.parent_pool_id)
                                     .reduce((sum, t) => sum + Number(t.amount), 0);
        return {
          ...pi,
          actual_invested_amount: actualInvested,
          dynamic_share_pct: childTotal > 0 ? (actualInvested / childTotal * 100) : 0
        };
      });

      parentInvestments = parentInvestments.map(pi => {
        const myTotal = getTotalReceived(poolId);
        const actualReceived = allTxs.filter(t => t.pool_id === poolId && t.type === 'pool_transfer_in' && t.related_pool_id === pi.parent_pool_id)
                                     .reduce((sum, t) => sum + Number(t.amount), 0);
        return {
          ...pi,
          actual_invested_amount: actualReceived,
          dynamic_share_pct: myTotal > 0 ? (actualReceived / myTotal * 100) : 0
        };
      });

      return {
        pool,
        members,
        projects,
        childInvestments,
        parentInvestments
      };
    } catch (err) {
      console.error("获取资金池详情失败:", err);
      throw err;
    }
  };

  /**
   * 创建新的资金池
   */
  const createPool = async (pool) => {
    const id = pool.id || `pool-${Date.now()}`;
    const sql = `
      INSERT INTO pools (id, name, description, total_committed, available_balance, type, start_date, end_date, created_by, contract_no)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      id,
      pool.name,
      pool.description || "",
      pool.totalCommitted || 0,
      pool.totalCommitted || 0, // 初始可用余额等于总认缴
      pool.type || "capital",
      pool.startDate || null,
      pool.endDate || null,
      pool.createdBy || "admin",
      pool.contractNo || ""
    ];
    await querySQL(sql, params);

    // 同步写入 investors 表镜像行（共享主键，type='pool'）
    // 使用 INSERT IGNORE 防止重复插入（幂等）
    await querySQL(
      `INSERT IGNORE INTO investors (id, name, type, note)
       VALUES (?, ?, 'pool', ?)`,
      [id, pool.name, pool.description || ""]
    );

    await fetchPools();
    return id;
  };

  /**
   * 配置池间投资关系（大池投小池）
   */
  const addPoolInvestment = async (investment) => {
    const id = `pi-${Date.now()}`;
    const sql = `
      INSERT INTO pool_investments (id, parent_pool_id, child_pool_id, invested_amount, share_pct, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      id,
      investment.parentPoolId,
      investment.childPoolId,
      investment.investedAmount,
      investment.sharePct !== undefined && investment.sharePct !== null ? investment.sharePct : 0,
      investment.note || ""
    ];
    await querySQL(sql, params);
  };

  /**
   * 更新资金池基本信息（不含 available_balance，余额只通过流水变化）
   */
  const updatePool = async (poolId, updates) => {
    const sql = `
      UPDATE pools
      SET name = ?, description = ?, total_committed = ?, type = ?, start_date = ?, end_date = ?, contract_no = ?, status = ?
      WHERE id = ?
    `;
    const params = [
      updates.name,
      updates.description || "",
      updates.totalCommitted,
      updates.type,
      updates.startDate || null,
      updates.endDate || null,
      updates.contractNo || "",
      updates.status || "active",
      poolId
    ];
    await querySQL(sql, params);

    // 同步更新 investors 镜像行名称（若池子改名则镜像行也跟着改）
    await querySQL(
      `UPDATE investors SET name = ?, note = ? WHERE id = ? AND type = 'pool'`,
      [updates.name, updates.description || "", poolId]
    );

    await fetchPools();
  };

  /**
   * 添加直接出资人到资金池（个人/机构 LP → pool_members）
   * 持股比例由实缴流水自动计算，不在此处存储
   */
  const addPoolMember = async ({ poolId, investorId, committedAmount }) => {
    const id = `pm-${Date.now()}`;
    const sql = `
      INSERT INTO pool_members (id, pool_id, investor_id, committed_amount, called_amount, share_pct, status)
      VALUES (?, ?, ?, ?, 0, 0, 'active')
    `;
    await querySQL(sql, [id, poolId, investorId, committedAmount]);
  };

  /**
   * 更新直接出资人的认缴参考金额（持股比例由实缴数据自动计算，不存储）
   */
  const updatePoolMember = async (poolId, investorId, { committedAmount }) => {
    const sql = `
      UPDATE pool_members
      SET committed_amount = ?
      WHERE pool_id = ? AND investor_id = ?
    `;
    await querySQL(sql, [committedAmount, poolId, investorId]);
  };

  return {
    pools,
    loading,
    error,
    fetchPools,
    getPoolDetail,
    createPool,
    addPoolInvestment,
    addPoolMember,
    updatePool,
    updatePoolMember
  };
}
export default usePools;
