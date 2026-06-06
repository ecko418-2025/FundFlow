import { querySQL } from "./db";

const MAX_TEXT = 500;
const AUDIT_RETRY_COOLDOWN_MS = 30000;
let auditMutedUntil = 0;

function stringifySafe(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return JSON.stringify({ unserializable: true, message: err.message });
  }
}

function truncate(value, max = MAX_TEXT) {
  if (!value) return value;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeActor(actor = {}) {
  return {
    uid: actor.uid || actor.actor_uid || actor.createdBy || null,
    email: actor.email || actor.actor_email || null,
    role: actor.role || actor.actor_role || null,
    name: actor.displayName || actor.display_name || actor.actor_name || actor.email || null
  };
}

export async function writeAuditLog({
  actor,
  action,
  module,
  targetType,
  targetId,
  targetLabel,
  status = "success",
  message = "",
  beforeData,
  afterData,
  requestPayload,
  errorMessage
}) {
  const now = Date.now();
  if (now < auditMutedUntil) return;

  try {
    const auditId = `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const normalizedActor = normalizeActor(actor);
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

    await querySQL(
      `INSERT INTO audit_logs (
        id, actor_uid, actor_email, actor_role, actor_name,
        action, module, target_type, target_id, target_label,
        status, message, before_data, after_data, request_payload,
        error_message, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditId,
        normalizedActor.uid,
        normalizedActor.email,
        normalizedActor.role,
        normalizedActor.name,
        action,
        module,
        targetType || null,
        targetId || null,
        truncate(targetLabel),
        status,
        truncate(message),
        stringifySafe(beforeData),
        stringifySafe(afterData),
        stringifySafe(requestPayload),
        truncate(errorMessage, 2000),
        truncate(userAgent)
      ],
      { silent: true }
    );
  } catch (err) {
    auditMutedUntil = Date.now() + AUDIT_RETRY_COOLDOWN_MS;
    // 审计是旁路能力，失败时不打扰业务页面；管理员仍可通过云函数日志排查。
  }
}
