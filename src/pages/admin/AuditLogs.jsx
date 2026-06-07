import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const PAGE_SIZES = [50, 100, 200];

function formatDateTime(value) {
  if (!value) return "-";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
    }
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(d);
  const get = (type) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function getBeijingDateRangeToday() {
  const date = formatDateTime(new Date()).slice(0, 10);
  return [`${date} 00:00:00`, `${date} 23:59:59`];
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

function buildWhereClause({ keyword, moduleFilter, actionFilter, statusFilter, actorFilter, dateFrom, dateTo }) {
  const clauses = [];
  const params = [];
  const kw = keyword.trim();

  if (moduleFilter) {
    clauses.push("module = ?");
    params.push(moduleFilter);
  }
  if (actionFilter) {
    clauses.push("action = ?");
    params.push(actionFilter);
  }
  if (statusFilter) {
    clauses.push("status = ?");
    params.push(statusFilter);
  }
  if (actorFilter) {
    clauses.push("actor_role = ?");
    params.push(actorFilter);
  }
  if (dateFrom) {
    clauses.push("created_at >= ?");
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    clauses.push("created_at <= ?");
    params.push(`${dateTo} 23:59:59`);
  }
  if (kw) {
    const like = `%${kw}%`;
    clauses.push(`(
      actor_email LIKE ?
      OR actor_name LIKE ?
      OR actor_role LIKE ?
      OR action LIKE ?
      OR module LIKE ?
      OR target_label LIKE ?
      OR target_id LIKE ?
      OR message LIKE ?
      OR error_message LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like, like);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function getCount(row) {
  return Number(row?.count || row?.["COUNT(*)"] || 0);
}

export function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, failures: 0, actors: 0 });

  const filterState = useMemo(() => ({
    keyword,
    moduleFilter,
    actionFilter,
    statusFilter,
    actorFilter,
    dateFrom,
    dateTo
  }), [keyword, moduleFilter, actionFilter, statusFilter, actorFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const displayPage = Math.min(page, totalPages);

  const loadStats = useCallback(async () => {
    const [todayStart, todayEnd] = getBeijingDateRangeToday();
    const data = await querySQL(
      `SELECT
        (SELECT COUNT(*) FROM audit_logs) AS total,
        (SELECT COUNT(*) FROM audit_logs WHERE created_at >= ? AND created_at <= ?) AS today,
        (SELECT COUNT(*) FROM audit_logs WHERE status = 'failure') AS failures,
        (SELECT COUNT(DISTINCT COALESCE(actor_uid, actor_email)) FROM audit_logs WHERE actor_uid IS NOT NULL OR actor_email IS NOT NULL) AS actors`,
      [todayStart, todayEnd]
    );
    const row = data?.[0] || {};
    setStats({
      total: Number(row.total || 0),
      today: Number(row.today || 0),
      failures: Number(row.failures || 0),
      actors: Number(row.actors || 0)
    });
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { whereSql, params } = buildWhereClause(filterState);
      const safePageSize = PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 50;
      const offset = Math.max(0, (page - 1) * safePageSize);
      const [rows, countRows] = await Promise.all([
        querySQL(
          `SELECT id, actor_uid, actor_email, actor_role, actor_name,
                  action, module, target_type, target_id, target_label,
                  status, message, error_message, created_at
           FROM audit_logs
           ${whereSql}
           ORDER BY created_at DESC
           LIMIT ${safePageSize} OFFSET ${offset}`,
          params
        ),
        querySQL(`SELECT COUNT(*) AS count FROM audit_logs ${whereSql}`, params)
      ]);
      const nextTotal = getCount(countRows?.[0]);
      setLogs(rows || []);
      setTotalRows(nextTotal);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / safePageSize));
      if (page > nextTotalPages) setPage(nextTotalPages);
    } catch (err) {
      alert("加载操作安全日志失败：" + err.message);
    } finally {
      setLoading(false);
    }
  }, [filterState, page, pageSize]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStats(), loadLogs()]);
  }, [loadStats, loadLogs]);

  useEffect(() => {
    loadStats().catch(err => console.warn("加载安全日志统计失败", err.message));
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
  }, [keyword, moduleFilter, actionFilter, statusFilter, actorFilter, dateFrom, dateTo, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadLogs();
    }, keyword.trim() ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs, keyword]);

  const openDetail = async (log) => {
    setSelectedLog(log);
    setDetailLoading(true);
    try {
      const rows = await querySQL("SELECT * FROM audit_logs WHERE id = ?", [log.id]);
      setSelectedLog(rows?.[0] || log);
    } catch (err) {
      alert("加载日志详情失败：" + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const startRow = totalRows === 0 ? 0 : (displayPage - 1) * pageSize + 1;
  const endRow = Math.min(displayPage * pageSize, totalRows);

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>操作安全日志</h2>
          <p style={styles.subtitle}>只读审计台账，列表按页加载，完整 JSON 详情点击后按需读取。</p>
        </div>
        <button onClick={refreshAll} className="btn-secondary" disabled={loading}>
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
        <div style={styles.tableTopBar}>
          <div style={styles.resultMeta}>
            {loading ? "日志加载中..." : `显示 ${startRow}-${endRow} 条，共 ${totalRows} 条匹配记录`}
          </div>
          <div style={styles.pageControls}>
            <span>每页</span>
            <select className="form-input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={styles.pageSizeSelect}>
              {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>

        <div className="table-container" style={styles.tableContainer}>
          <table className="data-table" style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>北京时间</th>
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
              {logs.map(log => (
                <tr key={log.id} style={styles.tr} onClick={() => openDetail(log)}>
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
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} style={styles.empty}>{loading ? "日志加载中..." : "暂无匹配日志"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.paginationRow}>
          <button type="button" className="btn-secondary" disabled={displayPage <= 1 || loading} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
            上一页
          </button>
          <span style={styles.pageIndicator}>第 {displayPage} / {totalPages} 页</span>
          <button type="button" className="btn-secondary" disabled={displayPage >= totalPages || loading} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>
            下一页
          </button>
        </div>
      </div>

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="操作日志详情" maxWidth="980px">
        {selectedLog && (
          <div style={styles.detail}>
            <div style={styles.detailGrid}>
              <div><span>日志编号</span><strong className="mono">{selectedLog.id}</strong></div>
              <div><span>发生时间（北京时间）</span><strong>{formatDateTime(selectedLog.created_at)}</strong></div>
              <div><span>操作人</span><strong>{selectedLog.actor_name || selectedLog.actor_email || "-"}</strong></div>
              <div><span>角色</span><strong>{selectedLog.actor_role || "-"}</strong></div>
              <div><span>模块</span><strong>{MODULE_LABELS[selectedLog.module] || selectedLog.module}</strong></div>
              <div><span>动作</span><strong>{ACTION_LABELS[selectedLog.action] || selectedLog.action}</strong></div>
              <div><span>对象</span><strong>{selectedLog.target_label || selectedLog.target_id || "-"}</strong></div>
              <div><span>结果</span><Badge text={selectedLog.status === "success" ? "成功" : "失败"} status={selectedLog.status} /></div>
            </div>
            {detailLoading && <div style={styles.messageBox}>正在加载完整日志详情...</div>}
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
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" },
  subtitle: { color: "var(--text-secondary)", marginTop: "6px", fontSize: "0.9rem" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" },
  statCard: { padding: "16px", display: "flex", alignItems: "center", gap: "12px" },
  filters: { padding: "16px", display: "grid", gridTemplateColumns: "2fr repeat(6, minmax(120px, 1fr))", gap: "10px", alignItems: "center" },
  searchBox: { display: "flex", alignItems: "center", gap: "8px" },
  tableWrap: { padding: "18px", display: "flex", flexDirection: "column", gap: "14px" },
  tableTopBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  resultMeta: { color: "var(--text-secondary)", fontSize: "0.86rem" },
  pageControls: { display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "0.86rem" },
  pageSizeSelect: { width: "92px", padding: "8px 10px" },
  tableContainer: { borderRadius: "8px", border: "1px solid var(--border)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" },
  th: { padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid var(--border)", cursor: "pointer" },
  td: { padding: "12px", color: "var(--text-primary)", verticalAlign: "middle" },
  actorName: { fontWeight: 700 },
  actorEmail: { color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "3px" },
  targetLabel: { fontWeight: 600 },
  empty: { padding: "36px", textAlign: "center", color: "var(--text-muted)" },
  paginationRow: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" },
  pageIndicator: { color: "var(--text-secondary)", fontSize: "0.86rem" },
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
