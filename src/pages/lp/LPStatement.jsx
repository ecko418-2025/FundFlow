import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { DataTable } from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Download, FileText } from "lucide-react";

export function LPStatement({ user }) {
  const [loading, setLoading] = useState(false);
  const [statement, setStatement] = useState([]);

  useEffect(() => {
    async function loadStatement() {
      if (!user?.investorId) return;
      setLoading(true);
      try {
        // 获取与当前 LP 相关的流水
        const sql = `
          SELECT t.*, p.name AS pool_name, pr.name AS project_name
          FROM transactions t
          JOIN pools p ON t.pool_id = p.id
          LEFT JOIN projects pr ON t.project_id = pr.id
          WHERE t.investor_id = ?
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

  const headers = [
    { key: "date", label: "交易日期", render: (v) => formatDate(v) },
    { key: "pool_name", label: "所属池子", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { 
      key: "type", 
      label: "往来类别", 
      render: (v) => {
        const typeMap = {
          capital_call: "我进行实缴出资",
          distribution: "收到收益分红分钱"
        };
        return typeMap[v] || v;
      }
    },
    { 
      key: "direction", 
      label: "流向", 
      render: (v) => <Badge text={v === "in" ? "向池子出资" : "收到派红"} status={v === "in" ? "out" : "in"} />
    },
    { 
      key: "amount", 
      label: "发生金额", 
      align: "right",
      render: (v, row) => (
        <span className={`mono amt-bold ${row.type === 'capital_call' ? 'amt-out' : 'amt-in'}`}>
          {row.type === 'capital_call' ? '-' : '+'}{formatCNY(v, false)}
        </span>
      )
    },
    { key: "project_name", label: "关联退出项目", render: (v) => v || "-" },
    { key: "reference_no", label: "流水凭证号", className: "mono" },
    { key: "description", label: "账目备注" }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>我名下的资金往来对账单</h2>
          <p>仅展示您直接缴款、或者以收益分配形式汇款给您的电子记账单明细。</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary" style={{ gap: "6px" }}>
          <Download size={18} />
          <span>打印 / 导出 PDF</span>
        </button>
      </div>

      <div className="glass-card" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={statement} 
          emptyMessage={loading ? "账目对账单核实中..." : "您名下暂无资金往来流水记录"}
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
export default LPStatement;
