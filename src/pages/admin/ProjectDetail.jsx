import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { querySQL } from "../../lib/db";
import { useAuthContext } from "../../context/AuthContext";
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
  History,
  Users,
  Pencil,
  Trash2,
  Check,
  XCircle
} from "lucide-react";

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const { createTransaction, approveTransaction, rejectTransaction } = useTransactions();

  const [project, setProject] = useState(null);
  const [txs, setTxs] = useState([]);
  const [projectInvestors, setProjectInvestors] = useState([]);
  const [allInvestors, setAllInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // 编辑项目相关状态
  const [systemTags, setSystemTags] = useState([]);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [editProjName, setEditProjName] = useState("");
  const [editProjContractNo, setEditProjContractNo] = useState("");
  const [editProjStatus, setEditProjStatus] = useState("pre");
  const [editProjCommitted, setEditProjCommitted] = useState("");
  const [editProjStartDate, setEditProjStartDate] = useState("");
  const [editProjEndDate, setEditProjEndDate] = useState("");
  const [editProjTags, setEditProjTags] = useState("");
  const [editProjDesc, setEditProjDesc] = useState("");

  // 添加出资人弹窗状态
  const [isAddInvestorOpen, setIsAddInvestorOpen] = useState(false);
  const [newInvestors, setNewInvestors] = useState(
    Array.from({ length: 5 }, () => ({ investorId: "", committedAmount: "" }))
  );

  // 编辑认缴额弹窗状态
  const [isEditInvestorOpen, setIsEditInvestorOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [editCommitted, setEditCommitted] = useState("");

  // 快捷录入流水状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState("investment");
  const [txInvestorId, setTxInvestorId] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txRef, setTxRef] = useState("");
  const [txDesc, setTxDesc] = useState("");

  const [customType, setCustomType] = useState("investment");

  useEffect(() => {
    setCustomType(txType);
  }, [txType]);

  const loadProjectDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projResult = await querySQL(
        `SELECT pr.*, p.name AS pool_name 
         FROM projects pr 
         LEFT JOIN pools p ON pr.pool_id = p.id 
         WHERE pr.id = ?`,
        [id]
      );
      if (projResult.length === 0) throw new Error("项目不存在");
      setProject(projResult[0]);

      const txResult = await querySQL(
        `SELECT t.*, p.name AS pool_name, pr.name AS project_name,
                i.name AS investor_name, rp.name AS related_pool_name 
         FROM transactions t
         LEFT JOIN pools p ON t.pool_id = p.id
         LEFT JOIN pools rp ON t.related_pool_id = rp.id
         LEFT JOIN projects pr ON t.project_id = pr.id
         LEFT JOIN investors i ON t.investor_id = i.id
         WHERE t.project_id = ?
         ORDER BY t.date DESC, t.created_at DESC`,
        [id]
      );
      setTxs(txResult);

      const piResult = await querySQL(
        `SELECT pi.*, 
                COALESCE(i.name, p.name) AS investor_name, 
                COALESCE(i.type, 'pool') AS investor_type
         FROM project_investors pi
         LEFT JOIN investors i ON pi.investor_id = i.id
         LEFT JOIN pools p ON pi.investor_id = p.id
         WHERE pi.project_id = ?`,
        [id]
      );

      const investorTxMap = {};
      txResult.filter(tx => tx.status === "approved").forEach(tx => {
        if (tx.investor_id) {
          if (!investorTxMap[tx.investor_id]) investorTxMap[tx.investor_id] = 0;
          if (tx.direction === "out") {
            investorTxMap[tx.investor_id] += Number(tx.amount);
          } else if (tx.direction === "in") {
            investorTxMap[tx.investor_id] -= Number(tx.amount);
          }
        }
      });

      const updatedPiResult = piResult.map(pi => ({
        ...pi,
        invested_amount: investorTxMap[pi.investor_id] || 0
      }));

      setProjectInvestors(updatedPiResult);

      const invResult = await querySQL(`SELECT id, name, type FROM investors`, []);
      const poolResult = await querySQL(`SELECT * FROM pools`, []);
      const combined = [
        ...invResult.map(i => ({ ...i, category: 'investor' })),
        ...poolResult.map(p => ({ id: p.id, name: p.name, type: 'pool', category: 'pool' }))
      ];
      setAllInvestors(combined);

      // 加载系统配置的分类标签
      const settingsData = await querySQL(`SELECT * FROM settings`);
      const tagsSetting = settingsData.find(s => s.key === "system_tags");
      if (tagsSetting) {
        setSystemTags(JSON.parse(tagsSetting.value));
      }
    } catch (err) {
      setError(err.message || "获取项目详情失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProjectDetails();
  }, [loadProjectDetails]);

  const getDirectionByType = (t) => {
    const map = {
      capital_call: "in",
      investment: "out",
      pool_investment: "out",
      return: "in",
      distribution: "out",
      fee: "out",
      adjustment: "in"
    };
    return map[t] || "in";
  };

  const handleCreateTx = async (e) => {
    e.preventDefault();
    if (!txAmount || !txDate || !txInvestorId) { alert("请填写必填项(金额/日期/投资人)"); return; }
    
    // ======== 新增：回款最大额度校验 ========
    if (txType === "return") {
      const pi = projectInvestors.find(p => p.investor_id === txInvestorId);
      const investedAmt = pi ? Number(pi.invested_amount || 0) : 0;
      const cumulativeReturned = txs.filter(tx => 
        tx.type === "return" && tx.investor_id === txInvestorId && tx.status === "approved"
      ).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      
      const maxAllowed = investedAmt - cumulativeReturned;
      if (Number(txAmount) > maxAllowed) {
        alert(`为保持等式平衡，项目回款(本金)不得高于该主体的实缴总额！\n\n该主体历史实缴：¥${(investedAmt/10000).toFixed(2)}万\n已退回本金：¥${(cumulativeReturned/10000).toFixed(2)}万\n本次最多可退回：¥${(maxAllowed/10000).toFixed(2)}万\n\n超出的部分请在“收益分配”中单独处理。`);
        return;
      }
    }
    // =====================================

    try {
      const resolvedTypeToUse = customType || txType;
      const direction = getDirectionByType(resolvedTypeToUse);
      const pi = projectInvestors.find(p => p.investor_id === txInvestorId);
      const isPool = pi && pi.investor_type === 'pool';
      const actualPoolId = isPool ? txInvestorId : null;
      const txStatus = currentUser?.role === "operator" ? "pending" : "approved";

      await createTransaction({
        poolId: actualPoolId,
        projectId: project.id,
        investorId: txInvestorId,
        type: resolvedTypeToUse,
        direction,
        amount: Number(txAmount),
        date: txDate,
        description: txDesc || `${resolvedTypeToUse === 'investment' ? '打款投放' : '项目提现回款'}-${project.name}`,
        referenceNo: txRef,
        createdBy: currentUser?.uid || "admin",
        actor: currentUser,
        status: txStatus
      });
      setTxAmount(""); setTxRef(""); setTxDesc(""); setTxInvestorId("");
      setIsModalOpen(false);
      alert(txStatus === "pending" ? "项目流水已录入，请等待管理员审核生效。" : "项目流水登账成功！");
      await loadProjectDetails();
    } catch (err) {
      alert("录入流水失败：" + err.message);
    }
  };

  const handleApproveTx = async (txId) => {
    if (!window.confirm("确定核准通过这笔项目流水吗？")) return;
    try {
      await approveTransaction(txId, currentUser);
      await loadProjectDetails();
      alert("审核通过！");
    } catch (err) {
      alert("审批失败：" + err.message);
    }
  };

  const handleRejectTx = async (txId) => {
    if (!window.confirm("确定要驳回这笔项目流水吗？")) return;
    try {
      await rejectTransaction(txId, currentUser);
      await loadProjectDetails();
      alert("已驳回。");
    } catch (err) {
      alert("驳回失败：" + err.message);
    }
  };

  const handleAddInvestorSubmit = async (e) => {
    e.preventDefault();
    const validInvestors = newInvestors.filter(inv => inv.investorId && inv.committedAmount && Number(inv.committedAmount) > 0);
    
    if (validInvestors.length === 0) {
      alert("请至少填写一行完整的出资方和对应的认缴金额");
      return;
    }

    try {
      for (const inv of validInvestors) {
        const newId = `pi-inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await querySQL(
          `INSERT INTO project_investors (id, project_id, investor_id, committed_amount) VALUES (?, ?, ?, ?)`,
          [newId, id, inv.investorId, Number(inv.committedAmount)]
        );
      }
      setIsAddInvestorOpen(false);
      setNewInvestors(Array.from({ length: 5 }, () => ({ investorId: "", committedAmount: "" })));
      await loadProjectDetails();
      alert("出资方已成功添加到项目！");
    } catch (err) {
      alert("添加失败：" + err.message);
    }
  };

  const handleOpenEditInvestor = (inv) => {
    setEditingInvestor(inv);
    setEditCommitted(String(inv.committed_amount));
    setIsEditInvestorOpen(true);
  };

  const handleEditInvestorSubmit = async (e) => {
    e.preventDefault();
    if (!editCommitted || Number(editCommitted) <= 0) { alert("认缴参考额必须大于 0"); return; }
    try {
      await querySQL(
        `UPDATE project_investors SET committed_amount = ? WHERE project_id = ? AND investor_id = ?`,
        [Number(editCommitted), id, editingInvestor.investor_id]
      );
      setIsEditInvestorOpen(false);
      setEditingInvestor(null);
      await loadProjectDetails();
      alert("认缴参考额已更新！");
    } catch (err) {
      alert("更新失败：" + err.message);
    }
  };

  const handleOpenEditProject = () => {
    if (!project) return;
    setEditProjName(project.name);
    setEditProjContractNo(project.contract_no || "");
    setEditProjStatus(project.status || "pre");
    setEditProjCommitted(String(project.committed_amount));
    
    let tagsStr = "";
    if (project.tags) {
      try {
        const parsed = typeof project.tags === "string" ? JSON.parse(project.tags) : project.tags;
        if (Array.isArray(parsed)) {
          tagsStr = parsed.join(", ");
        }
      } catch (e) {
        tagsStr = String(project.tags);
      }
    }
    setEditProjTags(tagsStr);
    setEditProjStartDate(project.start_date ? project.start_date.slice(0, 10) : "");
    setEditProjEndDate(project.expected_end_date ? project.expected_end_date.slice(0, 10) : "");
    setEditProjDesc(project.description || "");
    setIsEditProjectOpen(true);
  };

  const handleEditProjectSubmit = async (e) => {
    e.preventDefault();
    if (!editProjName || !editProjCommitted || !editProjStartDate || !editProjEndDate) {
      alert("请填写所有必填项");
      return;
    }
    if (editProjStartDate && editProjEndDate && new Date(editProjEndDate) < new Date(editProjStartDate)) {
      alert("结束日期不能早于起始日期！");
      return;
    }
    try {
      const tagsArray = editProjTags ? editProjTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      const sql = `
        UPDATE projects
        SET name = ?, code = ?, status = ?, committed_amount = ?,
            description = ?, tags = ?, start_date = ?, expected_end_date = ?, contract_no = ?
        WHERE id = ?
      `;
      await querySQL(sql, [
        editProjName,
        project.id,
        editProjStatus,
        Number(editProjCommitted),
        editProjDesc,
        JSON.stringify(tagsArray),
        editProjStartDate || null,
        editProjEndDate || null,
        editProjContractNo || "",
        project.id
      ]);
      setIsEditProjectOpen(false);
      await loadProjectDetails();
      alert("项目信息已更新！");
    } catch (err) {
      alert("更新失败：" + err.message);
    }
  };

  const handleDeleteProjectInvestor = async (e, investor) => {
    e.stopPropagation();
    if (Number(investor.invested_amount) > 0) {
      alert("该出资人已有实缴记录，不可删除。");
      return;
    }
    if (!window.confirm(`确定要移除出资人 ${investor.investor_name} 吗？`)) {
      return;
    }
    try {
      await querySQL(
        `DELETE FROM project_investors WHERE project_id = ? AND investor_id = ?`,
        [project.id, investor.investor_id]
      );
      await loadProjectDetails();
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

  if (loading) return <div style={styles.loading}>加载中...</div>;
  if (error) return <div style={styles.error}><Info color="red" /> {error}</div>;
  if (!project) return null;

  const isExpired = project.expected_end_date && new Date(project.expected_end_date) < new Date();
  const netInvested = project.invested_amount - project.returned_amount;
  const remainingCommitted = Math.max(0, project.committed_amount - project.invested_amount);

  // 全项目已到账总额（用于动态持股比例计算）
  const totalProjectInvested = projectInvestors.reduce((s, pi) => s + Number(pi.invested_amount || 0), 0);

  const getSourceName = (row) => {
    if (row.type === "capital_call") return row.investor_name || "";
    if (row.type === "investment") return row.investor_name || row.pool_name || "";
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
    {
      key: "status",
      label: "审核状态",
      render: (v) => {
        const map = {
          pending: { text: "待审核", status: "warning" },
          approved: { text: "已生效", status: "active" },
          rejected: { text: "已驳回", status: "exited" }
        };
        const item = map[v] || { text: v || "已生效", status: "active" };
        return <Badge text={item.text} status={item.status} />;
      }
    },
    { key: "description", label: "摘要说明" },
    {
      key: "actions",
      label: "操作",
      align: "center",
      render: (_, row) => {
        if (currentUser?.role === "admin" && row.status === "pending") {
          return (
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button onClick={() => handleApproveTx(row.id)} className="btn-primary" style={{ padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "var(--accent-green)", borderColor: "var(--accent-green)" }}>
                <Check size={14} />
              </button>
              <button onClick={() => handleRejectTx(row.id)} className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--accent-red)" }}>
                <XCircle size={14} />
              </button>
            </div>
          );
        }
        return <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>-</span>;
      }
    }
  ];

  const investorHeaders = [
    { key: "investor_name", label: "出资方名称", render: (v, row) => (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{row.investor_type === 'pool' ? `🏦 ${v}` : (row.investor_type === 'individual' ? `👤 ${v}` : `🏢 ${v}`)}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.investor_type === 'pool' ? '机构母池' : (row.investor_type === 'individual' ? '个人 LP' : '机构 LP')}
        </span>
      </div>
    )},
    { key: "committed_amount", label: "认缴参考额", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)" }}>{formatCNY(v, false)}</span> },
    { key: "invested_amount", label: "累计实缴额", render: (v) => <span className="mono" style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatCNY(v, false)}</span> },
    {
      key: "invested_amount_pct",
      label: "当前实缴比例",
      align: "right",
      render: (_, row) => {
        const pct = totalProjectInvested > 0 ? (Number(row.invested_amount || 0) / totalProjectInvested * 100) : 0;
        return (
          <div style={{ textAlign: "right" }}>
            <span className="badge badge-warning" style={{ fontWeight: 700 }}>
              {pct.toFixed(4)}%
            </span>
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
            onClick={(e) => { e.stopPropagation(); handleOpenEditInvestor(row); }}
            className="btn-secondary"
            style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px" }}
          >
            <Pencil size={12} />
            <span>编辑</span>
          </button>
          <button
            onClick={(e) => handleDeleteProjectInvestor(e, row)}
            className="btn-secondary"
            style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px", color: Number(row.invested_amount) > 0 ? "var(--text-muted)" : "var(--accent-red)", cursor: Number(row.invested_amount) > 0 ? "not-allowed" : "pointer" }}
            title={Number(row.invested_amount) > 0 ? "已有实缴，不可删除" : "删除出资方"}
            disabled={Number(row.invested_amount) > 0}
          >
            <Trash2 size={12} />
            <span>删除</span>
          </button>
        </div>
      )
    }
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
            text={project.status === 'pre' ? '投前考察' : project.status === 'active' ? '存续管理' : project.status === 'exited' ? '退出清算' : '项目归档'} 
            status={project.status} 
          />
          {isExpired && <span className="badge badge-danger" style={{ textTransform: "none" }}>已到期</span>}
          <button 
            onClick={handleOpenEditProject}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.85rem", gap: "6px", marginLeft: "12px" }}
          >
            <Pencil size={14} />
            <span>编辑项目</span>
          </button>
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
          <button 
            onClick={() => setActiveTab("investors")} 
            style={{ ...styles.tabBtn, ...(activeTab === "investors" ? styles.tabBtnActive : {}) }}
          >
            <Users size={16} />
            <span>出资方 ({projectInvestors.length})</span>
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
                <span style={styles.infoLabel}>相关合同编号</span>
                <span className="mono">{project.contract_no || "无"}</span>
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
                <span>{project.status === 'pre' ? '投前考察' : project.status === 'active' ? '存续管理' : project.status === 'exited' ? '退出清算' : '项目归档'}</span>
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

        {activeTab === "investors" && (
          <div className="glass-card no-hover" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>全量项目出资方名单 (含 LP 与母池)</h3>
              <button onClick={() => setIsAddInvestorOpen(true)} className="btn-primary" style={{ padding: "8px 16px", gap: "6px" }}>
                <Plus size={16} /><span>登记新出资方</span>
              </button>
            </div>
            
            <div style={{ marginBottom: "20px", padding: "16px", background: "var(--surface-secondary)", borderRadius: "10px", display: "flex", gap: "40px", border: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}>全项目当前累计实缴到位</div>
                <div className="mono amt-bold" style={{ color: "var(--accent-green)", fontSize: "1.2rem" }}>{formatCNY(totalProjectInvested, false)}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}>认缴登记总额目标</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: "1.2rem" }}>{formatCNY(projectInvestors.reduce((sum, pi) => sum + Number(pi.committed_amount || 0), 0), false)}</div>
              </div>
            </div>

            <DataTable 
              headers={investorHeaders} 
              data={projectInvestors} 
              emptyMessage="当前项目暂无出资人记录，请点击右上角添加" 
              onRowClick={(row) => {
                if (row.investor_type === 'pool') {
                  navigate(`/admin/pools/${row.investor_id}`);
                } else {
                  navigate(`/admin/investors/${row.investor_id}`);
                }
              }}
            />
          </div>
        )}

        {/* 4. 流水 Tab */}
        {activeTab === "ledger" && (
          <div className="glass-card no-hover" style={{ padding: "20px" }}>
            <DataTable headers={txHeaders} data={paginatedTxs} emptyMessage="当前项目暂无投资打款或回款流水变动" />

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
      </div>

      {/* 弹窗：快捷录入项目流水 */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`登记项目收支 - ${project.name}`}>
        <form onSubmit={handleCreateTx} style={styles.form}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" }}>
            <button 
              type="button"
              className={txType === "investment" ? "btn-primary" : "btn-secondary"}
              onClick={() => setTxType("investment")}
            >
              2. 向单独项目打款
            </button>
            <button 
              type="button"
              className={txType === "return" ? "btn-primary" : "btn-secondary"}
              onClick={() => setTxType("return")}
            >
              3. 项目回款入账
            </button>
          </div>

          <div style={styles.lockedFields}>
            <div style={styles.lockedRow}>
              <span>项目 ID：</span>
              <strong className="mono" style={{ color: "var(--accent-blue)" }}>{project.id}</strong>
            </div>
            {projectInvestors.length > 0 && (
              <>
                <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "4px 0" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>已登记出资方：</span>
                  {projectInvestors.map(pi => (
                    <div key={pi.investor_id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                      <span style={{ color: "var(--accent-blue)" }}>• {pi.investor_name}</span>
                      <span className="mono" style={{ color: "var(--text-secondary)" }}>认缴: {formatCNY(pi.committed_amount, false)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label className="form-label">关联具体投资人 *</label>
              <select value={txInvestorId} onChange={(e) => setTxInvestorId(e.target.value)} className="form-input" required>
                <option value="">-- 请选择打款/提现对应的投资方 --</option>
                {projectInvestors.map(pi => (
                  <option key={pi.investor_id} value={pi.investor_id}>
                    {pi.investor_name} ({pi.investor_type === "individual" ? "个人" : "机构"})
                  </option>
                ))}
              </select>
              {projectInvestors.length === 0 && (
                <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginTop: "6px" }}>
                  当前项目尚未添加任何出资方，请先在“出资方”Tab添加。
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: "16px" }}>
              <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
                <label className="form-label">发生金额 (元) *</label>
                <AmountInput 
                  value={txAmount} 
                  onChange={setTxAmount}
                  placeholder="请输入本次交易发生的金额"
                />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
                <label className="form-label">发生日期 *</label>
                <input 
                  type="date" 
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="form-input mono"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "16px" }}>
              <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
                <label className="form-label">交易类型 (系统定义) *</label>
                <select value={customType} onChange={(e) => setCustomType(e.target.value)} className="form-input" required style={{ height: "42px" }}>
                  <option value="capital_call">实缴打款</option>
                  <option value="investment">项目投资</option>
                  <option value="pool_investment">母池注资</option>
                  <option value="return">项目回款</option>
                  <option value="distribution">收益分红</option>
                  <option value="fee">管理费/支出</option>
                  <option value="adjustment">人工核校</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
                <label className="form-label">凭证流水号</label>
                <input 
                  type="text" 
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  placeholder="如：网银电子凭证号"
                  className="form-input mono"
                  style={{ height: "42px" }}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: "12px" }}>
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
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认登账</button>
          </div>
        </form>
      </Modal>

      {/* 弹窗：添加出资方 */}
      <Modal isOpen={isAddInvestorOpen} onClose={() => setIsAddInvestorOpen(false)} title="批量添加出资方" maxWidth="800px">
        <form onSubmit={handleAddInvestorSubmit} style={{ ...styles.form, minWidth: '100%' }}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>选择出资方 (资金池 / 独立投资人) *</th>
                  <th style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-secondary)' }}>认缴参考额 (元) *</th>
                  <th style={{ padding: '10px 8px', width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {newInvestors.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px' }}>
                      <select 
                        value={item.investorId} 
                        onChange={(e) => {
                          const newList = [...newInvestors];
                          newList[index].investorId = e.target.value;
                          setNewInvestors(newList);
                        }} 
                        className="form-input" 
                      >
                        <option value="">-- 请选择 --</option>
                        <optgroup label="关联资金池">
                          {allInvestors.filter(inv => inv.category === 'pool').map(inv => {
                            const isExists = projectInvestors.some(pi => pi.investor_id === inv.id);
                            const isSelectedInOtherRow = newInvestors.some((ni, idx) => idx !== index && ni.investorId === inv.id);
                            if (isExists || isSelectedInOtherRow) return null;
                            return <option key={inv.id} value={inv.id}>🏦 {inv.name}</option>;
                          })}
                        </optgroup>
                        <optgroup label="独立出资人 (机构/个人)">
                          {allInvestors.filter(inv => inv.category === 'investor').map(inv => {
                            const isExists = projectInvestors.some(pi => pi.investor_id === inv.id);
                            const isSelectedInOtherRow = newInvestors.some((ni, idx) => idx !== index && ni.investorId === inv.id);
                            if (isExists || isSelectedInOtherRow) return null;
                            return (
                              <option key={inv.id} value={inv.id}>
                                👤 {inv.name} ({inv.type === 'individual' ? '个人' : '机构'})
                              </option>
                            );
                          })}
                        </optgroup>
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <AmountInput 
                        value={item.committedAmount} 
                        onChange={(val) => {
                          const newList = [...newInvestors];
                          newList[index].committedAmount = val;
                          setNewInvestors(newList);
                        }}
                        placeholder="请输入认缴金额"
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {newInvestors.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => {
                            const newList = [...newInvestors];
                            newList.splice(index, 1);
                            setNewInvestors(newList);
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
                          title="删除此行"
                        >
                          &times;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button 
            type="button" 
            onClick={() => setNewInvestors([...newInvestors, { investorId: "", committedAmount: "" }])}
            className="btn-secondary"
            style={{ width: 'fit-content', padding: '6px 12px', fontSize: '0.85rem' }}
          >
            + 增加一行
          </button>
          
          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsAddInvestorOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认批量添加</button>
          </div>
        </form>
      </Modal>

      {/* 弹窗：编辑认缴额 */}
      <Modal isOpen={isEditInvestorOpen} onClose={() => setIsEditInvestorOpen(false)} title="编辑认缴参考额">
        {editingInvestor && (
          <form onSubmit={handleEditInvestorSubmit} style={styles.form}>
            <div style={styles.lockedFields}>
              <div style={styles.lockedRow}>
                <span>投资者名称：</span>
                <strong>{editingInvestor.investor_name}</strong>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">新的认缴参考额 (元) *</label>
              <AmountInput 
                value={editCommitted} 
                onChange={setEditCommitted}
                placeholder="请输入新金额"
              />
            </div>
            <div style={styles.modalActions}>
              <button type="button" onClick={() => setIsEditInvestorOpen(false)} className="btn-secondary">取消</button>
              <button type="submit" className="btn-primary">保存修改</button>
            </div>
          </form>
        )}
      </Modal>

      {/* 弹窗：编辑项目 */}
      <Modal isOpen={isEditProjectOpen} onClose={() => setIsEditProjectOpen(false)} title={`编辑项目：${project?.name || ""}`}>
        <form onSubmit={handleEditProjectSubmit} style={styles.form}>
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">项目 ID</label>
              <input 
                type="text" 
                disabled
                value={project?.id || ""}
                className="form-input mono"
                style={{ backgroundColor: "var(--background)", cursor: "not-allowed" }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={editProjContractNo}
                onChange={(e) => setEditProjContractNo(e.target.value)}
                placeholder="如：HT-2024-001"
                className="form-input mono"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 2, marginBottom: "12px" }}>
              <label className="form-label">项目名称 *</label>
              <input type="text" required value={editProjName} onChange={(e) => setEditProjName(e.target.value)} className="form-input" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">立项阶段 *</label>
              <select value={editProjStatus} onChange={(e) => setEditProjStatus(e.target.value)} className="form-input" style={{ height: "42px" }}>
                <option value="pre">投前储备阶段</option>
                <option value="active">存续运营阶段</option>
                <option value="exited">完全退出阶段</option>
                <option value="archived">项目归档阶段</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">计划出资规模 *</label>
              <AmountInput value={editProjCommitted} onChange={setEditProjCommitted} placeholder="请输入计划出资额（元）" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">运行起始日期</label>
              <input type="date" value={editProjStartDate} onChange={(e) => setEditProjStartDate(e.target.value)} className="form-input mono" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">预计结束日期</label>
              <input type="date" value={editProjEndDate} onChange={(e) => setEditProjEndDate(e.target.value)} className="form-input mono" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label" style={{ marginBottom: "4px" }}>项目分类标签</label>
            {systemTags.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "6px" }}>
                {systemTags.map(cat => (
                  <div key={cat.id} style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", minWidth: "70px" }}>{cat.name}:</span>
                    {cat.tags && cat.tags.map(tag => {
                      const currentTags = editProjTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
                      const isSelected = currentTags.includes(tag);
                      return (
                        <span 
                          key={tag} 
                          onClick={() => {
                            if (isSelected) {
                              setEditProjTags(currentTags.filter(t => t !== tag).join(", "));
                            } else {
                              setEditProjTags([...currentTags, tag].join(", "));
                            }
                          }}
                          className={`badge ${isSelected ? 'badge-active' : ''}`}
                          style={{ 
                            cursor: "pointer", 
                            fontSize: "0.75rem",
                            padding: "2px 6px",
                            border: isSelected ? "none" : `1px solid ${cat.color}40`, 
                            backgroundColor: isSelected ? cat.color : "transparent", 
                            color: isSelected ? "#fff" : cat.color 
                          }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <input 
              type="text" 
              value={editProjTags}
              onChange={(e) => setEditProjTags(e.target.value)}
              placeholder="自定义标签用逗号隔开，或者点击上方已有标签快速添加"
              className="form-input"
              style={{ height: "36px", fontSize: "0.85rem" }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">项目详情描述</label>
            <textarea 
              value={editProjDesc}
              onChange={(e) => setEditProjDesc(e.target.value)}
              placeholder="详细描述项目主营业务、估值、主要回款约定..."
              className="form-input"
              rows={2}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsEditProjectOpen(false)} className="btn-secondary">取消</button>
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
