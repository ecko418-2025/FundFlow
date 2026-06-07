import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { writeAuditLog } from "../../lib/audit";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Printer } from "lucide-react";

export function LPStatement({ user }) {
  const [loading, setLoading] = useState(false);
  const [statement, setStatement] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    async function loadStatement() {
      if (!user?.investorId) return;
      setLoading(true);
      try {
        // 获取与当前 LP 相关的流水
        const sql = `
          SELECT t.*, p.name AS pool_name, pr.name AS project_name,
                 i.name AS investor_name, rp.name AS related_pool_name 
          FROM transactions t
          LEFT JOIN pools p ON t.pool_id = p.id
          LEFT JOIN pools rp ON t.related_pool_id = rp.id
          LEFT JOIN projects pr ON t.project_id = pr.id
          LEFT JOIN investors i ON t.investor_id = i.id
          WHERE t.investor_id = ?
            AND t.status = 'approved'
          ORDER BY t.date DESC, t.created_at DESC
        `;
        const data = await querySQL(sql, [user.investorId]);
        setStatement(data);
      } catch (err) {
        console.error("加载LP对账单失败", err);
      } finally {
        setLoading(false);
      }
    }
    loadStatement();
  }, [user]);

  const paginatedStatement = React.useMemo(() => {
    return statement.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [statement, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(statement.length / pageSize));
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });

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

  const headers = [
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
        const badgeStatus = { capital_call: "warning", investment: "danger", distribution: "success", return: "success" }[v] || "default";
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
    { key: "description", label: "账目备注" }
  ];

  const renderCellValue = (header, row) => {
    const value = row[header.key];
    return header.render ? header.render(value, row) : (value === null || value === undefined ? "-" : value);
  };

  const getTypeText = (type) => {
    const typeMap = {
      capital_call: "实缴打款(入)",
      investment: "项目投资(出)",
      pool_investment: "母池注资(出)",
      return: "项目回款(入)",
      distribution: "收益分红(出)",
      fee: "管理费/支出",
      adjustment: "人工核校"
    };
    return typeMap[type] || type;
  };

  const handlePrint = async () => {
    await writeAuditLog({
      actor: user,
      action: "print",
      module: "lp_statement",
      targetType: "statement",
      targetId: user?.investorId,
      targetLabel: user?.displayName || user?.email || user?.investorId,
      status: "success",
      message: `打印/导出 LP 对账单 ${statement.length} 条`,
      requestPayload: { investorId: user?.investorId, count: statement.length }
    });
    window.print();
  };

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader} className="no-print">
        <div>
          <h2>我名下的资金往来对账单</h2>
          <p style={styles.pageHint}>共 {statement.length} 条已审核流水，按发生日期倒序排列。</p>
        </div>
        <button onClick={handlePrint} className="btn-secondary" style={styles.printButton}>
          <Printer size={18} />
          <span>打印 / 导出 PDF</span>
        </button>
      </div>

      <div className="lp-statement-print">
        <div className="lp-print-title">
          <div>
            <h1>LP 资金往来对账单</h1>
            <p>{user?.displayName || "出资人"} · {user?.email || ""}</p>
          </div>
          <div className="lp-print-meta">
            <span>生成时间：{generatedAt}</span>
            <span>记录数量：{statement.length} 条</span>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>流水编号</th>
              <th>发生日期</th>
              <th>出账方 (Source)</th>
              <th>进账方 (Target)</th>
              <th>交易类型</th>
              <th>金额</th>
              <th>凭证号</th>
              <th>账目备注</th>
            </tr>
          </thead>
          <tbody>
            {statement.map(row => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{formatDate(row.date)}</td>
                <td>{getSourceName(row) || "未知"}</td>
                <td>{getTargetName(row) || "未知"}</td>
                <td>{getTypeText(row.type)}</td>
                <td className={row.direction === "in" ? "amount-in" : "amount-out"}>
                  {row.direction === "in" ? "+" : "-"}{formatCNY(row.amount, false)}
                </td>
                <td>{row.reference_no || "-"}</td>
                <td>{row.description || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-card no-hover no-print" style={styles.statementCard}>
        <div style={styles.compactTableWrap}>
          <table style={styles.compactTable}>
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header.key} style={{ ...styles.compactTh, textAlign: header.align || "left" }}>
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedStatement.length === 0 ? (
                <tr>
                  <td colSpan={headers.length} style={styles.emptyCell}>
                    {loading ? "账目对账单核实中..." : "您名下暂无资金往来流水记录"}
                  </td>
                </tr>
              ) : (
                paginatedStatement.map(row => (
                  <tr key={row.id} style={styles.compactTr}>
                    {headers.map(header => (
                      <td key={header.key} style={{ ...styles.compactTd, textAlign: header.align || "left" }}>
                        {renderCellValue(header, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.paginationRow}>
          <div style={styles.paginationLeft}>
            <span>每页显示：</span>
            <select 
              value={pageSize} 
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="form-input"
              style={styles.pageSizeSelect}
            >
              <option value={10}>10 条</option>
              <option value={20}>20 条</option>
              <option value={50}>50 条</option>
            </select>
            <span style={{ marginLeft: "12px", color: "var(--text-secondary)" }}>
              共 {statement.length} 条记录
            </span>
          </div>
          
          {totalPages > 1 && (
            <div style={styles.paginationRight}>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="btn-secondary"
                style={styles.pageBtn}
              >
                上一页
              </button>
              <span style={styles.pageIndicator}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn-secondary"
                style={styles.pageBtn}
              >
                下一页
              </button>
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
    gap: "18px"
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap"
  },
  pageHint: {
    marginTop: "6px",
    color: "var(--text-secondary)",
    fontSize: "0.88rem"
  },
  printButton: {
    gap: "6px",
    height: "40px"
  },
  statementCard: {
    padding: "16px"
  },
  compactTableWrap: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    background: "rgba(17, 24, 39, 0.36)"
  },
  compactTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.82rem",
    minWidth: "1120px"
  },
  compactTh: {
    padding: "10px 12px",
    color: "var(--text-secondary)",
    fontSize: "0.74rem",
    fontWeight: "700",
    borderBottom: "1px solid var(--border)",
    backgroundColor: "rgba(9, 13, 26, 0.75)",
    whiteSpace: "nowrap"
  },
  compactTr: {
    borderBottom: "1px solid var(--border)"
  },
  compactTd: {
    padding: "10px 12px",
    color: "var(--text-primary)",
    verticalAlign: "top",
    maxWidth: "220px",
    lineHeight: 1.35
  },
  emptyCell: {
    padding: "34px",
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: "0.85rem"
  },
  paginationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginTop: "14px",
    paddingTop: "14px",
    borderTop: "1px solid var(--border)",
    flexWrap: "wrap"
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
export default LPStatement;
