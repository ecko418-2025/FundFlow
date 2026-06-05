import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { StatCard } from "../../components/ui/StatCard";
import { DataTable } from "../../components/ui/DataTable";
import { formatCNY, formatPercent } from "../../lib/formatters";
import { Wallet, DollarSign, Layers, PieChart } from "lucide-react";

export function LPDashboard({ user }) {
  const [loading, setLoading] = useState(false);
  const [participations, setParticipations] = useState([]);

  useEffect(() => {
    async function loadLPAus() {
      if (!user?.investorId) return;
      setLoading(true);
      try {
        // LP 视角核心数据获取
        // 查出系统内所有的池子，并使用递归逻辑算出该 LP 在每个池子中的有效份额
        const allPools = await querySQL("SELECT id, name, available_balance FROM pools");
        const list = [];
        
        for (const pool of allPools) {
          // 调用 CTE 计算该池所有成员有效份额
          const sql = `
            WITH RECURSIVE pool_hierarchy AS (
                SELECT id AS pool_id, CAST(1.0 AS DECIMAL(16,10)) AS path_multiplier, 0 AS lvl
                FROM pools WHERE id = ?
                UNION ALL
                SELECT pm.investor_id AS pool_id,
                       CAST(ph.path_multiplier * (pm.share_pct / 100.0) AS DECIMAL(16,10)) AS path_multiplier,
                       ph.lvl + 1 AS lvl
                FROM pool_members pm
                JOIN investors i ON pm.investor_id = i.id
                JOIN pool_hierarchy ph ON pm.pool_id = ph.pool_id
                WHERE pm.status = 'active' AND i.type = 'pool' AND ph.lvl < 3
            )
            SELECT 
                SUM(CASE WHEN ph.pool_id = ? THEN pm.share_pct ELSE 0.0000 END) AS direct_share,
                SUM(CASE WHEN ph.pool_id <> ? THEN pm.share_pct * ph.path_multiplier ELSE 0.0000 END) AS indirect_share,
                SUM(pm.share_pct * ph.path_multiplier) AS effective_share
            FROM pool_hierarchy ph
            JOIN pool_members pm ON pm.pool_id = ph.pool_id
            WHERE pm.investor_id = ? AND pm.status = 'active'
          `;
          
          const shareResult = await querySQL(sql, [pool.id, pool.id, pool.id, user.investorId]);
          const shareInfo = shareResult[0];

          // 如果在当前池子有直接或间接持股，则纳入看板
          if (shareInfo && Number(shareInfo.effective_share) > 0) {
            // 获取该 LP 在这个池子的累计分配
            const distResult = await querySQL(
              `SELECT SUM(amount) AS total 
               FROM distribution_items di
               JOIN distributions d ON di.distribution_id = d.id
               WHERE di.investor_id = ? AND d.pool_id = ? AND d.status = 'confirmed'`,
              [user.investorId, pool.id]
            );

            // 获取该 LP 在这个池子的直接实缴出资
            const calledResult = await querySQL(
              "SELECT called_amount FROM pool_members WHERE pool_id = ? AND investor_id = ?",
              [pool.id, user.investorId]
            );

            list.push({
              pool_id: pool.id,
              pool_name: pool.name,
              direct_share: shareInfo.direct_share || 0,
              indirect_share: shareInfo.indirect_share || 0,
              effective_share: shareInfo.effective_share || 0,
              called_amount: calledResult[0]?.called_amount || 0,
              distributions_received: distResult[0]?.total || 0,
              pool_cash_balance: pool.available_balance
            });
          }
        }
        setParticipations(list);
      } catch (err) {
        console.error("加载LP资产数据失败", err);
      } finally {
        setLoading(false);
      }
    }
    loadLPAus();
  }, [user]);

  // 全局合计计算
  const totalDirectCalled = participations.reduce((sum, p) => sum + Number(p.called_amount), 0);
  const totalDistributions = participations.reduce((sum, p) => sum + Number(p.distributions_received), 0);
  // 账面现金总价值 = 对应池的现金可用余额 * 最终有效份额
  const totalBookValue = participations.reduce((sum, p) => sum + Number(p.pool_cash_balance) * (Number(p.effective_share) / 100.0), 0);

  const headers = [
    { key: "pool_name", label: "我参与的资金池", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "direct_share", label: "直接持股比例", render: (v) => formatPercent(v) },
    { 
      key: "indirect_share", 
      label: "间接折算比例", 
      render: (v) => (
        <span style={{ color: Number(v) > 0 ? "var(--accent-gold)" : "var(--text-secondary)" }}>
          {formatPercent(v)}
        </span>
      )
    },
    { key: "effective_share", label: "最终有效比例", render: (v) => <span className="mono amt-bold" style={{ color: "var(--accent-blue)" }}>{formatPercent(v)}</span> },
    { key: "called_amount", label: "我的直接实缴出资", render: (v) => formatCNY(v, false) },
    { key: "distributions_received", label: "累计已收分配分红", className: "amt-in amt-bold", render: (v) => formatCNY(v, false) },
    { 
      key: "pool_id", 
      label: "我的账面现金净值", 
      align: "right",
      render: (v, row) => {
        const myValue = Number(row.pool_cash_balance) * (Number(row.effective_share) / 100.0);
        return <span className="mono amt-bold" style={{ color: "var(--accent-gold)", fontWeight: 700 }}>{formatCNY(myValue, false)}</span>;
      }
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.welcome}>
        <h2>您好，{user?.displayName || "出资人"}</h2>
        <p>这是您在 贷管家 管理的资金池资产详情与往来流水的综合视图。</p>
      </div>

      {/* LP 专属资产总览卡片 */}
      <div style={styles.cardGrid}>
        <StatCard 
          title="我的累计实缴出资" 
          value={formatCNY(totalDirectCalled, false)} 
          unit="元"
          subtext="我直接打款至各实体池子的金额"
          icon={Wallet}
        />
        <StatCard 
          title="账面现金权益净值" 
          value={formatCNY(totalBookValue, false)} 
          unit="元"
          subtext="各池可用现金 × 我的有效持股比例"
          icon={Layers}
          color="var(--accent-gold)"
        />
        <StatCard 
          title="累计收到分红收益" 
          value={formatCNY(totalDistributions, false)} 
          unit="元"
          subtext="包含项目已确认退出的分红派现"
          icon={DollarSign}
          color="var(--accent-green)"
        />
        <StatCard 
          title="参投实体资金池" 
          value={participations.length} 
          unit="个"
          subtext="包含直接出资与上层穿透出资"
          icon={PieChart}
          color="var(--text-secondary)"
        />
      </div>

      {/* 参股池明细表 */}
      <div className="glass-card no-hover" style={{ padding: "24px" }}>
        <h3 style={styles.sectionTitle}>我参股的资金池明细 (含多层级折算)</h3>
        <div style={{ marginTop: "20px" }}>
          <DataTable 
            headers={headers} 
            data={participations} 
            emptyMessage={loading ? "穿透折算核对中..." : "未查询到您名下的持股记录，请联系管理员为您登记"}
          />
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
  sectionTitle: {
    fontSize: "1.05rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  }
};
export default LPDashboard;
