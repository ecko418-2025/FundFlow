-- Audit log query index optimization.
-- Run this in the CloudBase SQL console or another privileged MySQL client.
-- The business SQL gateway blocks ALTER TABLE by design.

ALTER TABLE audit_logs
  ADD INDEX idx_audit_module_action_created_at (module, action, created_at),
  ADD INDEX idx_audit_status_created_at (status, created_at),
  ADD INDEX idx_audit_actor_role_created_at (actor_role, created_at);
