import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { useTransactions } from "../../hooks/useTransactions";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Badge } from "../../components/ui/Badge";
import { 
  Layers, 
  DollarSign, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingDown
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from "recharts";

export function Dashboard() {
  const { pools, loading: poolsLoading } = usePools();
  const { getTransactions } = useTransactions();
  const [recentTx, setRecentTx] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setTxLoading(true);
      try {
        const data = await getTransactions();
        setRecentTx(data.slice(0, 5)); // 仅展示最近 5 条
      } catch (err) {
        console.error("加载面板流水失败", err);
      } finally {
        setTxLoading(false);
      }
    }
    loadData();
  }, []);

  // 计算全局财务指标
  const totalCommitted = pools.reduce((sum, p) => sum + Number(p.total_committed || 0), 0);
  const totalBalance = pools.reduce((sum, p) => sum + Number(p.available_balance || 0), 0);
  
  // 简易图表数据生成 (按资金池展示认缴及可用余额对比)
  const chartData = pools.map(p => ({
    name: p.name.length > 8 ? p.name.substring(0, 8) + "..." : p.name,
    "认缴规模": p.total_committed / 10000, // 折算成万元
    "可用余额": p.available_balance / 10000
  }));

  const txHeaders = [
    { key: "date", label: "日期", render: (v) => formatDate(v) },
    { key: "pool_name", label: "所属池子" },
    { 
      key: "type", 
      label: "类型", 
      render: (v) => {
        const typeMap = {
          capital_call: "实缴出资",
          investment: "项目投资",
          return: "项目回款",
          distribution: "收益分配",
          fee: "管理费/支出",
          pool_transfer_out: "母池划出",
          pool_transfer_in: "子池划入"
        };
        return typeMap[v] || v;
      }
    },
    { 
      key: "direction", 
      label: "流向", 
      render: (v) => <Badge text={v === "in" ? "资金流入" : "资金流出"} status={v} />
    },
    { 
      key: "amount", 
      label: "发生金额", 
      align: "right",
      render: (v, row) => (
        <span className={`mono ${row.direction === 'in' ? 'amt-in' : 'amt-out'} amt-bold`}>
          {row.direction === 'in' ? '+' : '-'}{formatCNY(v, false)}
        </span>
      )
    },
    { key: "description", label: "备注摘要" }
  ];

  return (
    <div style={styles.container}>
      {/* 标题 */}
      <div style={styles.welcome}>
        <h2>欢迎回来，管理员</h2>
        <p>这是您管理的 FundFlow 人民币资金池总体财务健康状况。</p>
      </div>

      {/* 统计指标卡片组 */}
      <div style={styles.cardGrid}>
        <StatCard 
          title="资产管理总规模 (AUM)" 
          value={formatCNY(totalCommitted, false)} 
          unit="元"
          subtext="包含所有层级池子的认缴额"
          icon={Layers}
          color="var(--accent-blue)"
        />
        <StatCard 
          title="系统沉淀可用总余额" 
          value={formatCNY(totalBalance, false)} 
          unit="元"
          subtext="所有托管池子现金余额总和"
          icon={DollarSign}
          color="var(--accent-gold)"
        />
        <StatCard 
          title="已投放项目总额 (估)" 
          value={formatCNY(totalCommitted - totalBalance, false)} 
          unit="元"
          subtext="已打款但未退回的净头寸"
          icon={TrendingUp}
          color="var(--accent-red)"
        />
        <StatCard 
          title="在管资金池数" 
          value={pools.length} 
          unit="个"
          subtext="包含子级和孙级项目池"
          icon={Layers}
          color="var(--text-secondary)"
        />
      </div>

      {/* 图表与数据联动 */}
      <div style={styles.contentGrid}>
        {/* 左侧：柱状图 */}
        <div style={styles.chartContainer} className="glass-card">
          <h3 style={styles.sectionTitle}>资金池认缴与可用对比（单位：万元）</h3>
          <div style={{ width: "100%", height: "300px", marginTop: "20px" }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                    labelStyle={{ color: "var(--text-primary)" }}
                  />
                  <Legend />
                  <Bar dataKey="认缴规模" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="可用余额" fill="var(--accent-gold)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={styles.emptyChart}>无有效池子图形数据</div>
            )}
          </div>
        </div>

        {/* 右侧：最近核心流水 */}
        <div style={styles.recentContainer} className="glass-card">
          <div style={styles.recentHeader}>
            <h3 style={styles.sectionTitle}>系统最近五笔流水变动</h3>
          </div>
          <div style={{ marginTop: "20px" }}>
            <DataTable 
              headers={txHeaders} 
              data={recentTx} 
              emptyMessage={txLoading ? "加载流水中..." : "最近暂无流水明细"}
            />
          </div>
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
  welcome: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  cardGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "20px",
    width: "100%"
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "24px",
    width: "100%"
  },
  chartContainer: {
    padding: "24px"
  },
  sectionTitle: {
    fontSize: "1.05rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  },
  emptyChart: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    fontSize: "0.85rem"
  },
  recentContainer: {
    padding: "24px"
  },
  recentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }
};
export default Dashboard;
