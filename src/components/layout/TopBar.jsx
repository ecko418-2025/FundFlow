import React from "react";
import { Menu } from "lucide-react";

export function TopBar({ onToggleMenu, isSidebarCollapsed = false }) {
  return (
    <header style={styles.topbar} className="app-topbar">
      <div style={styles.leftGroup}>
        <button
          type="button"
          className="sidebar-toggle-button"
          aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起或打开侧边栏"}
          title={isSidebarCollapsed ? "展开侧边栏" : "收起或打开侧边栏"}
          onClick={onToggleMenu}
        >
          <Menu size={22} />
        </button>
        <h1 style={styles.title}>贷管家 资金管理台</h1>
      </div>
    </header>
  );
}

const styles = {
  topbar: {
    height: "70px",
    backgroundColor: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
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
  leftGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0
  },
  title: {
    fontSize: "1.15rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  }
};
export default TopBar;
