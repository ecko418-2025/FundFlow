import { useEffect, useState } from "react";
import { querySQL } from "../lib/db";
import {
  PENDING_APPROVALS_REFRESH_EVENT,
  PENDING_APPROVALS_STORAGE_KEY,
  createPendingApprovalsChannel
} from "../lib/pendingApprovals";

const EMPTY_COUNTS = {
  transactions: 0,
  distributions: 0
};

const REFRESH_INTERVAL_MS = 15000;

function toCount(rows) {
  return Number(rows?.[0]?.count || 0) || 0;
}

export function usePendingApprovals(enabled) {
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  useEffect(() => {
    if (!enabled) {
      setCounts(EMPTY_COUNTS);
      return undefined;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const [transactionRows, distributionRows] = await Promise.all([
          querySQL(
            `SELECT COUNT(*) AS count
             FROM transactions t
             WHERE t.status = 'pending'
               AND NOT (
                 t.type = 'pool_investment'
                 AND t.pool_id IS NOT NULL
                 AND t.related_pool_id IS NOT NULL
                 AND EXISTS (
                   SELECT 1
                   FROM transactions c
                   WHERE c.status = 'pending'
                     AND c.type = 'capital_call'
                     AND c.pool_id = t.related_pool_id
                     AND c.investor_id = t.pool_id
                     AND c.amount = t.amount
                     AND DATE(c.date) = DATE(t.date)
                 )
               )`,
            [],
            { silent: true }
          ),
          querySQL(
            `SELECT COUNT(*) AS count
             FROM distributions
             WHERE status = 'pending'`,
            [],
            { silent: true }
          )
        ]);

        if (!cancelled) {
          setCounts({
            transactions: toCount(transactionRows),
            distributions: toCount(distributionRows)
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("待审核数量读取失败：", err?.message || err);
        }
      }
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onStorage = (event) => {
      if (event.key === PENDING_APPROVALS_STORAGE_KEY) refresh();
    };
    const channel = createPendingApprovalsChannel(refresh);

    window.addEventListener("focus", onFocus);
    window.addEventListener(PENDING_APPROVALS_REFRESH_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(PENDING_APPROVALS_REFRESH_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      channel?.close();
    };
  }, [enabled]);

  return counts;
}

export default usePendingApprovals;
