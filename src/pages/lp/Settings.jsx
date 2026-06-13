import React from "react";
import { useAuthContext } from "../../context/AuthContext";

export function Settings() {
  const { theme, setTheme } = useAuthContext();

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>系统设置</h2>
          <p>个性化配置您在本系统的使用偏好。</p>
        </div>
      </div>

      <div className="glass-card no-hover" style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-gold) 100%)" }} />
          <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-primary)" }}>界面主题与外观</h3>
        </div>
        
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "24px" }}>
          选择适合您阅读习惯的系统色调。提供深色护眼模式与 Solarized Light 经典护眼亮色主题。该配置仅在您当前的浏览器和账户中生效。
        </p>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className="btn-primary"
            style={{
              background: theme === "dark" ? "var(--primary-500)" : "var(--neutral-700)",
              color: theme === "dark" ? "#fff" : "var(--text-primary)",
              border: theme === "dark" ? "1px solid var(--primary-500)" : "1px solid var(--border)",
              boxShadow: theme === "dark" ? "0 4px 12px var(--primary-glow)" : "none"
            }}
          >
            深邃暗夜模式 (默认)
          </button>

          <button
            type="button"
            onClick={() => setTheme("solarized-light")}
            className="btn-primary"
            style={{
              background: theme === "solarized-light" ? "#b58900" : "var(--neutral-700)",
              color: theme === "solarized-light" ? "#fff" : "var(--text-primary)",
              border: theme === "solarized-light" ? "1px solid #b58900" : "1px solid var(--border)",
              boxShadow: theme === "solarized-light" ? "0 4px 12px rgba(181, 137, 0, 0.2)" : "none"
            }}
          >
            Solarized Light (米黄护眼)
          </button>
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
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  card: {
    padding: "24px"
  }
};

export default Settings;
