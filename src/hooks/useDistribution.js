import { useState } from "react";
import { querySQL } from "../lib/db";

export function useDistribution() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 获取某资金池的分配历史
   */
  const getDistributions = async (poolId) => {
    const sql = `
      SELECT d.*, p.name AS project_name 
      FROM distributions d
      LEFT JOIN projects p ON d.project_id = p.id
      WHERE d.pool_id = ?
      ORDER BY d.distribution_date DESC, d.created_at DESC
    `;
    return await querySQL(sql, [poolId]);
  };

  /**
   * 获取单笔分配的详细项 (distribution_items)
   */
  const getDistributionDetails = async (distId) => {
    const sql = `
      SELECT di.*, i.name AS investor_name 
      FROM distribution_items di
      JOIN investors i ON di.investor_id = i.id
      WHERE di.distribution_id = ?
    `;
    return await querySQL(sql, [distId]);
  };

  /**
   * 提交分配方案（草稿或确认）
   */
  const createDistribution = async (dist, items) => {
    setLoading(true);
    setError(null);
    try {
      const distId = `dist-${Date.now()}`;
      
      // 1. 插入分配主表
      const sqlInsertDist = `
        INSERT INTO distributions (id, pool_id, project_id, total_amount, distribution_date, description, status, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const isConfirmed = dist.status === "confirmed";
      await querySQL(sqlInsertDist, [
        distId,
        dist.poolId,
        dist.projectId || null,
        dist.totalAmount,
        dist.distributionDate,
        dist.description || "",
        dist.status, // draft / confirmed
        isConfirmed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null
      ]);

      // 2. 插入分配明细项
      for (const item of items) {
        const itemId = `di-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const sqlInsertItem = `
          INSERT INTO distribution_items (
            id, distribution_id, investor_id, direct_share_pct, indirect_share_pct, effective_share_pct, amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await querySQL(sqlInsertItem, [
          itemId,
          distId,
          item.investor_id,
          item.direct_share || 0,
          item.indirect_share || 0,
          item.effective_share || 0,
          item.amount
        ]);

        // 3. 如果是立即确认状态，自动为每位出资人生成一条收益分配流入流水(direction='out'，因为是钱离开大池分给个人)
        if (isConfirmed) {
          const txId = `tx-dist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const txSql = `
            INSERT INTO transactions (
              id, pool_id, project_id, investor_id, type, direction, amount, date, description, created_by
            ) VALUES (?, ?, ?, ?, 'distribution', 'out', ?, ?, ?, 'admin')
          `;
          await querySQL(txSql, [
            txId,
            dist.poolId,
            dist.projectId || null,
            item.investor_id,
            item.amount,
            dist.distributionDate,
            `收益分配: ${dist.description || "按份额比例分配"}`
          ]);
        }
      }

      // 4. 如果是确认分配，自动扣减该池子的可用余额 available_balance
      if (isConfirmed) {
        await querySQL(
          "UPDATE pools SET available_balance = available_balance - ? WHERE id = ?",
          [dist.totalAmount, dist.poolId]
        );
      }

      return distId;
    } catch (err) {
      console.error("创建分配失败:", err);
      setError(err.message || "创建分配记录失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    getDistributions,
    getDistributionDetails,
    createDistribution
  };
}
export default useDistribution;
