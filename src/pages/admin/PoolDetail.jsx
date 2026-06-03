import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePools } from "../../hooks/usePools";
import { useTransactions } from "../../hooks/useTransactions";
import { useDistribution } from "../../hooks/useDistribution";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { 
  ArrowLeft, 
  Layers, 
  DollarSign, 
  TrendingUp, 
  Users, 
  Briefcase,
  History,
  Info
} from "lucide-react";

export function PoolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getPoolDetail } = usePools();
  const { getTransactions } = useTransactions();
  const { getDistributions } = useDistribution();

  const [activeTab, setActiveTab] = useState("overview");
  const [detail, setDetail] = useState(null);
  const [txs, setTxs] = useState([]);
  const [dists, setDists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPoolDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const poolDetail = await getPoolDetail(id);
      setDetail(poolDetail);

      const txList = await getTransactions({ poolId: id });
      setTxs(txList);

      const distList = await getDistributions(id);
      setDists(distList);
    } catch (err) {
      setError(err.message || "获取详情失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPoolDetails();
  }, [loadPoolDetails]);

  if (loading) return <div style={styles.loading}>数据深度加载中...</div>;
  if (error) return <div style={styles.error}><Info color="red" /> {error}</div>;
  if (!detail) return null;

  const { pool, members, projects, childInvestments, parentInvestments } = detail;

  const memberHeaders = [
    { key: "investor_name", label: "投资者名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "investor_type", label: "类型", render: (v) => v === "individual" ? "个人" : "机构/基金" },
    { key: "committed_amount", label: "直接认缴", render: (v) => formatCNY(v, false) },
    { key: "called_amount", label: "直接已实缴", render: (v) => formatCNY(v, false) },
    { key: "share_pct", label: "直接持股比例", align: "right", render: (v) => <span className="mono amt-bold">{formatPercent(v)}</span> }
  ];

  const projectHeaders = [
    { key: "name", label: "项目名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "code", label: "项目编号", render: (v) => <span className="badge badge-active">{v}</span> },
    { key: "status", label: "状态", render: (v) => {
        const labels = { pre: "投前", active: "存续中", exited: "已退出" };
        return <Badge text={labels[v] || v} status={v} />;
      }
    },
    { key: "committed_amount", label: "计划投放", render: (v) => formatCNY(v, false) },
    { key: "invested_amount", label: "已打款累计", render: (v) => formatCNY(v, false) },
    { key: "returned_amount", label: "收回款累计", render: (v) => formatCNY(v, false) }
  ];

  const txHeaders = [
    { key: "date", label: "交易日期", render: (v) => formatDate(v) },
    { key: "type", label: "流水类型", render: (v) => {
        const typeMap = {
          capital_call: "实缴出资",
          investment: "项目投资",
          return: "项目回款",
          distribution: "收益分配",
          fee: "管理费/支出",
          pool_transfer_out: "资金划出",
          pool_transfer_in: "资金划入"
        };
        return typeMap[v] || v;
      }
    },
    { key: "direction", label: "流入/流出", render: (v) => <Badge text={v === 'in' ? '流入' : '流出'} status={v} /> },
    { key: "amount", label: "发生金额", align: "right", render: (v, row) => (
        <span className={`mono amt-bold ${row.direction === 'in' ? 'amt-in' : 'amt-out'}`}>
          {row.direction === 'in' ? '+' : '-'}{formatCNY(v, false)}
        </span>
      )
    },
    { key: "description", label: "摘要说明" }
  ];

  const distHeaders = [
    { key: "distribution_date", label: "分配日期", render: (v) => formatDate(v) },
    { key: "total_amount", label: "分红总额", render: (v) => formatCNY(v, false) },
    { key: "status", label: "分配状态", render: (v) => <Badge text={v === "confirmed" ? "已到账" : "草稿中"} status={v} /> },
    { key: "description", label: "方案说明" },
    { key: "created_at", label: "创建时间", render: (v) => formatDate(v) }
  ];

  return (
    <div style={styles.container}>
      {/* 顶部标题与返回按钮 */}
      <div style={styles.header}>
        <button onClick={() => navigate("/admin/pools")} style={styles.backBtn}>
          <ArrowLeft size={16} />
          <span>返回列表</span>
        </button>
        <div style={styles.poolTitle}>
          <h2>{pool.name}</h2>
          <Badge text={pool.status === 'active' ? '正常存续中' : '已结清关闭'} status={pool.status} />
        </div>
      </div>

      {/* 四大卡片 */}
      <div style={styles.cardGrid}>
        <StatCard 
          title="认缴总额" 
          value={formatCNY(pool.total_committed, false)} 
          unit="元"
          subtext="包含本级直接持股"
          icon={Layers}
        />
        <StatCard 
          title="可用现金余额" 
          value={formatCNY(pool.available_balance, false)} 
          unit="元"
          subtext="可流向项目投资的自由现金"
          icon={DollarSign}
          color="var(--accent-gold)"
        />
        <StatCard 
          title="直接出资人" 
          value={members.length} 
          unit="人"
          subtext="本级持股名单"
          icon={Users}
          color="var(--accent-green)"
        />
        <StatCard 
          title="关联投向项目" 
          value={projects.length} 
          unit="个"
          subtext="由本池出资的组合"
          icon={Briefcase}
          color="var(--accent-red)"
        />
      </div>

      {/* Tab 导航标签 */}
      <div style={styles.tabBar}>
        <button 
          onClick={() => setActiveTab("overview")} 
          style={{ ...styles.tabBtn, ...(activeTab === "overview" ? styles.tabBtnActive : {}) }}
        >
          <Info size={16} />
          <span>基本概览</span>
        </button>
        <button 
          onClick={() => setActiveTab("investors")} 
          style={{ ...styles.tabBtn, ...(activeTab === "investors" ? styles.tabBtnActive : {}) }}
        >
          <Users size={16} />
          <span>出资方列表 ({members.length})</span>
        </button>
        <button 
          onClick={() => setActiveTab("projects")} 
          style={{ ...styles.tabBtn, ...(activeTab === "projects" ? styles.tabBtnActive : {}) }}
        >
          <Briefcase size={16} />
          <span>投向项目 ({projects.length})</span>
        </button>
        <button 
          onClick={() => setActiveTab("ledger")} 
          style={{ ...styles.tabBtn, ...(activeTab === "ledger" ? styles.tabBtnActive : {}) }}
        >
          <DollarSign size={16} />
          <span>流水明细 ({txs.length})</span>
        </button>
        <button 
          onClick={() => setActiveTab("dists")} 
          style={{ ...styles.tabBtn, ...(activeTab === "dists" ? styles.tabBtnActive : {}) }}
        >
          <History size={16} />
          <span>分配明细 ({dists.length})</span>
        </button>
      </div>

      {/* Tab 内容区 */}
      <div style={styles.tabContent}>
        {/* 1. 概览 Tab */}
        {activeTab === "overview" && (
          <div style={styles.overviewGrid}>
            {/* 资金池基本信息 */}
            <div className="glass-card" style={styles.infoCard}>
              <h3 style={styles.sectionTitle}>基本概况</h3>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>资金池 ID</span>
                <span className="mono">{pool.id}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>资金池名称</span>
                <span>{pool.name}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>当前状态</span>
                <span>{pool.status === 'active' ? '在管存续中' : '已关闭'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>结算币种</span>
                <span>CNY (人民币)</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>创建时间</span>
                <span>{formatDate(pool.created_at)}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>备注说明</span>
                <span style={{ color: "var(--text-secondary)" }}>{pool.description || "无"}</span>
              </div>
            </div>

            {/* 池间投资（大池投小池）层级分析 */}
            <div className="glass-card" style={styles.infoCard}>
              <h3 style={styles.sectionTitle}>层级投资结构 (Hierarchy)</h3>
              
              {/* 母池列表（本池接受了哪些上级大池投资） */}
              <div style={{ marginBottom: "20px" }}>
                <h4 style={styles.subSubTitle}>上级出资方 (母资金池)</h4>
                {parentInvestments.length === 0 ? (
                  <p style={styles.emptyText}>本级池子无上级母池出资，属于顶级资金池。</p>
                ) : (
                  parentInvestments.map(pi => (
                    <div 
                      key={pi.id} 
                      onClick={() => navigate(`/admin/pools/${pi.parent_pool_id}`)}
                      style={styles.hierarchyLink}
                    >
                      <span style={{ fontWeight: 600 }}>{pi.parent_pool_name}</span>
                      <div style={styles.linkValues}>
                        <span className="mono">投资了 {formatCNY(pi.invested_amount, false)}</span>
                        <span className="badge badge-active">{formatPercent(pi.share_pct)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 子池列表（本池又往哪些下级小池投资了钱） */}
              <div>
                <h4 style={styles.subSubTitle}>下级被投资方 (子资金池)</h4>
                {childInvestments.length === 0 ? (
                  <p style={styles.emptyText}>本级池子未对外出资给子池。</p>
                ) : (
                  childInvestments.map(pi => (
                    <div 
                      key={pi.id} 
                      onClick={() => navigate(`/admin/pools/${pi.child_pool_id}`)}
                      style={styles.hierarchyLink}
                    >
                      <span style={{ fontWeight: 600 }}>{pi.child_pool_name}</span>
                      <div style={styles.linkValues}>
                        <span className="mono">已拨付 {formatCNY(pi.invested_amount, false)}</span>
                        <span className="badge badge-warning">{formatPercent(pi.share_pct)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. 出资方 Tab */}
        {activeTab === "investors" && (
          <div className="glass-card">
            <DataTable headers={memberHeaders} data={members} emptyMessage="当前池子暂无直接LP出资记录" />
          </div>
        )}

        {/* 3. 项目 Tab */}
        {activeTab === "projects" && (
          <div className="glass-card">
            <DataTable headers={projectHeaders} data={projects} emptyMessage="当前资金池暂无投资项目记录" />
          </div>
        )}

        {/* 4. 流水 Tab */}
        {activeTab === "ledger" && (
          <div className="glass-card">
            <DataTable headers={txHeaders} data={txs} emptyMessage="当前资金池暂无流水变动账目" />
          </div>
        )}

        {/* 5. 分配 Tab */}
        {activeTab === "dists" && (
          <div className="glass-card">
            <DataTable headers={distHeaders} data={dists} emptyMessage="当前资金池暂无历史收益分配记录" />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "28px"
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "flex-start"
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: "500",
    transition: "color 0.2s"
  },
  poolTitle: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  cardGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "20px",
    width: "100%"
  },
  tabBar: {
    display: "flex",
    gap: "8px",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "1px",
    width: "100%",
    overflowX: "auto"
  },
  tabBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 18px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--text-secondary)",
    fontSize: "0.9rem",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },
  tabBtnActive: {
    color: "var(--accent-blue)",
    borderBottomColor: "var(--accent-blue)",
    fontWeight: "600"
  },
  tabContent: {
    width: "100%"
  },
  overviewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "24px"
  },
  infoCard: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  },
  sectionTitle: {
    fontSize: "1.05rem",
    fontWeight: "700",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "10px",
    marginBottom: "4px"
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "0.9rem",
    padding: "4px 0"
  },
  infoLabel: {
    color: "var(--text-secondary)"
  },
  subSubTitle: {
    fontSize: "0.85rem",
    fontWeight: "600",
    color: "var(--text-secondary)",
    marginBottom: "10px"
  },
  emptyText: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontStyle: "italic"
  },
  hierarchyLink: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "0.85rem",
    marginBottom: "8px",
    transition: "all 0.2s ease"
  },
  linkValues: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  loading: {
    padding: "80px",
    textAlign: "center",
    color: "var(--text-secondary)"
  },
  error: {
    padding: "24px",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
    border: "1px solid var(--accent-red)",
    borderRadius: "8px",
    color: "var(--accent-red)",
    display: "flex",
    alignItems: "center",
    gap: "10px"
  }
};
export default PoolDetail;
