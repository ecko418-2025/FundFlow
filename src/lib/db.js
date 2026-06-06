import { app } from "./cloudbase";

function stringifyErrorValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function getErrorMessage(error, fallback = "未知错误") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return (
    error.message ||
    error.errMsg ||
    error.errorMessage ||
    error.msg ||
    error.code ||
    error.requestId ||
    stringifyErrorValue(error) ||
    fallback
  );
}

export async function querySQL(sql, params = [], options = {}) {
  try {
    const res = await app.callFunction({ name: "executeSQL", data: { sql, params } });
    if (!res.result || res.result.code !== 0) {
      throw new Error(res.result?.message || res.result?.error || "SQL 执行失败");
    }
    return res.result.data;
  } catch (error) {
    const message = getErrorMessage(error, "SQL 执行失败");
    if (!options.silent) {
      console.error("云数据库执行失败：", message, error);
    }
    if (error instanceof Error) {
      error.message = message;
      throw error;
    }
    throw new Error(message);
  }
}

export async function checkDBConnection() {
  try {
    const res = await app.callFunction({ name: "ping", data: {} });
    return res.result && res.result.code === 0;
  } catch (error) {
    console.warn("连接失败", getErrorMessage(error));
    return false;
  }
}
