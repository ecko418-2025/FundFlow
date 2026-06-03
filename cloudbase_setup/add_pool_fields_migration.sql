-- Migration: Add fields for pool type and date control to pools table
ALTER TABLE `pools` ADD COLUMN `type` VARCHAR(50) NOT NULL DEFAULT 'capital' COMMENT '类型: capital/temporary_quarterly/temporary_annually';
ALTER TABLE `pools` ADD COLUMN `start_date` DATE NULL COMMENT '起始日期';
ALTER TABLE `pools` ADD COLUMN `end_date` DATE NULL COMMENT '结束日期';
