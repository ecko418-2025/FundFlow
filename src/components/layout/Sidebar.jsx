import React from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  TrendingUp, 
  Users, 
  Briefcase, 
  DollarSign, 
  PieChart, 
  FileText,
  LogOut,
  Layers,
  Settings
} from "lucide-react";

export function Sidebar({ user, onLogout }) {
  const location = useLocation();
  const role = user?.role || "lp";

  const adminMenu = [
    { name: "总览数据", path: "/admin", icon: LayoutDashboard },
    { name: "资金池管理", path: "/admin/pools", icon: Layers },
    { name: "出资方管理", path: "/admin/investors", icon: Users },
    { name: "项目管理", path: "/admin/projects", icon: Briefcase },
    { name: "核心流水账", path: "/admin/transactions", icon: DollarSign },
    { name: "收益分配", path: "/admin/distribution", icon: PieChart },
    { name: "系统设置", path: "/admin/settings", icon: Settings }
  ];

  const lpMenu = [
    { name: "我的资产总览", path: "/lp", icon: LayoutDashboard },
    { name: "对账账单", path: "/lp/statement", icon: FileText }
  ];

  const currentMenu = role === "admin" ? adminMenu : lpMenu;

  return (
    <aside style={styles.sidebar}>
      {/* 系统 Logo */}
      <div style={styles.logoContainer}>
        <TrendingUp size={28} color="var(--accent-gold)" />
        <span style={styles.logoText}>贷管家</span>
        <span style={styles.logoBadge}>SQL</span>
      </div>

      {/* 导航菜单 */}
      <nav style={styles.nav}>
        {currentMenu.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link 
              key={item.path} 
              to={item.path} 
              style={{
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              }}
            >
              <Icon size={20} color={isActive ? "var(--text-primary)" : "var(--text-secondary)"} />
              <span>{item.name}</span>
              {isActive && <div style={styles.activeIndicator} />}
            </Link>
          );
        })}
      </nav>

      {/* 底部用户信息与退出 */}
      <div style={styles.footer}>
        <div style={styles.userInfo}>
          <div style={styles.avatar}>
            {user?.displayName?.charAt(0) || "U"}
          </div>
          <div style={styles.userDetails}>
            <div style={styles.userName}>{user?.displayName || "未知用户"}</div>
            <div style={styles.userRole}>{role === "admin" ? "系统管理员" : "LP 投资人"}</div>
          </div>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>
          <LogOut size={16} />
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: "260px",
    height: "100vh",
    backgroundColor: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    position: "fixed",
    left: 0,
    top: 0,
    zIndex: 100
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "40px",
    paddingLeft: "8px"
  },
  logoText: {
    fontSize: "1.45rem",
    fontWeight: "700",
    color: "var(--text-primary)",
    letterSpacing: "-0.02em"
  },
  logoBadge: {
    fontSize: "0.65rem",
    fontWeight: "700",
    color: "var(--accent-blue)",
    backgroundColor: "var(--accent-blue-glow)",
    padding: "2px 6px",
    borderRadius: "4px",
    border: "1px solid rgba(37, 99, 235, 0.3)"
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flexGrow: 1
  },
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    color: "var(--text-secondary)",
    textDecoration: "none",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: "500",
    transition: "all 0.2s ease",
    position: "relative"
  },
  navLinkActive: {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    fontWeight: "600"
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: "25%",
    height: "50%",
    width: "4px",
    backgroundColor: "var(--accent-blue)",
    borderRadius: "0 4px 4px 0"
  },
  footer: {
    borderTop: "1px solid var(--border)",
    paddingTop: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px"
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "var(--accent-blue)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "600",
    fontSize: "1.1rem",
    boxShadow: "0 0 10px rgba(37, 99, 235, 0.2)"
  },
  userDetails: {
    display: "flex",
    flexDirection: "column"
  },
  userName: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "var(--text-primary)"
  },
  userRole: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "2px"
  },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "10px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--accent-red)",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: "500",
    transition: "all 0.2s ease"
  }
};
export default Sidebar;
