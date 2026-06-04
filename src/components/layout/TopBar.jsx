import React, { useState } from "react";
import { Database, AlertTriangle, Cpu } from "lucide-react";

export function TopBar() {
  const [envId, setEnvId] = useState(localStorage.getItem("CLOUDBASE_ENV_ID") || "cloud1-d2gpq0fat0dd3c17f");
  const [useMock, setUseMock] = useState(localStorage.getItem("USE_MOCK") !== "false");

  const handleEnvChange = (e) => {
    const val = e.target.value;
    setEnvId(val);
    localStorage.setItem("CLOUDBASE_ENV_ID", val);
  };

  const toggleMock = () => {
    const nextVal = !useMock;
    setUseMock(nextVal);
    localStorage.setItem("USE_MOCK", String(nextVal));
    window.location.reload(); // 重载应用以应用最新数据源
  };

  return (
    <header style={styles.topbar}>
      {/* 顶部标题 */}
      <div>
        <h1 style={styles.title}>FundFlow 资金管理台</h1>
        <p style={styles.subtitle}>人民币项目制多级资金池账本系统</p>
      </div>

      {/* 数据库环境控制面板 */}
      <div style={styles.controls}>
        {/* Mock/真实 切换开关 */}
        <button 
          onClick={toggleMock} 
          style={{
            ...styles.controlBtn,
            backgroundColor: useMock ? "var(--accent-gold-glow)" : "var(--accent-blue-glow)",
            borderColor: useMock ? "var(--accent-gold)" : "var(--accent-blue)"
          }}
        >
          {useMock ? <AlertTriangle size={16} color="var(--accent-gold)" /> : <Cpu size={16} color="var(--accent-blue)" />}
          <span style={{ color: useMock ? "var(--accent-gold)" : "var(--accent-blue)" }}>
            {useMock ? "演示 Mock 数据激活" : "腾讯云开发 SQL 连接中"}
          </span>
        </button>
      </div>
    </header>
  );
}

const styles = {
  topbar: {
    height: "70px",
    backgroundColor: "rgba(9, 13, 26, 0.8)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    position: "fixed",
    left: "260px",
    right: 0,
    top: 0,
    zIndex: 99
  },
  title: {
    fontSize: "1.15rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  },
  subtitle: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "2px"
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "14px"
  },
  controlBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    border: "1px solid",
    borderRadius: "6px",
    fontSize: "0.8rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },
  inputContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    padding: "6px 12px",
    borderRadius: "6px"
  },
  envInput: {
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontSize: "0.8rem",
    outline: "none",
    width: "150px"
  }
};
export default TopBar;
