import { useState, useCallback } from "react";
import { querySQL } from "../lib/db";

export function useEffectiveShares() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const calculateShares = useCallback(async (poolId) => {
    if (!poolId) return [];
    setLoading(true);
    setError(null);
    try {
      const sql = `
        WITH RECURSIVE pool_hierarchy AS (
            -- 1. 锚点部分：目标池子本身，路径乘数初始为 1.0，层级设为 0
            SELECT 
                id AS pool_id, 
                CAST(1.0 AS DECIMAL(16,10)) AS path_multiplier,
                0 AS lvl
            FROM pools 
            WHERE id = ?

            UNION ALL

            -- 2. 递归部分：查找投资了当前层级池子的 active 母池 (通过 pool_members 关联，且 investor 的 type 为 'pool')
            SELECT 
                pm.investor_id AS pool_id,
                CAST(ph.path_multiplier * (pm.share_pct / 100.0) AS DECIMAL(16,10)) AS path_multiplier,
                ph.lvl + 1 AS lvl
            FROM pool_members pm
            JOIN investors i ON pm.investor_id = i.id
            JOIN pool_hierarchy ph ON pm.pool_id = ph.pool_id
            WHERE pm.status = 'active'
              AND i.type = 'pool'
              AND ph.lvl < 3 -- 限制最多穿透 3 层（孙池→子池→母池）
        )
        -- 3. 汇总所有持股路径，按投资者维度进行累加
        SELECT 
            pm.investor_id,
            i.name AS investor_name,
            -- 直接份额：仅在目标池中直接持有的份额
            SUM(CASE WHEN ph.pool_id = ? THEN pm.share_pct ELSE 0.0000 END) AS direct_share,
            -- 间接份额：从所有母池/祖父池路径折算过来的份额之和
            SUM(CASE WHEN ph.pool_id <> ? THEN pm.share_pct * ph.path_multiplier ELSE 0.0000 END) AS indirect_share,
            -- 最终有效分配份额 = 直接份额 + 所有路径的折算间接份额
            SUM(pm.share_pct * ph.path_multiplier) AS effective_share
        FROM pool_hierarchy ph
        JOIN pool_members pm ON pm.pool_id = ph.pool_id
        JOIN investors i ON i.id = pm.investor_id
        WHERE pm.status = 'active'
        GROUP BY pm.investor_id, i.name
        ORDER BY effective_share DESC;
      `;
      
      // 注意：上面的 SQL 查询中包含了 3 个占位符。
      // 第一个在递归 CTE 内部，第二、第三个在外部的 SUM() 中。
      // 所以参数数组需要是 [poolId, poolId, poolId]。
      const data = await querySQL(sql, [poolId, poolId, poolId]);
      setShares(data);
      return data;
    } catch (err) {
      console.error("计算有效份额失败:", err);
      setError(err.message || "计算有效份额失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    shares,
    loading,
    error,
    calculateShares
  };
}
export default useEffectiveShares;
