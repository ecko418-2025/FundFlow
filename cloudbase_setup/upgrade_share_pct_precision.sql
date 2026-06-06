-- Upgrade pool member share precision to support an exact 100.0000%.
-- Run this in the CloudBase SQL console or another privileged MySQL client.

ALTER TABLE pool_members
  MODIFY share_pct DECIMAL(7,4) NOT NULL DEFAULT 0.0000 COMMENT '持股比例（%）';

UPDATE pool_members pm
JOIN (
  SELECT pool_id, SUM(called_amount) AS total_called
  FROM pool_members
  WHERE status = 'active'
  GROUP BY pool_id
) totals ON totals.pool_id = pm.pool_id
SET pm.share_pct = CASE
  WHEN totals.total_called > 0 THEN LEAST(100.0000, GREATEST(0.0000, ROUND(pm.called_amount / totals.total_called * 100, 4)))
  ELSE 0
END
WHERE pm.status = 'active';
