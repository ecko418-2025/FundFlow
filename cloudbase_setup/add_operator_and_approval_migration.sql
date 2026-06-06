-- ================================================================
-- 迁移脚本: 经办员账号与 Maker-Checker 审批流补丁
-- 执行时机: 已有云端数据库升级时执行一次，幂等安全。
-- ================================================================

-- 1. 确保 transactions.status 存在。新库 init_schema.sql 已包含该字段。
ALTER TABLE `transactions`
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(20) NOT NULL DEFAULT 'approved'
  COMMENT '状态: pending(待审核)/approved(已生效)/rejected(已驳回)';

-- 2. 补齐经办员账号映射。真实 Auth UID 如不同，请将 uid 更新为云开发 Auth 中的实际 uid。
INSERT INTO `users` (uid, email, role, investor_id, display_name)
VALUES ('uid-operator', 'operator@example.com', 'operator', NULL, '王经办（经办员）')
ON DUPLICATE KEY UPDATE
  email = VALUES(email),
  role = 'operator',
  investor_id = NULL,
  display_name = VALUES(display_name);

-- 3. 历史流水默认为已生效，避免升级后历史报表被排除。
UPDATE `transactions`
SET `status` = 'approved'
WHERE `status` IS NULL OR `status` = '';

-- 4. 按已生效流水全量重算核心统计，确保待审核/已驳回流水不会影响财务报表。
UPDATE projects SET
  invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = projects.id AND type = 'investment' AND status = 'approved'), 0),
  returned_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = projects.id AND type = 'return' AND status = 'approved'), 0);

UPDATE project_investors SET
  invested_amount = COALESCE((
    SELECT SUM(amount)
    FROM transactions
    WHERE project_id = project_investors.project_id
      AND investor_id = project_investors.investor_id
      AND type = 'investment'
      AND status = 'approved'
  ), 0);

UPDATE pool_members SET
  called_amount = COALESCE((
    SELECT SUM(amount)
    FROM transactions
    WHERE pool_id = pool_members.pool_id
      AND (
        investor_id = pool_members.investor_id
        OR (related_pool_id = pool_members.investor_id AND type = 'pool_transfer_in')
      )
      AND type IN ('capital_call', 'pool_transfer_in')
      AND status = 'approved'
  ), 0);

UPDATE pool_members pm
JOIN (
  SELECT pool_id, SUM(called_amount) AS total_called
  FROM pool_members
  WHERE status = 'active'
  GROUP BY pool_id
) totals ON totals.pool_id = pm.pool_id
SET pm.share_pct = CASE
  WHEN totals.total_called > 0 THEN pm.called_amount / totals.total_called * 100
  ELSE 0
END
WHERE pm.status = 'active';

UPDATE pools SET
  available_balance = COALESCE((
    SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END)
    FROM transactions
    WHERE pool_id = pools.id
      AND status = 'approved'
  ), 0);
