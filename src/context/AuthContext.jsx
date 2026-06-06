import React, { createContext, useContext, useState, useEffect } from "react";
import { auth } from "../lib/cloudbase";
import { querySQL } from "../lib/db";
import { writeAuditLog } from "../lib/audit";

const AuthContext = createContext(null);

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const getFallbackRole = (email = "") => {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail.includes("admin") || normalizedEmail === "ecko418@gmail.com") return "admin";
  if (normalizedEmail.includes("operator")) return "operator";
  return "lp";
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getStableAuthUser(loginState) {
  for (let i = 0; i < 5; i++) {
    const user = loginState?.user || auth.currentUser;
    if (user?.uid) return user;
    await sleep(120);
  }
  throw new Error("登录状态同步中，请稍后再试");
}

async function buildLoggedUser(user, fallbackEmail = "") {
  let dbUser = null;
  const email = user.email || fallbackEmail;
  try {
    const dbUsers = await querySQL("SELECT * FROM users WHERE uid = ?", [user.uid]);
    dbUser = dbUsers && dbUsers[0];
    if (!dbUser && email) {
      const emailUsers = await querySQL("SELECT * FROM users WHERE email = ?", [email]);
      dbUser = emailUsers && emailUsers[0];
    }
  } catch (err) {
    console.warn("登录成功，但读取用户角色失败，已使用邮箱兜底角色。", err.message);
  }

  return {
    uid: user.uid,
    email,
    role: dbUser ? dbUser.role : getFallbackRole(email),
    displayName: dbUser ? dbUser.display_name : (user.displayName || email),
    investorId: dbUser ? dbUser.investor_id : null
  };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const loginState = auth.hasLoginState();
        if (loginState) {
          const user = await getStableAuthUser(loginState);
          setCurrentUser(await buildLoggedUser(user));
        }
      } catch (e) {
        console.warn("未连接云开发 Auth。");
      } finally {
        setLoading(false);
      }
    };

    checkLogin();
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    const normalizedEmail = normalizeEmail(email);

    try {
      const loginState = await auth.signInWithEmailAndPassword(email, password);
      const user = await getStableAuthUser(loginState);
      const loggedUser = await buildLoggedUser(user, normalizedEmail);
      setCurrentUser(loggedUser);
      await writeAuditLog({
        actor: loggedUser,
        action: "login",
        module: "auth",
        targetType: "user",
        targetId: loggedUser.uid,
        targetLabel: loggedUser.email,
        status: "success",
        message: "用户登录成功"
      });
      setLoading(false);
      return loggedUser;
    } catch (err) {
      await writeAuditLog({
        actor: { email: normalizedEmail },
        action: "login",
        module: "auth",
        targetType: "user",
        targetLabel: normalizedEmail,
        status: "failure",
        message: "用户登录失败",
        errorMessage: err.message
      });
      setLoading(false);
      setError(err.message || "登录失败，邮箱或密码错误");
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    const userBeforeLogout = currentUser;
    setCurrentUser(null);
    try {
      await auth.signOut();
      await writeAuditLog({
        actor: userBeforeLogout,
        action: "logout",
        module: "auth",
        targetType: "user",
        targetId: userBeforeLogout?.uid,
        targetLabel: userBeforeLogout?.email,
        status: "success",
        message: "用户退出登录"
      });
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
