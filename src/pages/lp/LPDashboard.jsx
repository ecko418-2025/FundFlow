import React, { useEffect, useMemo, useRef, useState } from "react";
import { querySQL } from "../../lib/db";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { Wallet, DollarSign, Layers, Briefcase } from "lucide-react";

function toNumber(value) {
  return Number(value || 0);
}

function buildPoolMemberShares(poolMembers, approvedTransactions) {
  const txMap = new Map();
  approvedTransactions
    .filter(tx => ["capital_call", "pool_transfer_in"].includes(tx.type))
    .forEach(tx => {
      const investorId = tx.investor_id || tx.related_pool_id;
      if (!tx.pool_id || !investorId) return;
      const key = `${tx.pool_id}:${investorId}`;
      txMap.set(key, (txMap.get(key) || 0) + toNumber(tx.amount));
    });

  const totalByPool = new Map();
  poolMembers.forEach(pm => {
    const liveCalled = txMap.get(`${pm.pool_id}:${pm.investor_id}`);
    const amount = liveCalled !== undefined ? liveCalled : toNumber(pm.called_amount);
    totalByPool.set(pm.pool_id, (totalByPool.get(pm.pool_id) || 0) + amount);
  });

  return poolMembers.map(pm => {
    const liveCalled = txMap.get(`${pm.pool_id}:${pm.investor_id}`);
    const calledAmount = liveCalled !== undefined ? liveCalled : toNumber(pm.called_amount);
    const total = totalByPool.get(pm.pool_id) || 0;
    return {
      ...pm,
      calculated_called_amount: calledAmount,
      calculated_share: total > 0 ? (calledAmount / total) * 100 : toNumber(pm.share_pct)
    };
  });
}

function buildProjectInvestorShares(projectInvestors, approvedTransactions) {
  const txMap = new Map();
  approvedTransactions
    .filter(tx => tx.type === "investment" && tx.project_id && tx.investor_id)
    .forEach(tx => {
      const key = `${tx.project_id}:${tx.investor_id}`;
      txMap.set(key, (txMap.get(key) || 0) + toNumber(tx.amount));
    });

  const totalByProject = new Map();
  projectInvestors.forEach(pi => {
    const liveInvested = txMap.get(`${pi.project_id}:${pi.investor_id}`);
    const amount = liveInvested !== undefined ? liveInvested : toNumber(pi.invested_amount);
    totalByProject.set(pi.project_id, (totalByProject.get(pi.project_id) || 0) + amount);
  });

  return projectInvestors.map(pi => {
    const liveInvested = txMap.get(`${pi.project_id}:${pi.investor_id}`);
    const investedAmount = liveInvested !== undefined ? liveInvested : toNumber(pi.invested_amount);
    const total = totalByProject.get(pi.project_id) || 0;
    return {
      ...pi,
      calculated_invested_amount: investedAmount,
      calculated_share: total > 0 ? (investedAmount / total) * 100 : 0
    };
  });
}

