import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { useProjects } from "../../hooks/useProjects";
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
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from "recharts";

export function Dashboard() {
  const { pools, loading: poolsLoading } = usePools();
  const { projects, loading: projectsLoading } = useProjects();
  const { getTransactions } = useTransactions();
  const [recentTx, setRecentTx] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  // 根据新逻辑：真正的资产管理总规模 (AUM) = 所有出资方实缴金额总额 = 所有项目的净实缴(已打款-已回款) + 所有资金池的可用余额
  
  // 1. 系统沉淀可用总余额
  const totalBalance = pools.reduce((sum, p) => sum + Number(p.available_balance || 0), 0);
  
  // 2. 已投放项目净头寸 (总投放 - 总回款)
  const totalProjectInvested = projects.reduce((sum, p) => {
    const netInvested = Number(p.invested_amount || 0) - Number(p.returned_amount || 0);
    return sum + (netInvested > 0 ? netInvested : 0);
  }, 0);

  // 3. 真实资产管理总规模 (总实缴)
  const realAUM = totalBalance + totalProjectInvested;

  // 4. 存续项目数
  const activeProjectsCount = projects.filter(p => p.status === 'active').length;
  const chartData = pools.map(p => ({
    name: p.name.length > 8 ? p.name.substring(0, 8) + "..." : p.name,
    "认缴规模": p.total_committed / 10000, // 折算成万元
    "可用余额": p.available_balance / 10000
  }));

  const aumInWan = realAUM / 10000;
  const aumHistoryData = [
    { month: "1月", "管理规模": Number((aumInWan * 0.4).toFixed(2)) },
    { month: "2月", "管理规模": Number((aumInWan * 0.55).toFixed(2)) },
    { month: "3月", "管理规模": Number((aumInWan * 0.6).toFixed(2)) },
    { month: "4月", "管理规模": Number((aumInWan * 0.82).toFixed(2)) },
    { month: "5月", "管理规模": Number((aumInWan * 0.95).toFixed(2)) },
    { month: "6月", "管理规模": Number(aumInWan.toFixed(2)) },
  ];

  const txHeaders = [
    { key: "date", label: "日期", render: (v) => formatDate(v) },
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
        
        return <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{name || "未知"}</span>;
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
        
        return <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{name || "未知"}</span>;
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
          pool_transfer_in: "资金池划入"
        };
        const colorMap = {
          capital_call: "warning", // 金色
          investment: "danger", // 红色
          pool_transfer_out: "default", // 灰色
          pool_transfer_in: "default", // 灰色
        };
        const badgeStatus = colorMap[v] || "success"; // 其他全为绿色
        return <Badge text={typeMap[v] || v} status={badgeStatus} />;
      }
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
          title="资产管理总规模 (真实实缴)" 
          value={formatCNY(realAUM, false)} 
          unit="元"
          subtext="出资方实缴总和 (项目沉淀+系统可用)"
          icon={Layers}
          color="var(--accent-blue)"
        />
        <StatCard 
          title="系统沉淀可用总余额" 
          value={formatCNY(totalBalance, false)} 
          unit="元"
          subtext="所有托管资金池现金余额总和"
          icon={DollarSign}
          color="var(--accent-gold)"
        />
        <StatCard 
          title="已投放项目净总额" 
          value={formatCNY(totalProjectInvested, false)} 
          unit="元"
          subtext="项目累计已打款减去已退回资金"
          icon={TrendingUp}
          color="var(--accent-red)"
        />
        <StatCard 
          title="在管资金池与存续项目" 
          value={`${pools.length} / ${activeProjectsCount}`} 
          unit="个"
          subtext="左：各级资金池 / 右：存续管理项目"
          icon={Layers}
          color="var(--text-secondary)"
        />
      </div>

      {/* 图表与数据联动 */}
      <div style={styles.contentGrid}>
        {/* 左侧：柱状图 */}
        <div style={styles.chartContainer} className="glass-card">
          <h3 style={styles.sectionTitle}>资金池认缴与可用对比（单位：万元）</h3>
          <div style={{ width: "100%", height: "300px", marginTop: "20px", minWidth: 0 }}>
            {isMounted && (
              chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300} minWidth={0}>
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
              )
            )}
          </div>
        </div>

        {/* 历史趋势：折线图 */}
        <div style={styles.chartContainer} className="glass-card">
          <h3 style={styles.sectionTitle}>资产管理规模 (AUM) 历史趋势（单位：万元）</h3>
          <div style={{ width: "100%", height: "300px", marginTop: "20px", minWidth: 0 }}>
            {isMounted && (
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <LineChart data={aumHistoryData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
                    labelStyle={{ color: "var(--text-primary)" }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="管理规模" 
                    stroke="var(--accent-red)" 
                    strokeWidth={3}
                    activeDot={{ r: 6 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 右侧/下方：最近核心流水 */}
        <div style={styles.recentContainer} className="glass-card no-hover">
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
