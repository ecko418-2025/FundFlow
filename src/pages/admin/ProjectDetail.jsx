import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { querySQL } from "../../lib/db";
import { useTransactions } from "../../hooks/useTransactions";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { formatCNY, formatDate } from "../../lib/formatters";
import { 
  ArrowLeft, 
  Briefcase, 
  DollarSign, 
  TrendingUp, 
  Layers, 
  Plus, 
  Calendar, 
  Tag, 
  FileText,
  Info,
  History
} from "lucide-react";

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { createTransaction } = useTransactions();

  const [project, setProject] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // 快捷录入流水状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState("investment"); // investment 或 return
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txRef, setTxRef] = useState("");
  const [txDesc, setTxDesc] = useState("");

  const loadProjectDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. 获取项目详情与池子名称
      const projResult = await querySQL(
        `SELECT pr.*, p.name AS pool_name 
         FROM projects pr 
         JOIN pools p ON pr.pool_id = p.id 
         WHERE pr.id = ?`,
        [id]
      );
      if (projResult.length === 0) {
        throw new Error("项目不存在");
      }
      setProject(projResult[0]);

      // 2. 获取该项目名下的所有交易流水
      const txResult = await querySQL(
        `SELECT t.*, p.name AS pool_name, pr.name AS project_name, i.name AS investor_name
         FROM transactions t
         JOIN pools p ON t.pool_id = p.id
         LEFT JOIN projects pr ON t.project_id = pr.id
         LEFT JOIN investors i ON t.investor_id = i.id
         WHERE t.project_id = ?
         ORDER BY t.date DESC, t.created_at DESC`,
        [id]
      );
      setTxs(txResult);
    } catch (err) {
      setError(err.message || "获取项目详情失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProjectDetails();
  }, [loadProjectDetails]);

  const handleCreateTx = async (e) => {
    e.preventDefault();
    if (!txAmount || !txDate) {
      alert("请填写必填项");
      return;
    }

    try {
      const direction = txType === "investment" ? "out" : "in"; // 投资打款流出池子，项目回款流入池子
      
      await createTransaction({
        poolId: project.pool_id,
        projectId: project.id,
        investorId: null,
        type: txType,
        direction,
        amount: Number(txAmount),
        date: txDate,
        description: txDesc || `${txType === 'investment' ? '打款投入' : '项目收益回款'}-${project.name}`,
        referenceNo: txRef,
        createdBy: "admin"
      });

      // 重置并关闭
      setTxAmount("");
      setTxRef("");
      setTxDesc("");
      setIsModalOpen(false);

      alert("项目流水登账成功！已实时更新净投资头寸及可用现金余额。");
      await loadProjectDetails();
    } catch (err) {
      alert("录入流水失败：" + err.message);
    }
  };

  if (loading) return <div style={styles.loading}>加载项目详情中...</div>;
  if (error) return <div style={styles.error}><Info color="red" /> {error}</div>;
  if (!project) return null;

  const isExpired = project.expected_end_date && new Date(project.expected_end_date) < new Date();
  
  // 在账净投资额 = 累计实际投入 - 累计已收回项目款
  const netInvested = project.invested_amount - project.returned_amount;
  // 计划剩余未投放额 = 计划出资额 - 累计实际投入
  const remainingCommitted = Math.max(0, project.committed_amount - project.invested_amount);

  const txHeaders = [
    { key: "date", label: "交易日期", render: (v) => formatDate(v) },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => v === "investment" ? "打款投入" : "项目回款"
    },
    { key: "direction", label: "资金流向", render: (v) => <Badge text={v === 'in' ? '流入池' : '流出池'} status={v} /> },
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

  // 解析标签
  let tagsList = [];
  if (project.tags) {
    try {
      tagsList = typeof project.tags === "string" ? JSON.parse(project.tags) : project.tags;
    } catch (e) {
      tagsList = [];
    }
  }

  return (
    <div style={styles.container}>
      {/* 顶部标题与返回按钮 */}
      <div style={styles.header}>
        <button onClick={() => navigate("/admin/projects")} style={styles.backBtn}>
          <ArrowLeft size={16} />
          <span>返回项目列表</span>
        </button>
        <div style={styles.poolTitle}>
          <h2>{project.name}</h2>
          <span className="mono badge badge-active">{project.code}</span>
          <Badge 
            text={project.status === 'pre' ? '投前考察' : project.status === 'active' ? '存续管理' : '退出清算'} 
            status={project.status} 
          />
          {isExpired && <span className="badge badge-danger" style={{ textTransform: "none" }}>已到期</span>}
        </div>
      </div>

      {/* 五大核心卡片 */}
      <div style={styles.cardGrid}>
        <StatCard 
          title="计划投放额" 
          value={formatCNY(project.committed_amount, false)} 
          unit="元"
          subtext="立项约定的最高出资规模"
          icon={Layers}
        />
        <StatCard 
          title="实际已打款" 
          value={formatCNY(project.invested_amount, false)} 
          unit="元"
          subtext="累计已支付的项目资金"
          icon={DollarSign}
          color="var(--accent-red)"
        />
        <StatCard 
          title="已收回款" 
          value={formatCNY(project.returned_amount, false)} 
          unit="元"
          subtext="累计回笼的项目本息收益"
          icon={TrendingUp}
          color="var(--accent-green)"
        />
        <StatCard 
          title="在账净投资额" 
          value={formatCNY(netInvested, false)} 
          unit="元"
          subtext="当前未收回的存量投资额"
          icon={Briefcase}
          color="var(--accent-gold)"
        />
        <StatCard 
          title="计划剩余未投放额" 
          value={formatCNY(remainingCommitted, false)} 
          unit="元"
          subtext="计划尚需拨付的项目资金"
          icon={Layers}
          color="var(--text-secondary)"
        />
      </div>

      {/* Tab 导航标签 */}
      <div style={styles.tabBarRow}>
        <div style={styles.tabBar}>
          <button 
            onClick={() => setActiveTab("overview")} 
            style={{ ...styles.tabBtn, ...(activeTab === "overview" ? styles.tabBtnActive : {}) }}
          >
            <Info size={16} />
            <span>项目概况</span>
          </button>
          <button 
            onClick={() => setActiveTab("ledger")} 
            style={{ ...styles.tabBtn, ...(activeTab === "ledger" ? styles.tabBtnActive : {}) }}
          >
            <History size={16} />
            <span>收支明细 ({txs.length})</span>
          </button>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary" style={{ gap: "6px" }}>
          <Plus size={18} />
          <span>登记项目收支</span>
        </button>
      </div>

      {/* Tab 内容区 */}
      <div style={styles.tabContent}>
        {activeTab === "overview" && (
          <div style={styles.overviewGrid}>
            {/* 项目基本概况 */}
            <div className="glass-card" style={styles.infoCard}>
              <h3 style={styles.sectionTitle}>项目基本信息</h3>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>项目 ID</span>
                <span className="mono">{project.id}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>项目编号</span>
                <span className="mono">{project.code}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>出资来源资金池</span>
                <span style={{ fontWeight: 600, color: "var(--accent-blue)" }}>{project.pool_name}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>起始运行日期</span>
                <span className="mono">{formatDate(project.start_date)}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>结束运行日期</span>
                <span className="mono" style={{ color: isExpired ? "var(--accent-red)" : "inherit" }}>
                  {formatDate(project.expected_end_date)} {isExpired && "(已到期)"}
                </span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>立项状态</span>
                <span>{project.status === 'pre' ? '投前考察' : project.status === 'active' ? '存续管理' : '退出清算'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>备注说明</span>
                <span style={{ color: "var(--text-secondary)" }}>{project.description || "无"}</span>
              </div>
            </div>

            {/* 标签与描述信息 */}
            <div className="glass-card" style={styles.infoCard}>
              <h3 style={styles.sectionTitle}>分类标签 & 描述</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={styles.tagsContainer}>
                  <Tag size={16} color="var(--text-secondary)" />
                  <span style={styles.infoLabel}>标签：</span>
                  {tagsList.length === 0 ? (
                    <span style={styles.emptyText}>无标签</span>
                  ) : (
                    tagsList.map((tag, idx) => (
                      <span key={idx} className="badge badge-active" style={{ fontSize: "0.75rem", borderRadius: "4px" }}>
                        {tag}
                      </span>
                    ))
                  )}
                </div>
                
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                    <FileText size={16} color="var(--text-secondary)" />
                    <h4 style={styles.subSubTitle}>详细投资条款/描述</h4>
                  </div>
                  <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                    {project.description || "暂无添加详细投资条款描述。你可以通过Excel导入或立项时编辑来补充完整。"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 关联流水明细 Tab */}
        {activeTab === "ledger" && (
          <div className="glass-card">
            <DataTable headers={txHeaders} data={txs} emptyMessage="当前项目暂无投资打款或回款流水变动" />
          </div>
        )}
      </div>

      {/* 弹窗：快捷录入项目流水 */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`登记项目收支 - ${project.name}`}>
        <form onSubmit={handleCreateTx} style={styles.form}>
          <div style={styles.lockedFields}>
            <div style={styles.lockedRow}>
              <span>来源资金池：</span>
              <strong>{project.pool_name}</strong>
            </div>
            <div style={styles.lockedRow}>
              <span>关联项目：</span>
              <strong>{project.name}</strong>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">收支类型 *</label>
            <select 
              value={txType} 
              onChange={(e) => setTxType(e.target.value)}
              className="form-input"
              required
            >
              <option value="investment">打款投放 (Investment - 流出资金池)</option>
              <option value="return">收益回款 (Project Return - 流入资金池)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">发生金额 (元) *</label>
            <AmountInput 
              value={txAmount} 
              onChange={setTxAmount}
              placeholder="请输入本次交易发生的金额"
            />
          </div>

          <div className="form-group">
            <label className="form-label">发生日期 *</label>
            <input 
              type="date" 
              required
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="form-input mono"
            />
          </div>

          <div className="form-group">
            <label className="form-label">凭证流水号</label>
            <input 
              type="text" 
              value={txRef}
              onChange={(e) => setTxRef(e.target.value)}
              placeholder="如：网银电子凭证号"
              className="form-input mono"
            />
          </div>

          <div className="form-group">
            <label className="form-label">交易摘要说明</label>
            <textarea 
              value={txDesc}
              onChange={(e) => setTxDesc(e.target.value)}
              placeholder="说明本次打款或分期回款的具体阶段..."
              className="form-input"
              rows={2}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认登账</button>
          </div>
        </form>
      </Modal>
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
  tabBarRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
    width: "100%"
  },
  tabBar: {
    display: "flex",
    gap: "8px",
    paddingBottom: "1px",
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
    color: "var(--text-secondary)"
  },
  emptyText: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    fontStyle: "italic"
  },
  tagsContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap"
  },
  form: {
    display: "flex",
    flexDirection: "column"
  },
  lockedFields: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: "0.9rem"
  },
  lockedRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "16px",
    borderTop: "1px solid var(--border)",
    paddingTop: "16px"
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
export default ProjectDetail;
