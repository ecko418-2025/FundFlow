import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { useAuthContext } from "../../context/AuthContext";
import { querySQL } from "../../lib/db";
import { writeAuditLog } from "../../lib/audit";
import { DataTable } from "../../components/ui/DataTable";
import { formatCNY } from "../../lib/formatters";
import { FileText, Download } from "lucide-react";

export function Reports() {
  const { currentUser } = useAuthContext();
  const { pools, loading } = usePools();
  const [reportData, setReportData] = useState([]);

  useEffect(() => {
    async function loadReport() {
      if (pools.length === 0) return;
      try {
        const list = [];
        for (const pool of pools) {
          // 查询已投项目资金总和
          const projInvested = await querySQL(
            "SELECT SUM(invested_amount) AS total FROM projects WHERE pool_id = ?",
            [pool.id]
          );
          // 查询已回收项目资金总和
          const projReturned = await querySQL(
            "SELECT SUM(returned_amount) AS total FROM projects WHERE pool_id = ?",
            [pool.id]
          );

          list.push({
            ...pool,
            invested_amount: projInvested[0]?.total || 0,
            returned_amount: projReturned[0]?.total || 0
          });
        }
        setReportData(list);
      } catch (err) {
        console.error("加载报表中心失败", err);
      }
    }
    loadReport();
  }, [pools]);

  const headers = [
    { key: "name", label: "资金池名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "total_committed", label: "初始认缴规模", render: (v) => formatCNY(v, false) },
    { key: "available_balance", label: "可用现金余额", render: (v) => formatCNY(v, false) },
    { key: "invested_amount", label: "已拨项目投资总额", render: (v) => formatCNY(v, false) },
    { key: "returned_amount", label: "收回项目回报总额", render: (v) => formatCNY(v, false) },
    { 
      key: "id", 
      label: "账面净资产价值 (NAV)", 
      align: "right",
      render: (v, row) => {
        // NAV = 现金余额 + 在投净值 (已拨投资 - 已回收投资)
        const netAsset = Number(row.available_balance) + (Number(row.invested_amount) - Number(row.returned_amount));
        return <span className="mono amt-bold" style={{ color: "var(--accent-gold)", fontWeight: 700 }}>{formatCNY(netAsset, false)}</span>;
      }
    }
  ];

  const handleExport = async () => {
    await writeAuditLog({
      actor: currentUser,
      action: "print",
      module: "reports",
      targetType: "report",
      targetId: "pool_nav_report",
      targetLabel: "财务报表中心",
      status: "success",
      message: `打印/导出财务报表 PDF，资金池 ${reportData.length} 条`,
      requestPayload: { count: reportData.length }
    });
    alert("报表数据已同步生成！浏览器打印组件将以 PDF 形式输出账面对账报表。");
    window.print();
  };

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>财务报表中心</h2>
          <p>汇总所有池级实体的认缴、余额、项目累计投资及收回数据，综合审计净资产净值。</p>
        </div>
        <button onClick={handleExport} className="btn-secondary" style={{ gap: "6px" }}>
          <Download size={18} />
          <span>导出完整报表 PDF</span>
        </button>
      </div>

      <div className="glass-card no-hover" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={reportData} 
          emptyMessage={loading ? "加载综合资产中..." : "暂无已核算资金池报表"}
        />
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
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }
};
export default Reports;
