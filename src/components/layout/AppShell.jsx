import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ user, onLogout, children }) {
  return (
    <div style={styles.container}>
      {/* 侧边栏 */}
      <Sidebar user={user} onLogout={onLogout} />
      
      {/* 右侧主区域 */}
      <div style={styles.mainArea}>
        {/* 顶栏 */}
        <TopBar />
        
        {/* 主体页面内容 */}
        <main style={styles.content}>
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
