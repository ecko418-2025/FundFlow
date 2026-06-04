import { useState, useEffect } from "react";
import { auth } from "../lib/cloudbase";

// Mock 账号定义，方便无痛演示
const MOCK_USERS = {
  "admin@example.com": { uid: "uid-admin", email: "admin@example.com", role: "admin", displayName: "张总（管理员）", investorId: null },
  "ecko418@gmail.com": { uid: "uid-ecko418", email: "ecko418@gmail.com", role: "admin", displayName: "ecko418（管理员）", investorId: null },
  "zhangsan@example.com": { uid: "uid-zhangsan", email: "zhangsan@example.com", role: "lp", displayName: "张三（出资人）", investorId: "inv-1" },
  "lisi@example.com": { uid: "uid-lisi", email: "lisi@example.com", role: "lp", displayName: "李四（出资人）", investorId: "inv-2" },
  "future@example.com": { uid: "uid-future", email: "future@example.com", role: "lp", displayName: "未来资本（出资人）", investorId: "inv-3" }
};

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 优先检查本地缓存的 Mock 登录状态
    const useMock = localStorage.getItem("USE_MOCK") !== "false";
    const savedMockUser = localStorage.getItem("MOCK_USER");
    if (useMock && savedMockUser) {
      setCurrentUser(JSON.parse(savedMockUser));
      setLoading(false);
      return;
    }

    // 绑定真实的云开发 Auth 状态监听器
    try {
      const loginState = auth.hasLoginState();
      if (loginState) {
        // 已登录，获取用户信息
        const user = auth.currentUser;
        // 注意：此处实际开发中会再去查数据库获取 role 和 investor_id，这里简化处理
        setCurrentUser({
          uid: user.uid,
          email: user.email,
          role: user.email?.includes("admin") ? "admin" : "lp",
          displayName: user.displayName || user.email,
          investorId: user.email?.includes("zhangsan") ? "inv-1" : null
        });
      }
    } catch (e) {
      console.warn("未连接云开发 Auth，运行在演示模式。");
    }
    setLoading(false);
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
      const loggedUser = {
        uid: user.uid,
        email: user.email,
        role: user.email?.includes("admin") ? "admin" : "lp",
        displayName: user.displayName || user.email,
        investorId: null // 真实环境需要从 users 表查询
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

  return {
    currentUser,
    loading,
    error,
    login,
    logout
  };
}
export default useAuth;
