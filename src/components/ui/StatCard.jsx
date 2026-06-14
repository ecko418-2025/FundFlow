import React from "react";

export function StatCard({ title, value, unit = "", subtext = "", trend = null, icon: Icon = null, color = "var(--accent-blue)", onClick = null }) {
  const clickable = typeof onClick === "function";

  // Helper to resolve clean style key matching accent colors
  const getColorKey = (c) => {
    if (!c) return "blue";
    const str = c.toLowerCase();
    if (str.includes("blue")) return "blue";
    if (str.includes("gold")) return "gold";
    if (str.includes("green")) return "green";
    if (str.includes("red")) return "red";
    if (str.includes("purple")) return "purple";
    if (str.includes("secondary") || str.includes("gray")) return "gray";
    return "blue";
  };

  const colorKey = getColorKey(color);

  return (
    <div
      className={`stat-card stat-card-${colorKey}`}
      style={{
        ...styles.card,
        ...(clickable ? styles.cardClickable : {})
      }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
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
        {clickable && <span style={{ fontSize: "0.7rem", color: color, marginLeft: "auto" }}>点击查看 →</span>}
      </div>
    </div>
  );
}

const styles = {
  card: {
    borderRadius: "12px",
    padding: "20px",
    flex: 1,
    minWidth: "220px"
  },
  cardClickable: {
    cursor: "pointer",
    border: "1px solid var(--primary-glow)",
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
