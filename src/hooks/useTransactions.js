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
      SELECT t.*, p.name AS pool_name, pr.name AS project_name, i.name AS investor_name, rp.name AS related_pool_name 
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
      const txId = `tx-${Date.now()}`;
      
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

      // 2. 更新关联资金池的 available_balance 余额
      // in: 增加余额, out: 减少余额
      if (tx.poolId) {
        const operator = tx.direction === "in" ? "+" : "-";
        const sqlUpdatePool = `
          UPDATE pools 
          SET available_balance = available_balance ${operator} ? 
          WHERE id = ?
        `;
        await querySQL(sqlUpdatePool, [tx.amount, tx.poolId]);
      }

      // 3. 如果是项目投资(investment)或项目回款(return)，同时更新项目的 invested_amount 或 returned_amount
      if (tx.projectId) {
        if (tx.type === "investment") {
          await querySQL(
            "UPDATE projects SET invested_amount = invested_amount + ? WHERE id = ?",
            [tx.amount, tx.projectId]
          );
          // 如果关联了具体项目出资方，则更新该出资方的实际到账累计额
          if (tx.investorId) {
             await querySQL(
               "UPDATE project_investors SET invested_amount = invested_amount + ? WHERE project_id = ? AND investor_id = ?",
               [tx.amount, tx.projectId, tx.investorId]
             );
          }
        } else if (tx.type === "return") {
          await querySQL(
            "UPDATE projects SET returned_amount = returned_amount + ? WHERE id = ?",
            [tx.amount, tx.projectId]
          );
        }
      }

      // 4. 如果是出资人实缴(capital_call)，更新 pool_members 中的 called_amount (累计实缴)
      if (tx.type === "capital_call" && tx.poolId && tx.investorId) {
        await querySQL(
          "UPDATE pool_members SET called_amount = called_amount + ? WHERE pool_id = ? AND investor_id = ?",
          [tx.amount, tx.poolId, tx.investorId]
        );
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

      // 2. 扣减或退回涉及资金池的可用余额
      if (tx.pool_id) {
        const operator = tx.direction === "in" ? "-" : "+";
        const sqlUpdatePool = `
          UPDATE pools 
          SET available_balance = available_balance ${operator} ? 
          WHERE id = ?
        `;
        await querySQL(sqlUpdatePool, [tx.amount, tx.pool_id]);
      }

      // 3. 冲回项目的已投/已回金额
      if (tx.project_id) {
        if (tx.type === "investment") {
          await querySQL(
            "UPDATE projects SET invested_amount = invested_amount - ? WHERE id = ?",
            [tx.amount, tx.project_id]
          );
          if (tx.investor_id) {
             await querySQL(
               "UPDATE project_investors SET invested_amount = invested_amount - ? WHERE project_id = ? AND investor_id = ?",
               [tx.amount, tx.project_id, tx.investor_id]
             );
          }
        } else if (tx.type === "return") {
          await querySQL(
            "UPDATE projects SET returned_amount = returned_amount - ? WHERE id = ?",
            [tx.amount, tx.project_id]
          );
        }
      }

      // 4. 冲回出资人累计实缴
      if (tx.type === "capital_call" && tx.pool_id && tx.investor_id) {
        await querySQL(
          "UPDATE pool_members SET called_amount = called_amount - ? WHERE pool_id = ? AND investor_id = ?",
          [tx.amount, tx.pool_id, tx.investor_id]
        );
      }

      // 5. 从数据库删除此交易记录
      await querySQL("DELETE FROM transactions WHERE id = ?", [txId]);

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
