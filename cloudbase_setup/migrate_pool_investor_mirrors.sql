-- ================================================================
-- 迁移脚本: 为已有资金池在 investors 表注入镜像行 (共享主键方案)
-- 执行时机: 在云端数据库控制台一次性执行（仅需执行一次，幂等安全）
-- 作者备注: type='pool' 镜像行使 investor_id 能通过单一 JOIN investors 解析名称
-- ================================================================

-- 为已有的所有资金池插入 investors 镜像行
-- INSERT IGNORE 保证幂等（重复执行不报错）
INSERT IGNORE INTO `investors` (id, name, type, note)
SELECT id, name, 'pool', description
FROM `pools`;

-- 验证查询：执行后可运行以下 SELECT 确认结果
-- SELECT id, name, type FROM investors WHERE type = 'pool';
