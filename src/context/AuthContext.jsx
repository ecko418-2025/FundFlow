import React, { createContext, useContext, useState, useEffect } from "react";
import { auth } from "../lib/cloudbase";
import { querySQL } from "../lib/db";

const AuthContext = createContext(null);

// Mock 账号定义
const MOCK_USERS = {
  "admin@example.com": { uid: "uid-admin", email: "admin@example.com", role: "admin", displayName: "张总（管理员）", investorId: null },
  "ecko418@gmail.com": { uid: "uid-ecko418", email: "ecko418@gmail.com", role: "admin", displayName: "ecko418（管理员）", investorId: null },
  "zhangsan@example.com": { uid: "uid-zhangsan", email: "zhangsan@example.com", role: "lp", displayName: "张三（出资人）", investorId: "inv-1" },
  "lisi@example.com": { uid: "uid-lisi", email: "lisi@example.com", role: "lp", displayName: "李四（出资人）", investorId: "inv-2" },
  "future@example.com": { uid: "uid-future", email: "future@example.com", role: "lp", displayName: "未来资本（出资人）", investorId: "inv-3" }
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const useMock = localStorage.getItem("USE_MOCK") !== "false";
    const savedMockUser = localStorage.getItem("MOCK_USER");
    if (useMock && savedMockUser) {
      setCurrentUser(JSON.parse(savedMockUser));
      setLoading(false);
      return;
    }

    const checkLogin = async () => {
      try {
        const loginState = auth.hasLoginState();
        if (loginState) {
          const user = auth.currentUser;
          
          // 查询数据库中的用户角色及关联出资人ID
          const dbUsers = await querySQL("SELECT * FROM users WHERE uid = ?", [user.uid]);
          const dbUser = dbUsers && dbUsers[0];

          setCurrentUser({
            uid: user.uid,
            email: user.email,
            role: dbUser ? dbUser.role : (user.email?.includes("admin") ? "admin" : "lp"),
            displayName: dbUser ? dbUser.display_name : (user.displayName || user.email),
            investorId: dbUser ? dbUser.investor_id : null
          });
        }
      } catch (e) {
        console.warn("未连接云开发 Auth，运行在演示模式。");
      } finally {
        setLoading(false);
      }
    };

    checkLogin();
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);

    // 1. 尝试 Mock 账户登录（用于预览，仅在 Mock 模式下生效）
    const useMock = localStorage.getItem("USE_MOCK") !== "false";
    if (useMock && MOCK_USERS[email]) {
      const mockUser = MOCK_USERS[email];
      localStorage.setItem("MOCK_USER", JSON.stringify(mockUser));
      setCurrentUser(mockUser);
      setLoading(false);
      return mockUser;
    }

    // 2. 尝试云开发真实登录
    try {
      await auth.signInWithEmailAndPassword(email, password);
      const user = auth.currentUser;
      
      // 查询数据库获取真实角色和关联出资人ID
      const dbUsers = await querySQL("SELECT * FROM users WHERE uid = ?", [user.uid]);
      const dbUser = dbUsers && dbUsers[0];

      const loggedUser = {
        uid: user.uid,
        email: user.email,
        role: dbUser ? dbUser.role : (user.email?.includes("admin") ? "admin" : "lp"),
        displayName: dbUser ? dbUser.display_name : (user.displayName || user.email),
        investorId: dbUser ? dbUser.investor_id : null
      };
      setCurrentUser(loggedUser);
      setLoading(false);
      return loggedUser;
    } catch (err) {
      setLoading(false);
      setError(err.message || "登录失败，邮箱或密码错误");
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    localStorage.removeItem("MOCK_USER");
    setCurrentUser(null);
    try {
      await auth.signOut();
    } catch (e) {
      // 忽略登出报错
    }
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
