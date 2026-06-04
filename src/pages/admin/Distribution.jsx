import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { useProjects } from "../../hooks/useProjects";
import { useShareCalculator } from "../../hooks/useShareCalculator";
import { useDistribution } from "../../hooks/useDistribution";
import { AmountInput } from "../../components/ui/AmountInput";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { exportToExcel } from "../../lib/excel";
import { AlertCircle, CheckCircle, PieChart, Info, HelpCircle, FileText, Download, Printer, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";

export function Distribution() {
  const { pools } = usePools();
  const { projects } = useProjects();
  const { calculateShares, loading: sharesLoading } = useShareCalculator();
  const { createDistribution, getDistributions, getDistributionDetails, deleteDistribution, loading: distLoading } = useDistribution();

  // 分配表单参数
  const [targetId, setTargetId] = useState("");
  const [isPenetrate, setIsPenetrate] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [distributionDate, setDistributionDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  // 计算得出的出资人份额及金额明细列表
  const [lpItems, setLpItems] = useState([]);

  // 历史分配记录
  const [distHistory, setDistHistory] = useState([]);
  const [distHistoryLoading, setDistHistoryLoading] = useState(false);
  
  // 详情 Modal 状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDistDetail, setSelectedDistDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
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
      await deleteDistribution(dist.id);
      loadHistory();
    } catch (err) {
      alert("删除失败：" + err.message);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);


  // 当参数发生变化时，清空计算结果，要求用户重新点击“计算”
  useEffect(() => {
    setLpItems([]);
  }, [targetId, isPenetrate, totalAmount]);

  const handleCalculate = async (e) => {
    if (e) e.preventDefault();
    if (!targetId) {
      alert("请先选择目标分配实体");
      return;
    }
    const total = Number(totalAmount) || 0;
    try {
      const targetType = targetId.startsWith('proj') ? 'project' : 'pool';
      const rawShares = await calculateShares(targetType, targetId, isPenetrate);
      const itemsWithAmt = rawShares.map(s => ({
        ...s,
        amount: total * (Number(s.effective_share) / 100.0)
      }));
      setLpItems(itemsWithAmt);
    } catch (err) {
      console.error("加载目标分配份额失败", err);
      alert("计算失败: " + err.message);
    }
  };

  const handlePrintPdf = () => {
    const win = window.open('', '', 'width=900,height=650');
    
    let rowsHtml = lpItems.map(item => `
      <tr>
        <td>${item.investor_name} ${item.entity_type === 'pool' ? '(资金池)' : ''}</td>
        <td class="text-right">${formatPercent(item.direct_share)}</td>
        <td class="text-right">${formatPercent(item.indirect_share)}</td>
        <td class="text-right">${formatPercent(item.effective_share)}</td>
        <td class="text-right">${formatCNY(item.amount, false, false)}</td>
      </tr>
    `).join('');

    const totalShare = lpItems.reduce((sum, i) => sum + Number(i.effective_share), 0);
    const totalAmountSum = lpItems.reduce((sum, i) => sum + i.amount, 0);

    const targetType = targetId.startsWith('proj') ? 'project' : 'pool';
    const targetName = targetType === 'pool' 
      ? pools.find(p => p.id === targetId)?.name 
      : projects.find(p => p.id === targetId)?.name;

    win.document.write(`
      <html>
        <head>
          <title>收益分配计算表 - ${distributionDate}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            h2 { text-align: center; margin-bottom: 30px; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 14px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: 600; }
            .text-right { text-align: right; }
            .total-row td { font-weight: bold; background-color: #f8f9fa; }
          </style>
        </head>
        <body>
          <h2>收益分配明细表</h2>
          <div class="meta">
            <div><strong>分配目标实体：</strong>${targetName || '-'}</div>
            <div><strong>分配日期：</strong>${distributionDate}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>LP 姓名/实体名称</th>
                <th class="text-right">直接份额</th>
                <th class="text-right">间接份额</th>
                <th class="text-right">最终有效份额</th>
                <th class="text-right">预计实分金额 (元)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="total-row">
                <td>有效持股总计</td>
                <td colspan="3" class="text-right">${formatPercent(totalShare)}%</td>
                <td class="text-right">${formatCNY(totalAmountSum, false, false)}</td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            注：${isPenetrate ? '已开启穿透模式，收益将直接汇入底层自然人/机构账户。' : '当前为不穿透模式，收益将截留在直接投资实体。'}
          </p>
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

    const targetType = targetId.startsWith('proj') ? 'project' : 'pool';
    const selectedPool = pools.find(p => p.id === targetId);
    const selectedProject = projects.find(p => p.id === targetId);
    
    // 移除了余额校验，因为现在仅仅作为记账台账生成，不直接扣减可用余额

    try {
      const sumPct = lpItems.reduce((sum, item) => sum + Number(item.effective_share), 0);
      if (Math.abs(sumPct - 100.0) > 0.05) {
        const confirmGo = window.confirm(`警告：当前计算得出的分配份额总和为 ${sumPct.toFixed(2)}%，未精确等于 100%。是否依然确认分配？`);
        if (!confirmGo) return;
      }

      const targetName = targetType === 'pool' ? selectedPool.name : selectedProject.name;
      
      await createDistribution(
        {
          targetType, // 'pool' or 'project'
          poolId: targetType === 'pool' ? targetId : null,
          projectId: targetType === 'project' ? targetId : null,
          totalAmount: Number(totalAmount),
          distributionDate,
          status: "confirmed" // 确认直接生效
        },
        lpItems
      );

      alert("分红记录已成功保存！\\n" + (isPenetrate ? "已穿透分配至各底层自然人/机构的历史收益中。" : "已分配并截留至各直接实体历史收益中。"));
      // 重置表单
      setTargetId("");
      setTotalAmount("");
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
        <h2>收益分配计算器 (CTE Share Calculator)</h2>
        <p>输入待分配总额，系统通过 **递归 SQL 算法** 穿透多级池间出资关系，计算每位个人/机构投资人的最终有效份额，并完成一键划拨分红。</p>
      </div>

      <div style={styles.contentGrid}>
        {/* 左侧：分配配置表单 */}
        <div className="glass-card" style={styles.formCard}>
          <h3 style={styles.sectionTitle}>
            <PieChart size={18} color="var(--accent-blue)" />
            <span>新建分配分红方案</span>
          </h3>

          <form onSubmit={handleConfirmDistribution} style={styles.form}>
            <div className="form-group">
              <label className="form-label">目标分配实体 *</label>
              <select 
                value={targetId} 
                onChange={(e) => setTargetId(e.target.value)}
                className="form-input"
                required
              >
                <option value="">-- 请选择目标实体 --</option>
                <optgroup label="资金池">
                  {pools.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (ID: {p.id})</option>
                  ))}
                </optgroup>
                <optgroup label="已退出项目">
                  {projects.filter(p => p.status === 'exited').map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name} (ID: {pr.id})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <input 
                type="checkbox" 
                id="isPenetrate" 
                checked={isPenetrate} 
                onChange={(e) => setIsPenetrate(e.target.checked)} 
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="isPenetrate" style={{ cursor: 'pointer', margin: 0 }}>直接穿透分配到具体个人 (Penetrate to Individuals)</label>
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
                placeholder="例如：芯片项目一期退出收益按有效份额分配"
                className="form-input"
                rows={3}
                style={{ resize: "none" }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
              <button 
                type="button" 
                onClick={handleCalculate}
                className="btn-secondary" 
                style={{ flex: 1, padding: "12px", justifyContent: "center" }}
              >
                <span>计算分配金额</span>
              </button>
              <button 
                type="submit" 
                disabled={distLoading || lpItems.length === 0} 
                className="btn-primary" 
                style={{ flex: 1, padding: "12px", justifyContent: "center" }}
              >
                <span>{distLoading ? "提交记录中..." : "确认并记录分红"}</span>
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
                  onClick={() => {
                    const headers = {
                      investor_name: "LP 姓名/实体名称",
                      direct_share: "直接份额 (%)",
                      indirect_share: "间接份额 (%)",
                      effective_share: "最终有效份额 (%)",
                      amount: "预计实分金额 (元)",
                    };
                    exportToExcel(lpItems, headers, `收益分配计算表_\${distributionDate}`);
                  }}
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
                      {formatPercent(lpItems.reduce((sum, i) => sum + Number(i.effective_share), 0))}%
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
          <span>收益历史记录 (Settlement History)</span>
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
                      <span style={{
                        padding: "4px 8px", borderRadius: "4px", fontSize: "12px",
                        backgroundColor: dist.status === 'confirmed' ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                        color: dist.status === 'confirmed' ? "var(--accent-green)" : "var(--accent-gold)"
                      }}>
                        {dist.status === 'confirmed' ? '已确认结算' : '草稿'}
                      </span>
                    </td>
                    <td style={styles.td}>{dist.description || '-'}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <button 
                        onClick={(e) => handleDeleteDistribution(e, dist)}
                        title="删除记录"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "4px"
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = "var(--accent-red)"}
                        onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                      >
                        <Trash2 size={16} />
                      </button>
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
    padding: "24px"
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
  submitBtn: {
    width: "100%",
    padding: "12px",
    justifyContent: "center",
    marginTop: "12px"
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
  }
};
export default Distribution;
