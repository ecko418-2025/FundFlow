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
  History,
  Users,
  Pencil
} from "lucide-react";

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { createTransaction } = useTransactions();

  const [project, setProject] = useState(null);
  const [txs, setTxs] = useState([]);
  const [projectInvestors, setProjectInvestors] = useState([]);
  const [allInvestors, setAllInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

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
                i.name AS investor_name
         FROM transactions t
         LEFT JOIN pools p ON t.pool_id = p.id
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
      txResult.forEach(tx => {
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
      return: "in",
      distribution: "out",
      fee: "out",
      pool_transfer_out: "out",
      pool_transfer_in: "in",
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
        tx.type === "return" && tx.investor_id === txInvestorId
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
        createdBy: "admin"
      });
      setTxAmount(""); setTxRef(""); setTxDesc(""); setTxInvestorId("");
      setIsModalOpen(false);
      alert("项目流水登账成功！");
      await loadProjectDetails();
    } catch (err) {
      alert("录入流水失败：" + err.message);
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

  if (loading) return <div style={styles.loading}>加载项目详情中...</div>;
  if (error) return <div style={styles.error}><Info color="red" /> {error}</div>;
  if (!project) return null;

  const isExpired = project.expected_end_date && new Date(project.expected_end_date) < new Date();
  const netInvested = project.invested_amount - project.returned_amount;
  const remainingCommitted = Math.max(0, project.committed_amount - project.invested_amount);

  // 全项目已到账总额（用于动态持股比例计算）
  const totalProjectInvested = projectInvestors.reduce((s, pi) => s + (pi.invested_amount || 0), 0);

  const txHeaders = [
    { key: "date", label: "交易日期", render: (v) => formatDate(v) },
    { key: "investor_name", label: "出资人", render: (v) => <span style={{ fontWeight: 600, color: "var(--accent-blue)" }}>{v || "-"}</span> },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => {
        const typeMap = {
          investment: "项目打款投入",
          return: "项目回款",
          capital_call: "LP实缴打款",
          distribution: "收益分配",
          fee: "费用支出",
          pool_transfer_out: "资金池划出",
          pool_transfer_in: "资金池划入",
          adjustment: "账务调整",
        };
        return typeMap[v] || v;
      }
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

  const investorHeaders = [
    { key: "investor_name", label: "投资者名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "investor_type", label: "类型", render: (v) => v === "individual" ? "个人" : "机构/基金" },
    { key: "committed_amount", label: "认缴参考额", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)" }}>{formatCNY(v, false)}</span> },
    { key: "invested_amount", label: "实缴金额", render: (v) => <span className="mono" style={{ color: "var(--accent-green)", fontWeight: 700 }}>{formatCNY(v, false)}</span> },
    {
      key: "invested_amount",
      label: "实缴持股比例",
      align: "right",
      render: (v) => {
        const pct = totalProjectInvested > 0 ? (v / totalProjectInvested * 100) : 0;
        return (
          <div style={{ textAlign: "right" }}>
            <span className="mono amt-bold" style={{ color: "var(--accent-gold)" }}>
              {pct.toFixed(4)}%
            </span>
            {totalProjectInvested === 0 && (
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "block" }}>待资金到账后计算</span>
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
        <button
          onClick={(e) => { e.stopPropagation(); handleOpenEditInvestor(row); }}
          className="btn-secondary"
          style={{ padding: "5px 10px", fontSize: "0.78rem", gap: "4px" }}
        >
          <Pencil size={12} />
          <span>编辑认缴</span>
        </button>
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

        {activeTab === "investors" && (
          <div className="glass-card no-hover" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>项目出资方名单</h3>
              <button onClick={() => setIsAddInvestorOpen(true)} className="btn-primary" style={{ padding: "8px 14px", fontSize: "0.85rem", gap: "6px" }}>
                <Plus size={15} /><span>添加出资方</span>
              </button>
            </div>
            <DataTable headers={investorHeaders} data={projectInvestors} emptyMessage="当前项目暂无出资方记录，点击右上角添加" />
          </div>
        )}

        {/* 4. 流水 Tab */}
        {activeTab === "ledger" && (
          <div className="glass-card no-hover">
            <DataTable headers={txHeaders} data={txs} emptyMessage="当前项目暂无投资打款或回款流水变动" />
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
                  <option value="capital_call">LP实缴打款 (capital_call)</option>
                  <option value="investment">项目投资 (investment)</option>
                  <option value="return">项目回款 (return)</option>
                  <option value="distribution">收益分红 (distribution)</option>
                  <option value="fee">管理费/支出 (fee)</option>
                  <option value="pool_transfer_out">资金池划出 (pool_transfer_out)</option>
                  <option value="pool_transfer_in">资金池划入 (pool_transfer_in)</option>
                  <option value="adjustment">人工核校 (adjustment)</option>
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
