-- ==========================================
-- FundFlow 资金流系统 - MySQL 数据库建表脚本 (DDL)
-- 适用于：腾讯云开发 CloudBase SQL / 云数据库 MySQL 8.0+
-- 执行方式：可直接复制并在腾讯云数据库控制台、phpMyAdmin 或 Navicat 中执行。
-- ==========================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. 资金池主表
DROP TABLE IF EXISTS `pools`;
CREATE TABLE `pools` (
  `id` VARCHAR(36) NOT NULL COMMENT '资金池唯一ID (UUID)',
  `name` VARCHAR(100) NOT NULL COMMENT '资金池名称',
  `description` TEXT NULL COMMENT '备注说明',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: active/closed',
  `currency` VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '币种',
  `type` VARCHAR(50) NOT NULL DEFAULT 'capital' COMMENT '类型: capital/temporary_quarterly/temporary_annually',
  `start_date` DATE NULL COMMENT '起始日期',
  `end_date` DATE NULL COMMENT '结束日期',
  `total_committed` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '总认缴规模（元）',
  `available_balance` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '现金可用余额',
  `contract_no` VARCHAR(100) NULL COMMENT '合同编号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `created_by` VARCHAR(128) NOT NULL COMMENT '创建人 Auth UID',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. 出资方主表
DROP TABLE IF EXISTS `investors`;
CREATE TABLE `investors` (
  `id` VARCHAR(36) NOT NULL COMMENT '出资方唯一ID (UUID)',
  `name` VARCHAR(100) NOT NULL COMMENT '出资方名称',
  `type` VARCHAR(20) NOT NULL COMMENT '类型: individual(个人)/fund(机构/母基金)',
  `email` VARCHAR(255) NULL COMMENT '登录/对账邮箱',
  `uid` VARCHAR(128) NULL COMMENT '关联的云开发 Auth UID',
  `phone` VARCHAR(20) NULL COMMENT '联系电话',
  `contact` VARCHAR(100) NULL COMMENT '核心联系人（针对机构）',
  `note` TEXT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. 池-出资方直接持股关系表 (多对多)
-- 包含个人 LP 以及作为“机构 LP”注资的母资金池
DROP TABLE IF EXISTS `pool_members`;
CREATE TABLE `pool_members` (
  `id` VARCHAR(36) NOT NULL COMMENT '关系唯一ID',
  `pool_id` VARCHAR(36) NOT NULL COMMENT '所属资金池ID',
  `investor_id` VARCHAR(36) NOT NULL COMMENT '出资方ID (LP或母池ID)',
  `committed_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '认缴出资金额',
  `called_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '累计实缴金额',
  `share_pct` DECIMAL(7,4) NOT NULL DEFAULT 0.0000 COMMENT '持股比例（%）',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: active/withdrawn',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_pool_investor` (`pool_id`, `investor_id`),
  FOREIGN KEY (`pool_id`) REFERENCES `pools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. [已废弃] 池间投资关系表 (逻辑已并入 pool_members)
-- DROP TABLE IF EXISTS `pool_investments`;

-- 5. 投资组合项目表
DROP TABLE IF EXISTS `projects`;
CREATE TABLE `projects` (
  `id` VARCHAR(36) NOT NULL COMMENT '项目ID',
  `pool_id` VARCHAR(36) NULL COMMENT '出资来源资金池ID',
  `name` VARCHAR(200) NOT NULL COMMENT '项目名称',
  `code` VARCHAR(50) NOT NULL COMMENT '项目唯一编号',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pre' COMMENT '状态: pre(投前)/active(存续)/exited(退出)',
  `start_date` DATE NULL COMMENT '立项日期',
  `expected_end_date` DATE NULL COMMENT '预计退出日期',
  `actual_end_date` DATE NULL COMMENT '实际退出日期',
  `committed_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '计划出资额',
  `invested_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '累计实际投入金额',
  `returned_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '累计收回项目款',
  `description` TEXT NULL COMMENT '项目描述',
  `tags` JSON NULL COMMENT '标签数组 (MySQL JSON 格式)',
  `contract_no` VARCHAR(100) NULL COMMENT '合同编号',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_project_code` (`code`),
  FOREIGN KEY (`pool_id`) REFERENCES `pools` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5.5. 项目出资方关系表
DROP TABLE IF EXISTS `project_investors`;
CREATE TABLE `project_investors` (
  `id` VARCHAR(36) NOT NULL COMMENT '关系唯一ID',
  `project_id` VARCHAR(36) NOT NULL COMMENT '项目ID',
  `investor_id` VARCHAR(36) NOT NULL COMMENT '出资方ID',
  `committed_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '计划出资额',
  `invested_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT '累计实际到账金额',
  `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关联时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_proj_inv` (`project_id`, `investor_id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 6. 流水账本表
DROP TABLE IF EXISTS `transactions`;
CREATE TABLE `transactions` (
  `id` VARCHAR(36) NOT NULL COMMENT '流水ID',
  `pool_id` VARCHAR(36) NULL COMMENT '所属资金池ID',
  `project_id` VARCHAR(36) NULL COMMENT '关联的项目ID',
  `investor_id` VARCHAR(36) NULL COMMENT '关联的出资方ID',
  `related_pool_id` VARCHAR(36) NULL COMMENT '关联对方资金池ID（适用于母子池注资流水）',
  `type` VARCHAR(30) NOT NULL COMMENT '类型: capital_call(实缴)/investment(投项目)/pool_investment(投子池)/return/distribution/fee',
  `direction` VARCHAR(3) NOT NULL COMMENT '流向: in(流入池)/out(流出池)',
  `amount` DECIMAL(18,2) NOT NULL COMMENT '流水金额',
  `date` DATE NOT NULL COMMENT '发生日期',
  `description` TEXT NULL COMMENT '交易摘要',
  `reference_no` VARCHAR(100) NULL COMMENT '凭证号/网银流水号',
  `attachment_url` TEXT NULL COMMENT '凭证附件链接',
  `status` VARCHAR(20) NOT NULL DEFAULT 'approved' COMMENT '状态: pending(待审核)/approved(已生效)/rejected(已驳回)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登账时间',
  `created_by` VARCHAR(128) NOT NULL COMMENT '操作员 Auth UID',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`pool_id`) REFERENCES `pools` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`related_pool_id`) REFERENCES `pools` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 7. 收益分配方案表
DROP TABLE IF EXISTS `distributions`;
CREATE TABLE `distributions` (
  `id` VARCHAR(36) NOT NULL COMMENT '分配方案ID/内部流转钢印',
  `pool_id` VARCHAR(36) NULL COMMENT '涉及资金池ID',
  `project_id` VARCHAR(36) NULL COMMENT '关联退出项目ID',
  `total_amount` DECIMAL(18,2) NOT NULL COMMENT '待分配分红总金额',
  `distribution_date` DATE NOT NULL COMMENT '方案实施日期',
  `description` TEXT NULL COMMENT '方案说明',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending(待审核)/confirmed(已执行)/rejected(已驳回)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `confirmed_at` DATETIME NULL COMMENT '执行确认时间',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`pool_id`) REFERENCES `pools` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 8. 分配明细项表
DROP TABLE IF EXISTS `distribution_items`;
CREATE TABLE `distribution_items` (
  `id` VARCHAR(36) NOT NULL COMMENT '明细ID',
  `distribution_id` VARCHAR(36) NOT NULL COMMENT '关联分配方案',
  `investor_id` VARCHAR(36) NOT NULL COMMENT '出资人ID',
  `direct_share_pct` DECIMAL(8,4) NOT NULL DEFAULT 0.0000 COMMENT '直接出资比例',
  `indirect_share_pct` DECIMAL(8,4) NOT NULL DEFAULT 0.0000 COMMENT '上层穿透折算间接出资比例',
  `effective_share_pct` DECIMAL(8,4) NOT NULL DEFAULT 0.0000 COMMENT '有效持股比例 = 直接 + 间接',
  `amount` DECIMAL(18,2) NOT NULL COMMENT '分得的红利金额',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_dist_investor` (`distribution_id`, `investor_id`),
  FOREIGN KEY (`distribution_id`) REFERENCES `distributions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 8.5. 系统全局配置表
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `key` VARCHAR(50) NOT NULL COMMENT '设置键',
  `value` LONGTEXT NULL COMMENT '设置值 (JSON 字符串)',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 9. 操作安全审计日志表（只追加，不在业务页面提供删除/修改）
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(64) NOT NULL COMMENT '日志ID',
  `actor_uid` VARCHAR(128) NULL COMMENT '操作人 UID',
  `actor_email` VARCHAR(255) NULL COMMENT '操作人邮箱',
  `actor_role` VARCHAR(20) NULL COMMENT '操作人角色',
  `actor_name` VARCHAR(100) NULL COMMENT '操作人显示名',
  `action` VARCHAR(50) NOT NULL COMMENT '操作动作',
  `module` VARCHAR(50) NOT NULL COMMENT '所属模块',
  `target_type` VARCHAR(50) NULL COMMENT '操作对象类型',
  `target_id` VARCHAR(128) NULL COMMENT '操作对象ID',
  `target_label` VARCHAR(255) NULL COMMENT '操作对象名称/编号',
  `status` VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT '结果: success/failure',
  `message` VARCHAR(500) NULL COMMENT '摘要说明',
  `before_data` LONGTEXT NULL COMMENT '操作前数据 JSON',
  `after_data` LONGTEXT NULL COMMENT '操作后数据 JSON',
  `request_payload` LONGTEXT NULL COMMENT '提交参数 JSON',
  `error_message` TEXT NULL COMMENT '失败原因',
  `ip_address` VARCHAR(64) NULL COMMENT 'IP 地址',
  `user_agent` VARCHAR(500) NULL COMMENT '浏览器信息',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_audit_created_at` (`created_at`),
  KEY `idx_audit_actor_uid` (`actor_uid`),
  KEY `idx_audit_module_action` (`module`, `action`),
  KEY `idx_audit_module_action_created_at` (`module`, `action`, `created_at`),
  KEY `idx_audit_target` (`target_type`, `target_id`),
  KEY `idx_audit_status` (`status`),
  KEY `idx_audit_status_created_at` (`status`, `created_at`),
  KEY `idx_audit_actor_role_created_at` (`actor_role`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 10. 系统用户与角色关系表
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `uid` VARCHAR(128) NOT NULL COMMENT '云开发 Auth UID',
  `email` VARCHAR(255) NOT NULL COMMENT '登录邮箱',
  `role` VARCHAR(20) NOT NULL DEFAULT 'lp' COMMENT '角色: admin(管理员)/lp(投资者)',
  `investor_id` VARCHAR(36) NULL COMMENT 'LP关联的出资人ID',
  `display_name` VARCHAR(100) NULL COMMENT '名称',
  PRIMARY KEY (`uid`),
  FOREIGN KEY (`investor_id`) REFERENCES `investors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ==========================================
-- 初始测试演示数据注入
-- ==========================================

-- 1. 注入默认管理员和 LP 用户
INSERT INTO `investors` (id, name, type, email, uid, phone, contact, note) VALUES 
('inv-1', '张三', 'individual', 'zhangsan@example.com', 'uid-zhangsan', '13800001111', '张三', '大额个人LPs出资人'),
('inv-2', '李四', 'individual', 'lisi@example.com', 'uid-lisi', '13800002222', '李四', '普通合伙人'),
('inv-3', '未来资本基金', 'fund', 'future@example.com', 'uid-future', '021-88888888', '王经理', '机构出资人，母基金实体');

INSERT INTO `users` (uid, email, role, investor_id, display_name) VALUES 
('uid-admin', 'admin@example.com', 'admin', NULL, '系统管理员'),
('2062179704411439105', 'ecko418@gmail.com', 'admin', NULL, 'ecko418（管理员）'),
('uid-operator', 'operator@example.com', 'operator', NULL, '王经办（经办员）'),
('uid-zhangsan', 'zhangsan@example.com', 'lp', 'inv-1', '张三'),
('uid-lisi', 'lisi@example.com', 'lp', 'inv-2', '李四'),
('uid-future', 'future@example.com', 'lp', 'inv-3', '未来资本');

-- 2. 注入三个资金池 (大池 A, 大池 B, 子池 C)
INSERT INTO `pools` (id, name, description, total_committed, available_balance, type, start_date, end_date, created_by) VALUES 
('pool-1', '2024综合大池 A', '年度主要资金池', 50000000.00, 14200000.00, 'capital', '2024-01-01', '2029-12-31', 'uid-admin'),
('pool-2', '2024科技成长池 B', '科技创业项目专项资金池', 30000000.00, 8500000.00, 'temporary_annually', '2024-01-01', '2024-12-31', 'uid-admin'),
('pool-3', '2024新能源子池 C', '由大池A和大池B共同投资的新能源行业子池', 10000000.00, 4200000.00, 'temporary_quarterly', '2024-01-01', '2024-03-31', 'uid-admin');

-- 2.5 注入资金池的 investors 镜像行（共享主键，type='pool'）
-- 这使得 transactions/project_investors 中 investor_id=poolId 能通过单一 JOIN investors 找到名称
INSERT IGNORE INTO `investors` (id, name, type, note) VALUES
('pool-1', '2024综合大池 A', 'pool', '年度主要资金池'),
('pool-2', '2024科技成长池 B', 'pool', '科技创业项目专项资金池'),
('pool-3', '2024新能源子池 C', 'pool', '由大池A和大池B共同投资的新能源行业子池');

-- 3. 注入资金池成员与持股
-- 大池 A (pool-1): 张三占 40%, 未来资本占 60%
-- 大池 B (pool-2): 李四占 20%, 未来资本占 80%
-- 子池 C (pool-3): 张三(10%), 李四(20%), 剩余 70% 由母池注资 (大池A 50%, 大池B 20%)
INSERT INTO `pool_members` (id, pool_id, investor_id, committed_amount, called_amount, share_pct, status) VALUES 
('pm-1', 'pool-1', 'inv-1', 20000000.00, 15000000.00, 40.0000, 'active'),
('pm-2', 'pool-1', 'inv-3', 30000000.00, 20800000.00, 60.0000, 'active'),
('pm-3', 'pool-2', 'inv-2', 6000000.00, 5000000.00, 20.0000, 'active'),
('pm-4', 'pool-2', 'inv-3', 24000000.00, 16500000.00, 80.0000, 'active'),
('pm-5', 'pool-3', 'inv-1', 1000000.00, 1000000.00, 10.0000, 'active'),
('pm-6', 'pool-3', 'inv-2', 2000000.00, 2000000.00, 20.0000, 'active'),
('pm-7', 'pool-3', 'pool-1', 5000000.00, 5000000.00, 50.0000, 'active'),
('pm-8', 'pool-3', 'pool-2', 2000000.00, 2000000.00, 20.0000, 'active');

-- 4. [已废弃] 注入池间投资关系（数据已并入 pool_members）

-- 5. 注入初始投资项目
INSERT INTO `projects` (id, pool_id, name, code, status, committed_amount, invested_amount, returned_amount, description, tags) VALUES 
('proj-1', 'pool-1', '芯片半导体制造项目', 'P-2024-001', 'active', 15000000.00, 15000000.00, 5000000.00, '先进制程制造研发投融资', '["芯片", "硬科技"]'),
('proj-2', 'pool-3', '高倍率固态锂电池研发', 'P-2024-002', 'active', 5000000.00, 4000000.00, 0.00, '新能源固电池项目', '["固态电池", "新能源"]');

-- 6. 注入测试流水账目
INSERT INTO `transactions` (id, pool_id, project_id, investor_id, type, direction, amount, date, description, reference_no, created_by, status) VALUES 
('tx-1', 'pool-1', NULL, 'inv-1', 'capital_call', 'in', 15000000.00, '2024-01-02', '张三第一期实缴出资', 'RE-20240102-01', 'uid-admin', 'approved'),
('tx-2', 'pool-1', NULL, 'inv-3', 'capital_call', 'in', 20800000.00, '2024-01-02', '未来资本首期出资', 'RE-20240102-02', 'uid-admin', 'approved'),
('tx-3', 'pool-1', 'proj-1', 'pool-1', 'investment', 'out', 15000000.00, '2024-01-15', '向芯片项目打款第一笔', 'PAY-20240115-01', 'uid-admin', 'approved');

-- 7. 注入项目出资方数据
INSERT INTO `project_investors` (id, project_id, investor_id, committed_amount, invested_amount, status, joined_at) VALUES
('pi-inv-1', 'proj-1', 'pool-1', 15000000.00, 15000000.00, 'active', '2024-01-10 12:00:00'),
('pi-inv-2', 'proj-1', 'inv-1', 5000000.00, 5000000.00, 'active', '2024-01-10 12:00:00'),
('pi-inv-3', 'proj-2', 'pool-2', 10000000.00, 10000000.00, 'active', '2024-03-05 12:00:00'),
('pi-inv-4', 'proj-3', 'pool-1', 10000000.00, 10000000.00, 'active', '2024-04-10 12:00:00'),
('pi-inv-5', 'proj-3', 'inv-3', 20000000.00, 20000000.00, 'active', '2024-04-10 12:00:00'),
('pi-inv-6', 'proj-4', 'pool-3', 10000000.00, 10000000.00, 'active', '2024-05-05 12:00:00'),
('pi-inv-7', 'proj-4', 'pool-2', 5000000.00, 5000000.00, 'active', '2024-05-05 12:00:00');

-- 8. 注入系统全局配置数据
INSERT INTO `settings` (`key`, `value`) VALUES 
('system_tags', '[{"id":"cat_attr","name":"公司属性分类","color":"var(--accent-blue)","tags":["芯片","硬科技","人工智能","低空经济","机器人","固态电池","新能源","AI","高端制造"]},{"id":"cat_team","name":"团队分类标签","color":"var(--accent-gold)","tags":[]},{"id":"cat_nature","name":"项目性质标签","color":"var(--accent-green)","tags":[]}]');

SET FOREIGN_KEY_CHECKS = 1;
