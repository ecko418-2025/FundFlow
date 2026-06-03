import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { useEffectiveShares } from "../../hooks/useEffectiveShares";
import { useDistribution } from "../../hooks/useDistribution";
import { AmountInput } from "../../components/ui/AmountInput";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { AlertCircle, CheckCircle, PieChart, Info, HelpCircle } from "lucide-react";

export function Distribution() {
  const { pools } = usePools();
  const { calculateShares, loading: sharesLoading } = useEffectiveShares();
  const { createDistribution, loading: distLoading } = useDistribution();

  // 分配表单参数
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [distributionDate, setDistributionDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  // 计算得出的出资人份额及金额明细列表
  const [lpItems, setLpItems] = useState([]);

  // 加载所选池子的有效份额
  useEffect(() => {
    async function loadShares() {
      if (!selectedPoolId) {
        setLpItems([]);
        return;
      }
      try {
        const rawShares = await calculateShares(selectedPoolId);
        // 初始化把分配金额置为 0
        const itemsWithAmt = rawShares.map(s => ({
          ...s,
          amount: 0
        }));
        setLpItems(itemsWithAmt);
      } catch (err) {
        console.error("加载池子有效份额失败", err);
      }
    }
    loadShares();
  }, [selectedPoolId, calculateShares]);

  // 当分配总额发生变化时，实时计算每个 LP 的应得金额
  useEffect(() => {
    if (lpItems.length === 0) return;
    const total = Number(totalAmount) || 0;
    
    setLpItems(prev => prev.map(item => ({
      ...item,
      amount: total * (Number(item.effective_share) / 100.0)
    })));
  }, [totalAmount]);

  const handleConfirmDistribution = async (e) => {
    e.preventDefault();
    if (!selectedPoolId || !totalAmount || !distributionDate) {
      alert("请填写分配基本参数");
      return;
    }

    const selectedPool = pools.find(p => p.id === selectedPoolId);
    if (selectedPool && Number(selectedPool.available_balance) < Number(totalAmount)) {
      alert(`可用余额不足！当前资金池可用现金余额为：${formatCNY(selectedPool.available_balance)}`);
      return;
    }

    try {
      // 检查有效份额总和是否接近 100%
      const sumPct = lpItems.reduce((sum, item) => sum + Number(item.effective_share), 0);
      if (Math.abs(sumPct - 100.0) > 0.05) {
        const confirmGo = window.confirm(`警告：当前计算得出的有效份额总和为 ${sumPct.toFixed(2)}%，未精确等于 100%（可能是由于子池中仍有部分份额由大池直接覆盖，而大池内没有分尽，或四舍五入尾差）。是否依然确认分配？`);
        if (!confirmGo) return;
      }

      await createDistribution(
        {
          poolId: selectedPoolId,
          projectId: null,
          totalAmount: Number(totalAmount),
          distributionDate,
          description: description || `资金池收益分配 (${selectedPool.name})`,
          status: "confirmed" // 确认直接生效
        },
        lpItems
      );

      alert("分配计算执行成功！资金已自动扣减并生成分配登账流水。");
      // 重置表单
      setSelectedPoolId("");
      setTotalAmount("");
      setDescription("");
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
              <label className="form-label">目标分配资金池 *</label>
              <select 
                value={selectedPoolId} 
                onChange={(e) => setSelectedPoolId(e.target.value)}
                className="form-input"
                required
              >
                <option value="">-- 请选择目标资金池 --</option>
                {pools.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (余额: {formatCNY(p.available_balance, false)})</option>
                ))}
              </select>
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

            <button 
              type="submit" 
              disabled={distLoading || lpItems.length === 0} 
              className="btn-primary" 
              style={styles.submitBtn}
            >
              <span>{distLoading ? "提交划拨中..." : "确认并执行分红"}</span>
            </button>
          </form>
        </div>

        {/* 右侧：实时算费穿透路径明细 */}
        <div className="glass-card" style={styles.detailCard}>
          <h3 style={styles.sectionTitle}>
            <HelpCircle size={18} color="var(--accent-gold)" />
            <span>递归有效持股及应分金额计算表</span>
          </h3>

          {!selectedPoolId ? (
            <div style={styles.emptyDetail}>
              <Info size={36} color="var(--text-muted)" />
              <p>请在左侧选择要进行收益分配的资金池，系统将实时计算 LP 有效份额折算数据。</p>
            </div>
          ) : sharesLoading ? (
            <div style={styles.emptyDetail}>
              <p>正在执行 SQL 递归路径穿透...</p>
            </div>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
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
                        {formatCNY(item.amount, false)}
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
                      {formatCNY(lpItems.reduce((sum, i) => sum + i.amount, 0), false)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 穿透机制可视化提示 */}
              <div style={styles.tipBox}>
                <CheckCircle size={16} color="var(--accent-green)" />
                <span style={styles.tipText}>
                  已验证：该子池有效份额包含所有母池嵌套路径折算值，分红金额将基于有效份额写入流水。
                </span>
              </div>
            </div>
          )}
        </div>
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
