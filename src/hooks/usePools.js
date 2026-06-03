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
      const childInvestments = await querySQL(
        `SELECT pi.*, p.name AS child_pool_name 
         FROM pool_investments pi 
         JOIN pools p ON pi.child_pool_id = p.id 
         WHERE pi.parent_pool_id = ?`,
         [poolId]
      );

      // 5. 获取作为子池，接受哪些母池的投资 (pool_investments -> parent_pools)
      const parentInvestments = await querySQL(
        `SELECT pi.*, p.name AS parent_pool_name 
         FROM pool_investments pi 
         JOIN pools p ON pi.parent_pool_id = p.id 
         WHERE pi.child_pool_id = ?`,
         [poolId]
      );

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
    const id = `pool-${Date.now()}`;
    const sql = `
      INSERT INTO pools (id, name, description, total_committed, available_balance, type, start_date, end_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      pool.createdBy || "admin"
    ];
    await querySQL(sql, params);
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
      investment.sharePct,
      investment.note || ""
    ];
    await querySQL(sql, params);
  };

  return {
    pools,
    loading,
    error,
    fetchPools,
    getPoolDetail,
    createPool,
    addPoolInvestment
  };
}
export default usePools;
