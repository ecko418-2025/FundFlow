import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Search, Clock, AlertTriangle, UserCheck, Database } from "lucide-react";
import { querySQL } from "../../lib/db";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";

const MODULE_LABELS = {
  auth: "登录认证",
  transactions: "核心流水",
  distributions: "收益分配",
  pools: "资金池",
  pool_members: "资金池出资方",
  projects: "项目管理",
  investors: "出资方",
  settings: "系统设置"
};

const ACTION_LABELS = {
  login: "登录",
  logout: "退出",
  create: "新增",
  update: "编辑",
  delete: "删除",
  approve: "通过",
  reject: "驳回",
  import: "导入",
  export: "导出",
  reconcile: "校准"
};

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function JsonBlock({ title, value }) {
  const parsed = parseJson(value);
  if (!parsed) return null;
  return (
    <div style={styles.detailBlock}>
      <div style={styles.detailTitle}>{title}</div>
      <pre style={styles.pre}>{typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}</pre>
    </div>
  );
}

export function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await querySQL(`
        SELECT *
        FROM audit_logs
        ORDER BY created_at DESC
      `);
      setLogs(data || []);
    } catch (err) {
      alert("加载操作安全日志失败：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return logs.filter(log => {
      if (moduleFilter && log.module !== moduleFilter) return false;
      if (actionFilter && log.action !== actionFilter) return false;
      if (statusFilter && log.status !== statusFilter) return false;
      if (actorFilter && log.actor_role !== actorFilter) return false;
      if (dateFrom && formatDateTime(log.created_at).slice(0, 10) < dateFrom) return false;
      if (dateTo && formatDateTime(log.created_at).slice(0, 10) > dateTo) return false;
      if (!kw) return true;
      return [
        log.actor_email,
        log.actor_name,
        log.actor_role,
        log.action,
        log.module,
        log.target_label,
        log.target_id,
        log.message,
        log.error_message
      ].some(value => String(value || "").toLowerCase().includes(kw));
    });
  }, [logs, keyword, moduleFilter, actionFilter, statusFilter, actorFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: logs.length,
      today: logs.filter(log => formatDateTime(log.created_at).slice(0, 10) === today).length,
      failures: logs.filter(log => log.status === "failure").length,
      actors: new Set(logs.map(log => log.actor_uid || log.actor_email).filter(Boolean)).size
    };
  }, [logs]);

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>操作安全日志</h2>
          <p style={styles.subtitle}>只读审计台账，记录关键操作的操作者、时间、对象与结果。</p>
        </div>
        <button onClick={loadLogs} className="btn-secondary" disabled={loading}>
          <Clock size={16} />
          <span>{loading ? "刷新中..." : "刷新"}</span>
        </button>
      </div>

      <div style={styles.statsGrid}>
        <div className="glass-card no-hover" style={styles.statCard}>
          <Database size={20} color="var(--accent-blue)" />
          <div><strong>{stats.total}</strong><span>日志总数</span></div>
        </div>
        <div className="glass-card no-hover" style={styles.statCard}>
          <Clock size={20} color="var(--accent-gold)" />
          <div><strong>{stats.today}</strong><span>今日日志</span></div>
        </div>
        <div className="glass-card no-hover" style={styles.statCard}>
          <AlertTriangle size={20} color="var(--accent-red)" />
          <div><strong>{stats.failures}</strong><span>失败操作</span></div>
        </div>
        <div className="glass-card no-hover" style={styles.statCard}>
          <UserCheck size={20} color="var(--accent-green)" />
          <div><strong>{stats.actors}</strong><span>操作账号</span></div>
        </div>
      </div>

      <div className="glass-card no-hover" style={styles.filters}>
        <div style={styles.searchBox}>
          <Search size={16} color="var(--text-secondary)" />
          <input className="form-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索操作人、对象、摘要..." />
        </div>
        <select className="form-input" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
          <option value="">全部模块</option>
          {Object.entries(MODULE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select className="form-input" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="">全部动作</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部结果</option>
          <option value="success">成功</option>
          <option value="failure">失败</option>
        </select>
        <select className="form-input" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
          <option value="">全部角色</option>
          <option value="admin">管理员</option>
          <option value="operator">经办员</option>
          <option value="lp">LP</option>
        </select>
        <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <div className="glass-card no-hover" style={styles.tableWrap}>
        <table className="data-table" style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>时间</th>
              <th style={styles.th}>操作人</th>
              <th style={styles.th}>角色</th>
              <th style={styles.th}>模块</th>
              <th style={styles.th}>动作</th>
              <th style={styles.th}>对象</th>
              <th style={styles.th}>结果</th>
              <th style={styles.th}>摘要</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => (
              <tr key={log.id} style={styles.tr} onClick={() => setSelectedLog(log)}>
                <td style={styles.td} className="mono">{formatDateTime(log.created_at)}</td>
                <td style={styles.td}>
                  <div style={styles.actorName}>{log.actor_name || log.actor_email || "-"}</div>
                  <div style={styles.actorEmail}>{log.actor_email || log.actor_uid || "-"}</div>
                </td>
                <td style={styles.td}>{log.actor_role || "-"}</td>
                <td style={styles.td}>{MODULE_LABELS[log.module] || log.module}</td>
                <td style={styles.td}>{ACTION_LABELS[log.action] || log.action}</td>
                <td style={styles.td}>
                  <div style={styles.targetLabel}>{log.target_label || log.target_id || "-"}</div>
                  <div style={styles.actorEmail}>{log.target_type || ""}</div>
                </td>
                <td style={styles.td}>
                  <Badge text={log.status === "success" ? "成功" : "失败"} status={log.status} />
                </td>
                <td style={styles.td}>{log.message || log.error_message || "-"}</td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={8} style={styles.empty}>暂无匹配日志</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="操作日志详情" maxWidth="980px">
        {selectedLog && (
          <div style={styles.detail}>
            <div style={styles.detailGrid}>
              <div><span>日志编号</span><strong className="mono">{selectedLog.id}</strong></div>
              <div><span>发生时间</span><strong>{formatDateTime(selectedLog.created_at)}</strong></div>
              <div><span>操作人</span><strong>{selectedLog.actor_name || selectedLog.actor_email || "-"}</strong></div>
              <div><span>角色</span><strong>{selectedLog.actor_role || "-"}</strong></div>
              <div><span>模块</span><strong>{MODULE_LABELS[selectedLog.module] || selectedLog.module}</strong></div>
              <div><span>动作</span><strong>{ACTION_LABELS[selectedLog.action] || selectedLog.action}</strong></div>
              <div><span>对象</span><strong>{selectedLog.target_label || selectedLog.target_id || "-"}</strong></div>
              <div><span>结果</span><Badge text={selectedLog.status === "success" ? "成功" : "失败"} status={selectedLog.status} /></div>
            </div>
            <div style={styles.messageBox}>{selectedLog.message || selectedLog.error_message || "-"}</div>
            <JsonBlock title="操作前数据" value={selectedLog.before_data} />
            <JsonBlock title="操作后数据" value={selectedLog.after_data} />
            <JsonBlock title="提交参数" value={selectedLog.request_payload} />
            {selectedLog.error_message && <div style={styles.errorBox}>{selectedLog.error_message}</div>}
            <div style={styles.userAgent}>{selectedLog.user_agent || ""}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: "22px" },
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  subtitle: { color: "var(--text-secondary)", marginTop: "6px", fontSize: "0.9rem" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" },
  statCard: { padding: "16px", display: "flex", alignItems: "center", gap: "12px" },
  filters: { padding: "16px", display: "grid", gridTemplateColumns: "2fr repeat(6, minmax(120px, 1fr))", gap: "10px", alignItems: "center" },
  searchBox: { display: "flex", alignItems: "center", gap: "8px" },
  tableWrap: { padding: "18px", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" },
  th: { padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid var(--border)", cursor: "pointer" },
  td: { padding: "12px", color: "var(--text-primary)", verticalAlign: "middle" },
  actorName: { fontWeight: 700 },
  actorEmail: { color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "3px" },
  targetLabel: { fontWeight: 600 },
  empty: { padding: "36px", textAlign: "center", color: "var(--text-muted)" },
  detail: { display: "flex", flexDirection: "column", gap: "16px" },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" },
  messageBox: { padding: "12px", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" },
  detailBlock: { display: "flex", flexDirection: "column", gap: "8px" },
  detailTitle: { color: "var(--text-secondary)", fontWeight: 700, fontSize: "0.85rem" },
  pre: { margin: 0, padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)", overflowX: "auto", fontSize: "0.78rem" },
  errorBox: { padding: "12px", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", color: "var(--accent-red)" },
  userAgent: { color: "var(--text-muted)", fontSize: "0.75rem", wordBreak: "break-all" }
};

export default AuditLogs;
