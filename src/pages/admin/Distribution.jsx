import React, { useState, useEffect } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { usePools } from "../../hooks/usePools";
import { useProjects } from "../../hooks/useProjects";
import { useShareCalculator } from "../../hooks/useShareCalculator";
import { useDistribution } from "../../hooks/useDistribution";
import { AmountInput } from "../../components/ui/AmountInput";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { exportDistributionReport } from "../../lib/excel";
import { CheckCircle, PieChart, Info, HelpCircle, FileText, Download, Printer, Trash2, Check, XCircle } from "lucide-react";
import { Modal } from "../../components/ui/Modal";

function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function Distribution() {
  const { currentUser } = useAuthContext();
  const { pools } = usePools();
  const { projects } = useProjects();
  const { calculateShares, loading: sharesLoading } = useShareCalculator();
  const {
    createDistribution,
    getDistributions,
    getDistributionDetails,
    deleteDistribution,
    approveDistribution,
    rejectDistribution,
    loading: distLoading
  } = useDistribution();

  // 分配表单参数
  const [targetId, setTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [isPenetrate, setIsPenetrate] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [distributionDate, setDistributionDate] = useState(getTodayDateInputValue);
  const [description, setDescription] = useState("");

  // 计算得出的出资人份额及金额明细列表
  const [lpItems, setLpItems] = useState([]);
  const [directItems, setDirectItems] = useState([]);

  // 历史分配记录
  const [distHistory, setDistHistory] = useState([]);
  const [distHistoryLoading, setDistHistoryLoading] = useState(false);
  
  // 详情 Modal 状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDistDetail, setSelectedDistDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const getTargetType = (id = targetId) => {
    if (pools.some(p => p.id === id)) return "pool";
    if (projects.some(p => p.id === id)) return "project";
    return "";
  };

  const getTargetInfo = () => {
    const targetType = getTargetType();
    const targetName = targetType === 'pool'
      ? pools.find(p => p.id === targetId)?.name
      : projects.find(p => p.id === targetId)?.name;
    return { targetType, targetName };
  };
  
  const loadHistory = async () => {
    setDistHistoryLoading(true);
    try {
      const data = await getDistributions();
      setDistHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDistHistoryLoading(false);
    }
  };

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

  const handleDeleteDistribution = async (e, dist) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这条分配记录及其所有的明细台账吗？该操作不可恢复！")) {
      return;
    }
    
    try {
      await deleteDistribution(dist.id, currentUser);
      loadHistory();
    } catch (err) {
      alert("删除失败：" + err.message);
    }
  };

  const handleApproveDistribution = async (e, dist) => {
    e.stopPropagation();
    if (!window.confirm("确定核准通过这条收益分配方案吗？通过后 LP 端将看到该笔分配。")) return;
    try {
      await approveDistribution(dist.id, currentUser);
      alert("分配方案已审核通过。");
      loadHistory();
    } catch (err) {
      alert("审核失败：" + err.message);
    }
  };

  const handleRejectDistribution = async (e, dist) => {
    e.stopPropagation();
    if (!window.confirm("确定驳回这条收益分配方案吗？驳回后不会对 LP 端生效。")) return;
    try {
      await rejectDistribution(dist.id, currentUser);
      alert("分配方案已驳回。");
      loadHistory();
    } catch (err) {
      alert("驳回失败：" + err.message);
    }
  };

  const getDistStatusMeta = (status) => {
    const map = {
      pending: { text: "待审核", bg: "rgba(245, 158, 11, 0.2)", color: "var(--accent-gold)" },
      confirmed: { text: "已确认结算", bg: "rgba(16, 185, 129, 0.2)", color: "var(--accent-green)" },
      rejected: { text: "已驳回", bg: "rgba(239, 68, 68, 0.18)", color: "var(--accent-red)" },
      draft: { text: "草稿", bg: "rgba(148, 163, 184, 0.16)", color: "var(--text-secondary)" }
    };
    return map[status] || { text: status || "-", bg: "rgba(148, 163, 184, 0.16)", color: "var(--text-secondary)" };
  };

  useEffect(() => {
    loadHistory();
  }, []);


  // 当参数发生变化时，清空计算结果，要求用户重新点击“计算”
  useEffect(() => {
    setLpItems([]);
    setDirectItems([]);
  }, [targetId, isPenetrate, totalAmount]);

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const targetKeyword = normalizeText(targetSearch);
  const isTargetMatched = (item) => {
    if (!targetKeyword || item.id === targetId) return true;
    return [
      item.name,
      item.id,
      item.code,
      item.status,
      item.description
    ].some(value => normalizeText(value).includes(targetKeyword));
  };
  const visiblePools = pools.filter(isTargetMatched);
  const visibleProjects = projects
    .filter(p => !["pre", "archived"].includes(p.status))
    .filter(isTargetMatched);

  const handleCalculate = async (e) => {
    if (e) e.preventDefault();
    if (!targetId) {
      alert("请先选择目标分配实体");
      return;
    }
    const total = Number(totalAmount) || 0;
    try {
      const targetType = getTargetType();
      if (!targetType) {
        alert("目标分配实体不存在，请重新选择");
        return;
      }
      const directShares = await calculateShares(targetType, targetId, false);
      const rawShares = isPenetrate ? await calculateShares(targetType, targetId, true) : directShares;
      const directItemsWithAmt = directShares.map(s => ({
        ...s,
        amount: total * (Number(s.effective_share) / 100.0)
      }));
      const itemsWithAmt = rawShares.map(s => ({
        ...s,
        amount: total * (Number(s.effective_share) / 100.0)
      }));
      setDirectItems(directItemsWithAmt);
      setLpItems(itemsWithAmt);
    } catch (err) {
      console.error("加载目标分配份额失败", err);
      alert("计算失败: " + err.message);
    }
  };

  const handleExportExcel = () => {
    const { targetType, targetName } = getTargetInfo();
    exportDistributionReport({
      targetName,
      targetType,
      distributionDate,
      totalAmount,
      isPenetrate,
      directItems,
      lpItems,
      fileName: `收益分配计算表_${distributionDate}`
    });
  };

  const handlePrintPdf = () => {
    const win = window.open('', '', 'width=900,height=650');

    const showDirectPreview = isPenetrate && directItems.some(item => item.entity_type === "pool");
    const directRowsHtml = directItems.map(item => `
      <tr>
        <td><strong>${item.investor_name}</strong></td>
        <td><span class="${item.entity_type === 'pool' ? 'badge pool' : 'badge investor'}">${item.entity_type === 'pool' ? '资金池/基金' : '投资人'}</span></td>
        <td class="mono">${formatPercent(item.effective_share)}</td>
        <td class="text-right mono amount-gold">${formatCNY(item.amount, false, false)}</td>
      </tr>
    `).join('');

    const rowsHtml = lpItems.map(item => `
      <tr>
        <td><strong>${item.investor_name}</strong>${item.entity_type === 'pool' ? '<span class="badge pool inline">资金池</span>' : ''}</td>
        <td class="mono">${formatPercent(item.direct_share)}</td>
        <td class="mono muted">${formatPercent(item.indirect_share)}</td>
        <td class="mono final-share">${formatPercent(item.effective_share)}</td>
        <td class="text-right mono amount-green">${formatCNY(item.amount, false, false)}</td>
      </tr>
    `).join('');

    const totalShare = lpItems.reduce((sum, i) => sum + Number(i.effective_share), 0);
    const totalAmountSum = lpItems.reduce((sum, i) => sum + i.amount, 0);
    const directShareTotal = directItems.reduce((sum, i) => sum + Number(i.effective_share), 0);
    const directAmountTotal = directItems.reduce((sum, i) => sum + i.amount, 0);

    const { targetType, targetName } = getTargetInfo();

    win.document.write(`
      <html>
        <head>
          <title>收益分配计算表 - ${distributionDate}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 34px; color: #111827; background: #fff; }
            h2 { margin: 0 0 18px; font-size: 24px; }
            h3 { margin: 26px 0 10px; font-size: 16px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px; margin-bottom: 18px; font-size: 13px; padding: 14px; border: 1px solid #d7dde8; background: #f8fafc; }
            .meta span { color: #64748b; margin-right: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
            th, td { border-bottom: 1px solid #d7dde8; padding: 11px 12px; text-align: left; }
            th { background-color: #f1f5f9; color: #64748b; font-weight: 700; }
            .text-right { text-align: right; }
            .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
            .muted { color: #64748b; }
            .final-share { color: #2563eb; font-weight: 700; }
            .amount-green { color: #059669; font-weight: 700; }
            .amount-gold { color: #d97706; font-weight: 700; }
            .total-row td { font-weight: bold; background-color: #f8fafc; border-top: 2px solid #cbd5e1; }
            .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; }
            .badge.inline { margin-left: 8px; }
            .badge.pool { color: #92400e; background: #fef3c7; }
            .badge.investor { color: #1d4ed8; background: #dbeafe; }
            .preview { padding: 12px; border: 1px solid #f1d29b; background: #fffbeb; margin: 18px 0 22px; }
            .tip { margin-top: 18px; padding: 12px; border: 1px solid #a7f3d0; background: #ecfdf5; color: #047857; font-size: 13px; }
            @media print { body { padding: 20px; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <h2>收益分配计算表</h2>
          <div class="meta">
            <div><span>目标分配实体</span><strong>${targetName || '-'}</strong></div>
            <div><span>实体类型</span><strong>${targetType === 'pool' ? '资金池' : '项目'}</strong></div>
            <div><span>拟分配总金额</span><strong>${formatCNY(Number(totalAmount), false, false)}</strong></div>
            <div><span>分配日期</span><strong>${distributionDate}</strong></div>
            <div><span>分配模式</span><strong>${isPenetrate ? '穿透分配' : '不穿透分配'}</strong></div>
            <div><span>生成时间</span><strong>${new Date().toLocaleString('zh-CN')}</strong></div>
          </div>

          ${showDirectPreview ? `
            <div class="preview">
              <h3>直接层级分配预览（含资金池/基金）</h3>
              <table>
                <thead>
                  <tr>
                    <th>直接收款主体</th>
                    <th>主体类型</th>
                    <th>直接份额</th>
                    <th class="text-right">直接层级金额</th>
                  </tr>
                </thead>
                <tbody>
                  ${directRowsHtml}
                  <tr class="total-row">
                    <td>直接层级合计</td>
                    <td></td>
                    <td class="mono">${formatPercent(directShareTotal)}</td>
                    <td class="text-right mono amount-gold">${formatCNY(directAmountTotal, false, false)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ` : ''}

          <h3>最终分配比例及应分金额计算表</h3>
          <table>
            <thead>
              <tr>
                <th>LP 姓名/实体名称</th>
                <th>直接份额</th>
                <th>间接份额（大池穿透）</th>
                <th>最终有效份额</th>
                <th class="text-right">预计实分金额 (元)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td>有效持股总计</td>
                <td colspan="3" class="text-right mono">${formatPercent(totalShare)}</td>
                <td class="text-right">${formatCNY(totalAmountSum, false, false)}</td>
              </tr>
            </tbody>
          </table>
          <div class="tip">
            ${isPenetrate 
              ? '已开启穿透模式：收益将沿着持股层级逐级拆解，直接汇入底层自然人/机构投资人账户。'
              : '当前为不穿透模式：若该实体中包含母池等上级实体组织，收益将截留在母池，不会自动下发。'}
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  };

  const handleConfirmDistribution = async (e) => {
    e.preventDefault();
    if (!targetId || !totalAmount || !distributionDate) {
      alert("请填写分配基本参数");
      return;
    }
    if (lpItems.length === 0) {
      alert("请先点击“计算分配金额”生成分配表！");
      return;
    }

    const targetType = getTargetType();
    const selectedPool = pools.find(p => p.id === targetId);
    const selectedProject = projects.find(p => p.id === targetId);
    if (!targetType || (targetType === "pool" && !selectedPool) || (targetType === "project" && !selectedProject)) {
      alert("目标分配实体不存在，请重新选择");
      return;
    }
    
    // 移除了余额校验，因为现在仅仅作为记账台账生成，不直接扣减可用余额

    try {
      const sumPct = lpItems.reduce((sum, item) => sum + Number(item.effective_share), 0);
      if (Math.abs(sumPct - 100.0) > 0.05) {
        const confirmGo = window.confirm(`警告：当前计算得出的分配份额总和为 ${sumPct.toFixed(2)}%，未精确等于 100%。是否依然确认分配？`);
        if (!confirmGo) return;
      }

      const targetName = targetType === 'pool' ? selectedPool.name : selectedProject.name;
      const distStatus = currentUser?.role === "operator" ? "pending" : "confirmed";
      
      await createDistribution(
        {
          targetType, // 'pool' or 'project'
          poolId: targetType === 'pool' ? targetId : null,
          projectId: targetType === 'project' ? targetId : null,
          totalAmount: Number(totalAmount),
          distributionDate,
          description,
          actor: currentUser,
          status: distStatus
        },
        lpItems
      );

      alert(
        distStatus === "pending"
          ? "分红方案已提交，请等待管理员审核生效。"
          : "分红记录已成功保存！\\n" + (isPenetrate ? "已穿透分配至各底层自然人/机构的历史收益中。" : "已分配并截留至各直接实体历史收益中。")
      );
      // 重置表单
      setTargetId("");
      setTargetSearch("");
      setTotalAmount("");
      setDistributionDate(getTodayDateInputValue());
      setDescription("");
      
      // 重新加载历史记录
      loadHistory();
    } catch (err) {
      alert("执行分配失败：" + err.message);
    }
  };

  return (
    <div style={styles.container}>
      {/* 头部说明 */}
      <div>
        <h2>收益分配计算器</h2>
      </div>

      <div style={styles.contentGrid}>
        {/* 左侧：分配配置表单 */}
        <div className="glass-card distribution-form-card" style={styles.formCard}>
          <h3 style={styles.sectionTitle}>
            <PieChart size={18} color="var(--accent-blue)" />
            <span>新建分配分红方案</span>
          </h3>

          <form onSubmit={handleConfirmDistribution} style={styles.form}>
            <div className="form-group">
              <label className="form-label">目标分配实体 *</label>
              <input
                type="text"
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                className="form-input"
                placeholder="项目名称/ID"
                style={styles.targetSearchInput}
              />
              <select 
                value={targetId} 
                onChange={(e) => setTargetId(e.target.value)}
                className="form-input"
                required
              >
                <option value="">-- 请选择目标实体 --</option>
                <optgroup label="资金池">
                  {visiblePools.length === 0 && <option disabled>未匹配到资金池</option>}
                  {visiblePools.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (ID: {p.id})</option>
                  ))}
                </optgroup>
                <optgroup label="可分配项目">
                  {visibleProjects.length === 0 && <option disabled>未匹配到可分配项目</option>}
                  {visibleProjects.map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name} (ID: {pr.id})</option>
                  ))}
                </optgroup>
              </select>
              <div style={styles.targetHint}>
                已隐藏归档项目和考察期项目；资金池及其他项目状态均可选择。
              </div>
            </div>

            <div className="form-group" style={styles.checkboxGroup}>
              <input 
                type="checkbox" 
                id="isPenetrate" 
                checked={isPenetrate} 
                onChange={(e) => setIsPenetrate(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="isPenetrate" style={{ cursor: 'pointer', margin: 0 }}>直接穿透分配到具体个人</label>
            </div>

            <div className="form-group">
              <label className="form-label">拟分配总金额 *</label>
              <AmountInput 
                value={totalAmount} 
                onChange={setTotalAmount}
                placeholder="请输入本次待分红金额"
              />
            </div>

            <div className="form-group">
              <label className="form-label">分配日期 *</label>
              <input 
                type="date" 
                required
                value={distributionDate}
                onChange={(e) => setDistributionDate(e.target.value)}
                className="form-input mono"
              />
            </div>

            <div className="form-group">
              <label className="form-label">方案说明 / 分红备注</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="备注"
                className="form-input"
                rows={2}
                style={{ resize: "none" }}
              />
            </div>

            {currentUser?.role === "operator" && (
              <div style={styles.pendingNotice}>
                经办员提交的收益分配方案将进入待审核状态，管理员核准后才会对 LP 端生效。
              </div>
            )}

            <div style={styles.actionRow}>
              <button 
                type="button" 
                onClick={handleCalculate}
                className="btn-secondary" 
                style={styles.actionButton}
              >
                <span>计算分配金额</span>
              </button>
              <button 
                type="submit" 
                disabled={distLoading || lpItems.length === 0} 
                className="btn-primary" 
                style={styles.actionButton}
              >
                <span>{distLoading ? "提交记录中..." : currentUser?.role === "operator" ? "提交审核" : "确认并记录分红"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* 右侧：实时算费穿透路径明细 */}
        <div className="glass-card no-hover" style={styles.detailCard}>
          <h3 style={styles.sectionTitle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HelpCircle size={18} color="var(--accent-gold)" />
              <span>分配比例及应分金额计算表</span>
              {lpItems.length > 0 && (
                <span style={{ fontSize: "14px", color: "var(--text-muted)", marginLeft: "8px", fontWeight: "normal" }}>
                  (日期: {distributionDate})
                </span>
              )}
            </div>
            {lpItems.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn-secondary" 
                  style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={handleExportExcel}
                >
                  <Download size={14} />
                  <span>导出 Excel</span>
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ padding: "4px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={handlePrintPdf}
                >
                  <Printer size={14} />
                  <span>导出 PDF (打印)</span>
                </button>
              </div>
            )}
          </h3>

          {!targetId ? (
            <div style={styles.emptyDetail}>
              <Info size={36} color="var(--text-muted)" />
              <p>请在左侧填写参数并点击“计算分配金额”</p>
            </div>
          ) : lpItems.length === 0 ? (
            <div style={styles.emptyDetail}>
              <Info size={36} color="var(--text-muted)" />
              <p>请点击左侧“计算分配金额”按钮生成计算表</p>
            </div>
          ) : sharesLoading ? (
            <div style={styles.emptyDetail}>
              <p>正在执行动态路径穿透算法...</p>
            </div>
          ) : (
            <div style={styles.tableContainer}>
              {isPenetrate && directItems.some(item => item.entity_type === "pool") && (
                <div style={styles.directPreview}>
                  <div style={styles.directPreviewTitle}>直接层级分配预览（含资金池/基金）</div>
                  <table className="data-table" style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>直接收款主体</th>
                        <th style={styles.th}>主体类型</th>
                        <th style={styles.th}>直接份额</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>直接层级金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directItems.map((item, index) => (
                        <tr key={index} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={{ fontWeight: 600 }}>{item.investor_name}</span>
                          </td>
                          <td style={styles.td}>
                            <span style={item.entity_type === "pool" ? styles.poolBadge : styles.investorBadge}>
                              {item.entity_type === "pool" ? "资金池/基金" : "投资人"}
                            </span>
                          </td>
                          <td style={styles.td} className="mono">{formatPercent(item.effective_share)}</td>
                          <td style={{ ...styles.td, textAlign: "right" }} className="mono amt-gold amt-bold">
                            {formatCNY(item.amount, false, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <table className="data-table" style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>LP 姓名</th>
                    <th style={styles.th}>直接份额</th>
                    <th style={styles.th}>间接份额 (大池穿透)</th>
                    <th style={styles.th}>最终有效份额</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>预计实分金额</th>
                  </tr>
                </thead>
                <tbody>
                  {lpItems.map((item, index) => (
                    <tr key={index} style={styles.tr}>
                      <td style={styles.td}>
                        <span style={{ fontWeight: 600 }}>{item.investor_name}</span>
                        {item.entity_type === 'pool' && (
                          <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 4px", background: "var(--accent-gold)", color: "#000", borderRadius: "4px" }}>资金池</span>
                        )}
                      </td>
                      <td style={styles.td} className="mono">
                        {formatPercent(item.direct_share)}
                      </td>
                      <td style={styles.td} className="mono">
                        <span style={{ color: Number(item.indirect_share) > 0 ? "var(--accent-gold)" : "var(--text-secondary)" }}>
                          {formatPercent(item.indirect_share)}
                        </span>
                      </td>
                      <td style={styles.td} className="mono amt-bold" style={{ color: "var(--accent-blue)", fontWeight: 700 }}>
                        {formatPercent(item.effective_share)}
                      </td>
                      <td style={{ ...styles.td, textAlign: "right" }} className="mono amt-in amt-bold">
                        {formatCNY(item.amount, false, false)}
                      </td>
                    </tr>
                  ))}
                  {/* 合计行 */}
                  <tr style={styles.totalRow}>
                    <td style={styles.td}><strong>有效持股总计</strong></td>
                    <td colSpan={3} style={{ ...styles.td, textAlign: "right" }} className="mono amt-bold">
                      {formatPercent(lpItems.reduce((sum, i) => sum + Number(i.effective_share), 0))}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }} className="mono amt-gold amt-bold">
                      {formatCNY(lpItems.reduce((sum, i) => sum + i.amount, 0), false, false)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 穿透机制可视化提示 */}
              <div style={styles.tipBox}>
                <CheckCircle size={16} color="var(--accent-green)" />
                <span style={styles.tipText}>
                  {isPenetrate 
                    ? "已开启穿透模式：收益将沿着持股层级逐级拆解，直接汇入底层自然人/机构投资人账户。"
                    : "当前为不穿透模式：若该实体中包含母池等上级实体组织，收益将截留在母池，不会自动下发。"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部：收益历史记录 */}
      <div className="glass-card" style={styles.historyCard}>
        <h3 style={styles.sectionTitle}>
          <FileText size={18} color="var(--accent-green)" />
          <span>收益历史记录</span>
        </h3>
        
        {distHistoryLoading ? (
          <div style={styles.emptyDetail}>加载历史记录中...</div>
        ) : distHistory.length === 0 ? (
          <div style={styles.emptyDetail}>
            <Info size={36} color="var(--text-muted)" />
            <p>暂无提交过的分配方案记录</p>
          </div>
        ) : (
          <div style={styles.tableContainer}>
            <table className="data-table" style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>分配日期</th>
                  <th style={styles.th}>目标分配实体</th>
                  <th style={styles.th}>项目 ID</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>分配总额</th>
                  <th style={styles.th}>状态</th>
                  <th style={styles.th}>备注说明</th>
                  <th style={{ ...styles.th, textAlign: "center" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {distHistory.map((dist, idx) => (
                  <tr 
                    key={idx} 
                    style={{ ...styles.tr, cursor: "pointer" }} 
                    onClick={() => handleViewDetails(dist)}
                  >
                    <td style={styles.td}>{formatDate(dist.distribution_date)}</td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: 600 }}>{dist.project_name || dist.pool_name || '-'}</span>
                    </td>
                    <td style={styles.td} className="mono">{dist.project_id || dist.pool_id || '-'}</td>
                    <td style={{ ...styles.td, textAlign: "right" }} className="mono amt-in amt-bold">
                      {formatCNY(dist.total_amount, false, false)}
                    </td>
                    <td style={styles.td}>
                      {(() => {
                        const meta = getDistStatusMeta(dist.status);
                        return (
                      <span style={{
                        padding: "4px 8px", borderRadius: "4px", fontSize: "12px",
                            backgroundColor: meta.bg,
                            color: meta.color
                      }}>
                            {meta.text}
                      </span>
                        );
                      })()}
                    </td>
                    <td style={styles.td}>{dist.description || '-'}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <div style={styles.historyActions}>
                        {currentUser?.role === "admin" && dist.status === "pending" && (
                          <>
                            <button onClick={(e) => handleApproveDistribution(e, dist)} title="通过" style={{ ...styles.iconAction, color: "var(--accent-green)" }}>
                              <Check size={16} />
                            </button>
                            <button onClick={(e) => handleRejectDistribution(e, dist)} title="驳回" style={{ ...styles.iconAction, color: "var(--accent-red)" }}>
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={(e) => handleDeleteDistribution(e, dist)}
                          title="删除记录"
                          style={styles.iconAction}
                          onMouseOver={(e) => e.currentTarget.style.color = "var(--accent-red)"}
                          onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDistDetail(null);
        }}
        title="分配详细记录"
        width="900px"
      >
        {detailLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            加载中...
          </div>
        ) : selectedDistDetail && selectedDistDetail.items && (
          <div>
            <div style={{ display: "flex", gap: "24px", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>目标分配实体</div>
                <div style={{ fontWeight: 600 }}>{selectedDistDetail.project_name || selectedDistDetail.pool_name || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>分配总额</div>
                <div className="mono amt-in amt-bold" style={{ color: "var(--accent-green)" }}>
                  {formatCNY(selectedDistDetail.total_amount)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>分配日期</div>
                <div>{formatDate(selectedDistDetail.distribution_date)}</div>
              </div>
            </div>

            <table className="data-table" style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>出资方名称</th>
                  <th style={styles.th}>直接份额</th>
                  <th style={styles.th}>间接穿透</th>
                  <th style={styles.th}>有效总份额</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>应分金额</th>
                </tr>
              </thead>
              <tbody>
                {selectedDistDetail.items.map((item, i) => (
                  <tr key={i} style={styles.tr}>
                    <td style={styles.td}>
                      <strong>{item.investor_name}</strong>
                    </td>
                    <td style={styles.td} className="mono">{formatPercent(item.direct_share_pct)}</td>
                    <td style={styles.td} className="mono" style={{ color: "var(--accent-gold)" }}>{formatPercent(item.indirect_share_pct)}</td>
                    <td style={styles.td} className="mono amt-bold" style={{ color: "var(--accent-blue)" }}>{formatPercent(item.effective_share_pct)}</td>
                    <td style={{ ...styles.td, textAlign: "right" }} className="mono amt-in amt-bold">
                      {formatCNY(item.amount, false, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.8fr",
    gap: "24px",
    width: "100%"
  },
  formCard: {
    padding: "18px"
  },
  detailCard: {
    padding: "24px",
    display: "flex",
    flexDirection: "column"
  },
  sectionTitle: {
    fontSize: "1.05rem",
    fontWeight: "700",
    color: "var(--text-primary)",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "12px",
    marginBottom: "20px",
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  form: {
    display: "flex",
    flexDirection: "column"
  },
  checkboxGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "2px",
    marginBottom: "12px"
  },
  targetSearchInput: {
    marginBottom: "6px"
  },
  targetHint: {
    marginTop: "6px",
    color: "var(--text-secondary)",
    fontSize: "0.78rem",
    lineHeight: 1.4
  },
  actionRow: {
    display: "flex",
    gap: "10px",
    marginTop: "6px"
  },
  actionButton: {
    flex: 1,
    padding: "10px",
    justifyContent: "center"
  },
  submitBtn: {
    width: "100%",
    padding: "12px",
    justifyContent: "center",
    marginTop: "12px"
  },
  pendingNotice: {
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid rgba(245, 158, 11, 0.22)",
    backgroundColor: "var(--accent-gold-glow)",
    color: "var(--accent-gold)",
    fontSize: "0.85rem"
  },
  emptyDetail: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    color: "var(--text-secondary)",
    fontSize: "0.85rem",
    textAlign: "center",
    padding: "40px"
  },
  tableContainer: {
    width: "100%"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.85rem"
  },
  th: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
    fontWeight: "600",
    textAlign: "left"
  },
  tr: {
    borderBottom: "1px solid var(--border)",
    transition: "background-color 0.15s ease"
  },
  td: {
    padding: "14px 12px",
    color: "var(--text-primary)",
    verticalAlign: "middle"
  },
  totalRow: {
    backgroundColor: "rgba(255, 255, 255, 0.01)",
    borderTop: "2px solid var(--border)",
    borderBottom: "2px solid var(--border)"
  },
  directPreview: {
    marginBottom: "22px",
    padding: "14px",
    border: "1px solid rgba(245, 158, 11, 0.22)",
    borderRadius: "8px",
    backgroundColor: "rgba(245, 158, 11, 0.04)"
  },
  directPreviewTitle: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "var(--accent-gold)",
    marginBottom: "10px"
  },
  poolBadge: {
    display: "inline-flex",
    padding: "3px 8px",
    borderRadius: "4px",
    backgroundColor: "var(--accent-gold-glow)",
    color: "var(--accent-gold)",
    fontSize: "0.75rem",
    fontWeight: 600
  },
  investorBadge: {
    display: "inline-flex",
    padding: "3px 8px",
    borderRadius: "4px",
    backgroundColor: "var(--accent-blue-glow)",
    color: "var(--accent-blue)",
    fontSize: "0.75rem",
    fontWeight: 600
  },
  tipBox: {
    marginTop: "20px",
    backgroundColor: "var(--accent-green-glow)",
    border: "1px solid rgba(16, 185, 129, 0.2)",
    padding: "12px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  tipText: {
    fontSize: "0.75rem",
    color: "var(--accent-green)"
  },
  historyActions: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px"
  },
  iconAction: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "4px"
  }
};
export default Distribution;