export function LPDashboard({ user }) {
  const [loading, setLoading] = useState(false);
  const [poolRows, setPoolRows] = useState([]);
  const [projectRows, setProjectRows] = useState([]);
  const [incomeRows, setIncomeRows] = useState([]);
  const [activeTab, setActiveTab] = useState("income");
  const [pageByTab, setPageByTab] = useState({ income: 1, projects: 1, pools: 1 });
  const [pageSizeByTab, setPageSizeByTab] = useState({ income: 20, projects: 20, pools: 20 });
  const tableSectionRef = useRef(null);

  useEffect(() => {
    async function loadLPDashboard() {
      if (!user?.investorId) return;
      setLoading(true);
      try {
        const [
          pools,
          poolMembersRaw,
          projects,
          projectInvestorsRaw,
          distributions,
          approvedTransactions
        ] = await Promise.all([
          querySQL("SELECT * FROM pools"),
          querySQL("SELECT * FROM pool_members WHERE status = 'active'"),
          querySQL("SELECT * FROM projects"),
          querySQL("SELECT * FROM project_investors WHERE status = 'active'"),
          querySQL(`
            SELECT di.*, d.distribution_date, d.description, d.status,
                   d.pool_id, d.project_id, p.name AS pool_name, pr.name AS project_name
            FROM distribution_items di
            JOIN distributions d ON di.distribution_id = d.id
            LEFT JOIN pools p ON d.pool_id = p.id
            LEFT JOIN projects pr ON d.project_id = pr.id
            WHERE di.investor_id = ? AND d.status = 'confirmed'
            ORDER BY d.distribution_date DESC
          `, [user.investorId]),
          querySQL("SELECT * FROM transactions t WHERE t.status = 'approved'")
        ]);

        const poolMap = new Map((pools || []).map(pool => [pool.id, pool]));
        const projectMap = new Map((projects || []).map(project => [project.id, project]));
        const poolMembers = buildPoolMemberShares(poolMembersRaw || [], approvedTransactions || []);
        const projectInvestors = buildProjectInvestorShares(projectInvestorsRaw || [], approvedTransactions || []);
        const poolIds = new Set((pools || []).map(pool => pool.id));

        const positions = new Map();
        const directPoolShares = new Map();
        let frontier = new Map();
        poolMembers
          .filter(pm => pm.investor_id === user.investorId && toNumber(pm.calculated_share) > 0)
          .forEach(pm => {
            const share = toNumber(pm.calculated_share);
            positions.set(pm.pool_id, (positions.get(pm.pool_id) || 0) + share);
            directPoolShares.set(pm.pool_id, (directPoolShares.get(pm.pool_id) || 0) + share);
            frontier.set(pm.pool_id, (frontier.get(pm.pool_id) || 0) + share);
          });

        for (let depth = 0; depth < 5; depth++) {
          if (frontier.size === 0) break;
          const nextFrontier = new Map();
          poolMembers
            .filter(pm => poolIds.has(pm.investor_id) && frontier.has(pm.investor_id))
            .forEach(pm => {
              const parentShare = frontier.get(pm.investor_id) || 0;
              const inheritedShare = parentShare * toNumber(pm.calculated_share) / 100;
              if (inheritedShare <= 0.0001) return;
              positions.set(pm.pool_id, (positions.get(pm.pool_id) || 0) + inheritedShare);
              nextFrontier.set(pm.pool_id, (nextFrontier.get(pm.pool_id) || 0) + inheritedShare);
            });
          frontier = nextFrontier;
        }

        const directCalledByPool = new Map();
        poolMembers
          .filter(pm => pm.investor_id === user.investorId)
          .forEach(pm => directCalledByPool.set(pm.pool_id, toNumber(pm.calculated_called_amount)));

        const poolSummary = [...positions.entries()]
          .map(([poolId, effectiveShare]) => {
            const pool = poolMap.get(poolId);
            return {
              pool_id: poolId,
              pool_name: pool?.name || poolId,
              pool_status: pool?.status || "-",
              direct_share: directPoolShares.get(poolId) || 0,
              indirect_share: effectiveShare - (directPoolShares.get(poolId) || 0),
              effective_share: effectiveShare,
              called_amount: directCalledByPool.get(poolId) || 0,
              pool_cash_balance: toNumber(pool?.available_balance),
              book_value: toNumber(pool?.available_balance) * effectiveShare / 100
            };
          })
          .filter(row => row.effective_share > 0)
          .sort((a, b) => b.book_value - a.book_value);

        const projectExposureRows = projectInvestors
          .flatMap(pi => {
            const project = projectMap.get(pi.project_id);
            if (pi.investor_id === user.investorId) {
              return [{
                project_id: pi.project_id,
                project_name: project?.name || pi.project_id,
                project_status: project?.status || "-",
                source_name: "直接出资",
                direct_share: toNumber(pi.calculated_share),
                effective_share: toNumber(pi.calculated_share),
                invested_amount: toNumber(pi.calculated_invested_amount),
                exposure_amount: toNumber(pi.calculated_invested_amount),
                joined_at: pi.joined_at
              }];
            }
            const poolShare = positions.get(pi.investor_id) || 0;
            if (poolShare <= 0) return [];
            const pool = poolMap.get(pi.investor_id);
            const effectiveProjectShare = poolShare * toNumber(pi.calculated_share) / 100;
            return [{
              project_id: pi.project_id,
              project_name: project?.name || pi.project_id,
              project_status: project?.status || "-",
              source_name: pool?.name || pi.investor_id,
              direct_share: 0,
              effective_share: effectiveProjectShare,
              invested_amount: 0,
              exposure_amount: toNumber(pi.calculated_invested_amount) * poolShare / 100,
              joined_at: pi.joined_at
            }];
          })
          .filter(row => row.effective_share > 0);

        const projectSummary = [...projectExposureRows.reduce((map, row) => {
          const existing = map.get(row.project_id) || {
            project_id: row.project_id,
            project_name: row.project_name,
            project_status: row.project_status,
            source_names: [],
            direct_share: 0,
            effective_share: 0,
            invested_amount: 0,
            exposure_amount: 0,
            joined_at: row.joined_at
          };
          existing.source_names.push(row.source_name);
          existing.direct_share += toNumber(row.direct_share);
          existing.effective_share += toNumber(row.effective_share);
          existing.invested_amount += toNumber(row.invested_amount);
          existing.exposure_amount += toNumber(row.exposure_amount);
          if (!existing.joined_at || (row.joined_at && row.joined_at < existing.joined_at)) {
            existing.joined_at = row.joined_at;
          }
          map.set(row.project_id, existing);
          return map;
        }, new Map()).values()]
          .map(row => ({
            ...row,
            source_name: [...new Set(row.source_names)].join(" / ")
          }))
          .sort((a, b) => b.exposure_amount - a.exposure_amount);

        setPoolRows(poolSummary);
        setProjectRows(projectSummary);
        setIncomeRows(distributions || []);
      } catch (err) {
        console.error("加载 LP 汇总数据失败", err);
      } finally {
        setLoading(false);
      }
    }

    loadLPDashboard();
  }, [user]);

  const totalDirectCalled = poolRows.reduce((sum, p) => sum + toNumber(p.called_amount), 0);
  const totalDistributions = incomeRows.reduce((sum, d) => sum + toNumber(d.amount), 0);
  const totalBookValue = poolRows.reduce((sum, p) => sum + toNumber(p.book_value), 0);
  const totalProjectExposure = projectRows.reduce((sum, p) => sum + toNumber(p.exposure_amount), 0);

  const poolHeaders = [
    { key: "pool_name", label: "参与资金池", render: (v) => <strong>{v}</strong> },
    { key: "pool_status", label: "状态", render: (v) => <Badge text={v === "active" ? "运营中" : "已关闭"} status={v} /> },
    { key: "direct_share", label: "直接比例", render: (v) => formatPercent(v) },
    { key: "indirect_share", label: "穿透比例", render: (v) => <span style={{ color: Number(v) > 0 ? "var(--accent-gold)" : "var(--text-secondary)" }}>{formatPercent(v)}</span> },
    { key: "effective_share", label: "最终有效比例", render: (v) => <span className="mono amt-bold" style={{ color: "var(--accent-blue)" }}>{formatPercent(v)}</span> },
    { key: "called_amount", label: "我的直接实缴", render: (v) => formatCNY(v, false) },
    { key: "book_value", label: "账面现金权益", align: "right", render: (v) => <span className="mono amt-bold" style={{ color: "var(--accent-gold)" }}>{formatCNY(v, false)}</span> }
  ];

  const projectHeaders = [
    { key: "project_name", label: "参与项目", render: (v) => <strong>{v}</strong> },
    { key: "project_status", label: "状态", render: (v) => {
      const labels = { pre: "投前考察", active: "存续管理", exited: "退出清算", archived: "项目归档" };
      return <Badge text={labels[v] || v} status={v} />;
    }},
    { key: "source_name", label: "参与路径" },
    { key: "effective_share", label: "我的有效份额", render: (v) => <span className="mono amt-bold" style={{ color: "var(--accent-blue)" }}>{formatPercent(v)}</span> },
    { key: "exposure_amount", label: "折算投资敞口", align: "right", render: (v) => <span className="mono amt-bold">{formatCNY(v, false)}</span> },
    { key: "joined_at", label: "登记时间", render: (v) => formatDate(v) }
  ];

  const incomeHeaders = [
    { key: "distribution_date", label: "分配日期", render: (v) => formatDate(v) },
    { key: "source", label: "分配来源", render: (_, row) => <strong>{row.project_name || row.pool_name || "-"}</strong> },
    { key: "effective_share_pct", label: "分配份额", render: (v) => formatPercent(v) },
    { key: "amount", label: "个人实收收益", align: "right", render: (v) => <span className="mono amt-in amt-bold">{formatCNY(v, false)}</span> },
    { key: "description", label: "备注" }
  ];

  const tableTabs = useMemo(() => [
    {
      key: "income",
      label: "个人收益分配",
      title: "我的个人收益分配汇总表",
      headers: incomeHeaders,
      rows: incomeRows,
      loadingMessage: "收益分配核对中...",
      emptyMessage: "暂无已确认的个人收益分配记录"
    },
    {
      key: "projects",
      label: "参与项目",
      title: "我参与的项目汇总表",
      headers: projectHeaders,
      rows: projectRows,
      loadingMessage: "项目参与关系核对中...",
      emptyMessage: "暂无项目参与记录"
    },
    {
      key: "pools",
      label: "参与资金池",
      title: "我参与的资金池汇总表",
      headers: poolHeaders,
      rows: poolRows,
      loadingMessage: "资金池持仓穿透核对中...",
      emptyMessage: "暂无资金池参与记录"
    }
  ], [incomeRows, projectRows, poolRows]);

  const activeTable = tableTabs.find(tab => tab.key === activeTab) || tableTabs[0];
  const currentPage = pageByTab[activeTable.key] || 1;
  const pageSize = pageSizeByTab[activeTable.key] || 20;
  const totalRows = activeTable.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const displayPage = Math.min(currentPage, totalPages);
  const paginatedRows = activeTable.rows.slice((displayPage - 1) * pageSize, displayPage * pageSize);

  const setActivePage = (nextPage) => {
    setPageByTab(prev => ({
      ...prev,
      [activeTable.key]: Math.max(1, Math.min(nextPage, totalPages))
    }));
  };

  const setActivePageSize = (nextPageSize) => {
    setPageSizeByTab(prev => ({ ...prev, [activeTable.key]: nextPageSize }));
    setPageByTab(prev => ({ ...prev, [activeTable.key]: 1 }));
  };

  const jumpToTable = (tabKey) => {
    setActiveTab(tabKey);
    setPageByTab(prev => ({ ...prev, [tabKey]: 1 }));
    window.requestAnimationFrame(() => {
      tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.welcome}>
        <h2>您好，{user?.displayName || "出资人"}</h2>
        <p>这里汇总展示您名下的个人收益、参与项目和参与资金池。</p>
      </div>

      <div style={styles.cardGrid}>
        <StatCard title="我的累计实缴出资" value={formatCNY(totalDirectCalled, false)} unit="元" subtext="直接打款至资金池的已审核金额" icon={Wallet} />
        <StatCard title="账面现金权益净值" value={formatCNY(totalBookValue, false)} unit="元" subtext="资金池现金余额 × 我的有效份额" icon={Layers} color="var(--accent-gold)" onClick={() => jumpToTable("pools")} />
        <StatCard title="累计个人分配收益" value={formatCNY(totalDistributions, false)} unit="元" subtext="已确认分配至本人账户的收益" icon={DollarSign} color="var(--accent-green)" onClick={() => jumpToTable("income")} />
        <StatCard title="项目折算投资敞口" value={formatCNY(totalProjectExposure, false)} unit="元" subtext="直接项目和穿透项目的合计敞口" icon={Briefcase} color="var(--accent-blue)" onClick={() => jumpToTable("projects")} />
      </div>

      <div ref={tableSectionRef} className="glass-card no-hover" style={styles.section}>
        <div style={styles.tableHeader}>
          <div>
            <h3 style={styles.sectionTitle}>{activeTable.title}</h3>
          </div>
          <div style={styles.tabs}>
            {tableTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...styles.tabButton,
                  ...(activeTab === tab.key ? styles.tabButtonActive : {})
                }}
              >
                <span>{tab.label}</span>
                <span style={styles.tabCount}>{tab.rows.length}</span>
              </button>
            ))}
          </div>
        </div>

        <DataTable
          headers={activeTable.headers}
          data={paginatedRows}
          emptyMessage={loading ? activeTable.loadingMessage : activeTable.emptyMessage}
        />

        <div style={styles.paginationRow}>
          <div style={styles.paginationLeft}>
            <span>每页显示：</span>
            <select
              value={pageSize}
              onChange={(e) => setActivePageSize(Number(e.target.value))}
              className="form-input"
              style={styles.pageSizeSelect}
            >
              <option value={10}>10 条</option>
              <option value={20}>20 条</option>
              <option value={50}>50 条</option>
            </select>
            <span>共 {totalRows} 条</span>
          </div>
          {totalPages > 1 && (
            <div style={styles.paginationRight}>
              <button
                type="button"
                onClick={() => setActivePage(displayPage - 1)}
                disabled={displayPage === 1}
                className="btn-secondary"
                style={styles.pageBtn}
              >
                上一页
              </button>
              <span style={styles.pageIndicator}>第 {displayPage} / {totalPages} 页</span>
              <button
                type="button"
                onClick={() => setActivePage(displayPage + 1)}
                disabled={displayPage === totalPages}
                className="btn-secondary"
                style={styles.pageBtn}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: "28px" },
  welcome: { display: "flex", flexDirection: "column", gap: "4px" },
  cardGrid: { display: "flex", flexWrap: "wrap", gap: "20px", width: "100%" },
  section: { padding: "24px", display: "flex", flexDirection: "column", gap: "18px" },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap"
  },
  sectionTitle: { fontSize: "1.05rem", fontWeight: "700", color: "var(--text-primary)" },
  tabs: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  tabButton: {
    minHeight: "36px",
    padding: "7px 12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "6px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    color: "var(--text-secondary)",
    fontSize: "0.86rem",
    fontWeight: 600,
    cursor: "pointer"
  },
  tabButtonActive: {
    backgroundColor: "rgba(37, 99, 235, 0.18)",
    borderColor: "var(--accent-blue)",
    color: "var(--text-primary)"
  },
  tabCount: {
    minWidth: "22px",
    height: "20px",
    padding: "0 6px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    color: "var(--text-secondary)",
    fontSize: "0.75rem"
  },
  paginationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    paddingTop: "16px",
    borderTop: "1px solid var(--border)",
    flexWrap: "wrap"
  },
  paginationLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "var(--text-secondary)",
    fontSize: "0.85rem"
  },
  pageSizeSelect: {
    padding: "4px 8px",
    fontSize: "0.85rem",
    width: "90px",
    height: "32px",
    borderRadius: "4px",
    backgroundColor: "var(--bg-secondary)",
    borderColor: "var(--border)",
    color: "var(--text-primary)"
  },
  paginationRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  pageBtn: {
    padding: "6px 12px",
    fontSize: "0.85rem",
    borderRadius: "4px",
    height: "32px",
    display: "flex",
    alignItems: "center"
  },
  pageIndicator: {
    color: "var(--text-secondary)",
    fontSize: "0.85rem"
  }
};

export default LPDashboard;
