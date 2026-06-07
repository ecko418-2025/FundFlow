import { useState } from "react";
import { querySQL } from "../lib/db";
import { writeAuditLog } from "../lib/audit";
import { notifyPendingApprovalsChanged } from "../lib/pendingApprovals";

export function useTransactions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 获取流水列表（支持过滤）
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
      // 增强型流水 ID
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
      const txId = `TX${dateStr}${entropy}`;
      
      const status = tx.status || 'approved'; 

      // 1. 插入流水记录
      const sqlInsert = `
        INSERT INTO transactions (
          id, pool_id, project_id, investor_id, related_pool_id, type, direction, amount, date, description, reference_no, created_by, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        tx.createdBy || "admin",
        status
      ];
      await querySQL(sqlInsert, paramsInsert);

      // 如果是待审核状态，不执行任何联动更新逻辑
      if (status === 'pending') {
        await writeAuditLog({
          actor: tx.actor || { uid: tx.createdBy },
          action: "create",
          module: "transactions",
          targetType: "transaction",
          targetId: txId,
          targetLabel: tx.referenceNo || tx.description || txId,
          status: "success",
          message: "创建资金流水（待审核）",
          afterData: { id: txId, ...tx, status },
          requestPayload: tx
        });
        notifyPendingApprovalsChanged();
        return txId;
      }

      // 执行余额与名单联动逻辑
      await runTransactionLinkedUpdates({ ...tx, id: txId });

      await writeAuditLog({
        actor: tx.actor || { uid: tx.createdBy },
        action: "create",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        targetLabel: tx.referenceNo || tx.description || txId,
        status: "success",
        message: "创建资金流水（已生效）",
        afterData: { id: txId, ...tx, status },
        requestPayload: tx
      });

      return txId;
    } catch (err) {
      console.error("创建流水失败:", err);
      await writeAuditLog({
        actor: tx.actor || { uid: tx.createdBy },
        action: "create",
        module: "transactions",
        targetType: "transaction",
        targetLabel: tx.referenceNo || tx.description || "",
        status: "failure",
        message: "创建资金流水失败",
        requestPayload: tx,
        errorMessage: err.message
      });
      setError(err.message || "记录流水失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * 内部辅助：执行流水的余额与名单联动逻辑 (仅针对 approved 流水)
   */
  const runTransactionLinkedUpdates = async (tx) => {
    // 2. 重算关联资金池的 available_balance 余额
    if (tx.poolId) {
      await querySQL(
        `UPDATE pools SET
           available_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) FROM transactions WHERE pool_id = ? AND status = 'approved'), 0)
         WHERE id = ?`,
        [tx.poolId, tx.poolId]
      );
    }

    // 3. 自动补全项目出资方
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

    // 4. 重算项目金额
    if (tx.projectId) {
      await querySQL(
        `UPDATE projects SET
           invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND type = 'investment' AND status = 'approved'), 0),
           returned_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND type = 'return' AND status = 'approved'), 0)
         WHERE id = ?`,
        [tx.projectId, tx.projectId, tx.projectId]
      );
      if (tx.investorId) {
        await querySQL(
          `UPDATE project_investors SET
             invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = ? AND investor_id = ? AND type = 'investment' AND status = 'approved'), 0)
           WHERE project_id = ? AND investor_id = ?`,
          [tx.projectId, tx.investorId, tx.projectId, tx.investorId]
        );
      }
    }

    // 5. 自动补全资金池成员
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

    // 6. 重算实缴额
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
                 AND status = 'approved'
             ), 0)
           WHERE pool_id = ? AND investor_id = ?`,
          [tx.poolId, targetInvestorId, targetInvestorId, tx.poolId, targetInvestorId]
        );
        await querySQL(
          `UPDATE pool_members pm
           JOIN (
             SELECT pool_id, SUM(called_amount) AS total_called
             FROM pool_members
             WHERE pool_id = ? AND status = 'active'
             GROUP BY pool_id
           ) totals ON totals.pool_id = pm.pool_id
           SET pm.share_pct = CASE
             WHEN totals.total_called > 0 THEN LEAST(99.9999, GREATEST(0.0000, ROUND(pm.called_amount / totals.total_called * 100, 4)))
             ELSE 0
           END
           WHERE pm.pool_id = ? AND pm.status = 'active'`,
          [tx.poolId, tx.poolId]
        );
      }
    }
  };

  const normalizeDbTx = (tx) => ({
    id: tx.id,
    poolId: tx.pool_id,
    projectId: tx.project_id,
    investorId: tx.investor_id,
    relatedPoolId: tx.related_pool_id,
    type: tx.type,
    direction: tx.direction,
    amount: tx.amount,
    date: tx.date
  });

  const getPairedPoolTransferTransactions = async (tx, statuses = ["pending", "approved"]) => {
    const amount = Number(tx.amount || 0);
    if (!amount || !tx.date) return [];

    const dateText = String(tx.date).slice(0, 10);
    const statusPlaceholders = statuses.map(() => "?").join(", ");
    let sql = "";
    let params = [];

    if (tx.type === "pool_investment" && tx.pool_id && tx.related_pool_id) {
      sql = `
        SELECT * FROM transactions
        WHERE id <> ?
          AND type = 'capital_call'
          AND pool_id = ?
          AND investor_id = ?
          AND amount = ?
          AND DATE(date) = ?
          AND status IN (${statusPlaceholders})
        ORDER BY created_at DESC
        LIMIT 1
      `;
      params = [tx.id, tx.related_pool_id, tx.pool_id, amount, dateText, ...statuses];
    } else if (tx.type === "capital_call" && tx.pool_id && tx.investor_id) {
      const sourcePool = await querySQL("SELECT id FROM pools WHERE id = ?", [tx.investor_id], { silent: true });
      if (!sourcePool || sourcePool.length === 0) return [];

      sql = `
        SELECT * FROM transactions
        WHERE id <> ?
          AND type = 'pool_investment'
          AND pool_id = ?
          AND related_pool_id = ?
          AND amount = ?
          AND DATE(date) = ?
          AND status IN (${statusPlaceholders})
        ORDER BY created_at DESC
        LIMIT 1
      `;
      params = [tx.id, tx.investor_id, tx.pool_id, amount, dateText, ...statuses];
    } else {
      return [];
    }

    return await querySQL(sql, params);
  };

  const approveTransaction = async (txId, actor) => {
    setLoading(true);
    setError(null);
    try {
      const results = await querySQL("SELECT * FROM transactions WHERE id = ?", [txId]);
      if (results.length === 0) throw new Error("未找到该流水记录");
      const tx = results[0];
      const pairedTxs = await getPairedPoolTransferTransactions(tx);
      const txsToApprove = [tx, ...pairedTxs].filter((item, index, arr) => (
        item && arr.findIndex(candidate => candidate.id === item.id) === index
      ));

      for (const item of txsToApprove) {
        await querySQL("UPDATE transactions SET status = 'approved' WHERE id = ?", [item.id]);
      }
      for (const item of txsToApprove) {
        await runTransactionLinkedUpdates(normalizeDbTx(item));
      }

      await writeAuditLog({
        actor,
        action: "approve",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        targetLabel: tx.reference_no || tx.description || txId,
        status: "success",
        message: pairedTxs.length > 0 ? "审核通过资金池转款双分录" : "审核通过资金流水",
        beforeData: txsToApprove,
        afterData: txsToApprove.map(item => ({ ...item, status: "approved" }))
      });
      notifyPendingApprovalsChanged();
      return { approvedIds: txsToApprove.map(item => item.id) };
    } catch (err) {
      await writeAuditLog({
        actor,
        action: "approve",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        status: "failure",
        message: "审核资金流水失败",
        errorMessage: err.message
      });
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const rejectTransaction = async (txId, actor) => {
    setLoading(true);
    setError(null);
    try {
      const results = await querySQL("SELECT * FROM transactions WHERE id = ?", [txId]);
      const tx = results[0] || {};
      const pairedTxs = tx.id ? await getPairedPoolTransferTransactions(tx) : [];
      const txsToReject = [tx, ...pairedTxs].filter((item, index, arr) => (
        item && item.id && arr.findIndex(candidate => candidate.id === item.id) === index
      ));
      for (const item of txsToReject) {
        await querySQL("UPDATE transactions SET status = 'rejected' WHERE id = ?", [item.id]);
      }
      await writeAuditLog({
        actor,
        action: "reject",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        targetLabel: tx.reference_no || tx.description || txId,
        status: "success",
        message: pairedTxs.length > 0 ? "驳回资金池转款双分录" : "驳回资金流水",
        beforeData: txsToReject,
        afterData: txsToReject.map(item => ({ ...item, status: "rejected" }))
      });
      notifyPendingApprovalsChanged();
      return { rejectedIds: txsToReject.map(item => item.id) };
    } catch (err) {
      await writeAuditLog({
        actor,
        action: "reject",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        status: "failure",
        message: "驳回资金流水失败",
        errorMessage: err.message
      });
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteTransaction = async (txId, actor) => {
    setLoading(true);
    setError(null);
    try {
      const txs = await querySQL("SELECT * FROM transactions WHERE id = ?", [txId]);
      if (!txs || txs.length === 0) throw new Error("未找到该流水记录");
      const tx = txs[0];
      const pairedTxs = await getPairedPoolTransferTransactions(tx, ["pending", "approved", "rejected"]);
      const txsToDelete = [tx, ...pairedTxs].filter((item, index, arr) => (
        item && item.id && arr.findIndex(candidate => candidate.id === item.id) === index
      ));

      for (const item of txsToDelete) {
        await querySQL("DELETE FROM transactions WHERE id = ?", [item.id]);
      }
      for (const item of txsToDelete) {
        if (item.status === 'approved') {
          await runTransactionLinkedUpdates(normalizeDbTx(item));
        }
      }
      await writeAuditLog({
        actor,
        action: "delete",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        targetLabel: tx.reference_no || tx.description || txId,
        status: "success",
        message: pairedTxs.length > 0 ? "删除资金池转款双分录" : "删除资金流水",
        beforeData: txsToDelete
      });
      notifyPendingApprovalsChanged();
      return { deletedIds: txsToDelete.map(item => item.id) };
    } catch (err) {
      await writeAuditLog({
        actor,
        action: "delete",
        module: "transactions",
        targetType: "transaction",
        targetId: txId,
        status: "failure",
        message: "删除资金流水失败",
        errorMessage: err.message
      });
      setError(err.message || "删除流水失败");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading, error, getTransactions, createTransaction, 
    approveTransaction, rejectTransaction, deleteTransaction
  };
}
export default useTransactions;
