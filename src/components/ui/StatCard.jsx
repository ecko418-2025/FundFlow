import React from "react";

export function StatCard({ title, value, unit = "", subtext = "", trend = null, icon: Icon = null, color = "var(--accent-blue)" }) {
  return (
    <div style={styles.card}>
      {/* 顶部标题与图标 */}
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        {Icon && (
          <div style={{ ...styles.iconGlow, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
            <Icon size={18} color={color} />
          </div>
        )}
      </div>

      {/* 核心数值 */}
      <div style={styles.valueContainer}>
        <span style={styles.value} className="mono">{value}</span>
        {unit && <span style={styles.unit}>{unit}</span>}
      </div>

      {/* 底部副文本与趋势 */}
      <div style={styles.footer}>
        {trend !== null && (
          <span style={{ ...styles.trend, color: trend >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
        <span style={styles.subtext}>{subtext}</span>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "rgba(17, 24, 39, 0.6)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.04)",
    borderRadius: "12px",
    padding: "20px",
    flex: 1,
    minWidth: "220px",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
    transition: "all 0.2s ease"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px"
  },
  title: {
    color: "var(--text-secondary)",
    fontSize: "0.85rem",
    fontWeight: "500"
  },
  iconGlow: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  valueContainer: {
    display: "flex",
    alignItems: "baseline",
    gap: "4px",
    marginBottom: "8px"
  },
  value: {
    fontSize: "1.75rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  },
  unit: {
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
    fontWeight: "500"
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: "6px"
  },
  trend: {
    fontSize: "0.75rem",
    fontWeight: "600"
  },
  subtext: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)"
  }
};
export default StatCard;
