import { useState, useCallback } from "react";
import { querySQL } from "../lib/db";

export function useTransactions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 查询所有流水
   */
  const getTransactions = async (filters = {}) => {
    let sql = `
      SELECT t.*, p.name AS pool_name, pr.name AS project_name,
             i.name AS investor_name, rp.name AS related_pool_name 
      FROM transactions t
      LEFT JOIN pools p ON t.pool_id = p.id
      LEFT JOIN pools rp ON t.related_pool_id = rp.id
      LEFT JOIN projects pr ON t.project_id = pr.id
      LEFT JOIN investors i ON t.investor_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.poolId) {
      sql += " AND t.pool_id = ?";
      params.push(filters.poolId);
    }
    if (filters.projectId) {
      sql += " AND t.project_id = ?";
      params.push(filters.projectId);
    }
    if (filters.investorId) {
      sql += " AND t.investor_id = ?";
      params.push(filters.investorId);
    }
    if (filters.type) {
      sql += " AND t.type = ?";
      params.push(filters.type);
    }

    sql += " ORDER BY t.date DESC, t.created_at DESC";
    return await querySQL(sql, params);
  };

  /**
   * 记录流水（并在底层自动处理资金池余额或项目投入的变化）
   */
  const createTransaction = async (tx) => {
    setLoading(true);
    setError(null);
    try {
      // 增强型流水 ID：TX + 年月日 + 6位高精度随机码
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
      const txId = `TX${dateStr}${entropy}`;
      
      // 1. 插入流水记录
      const sqlInsert = `
        INSERT INTO transactions (
          id, pool_id, project_id, investor_id, related_pool_id, type, direction, amount, date, description, reference_no, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const paramsInsert = [
        txId,
        tx.poolId,
        tx.projectId || null,
        tx.investorId || null,
        tx.relatedPoolId || null,
        tx.type,
        tx.direction,
        tx.amount,
        tx.date,
        tx.description || "",
        tx.referenceNo || "",
        tx.createdBy || "admin"
      ];
      await querySQL(sqlInsert, paramsInsert);

      // 2. 重算关联资金池的 available_balance 余额
      if (tx.poolId) {
        await querySQL(
          `UPDATE pools SET
             available_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) FROM transactions WHERE pool_id = ?), 0)
           WHERE id = ?`,
          [tx.poolId, tx.poolId]
        );
      }

      // 3. 自动补全缺失的出资方名单 (项目直投)
      if (tx.projectId && tx.investorId && tx.type === 'investment') {
        const piExisting = await querySQL(
          "SELECT id FROM project_investors WHERE project_id = ? AND investor_id = ?",
          [tx.projectId, tx.investorId]
        );
        if (piExisting.length === 0) {
          const newPiId = `PI-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          await querySQL(
            `INSERT INTO project_investors (id, project_id, investor_id, committed_amount, invested_amount)
             VALUES (?, ?, ?, 0, 0)`,
            [newPiId, tx.projectId, tx.investorId]
          );
        }
      }

      // 4. 重算项目的 invested_amount/returned_amount 以及 project_investors 的 invested_amount
      if (tx.projectId) {
        await querySQL(
          `UPDATE projects SET
             invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND type = 'investment'), 0),
             returned_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND type = 'return'), 0)
           WHERE id = ?`,
          [tx.projectId, tx.projectId, tx.projectId]
        );
        if (tx.investorId) {
          await querySQL(
            `UPDATE project_investors SET
               invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND investor_id = ? AND type = 'investment'), 0)
             WHERE project_id = ? AND investor_id = ?`,
            [tx.projectId, tx.investorId, tx.projectId, tx.investorId]
          );
        }
      }

      // 5. 自动补全缺失的资金池出资方名单 (实缴/划入)
      if ((tx.type === "capital_call" || tx.type === "pool_transfer_in") && tx.poolId) {
        const targetInvestorId = tx.investorId || tx.relatedPoolId;
        if (targetInvestorId) {
          const pmExisting = await querySQL(
            "SELECT id FROM pool_members WHERE pool_id = ? AND investor_id = ?",
            [tx.poolId, targetInvestorId]
          );
          if (pmExisting.length === 0) {
            const newPmId = `PM-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            await querySQL(
              `INSERT INTO pool_members (id, pool_id, investor_id, committed_amount, called_amount, share_pct, status)
               VALUES (?, ?, ?, 0, 0, 0, 'active')`,
              [newPmId, tx.poolId, targetInvestorId]
            );
          }
        }
      }

      // 6. 重算 pool_members 中的 called_amount (实缴总额)
      // 统一模型：统计所有 type 为 capital_call 或 pool_transfer_in 的流水
      if ((tx.type === "capital_call" || tx.type === "pool_transfer_in") && tx.poolId) {
        const targetInvestorId = tx.investorId || tx.relatedPoolId;
        if (targetInvestorId) {
          await querySQL(
            `UPDATE pool_members SET
               called_amount = COALESCE((
                 SELECT SUM(amount) FROM transactions 
                 WHERE pool_id = ? 
                   AND (investor_id = ? OR (related_pool_id = ? AND type = 'pool_transfer_in'))
                   AND type IN ('capital_call', 'pool_transfer_in')
               ), 0)
             WHERE pool_id = ? AND investor_id = ?`,
            [tx.poolId, targetInvestorId, targetInvestorId, tx.poolId, targetInvestorId]
          );
        }
      }

      return txId;
    } catch (err) {
      console.error("创建流水失败:", err);
      setError(err.message || "记录流水失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * 删除流水并冲回涉及的资金池/项目/出资人财务数据
   */
  const deleteTransaction = async (txId) => {
    setLoading(true);
    setError(null);
    try {
      // 1. 查询该流水明细，用于金额冲回
      const txs = await querySQL("SELECT * FROM transactions WHERE id = ?", [txId]);
      if (!txs || txs.length === 0) {
        throw new Error("未找到该流水记录");
      }
      const tx = txs[0];

      // 2. 先删除流水记录
      await querySQL("DELETE FROM transactions WHERE id = ?", [txId]);

      // 3. 删除后重算涉及资金池的可用余额
      if (tx.pool_id) {
        await querySQL(
          `UPDATE pools SET
             available_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) FROM transactions WHERE pool_id = ?), 0)
           WHERE id = ?`,
          [tx.pool_id, tx.pool_id]
        );
      }

      // 4. 重算涉及项目的已投/已回金额
      if (tx.project_id) {
        await querySQL(
          `UPDATE projects SET
             invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND type = 'investment'), 0),
             returned_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND type = 'return'), 0)
           WHERE id = ?`,
          [tx.project_id, tx.project_id, tx.project_id]
        );
        // 同步更新 project_investors 的实缴额
        if (tx.investor_id) {
          await querySQL(
            `UPDATE project_investors SET
               invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND investor_id = ? AND type = 'investment'), 0)
             WHERE project_id = ? AND investor_id = ?`,
            [tx.project_id, tx.investor_id, tx.project_id, tx.investor_id]
          );
        }
      }

      // 5. 重算 pool_members 中的 called_amount (实缴总额)
      if ((tx.type === "capital_call" || tx.type === "pool_transfer_in") && tx.pool_id) {
        const targetInvestorId = tx.investor_id || tx.related_pool_id;
        if (targetInvestorId) {
          await querySQL(
            `UPDATE pool_members SET
               called_amount = COALESCE((
                 SELECT SUM(amount) FROM transactions 
                 WHERE pool_id = ? 
                   AND (investor_id = ? OR (related_pool_id = ? AND type = 'pool_transfer_in'))
                   AND type IN ('capital_call', 'pool_transfer_in')
               ), 0)
             WHERE pool_id = ? AND investor_id = ?`,
            [tx.pool_id, targetInvestorId, targetInvestorId, tx.pool_id, targetInvestorId]
          );
        }
      }

      return true;
    } catch (err) {
      console.error("删除流水失败:", err);
      setError(err.message || "删除流水失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    getTransactions,
    createTransaction,
    deleteTransaction
  };
}
export default useTransactions;
