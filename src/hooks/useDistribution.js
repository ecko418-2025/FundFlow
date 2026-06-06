import { useState } from "react";
import { querySQL } from "../lib/db";
import { writeAuditLog } from "../lib/audit";

export function useDistribution() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 获取某资金池的分配历史
   */
  const getDistributions = async (poolId) => {
    let sql = `
      SELECT d.*, p.name AS project_name, p.code AS project_code, pl.name AS pool_name, pl.contract_no AS pool_code
      FROM distributions d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN pools pl ON d.pool_id = pl.id
    `;
    const params = [];
    if (poolId) {
      sql += ` WHERE d.pool_id = ? 
                 OR d.project_id IN (SELECT id FROM projects WHERE pool_id = ?)
                 OR d.id IN (SELECT distribution_id FROM distribution_items WHERE investor_id = ?)`;
      params.push(poolId, poolId, poolId);
    }
    sql += ` ORDER BY d.distribution_date DESC, d.created_at DESC`;
    return await querySQL(sql, params);
  };

  /**
   * 获取单笔分配的详细项 (distribution_items)
   */
  const getDistributionDetails = async (distId) => {
    const sql = `
      SELECT di.*, COALESCE(i.name, pl.name) AS investor_name 
      FROM distribution_items di
      LEFT JOIN investors i ON di.investor_id = i.id
      LEFT JOIN pools pl ON di.investor_id = pl.id
      WHERE di.distribution_id = ?
    `;
    return await querySQL(sql, [distId]);
  };

  /**
   * 提交分配方案（待审核或确认）
   */
  const createDistribution = async (dist, items) => {
    setLoading(true);
    setError(null);
    try {
      const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
      const distId = `DIST-${Date.now()}-${entropy}`;
      
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
        dist.status, // pending / confirmed / rejected
        isConfirmed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null
      ]);

      // 2. 插入分配明细项
      for (const item of items) {
        const itemId = `DI-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
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

      }

      // 不再自动扣减或增加任何实体（池子、项目）的真实余额。仅作为分配台账记录。

      await writeAuditLog({
        actor: dist.actor,
        action: "create",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        targetLabel: dist.description || distId,
        status: "success",
        message: dist.status === "pending" ? "提交收益分配方案（待审核）" : "创建收益分配方案（已确认）",
        afterData: { id: distId, ...dist, items },
        requestPayload: dist
      });

      return distId;
    } catch (err) {
      console.error("创建分配失败:", err);
      await writeAuditLog({
        actor: dist.actor,
        action: "create",
        module: "distributions",
        targetType: "distribution",
        status: "failure",
        message: "创建收益分配方案失败",
        requestPayload: { ...dist, items },
        errorMessage: err.message
      });
      setError(err.message || "创建分配记录失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const approveDistribution = async (distId, actor) => {
    setLoading(true);
    setError(null);
    try {
      const before = await querySQL(`SELECT * FROM distributions WHERE id = ?`, [distId]);
      const dist = before[0] || {};
      await querySQL(
        `UPDATE distributions SET status = 'confirmed', confirmed_at = ? WHERE id = ?`,
        [new Date().toISOString().slice(0, 19).replace('T', ' '), distId]
      );
      await writeAuditLog({
        actor,
        action: "approve",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        targetLabel: dist.description || distId,
        status: "success",
        message: "审核通过收益分配方案",
        beforeData: dist,
        afterData: { ...dist, status: "confirmed" }
      });
      return true;
    } catch (err) {
      console.error("审核分配失败:", err);
      await writeAuditLog({
        actor,
        action: "approve",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        status: "failure",
        message: "审核收益分配方案失败",
        errorMessage: err.message
      });
      setError(err.message || "审核分配失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const rejectDistribution = async (distId, actor) => {
    setLoading(true);
    setError(null);
    try {
      const before = await querySQL(`SELECT * FROM distributions WHERE id = ?`, [distId]);
      const dist = before[0] || {};
      await querySQL(
        `UPDATE distributions SET status = 'rejected', confirmed_at = NULL WHERE id = ?`,
        [distId]
      );
      await writeAuditLog({
        actor,
        action: "reject",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        targetLabel: dist.description || distId,
        status: "success",
        message: "驳回收益分配方案",
        beforeData: dist,
        afterData: { ...dist, status: "rejected" }
      });
      return true;
    } catch (err) {
      console.error("驳回分配失败:", err);
      await writeAuditLog({
        actor,
        action: "reject",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        status: "failure",
        message: "驳回收益分配方案失败",
        errorMessage: err.message
      });
      setError(err.message || "驳回分配失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteDistribution = async (distId, actor) => {
    setLoading(true);
    setError(null);
    try {
      const before = await querySQL(`SELECT * FROM distributions WHERE id = ?`, [distId]);
      const items = await querySQL(`SELECT * FROM distribution_items WHERE distribution_id = ?`, [distId]);
      await querySQL(`DELETE FROM distribution_items WHERE distribution_id = ?`, [distId]);
      await querySQL(`DELETE FROM distributions WHERE id = ?`, [distId]);
      await writeAuditLog({
        actor,
        action: "delete",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        targetLabel: before[0]?.description || distId,
        status: "success",
        message: "删除收益分配方案",
        beforeData: { distribution: before[0], items }
      });
      return true;
    } catch (err) {
      console.error("删除分配记录失败:", err);
      await writeAuditLog({
        actor,
        action: "delete",
        module: "distributions",
        targetType: "distribution",
        targetId: distId,
        status: "failure",
        message: "删除收益分配方案失败",
        errorMessage: err.message
      });
      setError(err.message || "删除分配记录失败");
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
    createDistribution,
    approveDistribution,
    rejectDistribution,
    deleteDistribution
  };
}
export default useDistribution;
