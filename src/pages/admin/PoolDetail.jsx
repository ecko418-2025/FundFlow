import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  const { getPoolDetail, addPoolMember, addPoolInvestment, updatePoolMember, updatePool, removePoolMember } = usePools();
  const { getTransactions } = useTransactions();
  const { getDistributions } = useDistribution();

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
          await addPoolMember({ poolId: id, investorId: member.id, committedAmount: Number(member.amount) });
        } else if (member.type === 'pool') {
          await addPoolInvestment({ parentPoolId: member.id, childPoolId: id, investedAmount: Number(member.amount), note: "" });
        }
      }
      setIsAddMemberOpen(false);
      setNewMembers(Array.from({ length: 5 }, () => ({ id: "", amount: "", type: "" })));
      await loadPoolDetails();
      alert("批量添加出资人成功！");
    } catch (err) {
      alert("批量添加失败：" + err.message);
    }
  };

  const handleOpenEditMember = (member) => {
    setEditingMember(member);
    setEditMemberCommitted(String(member.committed_amount));
    setEditMemberSharePct(String(member.share_pct));
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
        committedAmount: Number(editMemberCommitted)
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
    if (editStartDate && editEndDate && new Date(editEndDate) < new Date(editStartDate)) {
      alert("结束日期不能早于起始日期！");
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
        endDate: editEndDate || null
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
      await removePoolMember(detail.pool.id, member.investor_id);
      await loadPoolDetails();
      alert("出资人已移除！");
    } catch (err) {
      alert("移除失败：" + err.message);
    }
  };

  const handleDeleteParentInvestment = async (e, pi) => {
    e.stopPropagation();
    if (Number(pi.actual_invested_amount) > 0) {
      alert("该母资金池已有实际划拨到账记录，不可删除。");
      return;
    }
    if (!window.confirm(`确定要移除母资金池出资方 ${pi.parent_pool_name} 吗？`)) {
      return;
    }
    try {
      await querySQL(
        `DELETE FROM pool_investments WHERE id = ?`,
        [pi.id]
      );
      await loadPoolDetails();
      alert("关联母资金池已移除！");
    } catch (err) {
      alert("移除失败：" + err.message);
    }
  };

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
    { key: "investor_name", label: "投资者名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "investor_type", label: "类型", render: (v) => v === "individual" ? "个人" : "机构/基金" },
    { key: "committed_amount", label: "认缴参考额", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)" }}>{formatCNY(v, false)}</span> },
    { key: "called_amount", label: "实缴金额", render: (v) => <span className="mono" style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatCNY(v, false)}</span> },
    {
      key: "called_amount",
      label: "实缴持股比例",
      align: "right",
      render: (v) => {
        const pct = totalCalledAmount > 0 ? (Number(v || 0) / totalCalledAmount * 100) : 0;
        return (
          <div style={{ textAlign: "right" }}>
            <span className="mono amt-bold" style={{ color: "var(--accent-gold)" }}>
              {pct.toFixed(4)}%
            </span>
            {totalCalledAmount === 0 && (
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block" }}>待实缴后自动计算</span>
            )}
          </div>
        );
      }
    },
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
            <span>编辑认缴</span>
          </button>
          <button
            onClick={(e) => handleDeleteMember(e, row)}
            className="btn-secondary"
            style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px", color: Number(row.called_amount) > 0 ? "var(--text-muted)" : "var(--accent-red)", cursor: Number(row.called_amount) > 0 ? "not-allowed" : "pointer" }}
            title={Number(row.called_amount) > 0 ? "已有实缴，不可删除" : "删除出资人"}
            disabled={Number(row.called_amount) > 0}
          >
            <Trash2 size={12} />
            <span>删除</span>
          </button>
        </div>
      )
    }
  ];

  const parentInvestmentHeaders = [
    { key: "parent_pool_name", label: "投资者名称", render: (v) => <span style={{ fontWeight: 600 }}>🏦 {v}</span> },
    { key: "parent_pool_id", label: "类型", render: () => "母资金池" },
    { key: "invested_amount", label: "认缴参考额", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)" }}>{formatCNY(v, false)}</span> },
    { key: "actual_invested_amount", label: "实缴金额", render: (v) => <span className="mono" style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatCNY(v, false)}</span> },
    {
      key: "dynamic_share_pct",
      label: "实缴持股比例",
      align: "right",
      render: (v) => (
        <div style={{ textAlign: "right" }}>
          <span className="mono amt-bold" style={{ color: "var(--accent-gold)" }}>
            {formatPercent(v)}
          </span>
        </div>
      )
    },
    {
      key: "id",
      label: "操作",
      align: "right",
      render: (v, row) => (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={(e) => handleDeleteParentInvestment(e, row)}
            className="btn-secondary"
            style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px", color: Number(row.actual_invested_amount) > 0 ? "var(--text-muted)" : "var(--accent-red)", cursor: Number(row.actual_invested_amount) > 0 ? "not-allowed" : "pointer" }}
            title={Number(row.actual_invested_amount) > 0 ? "已有实际划拨，不可删除" : "删除关联"}
            disabled={Number(row.actual_invested_amount) > 0}
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
    { key: "code", label: "项目 ID", render: (v, row) => <span className="badge badge-active">{row.id}</span> },
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
    { key: "date", label: "发生日期", render: (v) => formatDate(v) },
    { 
      key: "sourceName", 
      label: "出账方 (Source)", 
      render: (_, row) => {
        let name = "未知";
        if (row.type === "capital_call") name = row.investor_name;
        else if (row.type === "investment") name = row.investor_name || row.pool_name;
        else if (row.type === "return" || row.type === "distribution") name = row.project_name;
        else if (row.type === "pool_transfer_out") name = row.pool_name;
        else if (row.type === "pool_transfer_in") name = row.related_pool_name;
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
        else if (row.type === "return" || row.type === "distribution") name = row.investor_name || row.pool_name;
        else if (row.type === "pool_transfer_out") name = row.related_pool_name;
        else if (row.type === "pool_transfer_in") name = row.pool_name;
        else name = row.direction === "in" ? (row.pool_name || "未知") : "外部去向";
        
        return <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name || "未知"}</span>;
      }
    },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => {
        const typeMap = {
          capital_call: "LP实缴打款",
          investment: "项目投资",
          return: "项目回款",
          distribution: "收益分红",
          fee: "管理费/支出",
          pool_transfer_out: "资金池划出",
          pool_transfer_in: "资金池划入",
          adjustment: "人工核校"
        };
        const colorMap = {
          capital_call: "warning", // 金色
          investment: "danger", // 红色
          pool_transfer_out: "default", // 灰色
          pool_transfer_in: "default", // 灰色
        };
        const badgeStatus = colorMap[v] || "success";
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
          {isExpired && <span className="badge badge-danger" style={{ textTransform: "none" }}>已到期</span>}
          <button 
            onClick={handleOpenEditPool}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.85rem", gap: "6px", marginLeft: "12px" }}
          >
            <Pencil size={14} />
            <span>编辑信息</span>
          </button>
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
          value={members.length + parentInvestments.length} 
          unit="人/池"
          subtext="点击查看本级出资方名单"
          icon={Users}
          color="var(--accent-green)"
          onClick={() => setActiveTab("investors")}
        />
        <StatCard 
          title="关联投向项目" 
          value={projects.length} 
          unit="个"
          subtext="点击查看关联项目列表"
          icon={Briefcase}
          color="var(--accent-red)"
          onClick={() => setActiveTab("projects")}
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
                <span style={styles.infoLabel}>相关合同编号</span>
                <span className="mono">{pool.contract_no || "无"}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>资金池名称</span>
                <span>{pool.name}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>资金池类型</span>
                <span style={{ fontWeight: 600, color: "var(--accent-gold)" }}>{poolTypesLabel[pool.type] || "公司股本金"}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>起始运行日期</span>
                <span className="mono">{formatDate(pool.start_date)}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>结束运行日期</span>
                <span className="mono" style={{ color: isExpired ? "var(--accent-red)" : "inherit" }}>
                  {formatDate(pool.end_date)} {isExpired && "(已到期)"}
                </span>
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
                        <span className="mono">实际到账 {formatCNY(pi.actual_invested_amount, false)}</span>
                        <span className="badge badge-active">当前占比 {formatPercent(pi.dynamic_share_pct)}</span>
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
                        <span className="mono">实际拨付流水 {formatCNY(pi.actual_invested_amount, false)}</span>
                        <span className="badge badge-warning">当前占比 {formatPercent(pi.dynamic_share_pct)}</span>
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
          <div className="glass-card no-hover" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>个人/机构投资方名单</h3>
              <button onClick={handleOpenAddMember} className="btn-primary" style={{ padding: "8px 14px", fontSize: "0.85rem", gap: "6px" }}>
                <Plus size={15} /><span>添加出资人</span>
              </button>
            </div>
            <DataTable 
              headers={memberHeaders} 
              data={members.filter(m => m.investor_type !== 'pool')} 
              emptyMessage="当前暂无真实的个人或机构出资记录，点击右上角添加" 
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "32px", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>内部资金池作为直接出资方</h3>
            </div>
            <DataTable 
              headers={memberHeaders} 
              data={members.filter(m => m.investor_type === 'pool')} 
              emptyMessage="暂无内部资金池作为出资方" 
            />

            {parentInvestments.length > 0 && (
              <div style={{ marginTop: "32px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>母资金池出资方 (层级关联)</h3>
                </div>
                <DataTable 
                  headers={parentInvestmentHeaders} 
                  data={parentInvestments} 
                  emptyMessage="暂无母资金池出资方"
                  onRowClick={(row) => navigate(`/admin/pools/${row.parent_pool_id}`)}
                />
              </div>
            )}
          </div>
        )}

        {/* 3. 项目 Tab */}
        {activeTab === "projects" && (
          <div className="glass-card no-hover">
            <DataTable headers={projectHeaders} data={projects} emptyMessage="当前资金池暂无投资项目记录" />
          </div>
        )}

        {/* 4. 流水 Tab */}
        {activeTab === "ledger" && (() => {
          // 统计有实缴流水的出资人
          const capitalCallInvestors = [
            ...new Map(
              txs.filter(t => t.type === "capital_call" && t.investor_name)
                 .map(t => [t.investor_id, t.investor_name])
            ).entries()
          ];
          return (
            <div className="glass-card no-hover" style={{ padding: "20px" }}>
              {capitalCallInvestors.length > 0 && (
                <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(34,197,94,0.06)", borderRadius: "8px", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginRight: "10px" }}>💰 已有实缴流水的出资人：</span>
                  {capitalCallInvestors.map(([invId, invName]) => (
                    <span key={invId} className="badge badge-active" style={{ marginRight: "6px", fontWeight: 600 }}>{invName}</span>
                  ))}
                </div>
              )}
              <DataTable headers={txHeaders} data={txs} emptyMessage="当前资金池暂无流水变动账目" />
            </div>
          );
        })()}

        {/* 5. 分配 Tab */}
        {activeTab === "dists" && (
          <div className="glass-card no-hover">
            <DataTable headers={distHeaders} data={dists} emptyMessage="当前资金池暂无历史收益分配记录" />
          </div>
        )}
      </div>

      {/* 添加出资人弹窗 */}
      <Modal isOpen={isAddMemberOpen} onClose={() => setIsAddMemberOpen(false)} title="批量添加出资方" maxWidth="800px">
        <form onSubmit={handleAddMemberSubmit} style={{ ...styles.form, minWidth: '100%' }}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>选择出资方 (资金池 / 独立投资人) *</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>认缴/投资额 (元) *</th>
                  <th style={{ padding: '10px 8px', width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {newMembers.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px' }}>
                      <select 
                        value={item.id ? `${item.type}_${item.id}` : ""} 
                        onChange={(e) => {
                          const newList = [...newMembers];
                          const val = e.target.value;
                          if (!val) {
                            newList[index].id = "";
                            newList[index].type = "";
                          } else {
                            const [type, ...idParts] = val.split('_');
                            newList[index].type = type;
                            newList[index].id = idParts.join('_');
                          }
                          setNewMembers(newList);
                        }} 
                        className="form-input" 
                      >
                        <option value="">-- 请选择 --</option>
                        <optgroup label="关联母资金池">
                          {allPools.map(p => {
                            const isExists = detail?.parentInvestments?.some(pi => pi.parent_pool_id === p.id);
                            const isSelected = newMembers.some((nm, idx) => idx !== index && nm.type === 'pool' && nm.id === p.id);
                            if (isExists || isSelected) return null;
                            return <option key={`pool_${p.id}`} value={`pool_${p.id}`}>🏦 {p.name}</option>;
                          })}
                        </optgroup>
                        <optgroup label="独立出资人 (机构/个人)">
                          {allInvestors.map(inv => {
                            const isExists = detail?.members?.some(m => m.investor_id === inv.id);
                            const isSelected = newMembers.some((nm, idx) => idx !== index && nm.type === 'investor' && nm.id === inv.id);
                            if (isExists || isSelected) return null;
                            return (
                              <option key={`investor_${inv.id}`} value={`investor_${inv.id}`}>
                                👤 {inv.name} ({inv.type === "individual" ? "个人" : "机构"})
                              </option>
                            );
                          })}
                        </optgroup>
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="请输入金额"
                        value={item.amount}
                        onChange={(e) => {
                          const newList = [...newMembers];
                          newList[index].amount = e.target.value;
                          setNewMembers(newList);
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const newList = newMembers.filter((_, i) => i !== index);
                          setNewMembers(newList.length ? newList : [{ id: "", amount: "", type: "" }]);
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1.2rem' }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button 
            type="button" 
            onClick={() => setNewMembers([...newMembers, { id: "", amount: "", type: "" }])}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            + 增加一行
          </button>
          
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
            <button type="button" onClick={() => setIsAddMemberOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认批量添加</button>
          </div>
        </form>
      </Modal>

      {/* 编辑出资人弹窗 */}
      <Modal isOpen={isEditMemberOpen} onClose={() => setIsEditMemberOpen(false)} title={`编辑出资人：${editingMember?.investor_name || ""}`}>
        {editingMember && (
          <form onSubmit={handleEditMemberSubmit} style={{ display: "flex", flexDirection: "column" }}>
            {/* 只读信息展示 */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", padding: "12px 14px", background: "var(--surface-secondary)", borderRadius: "8px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "4px" }}>出资人名称</div>
                <div style={{ fontWeight: 700 }}>{editingMember.investor_name}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "4px" }}>类型</div>
                <div>{editingMember.investor_type === "individual" ? "👤 个人" : "🏦 机构/基金"}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "4px" }}>已实缴金额</div>
                <div className="mono" style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatCNY(editingMember.called_amount, false)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "4px" }}>实缴持股比例</div>
                <div className="mono" style={{ color: "var(--accent-gold)", fontWeight: 700 }}>
                  {totalCalledAmount > 0 ? (Number(editingMember.called_amount || 0) / totalCalledAmount * 100).toFixed(4) : "0.0000"}%
                </div>
              </div>
            </div>

            <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.07)", borderRadius: "8px", marginBottom: "16px", border: "1px solid rgba(251,191,36,0.2)" }}>
              <p style={{ fontSize: "0.78rem", color: "var(--accent-gold)", margin: 0 }}>
                💡 <strong>持股比例自动计算</strong>：将根据各出资人的实缴金额占全池实缴总额的比例自动得出，无需手动设置。此处仅支持修改「认缴参考额」。
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">认缴参考额（元）
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: "6px", fontWeight: 400 }}>（仅作计划参考，不影响持股比例）</span>
              </label>
              <AmountInput value={editMemberCommitted} onChange={setEditMemberCommitted} placeholder="认缴总额目标（元）" />
              {editingMember.called_amount > 0 && Number(editMemberCommitted) < Number(editingMember.called_amount) && (
                <p style={{ fontSize: "0.75rem", color: "var(--accent-gold)", marginTop: "6px" }}>
                  ⚠️ 认缴参考额低于已实缴金额（{formatCNY(editingMember.called_amount, false)}），请确认是否正确。
                </p>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <button type="button" onClick={() => setIsEditMemberOpen(false)} className="btn-secondary">取消</button>
              <button type="submit" className="btn-primary">保存认缴参考额</button>
            </div>
          </form>
        )}
      </Modal>

      {/* 编辑资金池弹窗 */}
      <Modal isOpen={isEditPoolOpen} onClose={() => setIsEditPoolOpen(false)} title={`编辑资金池：${detail?.pool?.name || ""}`}>
        <form onSubmit={handleEditPoolSubmit} style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">资金池 ID</label>
              <input 
                type="text" 
                disabled
                value={detail?.pool?.id || ""}
                className="form-input mono"
                style={{ backgroundColor: "var(--background)", cursor: "not-allowed" }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={editPoolContractNo}
                onChange={(e) => setEditPoolContractNo(e.target.value)}
                placeholder="如：HT-2024-001"
                className="form-input mono"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 2, marginBottom: "12px" }}>
              <label className="form-label">资金池名称 *</label>
              <input type="text" required value={editPoolName} onChange={(e) => setEditPoolName(e.target.value)} className="form-input" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">管理状态 *</label>
              <select value={editPoolStatus} onChange={(e) => setEditPoolStatus(e.target.value)} className="form-input" style={{ height: "42px" }}>
                <option value="active">在管存续中</option>
                <option value="closed">已到期结清</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">认缴规模（元） *</label>
              <AmountInput value={editTotalCommitted} onChange={setEditTotalCommitted} placeholder="请输入总认缴规模" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">资金池类型 *</label>
              <select value={editPoolType} onChange={(e) => setEditPoolType(e.target.value)} className="form-input" style={{ height: "42px" }}>
                <option value="capital">公司股本金</option>
                <option value="temporary_quarterly">季度临时资金池</option>
                <option value="temporary_annually">年度临时资金池</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">运行起始日期</label>
              <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} className="form-input mono" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">运行结束日期</label>
              <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} className="form-input mono" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">备注说明</label>
            <textarea value={editPoolDesc} onChange={(e) => setEditPoolDesc(e.target.value)} className="form-input" rows={2} style={{ resize: "none" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
            <button type="button" onClick={() => setIsEditPoolOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">保存修改</button>
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
    borderBottom: "2px solid var(--accent-blue)",
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
