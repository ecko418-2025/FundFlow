import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ user, onLogout, children }) {
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMobileSidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileSidebarOpen]);

  return (
    <div style={styles.container} className={`app-shell ${isDesktopSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* 侧边栏 */}
      <Sidebar
        user={user}
        onLogout={onLogout}
        isMobileOpen={isMobileSidebarOpen}
        onNavigate={() => setIsMobileSidebarOpen(false)}
      />
      <button
        type="button"
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? "is-open" : ""}`}
        aria-label="关闭导航菜单"
        onClick={() => setIsMobileSidebarOpen(false)}
      />
      
      {/* 右侧主区域 */}
      <div style={styles.mainArea} className="app-main-area">
        {/* 顶栏 */}
        <TopBar
          isSidebarCollapsed={isDesktopSidebarCollapsed}
          onToggleMenu={() => {
            if (window.matchMedia("(max-width: 768px)").matches) {
              setIsMobileSidebarOpen(true);
            } else {
              setIsDesktopSidebarCollapsed(prev => !prev);
            }
          }}
        />
        
        {/* 主体页面内容 */}
        <main style={styles.content} className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "var(--bg-primary)"
  },
  mainArea: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    marginLeft: "260px" /* 避开 sidebar 固定定位 */
  },
  content: {
    marginTop: "70px", /* 避开 topbar 固定定位 */
    padding: "32px",
    minHeight: "calc(100vh - 70px)",
    overflowY: "auto"
  }
};
export default AppShell;
