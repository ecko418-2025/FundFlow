import { querySQL } from "./db";

const MAX_TEXT = 500;
const AUDIT_RETRY_DELAY_MS = 500;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBeijingDateTime() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

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
  try {
    const auditId = `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const normalizedActor = normalizeActor(actor);
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const sql = `INSERT INTO audit_logs (
        id, actor_uid, actor_email, actor_role, actor_name,
        action, module, target_type, target_id, target_label,
        status, message, before_data, after_data, request_payload,
        error_message, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
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
      truncate(userAgent),
      getBeijingDateTime()
    ];

    try {
      await querySQL(sql, params, { silent: true });
    } catch {
      await wait(AUDIT_RETRY_DELAY_MS);
      await querySQL(sql, params, { silent: true });
    }
  } catch (err) {
    // 审计是旁路能力，失败时不打扰业务页面；但不能静默跳过后续日志。
    console.warn("审计日志写入失败：", err?.message || err);
  }
}
