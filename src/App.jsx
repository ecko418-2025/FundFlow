import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import { AppShell } from "./components/layout/AppShell";

// 页面组件导入
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/admin/Dashboard";
import { Pools } from "./pages/admin/Pools";
import { PoolDetail } from "./pages/admin/PoolDetail";
import { Investors } from "./pages/admin/Investors";
import { InvestorDetail } from "./pages/admin/InvestorDetail";
import { Projects } from "./pages/admin/Projects";
import { ProjectDetail } from "./pages/admin/ProjectDetail";
import { Transactions } from "./pages/admin/Transactions";
import { Distribution } from "./pages/admin/Distribution";
import { Reports } from "./pages/admin/Reports";
import { Settings } from "./pages/admin/Settings";

import { LPDashboard } from "./pages/lp/LPDashboard";
import { LPStatement } from "./pages/lp/LPStatement";

function AppContent() {
  const { currentUser, loading, logout } = useAuthContext();

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={{ marginTop: "16px", color: "var(--text-secondary)" }}>正在加载身份鉴权...</p>
      </div>
    );
  }

  // 路由保护守卫组件
  const PrivateRoute = ({ children, allowedRole }) => {
    if (!currentUser) {
      return <Navigate to="/login" replace />;
    }
    if (allowedRole && currentUser.role !== allowedRole) {
      // 角色不匹配，重定向到合适的主页
      return <Navigate to={currentUser.role === "admin" ? "/admin" : "/lp"} replace />;
    }
    return children;
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页面 */}
        <Route 
          path="/login" 
          element={currentUser ? <Navigate to={currentUser.role === "admin" ? "/admin" : "/lp"} replace /> : <Login />} 
        />

        {/* 管理员路由分支 (Admin Panel) */}
        <Route 
          path="/admin" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Dashboard />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/pools" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Pools />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/pools/:id" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <PoolDetail />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/investors" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Investors />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/investors/:id" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <InvestorDetail />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/projects" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Projects />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/projects/:id" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <ProjectDetail />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/transactions" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Transactions />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/distribution" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Distribution />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/admin/reports" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Reports />
              </AppShell>
            </PrivateRoute>
          } 
        />

        <Route 
          path="/admin/settings" 
          element={
            <PrivateRoute allowedRole="admin">
              <AppShell user={currentUser} onLogout={logout}>
                <Settings />
              </AppShell>
            </PrivateRoute>
          } 
        />

        {/* 出资人路由分支 (LP Wealth Portal) */}
        <Route 
          path="/lp" 
          element={
            <PrivateRoute allowedRole="lp">
              <AppShell user={currentUser} onLogout={logout}>
                <LPDashboard user={currentUser} />
              </AppShell>
            </PrivateRoute>
          } 
        />
        <Route 
          path="/lp/statement" 
          element={
            <PrivateRoute allowedRole="lp">
              <AppShell user={currentUser} onLogout={logout}>
                <LPStatement user={currentUser} />
              </AppShell>
            </PrivateRoute>
          } 
        />

        {/* 默认首页，根据登录状态决定分流 */}
        <Route 
          path="*" 
          element={<Navigate to={currentUser ? (currentUser.role === "admin" ? "/admin" : "/lp") : "/login"} replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

const styles = {
  loadingContainer: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--bg-primary)"
  },
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid rgba(255, 255, 255, 0.05)",
    borderTopColor: "var(--accent-blue)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite"
  }
};

// 插入全局加载旋转帧动画样式
const styleEl = document.createElement("style");
styleEl.innerHTML = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleEl);

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
