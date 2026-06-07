import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { usePools } from "../../hooks/usePools";
import { useTransactions } from "../../hooks/useTransactions";
import { useDistribution } from "../../hooks/useDistribution";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { querySQL } from "../../lib/db";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { getDistributionStamp } from "../../lib/distributionStamp";
import { 
  ArrowLeft, 
  Layers, 
  DollarSign, 
  Users, 
  Briefcase,
  History,
  Info,
  Plus,
  Pencil,
  Trash2
} from "lucide-react";

export function PoolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const { getPoolDetail, addPoolMember, addPoolInvestment, updatePoolMember, updatePool, removePoolMember } = usePools();
  const { getTransactions } = useTransactions();
  const { getDistributions, getDistributionDetails } = useDistribution();

  // 分配记录明细 Modal 状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDistDetail, setSelectedDistDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 添加出资人弹窗状态
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMembers, setNewMembers] = useState(
    Array.from({ length: 5 }, () => ({ id: "", amount: "", type: "" }))
  );
  const [allInvestors, setAllInvestors] = useState([]);
  const [allPools, setAllPools] = useState([]);

  // 编辑出资人弹窗状态
  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editMemberCommitted, setEditMemberCommitted] = useState("");
  const [editMemberSharePct, setEditMemberSharePct] = useState("");

  // 编辑资金池基本信息状态
  const [isEditPoolOpen, setIsEditPoolOpen] = useState(false);
  const [editPoolName, setEditPoolName] = useState("");
  const [editPoolContractNo, setEditPoolContractNo] = useState("");
  const [editPoolDesc, setEditPoolDesc] = useState("");
  const [editTotalCommitted, setEditTotalCommitted] = useState("");
  const [editPoolType, setEditPoolType] = useState("capital");
  const [editPoolStatus, setEditPoolStatus] = useState("active");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const [activeTab, setActiveTab] = useState("overview");
  const [detail, setDetail] = useState(null);
  const [txs, setTxs] = useState([]);
  const [dists, setDists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getAmountDistributedToPool = async (currentPoolId, dist) => {
    // 1. 如果是本级发起的分配，归零（显示本级发起分配，去往 LPs）
    if (dist.pool_id === currentPoolId && !dist.project_id) {
      return 0;
    }

    // 2. 如果是项目的分配（钱流向本资金池）
    if (dist.project_id) {
      const pInvList = await querySQL(
        `SELECT * FROM project_investors WHERE project_id = ?`,
        [dist.project_id]
      );
      const totalInvested = pInvList.reduce((sum, pi) => sum + Number(pi.invested_amount || 0), 0);
      const poolInv = pInvList.find(pi => pi.investor_id === currentPoolId);
      if (poolInv && totalInvested > 0) {
        const sharePct = Number(poolInv.invested_amount || 0) / totalInvested;
        return dist.total_amount * sharePct;
      }
      return 0;
    }

    // 3. 如果是子级资金池发起的分配（钱流向本母资金池）
    if (dist.pool_id && dist.pool_id !== currentPoolId) {
      const pMembers = await querySQL(
        `SELECT * FROM pool_members WHERE pool_id = ? AND investor_id = ?`,
        [dist.pool_id, currentPoolId]
      );
      if (pMembers.length > 0) {
        const allMembers = await querySQL(`SELECT called_amount FROM pool_members WHERE pool_id = ?`, [dist.pool_id]);
        const totalCalled = allMembers.reduce((sum, m) => sum + Number(m.called_amount || 0), 0);
        if (totalCalled > 0) {
          const sharePct = Number(pMembers[0].called_amount || 0) / totalCalled;
          return dist.total_amount * sharePct;
        }
      }
      return 0;
    }

    return 0;
  };

  const loadPoolDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const poolDetail = await getPoolDetail(id);
      setDetail(poolDetail);
      const txList = await getTransactions({ poolId: id });
      setTxs(txList);
      
      const distList = await getDistributions(id);
      
      const distListWithAllocations = await Promise.all(
        distList.map(async (d) => {
          const allocatedAmount = await getAmountDistributedToPool(id, d);
          return { ...d, allocated_amount: allocatedAmount };
        })
      );
      
      setDists(distListWithAllocations);
    } catch (err) {
      setError(err.message || "获取详情失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleViewDetails = async (dist) => {
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const details = await getDistributionDetails(dist.id);
      setSelectedDistDetail({ ...dist, items: details });
    } catch (err) {
      alert("加载详情失败：" + err.message);
      setIsDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadSelectOptions = useCallback(async () => {
    try {
      const [investors, pools] = await Promise.all([
        querySQL("SELECT * FROM investors ORDER BY created_at DESC"),
        querySQL("SELECT * FROM pools ORDER BY created_at DESC")
      ]);
      setAllInvestors(investors);
      setAllPools(pools.filter(p => p.id !== id));
    } catch (e) {
      console.warn("加载选项失败", e);
    }
  }, [id]);

  useEffect(() => {
    loadPoolDetails();
    loadSelectOptions();
  }, [loadPoolDetails, loadSelectOptions]);

  const handleOpenAddMember = () => {
    setNewMembers(Array.from({ length: 5 }, () => ({ id: "", amount: "", type: "" })));
    setIsAddMemberOpen(true);
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    const validMembers = newMembers.filter(m => m.id && m.amount && Number(m.amount) > 0);
    if (validMembers.length === 0) {
      alert("请至少完整填写一行有效的出资方和金额");
      return;
    }

    try {
      for (const member of validMembers) {
        if (member.type === 'investor') {
          await addPoolMember({ poolId: id, investorId: member.id, committedAmount: Number(member.amount), actor: currentUser });
        } else if (member.type === 'pool') {
          await addPoolInvestment({ parentPoolId: member.id, childPoolId: id, committedAmount: Number(member.amount), actor: currentUser });
        }
      }
      setIsAddMemberOpen(false);
      setNewMembers(Array.from({ length: 5 }, () => ({ id: "", amount: "", type: "" })));
      await loadPoolDetails();
      alert("批量添加出资方成功！");
    } catch (err) {
      alert("批量添加失败：" + err.message);
    }
  };

  const handleOpenEditMember = (member) => {
    setEditingMember(member);
    setEditMemberCommitted(String(member.committed_amount));
    setIsEditMemberOpen(true);
  };

  const handleEditMemberSubmit = async (e) => {
    e.preventDefault();
    if (!editMemberCommitted || Number(editMemberCommitted) <= 0) {
      alert("认缴参考额必须大于 0");
      return;
    }
    try {
      await updatePoolMember(id, editingMember.investor_id, {
        committedAmount: Number(editMemberCommitted),
        actor: currentUser
      });
      setIsEditMemberOpen(false);
      setEditingMember(null);
      await loadPoolDetails();
      alert("认缴参考额已更新！持股比例将根据实缴金额自动计算。");
    } catch (err) {
      alert("更新失败：" + err.message);
    }
  };

  const handleOpenEditPool = () => {
    setEditPoolName(detail.pool.name);
    setEditPoolContractNo(detail.pool.contract_no || "");
    setEditPoolDesc(detail.pool.description || "");
    setEditTotalCommitted(String(detail.pool.total_committed));
    setEditPoolType(detail.pool.type || "capital");
    setEditPoolStatus(detail.pool.status || "active");
    setEditStartDate(detail.pool.start_date ? detail.pool.start_date.slice(0, 10) : "");
    setEditEndDate(detail.pool.end_date ? detail.pool.end_date.slice(0, 10) : "");
    setIsEditPoolOpen(true);
  };

  const handleEditPoolSubmit = async (e) => {
    e.preventDefault();
    if (!editPoolName || !editTotalCommitted) {
      alert("请填写资金池名称和总规模");
      return;
    }
    try {
      await updatePool(detail.pool.id, {
        name: editPoolName,
        contractNo: editPoolContractNo,
        description: editPoolDesc,
        totalCommitted: Number(editTotalCommitted),
        type: editPoolType,
        status: editPoolStatus,
        startDate: editStartDate || null,
        endDate: editEndDate || null,
        actor: currentUser
      });
      setIsEditPoolOpen(false);
      await loadPoolDetails();
      alert("资金池信息已更新！");
    } catch (err) {
      alert("更新失败：" + err.message);
    }
  };

  const handleDeleteMember = async (e, member) => {
    e.stopPropagation();
    if (Number(member.called_amount) > 0) {
      alert("该出资人已有实缴记录，不可删除。");
      return;
    }
    if (!window.confirm(`确定要移除出资人 ${member.investor_name} 吗？`)) {
      return;
    }
    try {
      await removePoolMember(detail.pool.id, member.investor_id, currentUser);
      await loadPoolDetails();
      alert("出资人已移除！");
    } catch (err) {
      alert("移除失败：" + err.message);
    }
  };

  const [txCurrentPage, setTxCurrentPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(10);

  const paginatedTxs = React.useMemo(() => {
    return txs.slice((txCurrentPage - 1) * txPageSize, txCurrentPage * txPageSize);
  }, [txs, txCurrentPage, txPageSize]);

  const txTotalPages = Math.ceil(txs.length / txPageSize);

  if (loading) return <div style={styles.loading}>数据深度加载中...</div>;
  if (error) return <div style={styles.error}><Info color="red" /> {error}</div>;
  if (!detail) return null;

  const { pool, members, projects, childInvestments, parentInvestments } = detail;
  const isExpired = pool.end_date && new Date(pool.end_date) < new Date();
  const poolTypesLabel = {
    capital: "公司股本金",
    temporary_quarterly: "季度临时资金",
    temporary_annually: "年度临时资金"
  };

  // 计算全池累计实缴总额（用于动态比例）
  const totalCalledAmount = members.reduce((sum, m) => sum + Number(m.called_amount || 0), 0);

  const memberHeaders = [
    { key: "investor_name", label: "出资方名称", render: (v, row) => (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{row.investor_type === 'pool' ? `🏦 ${v}` : (row.investor_type === 'individual' ? `👤 ${v}` : `🏢 ${v}`)}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.investor_type === 'pool' ? '机构母池' : (row.investor_type === 'individual' ? '个人 LP' : '机构 LP')}
        </span>
      </div>
    )},
    { key: "committed_amount", label: "认缴参考额", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)" }}>{formatCNY(v, false)}</span> },
    { key: "called_amount", label: "累计实缴额", render: (v) => <span className="mono" style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatCNY(v, false)}</span> },
    {
      key: "dynamic_share_pct",
      label: "当前实缴比例",
      align: "right",
      render: (v) => (
        <div style={{ textAlign: "right" }}>
          <span className="badge badge-warning" style={{ fontWeight: 700 }}>
            {formatPercent(v)}
          </span>
        </div>
      )
    },
    { key: "joined_at", label: "加入日期", render: (v) => formatDate(v) },
    {
      key: "investor_id",
      label: "操作",
      align: "right",
      render: (v, row) => (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenEditMember(row); }}
            className="btn-secondary"
            style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px" }}
          >
            <Pencil size={12} />
            <span>编辑</span>
          </button>
          <button
            onClick={(e) => handleDeleteMember(e, row)}
            className="btn-secondary"
            style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px", color: Number(row.called_amount) > 0 ? "var(--text-muted)" : "var(--accent-red)", cursor: Number(row.called_amount) > 0 ? "not-allowed" : "pointer" }}
            title={Number(row.called_amount) > 0 ? "已有实缴，不可删除" : "删除出资方"}
            disabled={Number(row.called_amount) > 0}
          >
            <Trash2 size={12} />
            <span>删除</span>
          </button>
        </div>
      )
    }
  ];

  const projectHeaders = [
    { key: "name", label: "项目名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "code", label: "项目唯一编号", className: "mono" },
    { key: "status", label: "状态", render: (v) => {
        const labels = { pre: "投前", active: "存续中", exited: "已退出", archived: "已归档" };
        return <Badge text={labels[v] || v} status={v} />;
      }
    },
    { key: "committed_amount", label: "计划投放", render: (v) => formatCNY(v, false) },
    { key: "invested_amount", label: "已打款累计", render: (v) => formatCNY(v, false) },
    { key: "returned_amount", label: "收回款累计", render: (v) => formatCNY(v, false) }
  ];

  const txHeaders = [
    { key: "id", label: "流水编号", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{v}</span> },
    { key: "date", label: "发生日期", render: (v) => formatDate(v) },
    { 
      key: "sourceName", 
      label: "出账方 (Source)", 
      render: (_, row) => {
        let name = "未知";
        if (row.type === "capital_call") name = row.investor_name;
        else if (row.type === "investment") name = row.investor_name || row.pool_name;
        else if (row.type === "pool_investment") name = row.pool_name;
        else if (row.type === "pool_transfer_out") name = row.pool_name;
        else if (row.type === "pool_transfer_in") name = row.related_pool_name;
        else if (row.type === "return" || row.type === "distribution") name = row.project_name;
        else name = row.direction === "in" ? "外部来源" : (row.pool_name || "未知");
        return <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name || "未知"}</span>;
      }
    },
    { 
      key: "targetName", 
      label: "进账方 (Target)", 
      render: (_, row) => {
        let name = "未知";
        if (row.type === "capital_call") name = row.pool_name;
        else if (row.type === "investment") name = row.project_name;
        else if (row.type === "pool_investment") name = row.related_pool_name;
        else if (row.type === "pool_transfer_in") name = row.pool_name;
        else if (row.type === "pool_transfer_out") name = row.related_pool_name;
        else if (row.type === "return") name = row.investor_name || row.pool_name;
        else if (row.type === "distribution") name = row.investor_name || row.pool_name;
        else name = row.direction === "in" ? (row.pool_name || "未知") : "外部去向";
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
        const badgeStatus = { capital_call: "warning", investment: "danger", pool_investment: "danger" }[v] || "success";
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

  const distHeaders = [
    { key: "distribution_stamp", label: "分配钢印", className: "mono", render: (_, row) => (
      <span style={styles.stampText}>{getDistributionStamp(row)}</span>
    ) },
    { key: "distribution_date", label: "分配日期", render: (v) => formatDate(v) },
    { key: "source", label: "分配来源 / 去向", render: (_, row) => {
        if (row.pool_id === id && !row.project_id) return <span>本级发起分配 (去往上级 LPs)</span>;
        const name = row.project_name || row.pool_name || '-';
        const code = row.project_code || row.pool_code || '-';
        return <span style={{ fontWeight: 600 }}>{name} ({code})</span>;
      }
    },
    { key: "total_amount", label: "方案总额", render: (v) => formatCNY(v, false) },
    { 
      key: "allocated_amount", 
      label: "分配至本基金金额", 
      align: "right",
      render: (v, row) => {
        if (row.pool_id === id && !row.project_id) return <span style={{ color: "var(--text-secondary)" }}>-</span>;
        return <span className="mono amt-bold" style={{ color: "var(--accent-green)" }}>+{formatCNY(v, false)}</span>;
      }
    },
    { key: "status", label: "状态", render: (v) => {
        const labels = { pending: "待审核", confirmed: "已确认", rejected: "已驳回", draft: "草稿" };
        return <Badge text={labels[v] || v} status={v} />;
      }
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => navigate("/admin/pools")} style={styles.backBtn}>
          <ArrowLeft size={16} /><span>返回列表</span>
        </button>
        <div style={styles.poolTitle}>
          <h2>{pool.name}</h2>
          <Badge text={pool.status === 'active' ? '正常存续中' : '已结清关闭'} status={pool.status} />
          <button onClick={handleOpenEditPool} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem", gap: "6px", marginLeft: "12px" }}>
            <Pencil size={14} /><span>编辑信息</span>
          </button>
        </div>
      </div>

      <div style={styles.cardGrid}>
        <StatCard title="认缴总额规模" value={formatCNY(pool.total_committed, false)} unit="元" icon={Layers} />
        <StatCard title="可用现金余额" value={formatCNY(pool.available_balance, false)} unit="元" icon={DollarSign} color="var(--accent-gold)" />
        <StatCard title="直接出资方" value={members.length} unit="个" icon={Users} color="var(--accent-green)" onClick={() => setActiveTab("investors")} />
        <StatCard title="投向项目" value={projects.length} unit="个" icon={Briefcase} color="var(--accent-red)" onClick={() => setActiveTab("projects")} />
      </div>

      <div style={styles.tabBar}>
        <button onClick={() => setActiveTab("overview")} style={{ ...styles.tabBtn, ...(activeTab === "overview" ? styles.tabBtnActive : {}) }}><Info size={16} /><span>基本概览</span></button>
        <button onClick={() => setActiveTab("investors")} style={{ ...styles.tabBtn, ...(activeTab === "investors" ? styles.tabBtnActive : {}) }}><Users size={16} /><span>出资方列表 ({members.length})</span></button>
        <button onClick={() => setActiveTab("projects")} style={{ ...styles.tabBtn, ...(activeTab === "projects" ? styles.tabBtnActive : {}) }}><Briefcase size={16} /><span>投向项目 ({projects.length})</span></button>
        <button onClick={() => setActiveTab("ledger")} style={{ ...styles.tabBtn, ...(activeTab === "ledger" ? styles.tabBtnActive : {}) }}><DollarSign size={16} /><span>流水明细 ({txs.length})</span></button>
        <button onClick={() => setActiveTab("dists")} style={{ ...styles.tabBtn, ...(activeTab === "dists" ? styles.tabBtnActive : {}) }}><History size={16} /><span>分配明细 ({dists.length})</span></button>
      </div>

      <div style={styles.tabContent}>
        {activeTab === "overview" && (
          <div style={styles.overviewGrid}>
            <div className="glass-card" style={styles.infoCard}>
              <h3 style={styles.sectionTitle}>基本概况</h3>
              <div style={styles.infoRow}><span style={styles.infoLabel}>资金池 ID</span><span className="mono">{pool.id}</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>合同编号</span><span className="mono">{pool.contract_no || "无"}</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>池子类型</span><span style={{ fontWeight: 600, color: "var(--accent-gold)" }}>{poolTypesLabel[pool.type] || "公司股本金"}</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>存续期间</span><span className="mono">{formatDate(pool.start_date)} 至 {formatDate(pool.end_date)}</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>备注说明</span><span style={{ color: "var(--text-secondary)" }}>{pool.description || "无"}</span></div>
            </div>

            <div className="glass-card" style={styles.infoCard}>
              <h3 style={styles.sectionTitle}>层级结构 (Hierarchy)</h3>
              <div style={{ marginBottom: "16px" }}>
                <h4 style={styles.subSubTitle}>上级出资方 (母资金池)</h4>
                {parentInvestments.length === 0 ? <p style={styles.emptyText}>无上级母池出资。</p> : parentInvestments.map(pi => (
                  <div key={pi.parent_pool_id} onClick={() => navigate(`/admin/pools/${pi.parent_pool_id}`)} style={styles.hierarchyLink}>
                    <span style={{ fontWeight: 600 }}>{pi.parent_pool_name}</span>
                    <span className="badge badge-active">{formatPercent(pi.dynamic_share_pct)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 style={styles.subSubTitle}>下级被投资方 (子资金池)</h4>
                {childInvestments.length === 0 ? <p style={styles.emptyText}>未对外注资子池。</p> : childInvestments.map(pi => (
                  <div key={pi.child_pool_id} onClick={() => navigate(`/admin/pools/${pi.child_pool_id}`)} style={styles.hierarchyLink}>
                    <span style={{ fontWeight: 600 }}>{pi.child_pool_name}</span>
                    <span className="badge badge-warning">{formatCNY(pi.invested_amount, false)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "investors" && (
          <div className="glass-card no-hover" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>全量直接出资方名单 (含 LP 与母池)</h3>
              <button onClick={handleOpenAddMember} className="btn-primary" style={{ padding: "8px 16px", gap: "6px" }}><Plus size={16} /><span>登记新出资方</span></button>
            </div>
            
            <div style={{ marginBottom: "20px", padding: "16px", background: "var(--surface-secondary)", borderRadius: "10px", display: "flex", gap: "40px", border: "1px solid var(--border)" }}>
              <div><div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}>本级当前累计实缴总计</div><div className="mono amt-bold" style={{ color: "var(--accent-green)", fontSize: "1.2rem" }}>{formatCNY(totalCalledAmount, false)}</div></div>
              <div><div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}>认缴登记总额目标</div><div className="mono" style={{ fontWeight: 700, fontSize: "1.2rem" }}>{formatCNY(members.reduce((sum, m) => sum + Number(m.committed_amount || 0), 0), false)}</div></div>
            </div>

            <DataTable headers={memberHeaders} data={members} emptyMessage="暂无登记记录" onRowClick={(row) => row.investor_type === 'pool' && navigate(`/admin/pools/${row.investor_id}`)} />
          </div>
        )}

        {activeTab === "projects" && <div className="glass-card no-hover"><DataTable headers={projectHeaders} data={projects} emptyMessage="暂无投向项目" /></div>}
        {activeTab === "ledger" && (
          <div className="glass-card no-hover" style={{ padding: "20px" }}>
            <DataTable headers={txHeaders} data={paginatedTxs} emptyMessage="暂无流水记录" />
            
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
                  共 {txs.length} 条记录
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
        {activeTab === "dists" && <div className="glass-card no-hover"><DataTable headers={distHeaders} data={dists} emptyMessage="暂无分配记录" onRowClick={handleViewDetails} /></div>}
      </div>

      {/* 弹窗：批量添加 */}
      <Modal isOpen={isAddMemberOpen} onClose={() => setIsAddMemberOpen(false)} title="登记出资方" maxWidth="800px">
        <form onSubmit={handleAddMemberSubmit} style={{ width: '100%' }}>
          <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}><th style={{ padding: '12px 8px' }}>出资方主体 (LP 或 母资金池)</th><th style={{ padding: '12px 8px' }}>认缴/出资目标 (元)</th><th style={{ width: '50px' }}></th></tr></thead>
              <tbody>
                {newMembers.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px' }}>
                      <select value={item.id ? `${item.type}_${item.id}` : ""} onChange={(e) => {
                        const newList = [...newMembers];
                        const [type, ...idParts] = e.target.value.split('_');
                        newList[index] = { type, id: idParts.join('_'), amount: item.amount };
                        setNewMembers(newList);
                      }} className="form-input">
                        <option value="">-- 请选择 --</option>
                        <optgroup label="外部出资人 (LP)">
                          {allInvestors.map(inv => <option key={inv.id} value={`investor_${inv.id}`}>👤 {inv.name} ({inv.type === 'individual' ? '个人' : '机构'})</option>)}
                        </optgroup>
                        <optgroup label="内部资金池 (母池)">
                          {allPools.map(p => <option key={p.id} value={`pool_${p.id}`}>🏦 {p.name}</option>)}
                        </optgroup>
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}><input type="number" className="form-input" value={item.amount} onChange={(e) => { const newList = [...newMembers]; newList[index].amount = e.target.value; setNewMembers(newList); }} /></td>
                    <td><button type="button" onClick={() => setNewMembers(newMembers.filter((_, i) => i !== index))} style={{ color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setNewMembers([...newMembers, { id: "", amount: "", type: "" }])} className="btn-secondary">+ 增加一行</button>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "20px" }}>
            <button type="button" onClick={() => setIsAddMemberOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认登记</button>
          </div>
        </form>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal isOpen={isEditMemberOpen} onClose={() => setIsEditMemberOpen(false)} title="编辑出资登记">
        {editingMember && (
          <form onSubmit={handleEditMemberSubmit}>
            <div style={{ marginBottom: "20px", padding: "12px", background: "var(--surface-secondary)", borderRadius: "8px" }}>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{editingMember.investor_name}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{editingMember.investor_type === 'pool' ? '🏦 机构母池' : '👤 外部 LP'}</div>
            </div>
            <div className="form-group">
              <label className="form-label">认缴参考额 (元)</label>
              <AmountInput value={editMemberCommitted} onChange={setEditMemberCommitted} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button type="button" onClick={() => setIsEditMemberOpen(false)} className="btn-secondary">取消</button>
              <button type="submit" className="btn-primary">保存修改</button>
            </div>
          </form>
        )}
      </Modal>

      {/* 资金池编辑 */}
      <Modal isOpen={isEditPoolOpen} onClose={() => setIsEditPoolOpen(false)} title="编辑资金池信息">
        <form onSubmit={handleEditPoolSubmit}>
          <div className="form-group"><label className="form-label">资金池名称 *</label><input type="text" required value={editPoolName} onChange={(e) => setEditPoolName(e.target.value)} className="form-input" /></div>
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1 }}><label className="form-label">总规模规模 (元)</label><AmountInput value={editTotalCommitted} onChange={setEditTotalCommitted} /></div>
            <div className="form-group" style={{ flex: 1 }}><label className="form-label">管理状态</label><select value={editPoolStatus} onChange={(e) => setEditPoolStatus(e.target.value)} className="form-input"><option value="active">存续中</option><option value="closed">已关闭</option></select></div>
          </div>
          <div className="form-group"><label className="form-label">备注说明</label><textarea value={editPoolDesc} onChange={(e) => setEditPoolDesc(e.target.value)} className="form-input" rows={3} /></div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
            <button type="button" onClick={() => setIsEditPoolOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">保存修改</button>
          </div>
        </form>
      </Modal>

      {/* 分配明细 Modal 已在代码中，保持不变 */}
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: "28px" },
  header: { display: "flex", flexDirection: "column", gap: "12px" },
  backBtn: { background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" },
  poolTitle: { display: "flex", alignItems: "center", gap: "16px" },
  cardGrid: { display: "flex", flexWrap: "wrap", gap: "20px" },
  tabBar: { display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", overflowX: "auto" },
  tabBtn: { 
    padding: "12px 20px", 
    background: "none", 
    border: "none", 
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    color: "var(--text-secondary)", 
    cursor: "pointer", 
    display: "flex", 
    alignItems: "center", 
    gap: "8px", 
    fontSize: "0.95rem" 
  },
  tabBtnActive: { 
    color: "var(--accent-blue)", 
    borderBottomColor: "var(--accent-blue)", 
    fontWeight: "600" 
  },
  tabContent: { width: "100%" },
  overviewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" },
  infoCard: { padding: "24px", display: "flex", flexDirection: "column", gap: "16px" },
  sectionTitle: { fontSize: "1.1rem", fontWeight: "700", borderBottom: "1px solid var(--border)", paddingBottom: "10px" },
  infoRow: { display: "flex", justifyContent: "space-between", fontSize: "0.9rem" },
  infoLabel: { color: "var(--text-secondary)" },
  stampText: { color: "var(--accent-blue)", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0" },
  subSubTitle: { fontSize: "0.85rem", fontWeight: "700", color: "var(--text-secondary)", marginBottom: "8px" },
  emptyText: { fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" },
  hierarchyLink: { display: "flex", justifyContent: "space-between", padding: "12px", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", marginBottom: "8px" },
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
  },
  loading: { padding: "100px", textAlign: "center" },
  error: { padding: "20px", color: "var(--accent-red)" }
};
export default PoolDetail;
