import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, User, DollarSign, Activity, FileText } from "lucide-react";
import { querySQL } from "../../lib/db";
import { formatCNY, formatDate, formatPercent } from "../../lib/formatters";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";

export function InvestorDetail() {
  const { id } = useParams();
  const [investor, setInvestor] = useState(null);
  const [poolMembers, setPoolMembers] = useState([]);
  const [projectInvestments, setProjectInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const loadInvestorDetails = async () => {
      setLoading(true);
      try {
        // 1. 基本信息
        const invResult = await querySQL(`SELECT * FROM investors WHERE id = ?`, [id]);
        if (!invResult || invResult.length === 0) {
          throw new Error("找不到该出资方记录");
        }
        setInvestor(invResult[0]);

        // 2. 参与的资金池（关联获取名称并计算动态占比）
        const pmResultRaw = await querySQL(`
          SELECT pm.*, p.name AS pool_name 
          FROM pool_members pm 
          JOIN pools p ON pm.pool_id = p.id 
          WHERE pm.investor_id = ?
        `, [id]);

        // 为了显示精准的“池内占比”，需要获取这些池子的实缴总规模
        const poolIds = pmResultRaw.map(pm => pm.pool_id);
        const poolAUMs = {};
        if (poolIds.length > 0) {
          const aumResults = await querySQL(`
            SELECT pool_id, SUM(called_amount) as total_called 
            FROM pool_members 
            WHERE pool_id IN (${poolIds.map(() => '?').join(',')})
            GROUP BY pool_id
          `, poolIds);
          aumResults.forEach(r => { poolAUMs[r.pool_id] = Number(r.total_called); });
        }

        const pmResult = pmResultRaw.map(pm => ({
          ...pm,
          dynamic_share_pct: poolAUMs[pm.pool_id] > 0 
            ? (Number(pm.called_amount) / poolAUMs[pm.pool_id] * 100) 
            : 0
        }));
        setPoolMembers(pmResult);

        // 3. 直投的项目
        const piResult = await querySQL(`SELECT pi.*, pr.name as project_name, pr.status as project_status FROM project_investors pi LEFT JOIN projects pr ON pi.project_id = pr.id WHERE pi.investor_id = ?`, [id]);
        setProjectInvestments(piResult);

        // 4. 所有流水
        const txResult = await querySQL(`
          SELECT t.*, p.name AS pool_name, pr.name AS project_name,
                 i.name AS investor_name, rp.name AS related_pool_name 
          FROM transactions t
          LEFT JOIN pools p ON t.pool_id = p.id
          LEFT JOIN pools rp ON t.related_pool_id = rp.id
          LEFT JOIN projects pr ON t.project_id = pr.id
          LEFT JOIN investors i ON t.investor_id = i.id
          WHERE t.investor_id = ? 
          ORDER BY t.date DESC, t.created_at DESC
        `, [id]);
        setTransactions(txResult);

        // 5. 所有的收益分配历史
        const distResult = await querySQL(`
          SELECT di.*, d.distribution_date, d.description, d.status, 
                 p.name as pool_name, d.pool_id as dist_pool_id, 
                 pr.name as project_name, d.project_id as dist_project_id
          FROM distribution_items di 
          JOIN distributions d ON di.distribution_id = d.id 
          LEFT JOIN pools p ON d.pool_id = p.id 
          LEFT JOIN projects pr ON d.project_id = pr.id
          WHERE di.investor_id = ?
          ORDER BY d.distribution_date DESC
        `, [id]);
        setDistributions(distResult);

      } catch (err) {
        setError(err.message || "加载详情失败");
      } finally {
        setLoading(false);
      }
    };
    loadInvestorDetails();
  }, [id]);

  const [txCurrentPage, setTxCurrentPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(10);

  const paginatedTxs = React.useMemo(() => {
    return transactions.slice((txCurrentPage - 1) * txPageSize, txCurrentPage * txPageSize);
  }, [transactions, txCurrentPage, txPageSize]);

  const txTotalPages = Math.ceil(transactions.length / txPageSize);

  if (loading) return <div style={{ padding: 20 }}>正在加载出资方台账...</div>;
  if (error) return <div style={{ padding: 20, color: "var(--accent-red)" }}>{error}</div>;
  if (!investor) return null;

  // 统计数据
  const totalPoolCommitted = poolMembers.reduce((sum, pm) => sum + Number(pm.committed_amount || 0), 0);
  const totalPoolCalled = poolMembers.reduce((sum, pm) => sum + Number(pm.called_amount || 0), 0);
  const totalProjectCommitted = projectInvestments.reduce((sum, pi) => sum + Number(pi.committed_amount || 0), 0);
  const totalProjectInvested = projectInvestments.reduce((sum, pi) => sum + Number(pi.invested_amount || 0), 0);

  const totalCommitted = totalPoolCommitted + totalProjectCommitted;
  const totalInvested = totalPoolCalled + totalProjectInvested;

  const txReturned = transactions
    .filter(tx => tx.type === "return")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    
  const distReturned = distributions
    .reduce((sum, d) => sum + Number(d.amount || 0), 0);

  const totalReturned = txReturned + distReturned;

  const getSourceName = (row) => {
    if (row.type === "capital_call") return row.investor_name || "";
    if (row.type === "investment") return row.pool_name || "";
    if (row.type === "pool_investment") return row.pool_name || "";
    if (row.type === "pool_transfer_out") return row.pool_name || "";
    if (row.type === "pool_transfer_in") return row.related_pool_name || "";
    if (row.type === "return" || row.type === "distribution") return row.project_name || "";
    return row.direction === "in" ? "外部来源" : (row.pool_name || "");
  };

  const getTargetName = (row) => {
    if (row.type === "capital_call") return row.pool_name || "";
    if (row.type === "investment") return row.project_name || "";
    if (row.type === "pool_investment") return row.related_pool_name || "";
    if (row.type === "pool_transfer_in") return row.pool_name || "";
    if (row.type === "pool_transfer_out") return row.related_pool_name || "";
    if (row.type === "return") return row.investor_name || row.pool_name || "";
    if (row.type === "distribution") return row.investor_name || row.pool_name || "";
    return row.direction === "in" ? (row.pool_name || "") : "外部去向";
  };

  const txHeaders = [
    { key: "id", label: "流水编号", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{v}</span> },
    { key: "date", label: "发生日期", render: (v) => formatDate(v) },
    { 
      key: "sourceName", 
      label: "出账方 (Source)", 
      render: (_, row) => {
        const name = getSourceName(row);
        return <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name || "未知"}</span>;
      }
    },
    { 
      key: "targetName", 
      label: "进账方 (Target)", 
      render: (_, row) => {
        const name = getTargetName(row);
        return <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name || "未知"}</span>;
      }
    },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => {
        const typeMap = {
          capital_call: "实缴打款(入)",
          investment: "项目投资(出)",
          pool_investment: "母池注资(出)",
          return: "项目回款(入)",
          distribution: "收益分红(出)",
          fee: "管理费/支出",
          adjustment: "人工核校"
        };
        const colorMap = {
          capital_call: "warning", // 金色
          investment: "danger", // 红色
          pool_investment: "danger", 
          return: "success",
          distribution: "success",
        };
        const badgeStatus = colorMap[v] || "default";
        return <Badge text={typeMap[v] || v} status={badgeStatus} />;
      }
    },
    { 
      key: "amount", 
      label: "金额", 
      align: "right",
      render: (v, row) => (
        <span className={`mono amt-bold ${row.direction === 'in' ? 'amt-in' : 'amt-out'}`}>
          {row.direction === 'in' ? '+' : '-'}{formatCNY(v, false)}
        </span>
      )
    },
    { key: "reference_no", label: "凭证号", className: "mono" },
    { key: "description", label: "摘要说明" }
  ];

  const poolHeaders = [
    { key: "pool_name", label: "所属资金池", render: (v, pm) => <Link to={`/admin/pools/${pm.pool_id}`} className="text-link" style={{ fontWeight: 600 }}>{v}</Link> },
    { key: "committed_amount", label: "认缴参考额", render: (v) => formatCNY(v, false) },
    { key: "called_amount", label: "累计实缴额", className: "amt-in", render: (v) => <span className="mono amt-bold">{formatCNY(v, false)}</span> },
    { key: "dynamic_share_pct", label: "实时池内占比", render: (v) => <span className="badge badge-warning">{v.toFixed(4)}%</span> },
    { key: "status", label: "状态", render: (v) => <Badge text={v === 'active' ? '正常在投' : '已退出'} status={v} /> }
  ];

  const projectHeaders = [
    { key: "project_name", label: "直投项目", render: (v, pi) => <Link to={`/admin/projects/${pi.project_id}`} className="text-link" style={{ fontWeight: 600 }}>{v}</Link> },
    { key: "committed_amount", label: "认缴额度", className: "mono", render: (v) => formatCNY(v) },
    { key: "invested_amount", label: "已实缴/打款", className: "mono", render: (v) => formatCNY(v) },
    { key: "status", label: "状态", render: (v) => <Badge text={v === 'active' ? '正常在投' : '已退出'} status={v} /> }
  ];

  const distHeaders = [
    { key: "distribution_date", label: "结算日期", render: (v) => formatDate(v) },
    { key: "source", label: "分配来源", render: (_, di) => {
      const name = di.project_name || di.pool_name || '-';
      const id = di.dist_project_id || di.dist_pool_id || '-';
      return <span style={{ fontWeight: 600 }}>{name} (ID: {id})</span>;
    } },
    { key: "effective_share_pct", label: "有效份额", className: "mono", render: (v) => formatPercent(v) },
    { key: "amount", label: "结算金额", className: "mono", render: (v) => (
      <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>+{formatCNY(v)}</span>
    ) },
    { key: "status", label: "状态", render: (v) => (
      <span style={{
        padding: "2px 6px", borderRadius: "4px", fontSize: "12px",
        backgroundColor: v === 'confirmed' ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
        color: v === 'confirmed' ? "var(--accent-green)" : "var(--accent-gold)"
      }}>
        {v === 'confirmed' ? '已到账' : '草稿'}
      </span>
    ) },
    { key: "description", label: "方案说明" }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to="/admin/investors" style={styles.backLink}>
          <ArrowLeft size={16} /> 返回出资方列表
        </Link>
        <div style={styles.titleRow}>
          <h2>{investor.name} <span style={{ fontSize: "16px", color: "var(--text-secondary)", fontWeight: 400 }}>({investor.type === "individual" ? "个人 LP" : "机构基金 LP"})</span></h2>
          <Badge text={investor.type} status="active" />
        </div>
      </div>

      <div style={styles.statsGrid}>
        <StatCard 
          title="认缴总额 (Committed)" 
          value={formatCNY(totalCommitted, false)} 
          icon={User} 
          trend="包含大池及项目直投"
          color="var(--accent-blue)"
        />
        <StatCard 
          title="实缴总额 (Called/Invested)" 
          value={formatCNY(totalInvested, false)} 
          icon={DollarSign} 
          trend={`已实缴占比 ${((totalInvested/totalCommitted)*100).toFixed(1)}%`}
          color="var(--accent-gold)"
        />
        <StatCard 
          title="累计获得退款/分红" 
          value={formatCNY(totalReturned, false)} 
          icon={Activity} 
          trend="从系统流出的本息收益"
          color="var(--accent-green)"
        />
      </div>

      <div className="glass-card" style={styles.tabsContainer}>
        <div style={styles.tabNav}>
          <button 
            style={activeTab === "overview" ? { ...styles.tabBtn, ...styles.activeTabBtn } : styles.tabBtn}
            onClick={() => setActiveTab("overview")}
          >
            <User size={16} /> 基本档案
          </button>
          <button 
            style={activeTab === "pools" ? { ...styles.tabBtn, ...styles.activeTabBtn } : styles.tabBtn}
            onClick={() => setActiveTab("pools")}
          >
            资金池份额 ({poolMembers.length})
          </button>
          <button 
            style={activeTab === "projects" ? { ...styles.tabBtn, ...styles.activeTabBtn } : styles.tabBtn}
            onClick={() => setActiveTab("projects")}
          >
            直接参投项目 ({projectInvestments.length})
          </button>
          <button 
            style={activeTab === "transactions" ? { ...styles.tabBtn, ...styles.activeTabBtn } : styles.tabBtn}
            onClick={() => setActiveTab("transactions")}
          >
            <FileText size={16} /> 资金流水簿 ({transactions.length})
          </button>
          <button 
            style={activeTab === "distributions" ? { ...styles.tabBtn, ...styles.activeTabBtn } : styles.tabBtn}
            onClick={() => setActiveTab("distributions")}
          >
            <DollarSign size={16} /> 收益结算单 ({distributions.length})
          </button>
        </div>

        <div style={styles.tabContent}>
          {activeTab === "overview" && (
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>对接人姓名</span>
                <span style={styles.infoValue}>{investor.contact || '-'}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>联系电话</span>
                <span style={styles.infoValue}>{investor.phone || '-'}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>对账电子邮箱</span>
                <span style={styles.infoValue}>{investor.email || '-'}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>登录识别码 (UID)</span>
                <span style={styles.infoValue} className="mono">{investor.uid || '-'}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>录入时间</span>
                <span style={styles.infoValue}>{formatDate(investor.created_at)}</span>
              </div>
              <div style={styles.infoItem} style={{ gridColumn: "span 2" }}>
                <span style={styles.infoLabel}>备注说明</span>
                <span style={styles.infoValue}>{investor.note || '无'}</span>
              </div>
            </div>
          )}

          {activeTab === "pools" && (
            <DataTable headers={poolHeaders} data={poolMembers} emptyMessage="该出资方暂未参与任何资金池" />
          )}

          {activeTab === "projects" && (
            <DataTable headers={projectHeaders} data={projectInvestments} emptyMessage="该出资方暂无直投项目记录" />
          )}

          {activeTab === "transactions" && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <DataTable headers={txHeaders} data={paginatedTxs} emptyMessage="该出资方暂无核心资金进出流水" />
              
              {/* 分页控制栏 */}
              <div style={styles.paginationRow}>
                <div style={styles.paginationLeft}>
                  <span>每页显示：</span>
                  <select 
                    value={txPageSize} 
                    onChange={(e) => {
                      setTxPageSize(Number(e.target.value));
                      setTxCurrentPage(1);
                    }}
                    className="form-input"
                    style={styles.pageSizeSelect}
                  >
                    <option value={5}>5 条</option>
                    <option value={10}>10 条</option>
                    <option value={20}>20 条</option>
                    <option value={50}>50 条</option>
                  </select>
                  <span style={{ marginLeft: "12px", color: "var(--text-secondary)" }}>
                    共 {transactions.length} 条记录
                  </span>
                </div>
                
                {txTotalPages > 1 && (
                  <div style={styles.paginationRight}>
                    <button 
                      onClick={() => setTxCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={txCurrentPage === 1}
                      className="btn-secondary"
                      style={styles.pageBtn}
                    >
                      上一页
                    </button>
                    <span style={styles.pageIndicator}>
                      第 {txCurrentPage} / {txTotalPages} 页
                    </span>
                    <button 
                      onClick={() => setTxCurrentPage(prev => Math.min(prev + 1, txTotalPages))}
                      disabled={txCurrentPage === txTotalPages}
                      className="btn-secondary"
                      style={styles.pageBtn}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "distributions" && (
            <DataTable headers={distHeaders} data={distributions} emptyMessage="该出资方暂无收益结算记录" />
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: "24px" },
  header: { display: "flex", flexDirection: "column", gap: "12px" },
  backLink: { 
    display: "flex", alignItems: "center", gap: "6px", 
    color: "var(--text-secondary)", textDecoration: "none", fontSize: "14px" 
  },
  titleRow: { display: "flex", alignItems: "center", gap: "16px" },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "24px"
  },
  tabsContainer: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  tabNav: {
    display: "flex",
    gap: "16px",
    padding: "0 24px",
    borderBottom: "1px solid var(--border)",
    backgroundColor: "rgba(255,255,255,0.02)"
  },
  tabBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "16px 8px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--text-secondary)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s"
  },
  activeTabBtn: {
    color: "var(--text)",
    borderBottom: "2px solid var(--accent-blue)"
  },
  tabContent: {
    padding: "24px",
    minHeight: "300px"
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px",
    background: "rgba(255,255,255,0.02)",
    padding: "24px",
    borderRadius: "8px",
    border: "1px solid var(--border)"
  },
  infoItem: {
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  },
  infoLabel: {
    fontSize: "13px",
    color: "var(--text-secondary)"
  },
  infoValue: {
    fontSize: "15px",
    color: "var(--text)"
  },
  paginationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "20px",
    paddingTop: "16px",
    borderTop: "1px solid var(--border)"
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
    cursor: "pointer",
    height: "32px",
    display: "flex",
    alignItems: "center"
  },
  pageIndicator: {
    color: "var(--text-primary)",
    fontSize: "0.85rem",
    fontWeight: "500"
  }
};
export default InvestorDetail;
