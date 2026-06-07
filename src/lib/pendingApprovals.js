export const PENDING_APPROVALS_REFRESH_EVENT = "pending-approvals:refresh";
export const PENDING_APPROVALS_STORAGE_KEY = "fundflow:pending-approvals-refresh";
const PENDING_APPROVALS_CHANNEL = "fundflow-pending-approvals";

export function notifyPendingApprovalsChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(PENDING_APPROVALS_REFRESH_EVENT));

  try {
    window.localStorage?.setItem(PENDING_APPROVALS_STORAGE_KEY, String(Date.now()));
  } catch {
    // 部分无痕或隐私模式可能禁用 localStorage，轮询仍会兜底刷新。
  }

  if (typeof BroadcastChannel === "undefined") return;

  const channel = new BroadcastChannel(PENDING_APPROVALS_CHANNEL);
  channel.postMessage({ type: "refresh" });
  window.setTimeout(() => channel.close(), 100);
}

export function createPendingApprovalsChannel(onRefresh) {
  if (typeof BroadcastChannel === "undefined") return null;

  const channel = new BroadcastChannel(PENDING_APPROVALS_CHANNEL);
  channel.onmessage = (event) => {
    if (event.data?.type === "refresh") onRefresh();
  };
  return channel;
}
