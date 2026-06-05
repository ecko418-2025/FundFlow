-- ================================================================
-- 数据库迁移脚本: 从双轨制模型迁移至统一出资模型
-- 执行说明: 请在腾讯云开发数据库控制台手动执行此脚本。
-- 影响范围: pool_members, transactions, [废弃] pool_investments
-- ================================================================

-- 1. 为现有的母子池关系在 pool_members 中创建记录
-- 将 pool_investments 表中的数据迁移至 pool_members
INSERT IGNORE INTO `pool_members` (id, pool_id, investor_id, committed_amount, called_amount, share_pct, status, joined_at)
SELECT 
    CONCAT('pm-mig-', id), 
    child_pool_id, 
    parent_pool_id, 
    invested_amount, -- 将已投金额暂时记为认缴参考
    invested_amount, -- 将已投金额记为实缴
    share_pct,
    'active',
    invested_at
FROM `pool_investments`;

-- 2. 迁移历史划拨流水类型 (可选，视历史数据量而定)
-- 将 pool_transfer_in 统一更新为 capital_call (进账方视角)
UPDATE `transactions` 
SET `type` = 'capital_call', 
    `investor_id` = `related_pool_id`, -- 原划拨流水中 source pool 记在 related_pool_id
    `related_pool_id` = NULL
WHERE `type` = 'pool_transfer_in';

-- 将 pool_transfer_out 统一更新为 pool_investment (出账方视角)
UPDATE `transactions` 
SET `type` = 'pool_investment'
WHERE `type` = 'pool_transfer_out';

-- 3. 验证数据 (建议手动执行以下查询)
-- SELECT * FROM pool_members WHERE investor_id IN (SELECT id FROM pools);
-- SELECT * FROM transactions WHERE type IN ('capital_call', 'pool_investment') AND investor_id IN (SELECT id FROM pools);

-- 4. [慎重] 删除旧表 (确认数据迁移无误后再执行)
-- DROP TABLE `pool_investments`;
