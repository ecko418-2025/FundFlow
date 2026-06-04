import React, { useState } from "react";
import { useAuthContext } from "../context/AuthContext";
import { TrendingUp, Key, Mail, AlertCircle, ArrowRight } from "lucide-react";

export function Login() {
  const { login, error: loginError } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      // 成功登录后，Auth 监听会自动处理路由跳转
    } catch (err) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (mockEmail) => {
    // 快捷按钮不再后台登录，而是直接填入“用户名和密码”输入框中，符合用户对显式密码登录的诉求
    setEmail(mockEmail);
    setPassword("123456");
  };

  return (
    <div style={styles.container}>
      {/* 炫光背景球 */}
      <div style={styles.blurBall1} />
      <div style={styles.blurBall2} />

      <div style={styles.card} className="glass-card">
        {/* 系统标志 */}
        <div style={styles.logoHeader}>
          <div style={styles.logoGlow}>
            <TrendingUp size={36} color="var(--accent-gold)" />
          </div>
          <h2 style={styles.systemName}>贷管家</h2>
          <p style={styles.systemSlogan}>人民币项目制多层级资金池记账平台</p>
        </div>

        {/* 错误提示 */}
        {(error || loginError) && (
          <div style={styles.errorAlert}>
            <AlertCircle size={16} color="var(--accent-red)" />
            <span>{error || loginError}</span>
          </div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="form-group">
            <label className="form-label">登录邮箱</label>
            <div style={styles.inputWrapper}>
              <Mail size={16} color="var(--text-secondary)" style={styles.inputIcon} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="form-input"
                style={styles.inputWithIcon}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "28px" }}>
            <label className="form-label">登录密码</label>
            <div style={styles.inputWrapper}>
              <Key size={16} color="var(--text-secondary)" style={styles.inputIcon} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="form-input"
                style={styles.inputWithIcon}
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={styles.submitBtn}>
            <span>{loading ? "验证中..." : "安全登录"}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {/* 快速体验通道 */}
        <div style={styles.quickLoginSection}>
          <div style={styles.divider}>
            <span style={styles.dividerText}>演示环境快捷登录</span>
          </div>
          
          <div style={styles.quickBtnGrid}>
            <button 
              onClick={() => handleQuickLogin("admin@example.com")} 
              style={{ ...styles.quickBtn, borderLeft: "4px solid var(--accent-blue)" }}
            >
              <span style={styles.quickBtnTitle}>管理员</span>
              <span style={styles.quickBtnEmail}>admin@example.com</span>
            </button>
            <button 
              onClick={() => handleQuickLogin("zhangsan@example.com")} 
              style={{ ...styles.quickBtn, borderLeft: "4px solid var(--accent-gold)" }}
            >
              <span style={styles.quickBtnTitle}>LP - 张三</span>
              <span style={styles.quickBtnEmail}>zhangsan@example.com</span>
            </button>
            <button 
              onClick={() => handleQuickLogin("lisi@example.com")} 
              style={{ ...styles.quickBtn, borderLeft: "4px solid var(--accent-green)" }}
            >
              <span style={styles.quickBtnTitle}>LP - 李四</span>
              <span style={styles.quickBtnEmail}>lisi@example.com</span>
            </button>
            <button 
              onClick={() => handleQuickLogin("future@example.com")} 
              style={{ ...styles.quickBtn, borderLeft: "4px solid var(--text-muted)" }}
            >
              <span style={styles.quickBtnTitle}>LP - 未来资本</span>
              <span style={styles.quickBtnEmail}>future@example.com</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    background: "radial-gradient(circle at center, #0F172A 0%, #020617 100%)"
  },
  blurBall1: {
    position: "absolute",
    width: "400px",
    height: "400px",
    borderRadius: "50%",
    background: "rgba(37, 99, 235, 0.15)",
    filter: "blur(80px)",
    top: "10%",
    left: "15%",
    zIndex: 1
  },
  blurBall2: {
    position: "absolute",
    width: "300px",
    height: "300px",
    borderRadius: "50%",
    background: "rgba(245, 158, 11, 0.1)",
    filter: "blur(60px)",
    bottom: "15%",
    right: "15%",
    zIndex: 1
  },
  card: {
    width: "100%",
    maxWidth: "460px",
    padding: "40px",
    zIndex: 10,
    backgroundColor: "rgba(15, 23, 42, 0.65)"
  },
  logoHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    marginBottom: "32px"
  },
  logoGlow: {
    width: "68px",
    height: "68px",
    borderRadius: "16px",
    backgroundColor: "var(--accent-gold-glow)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
    boxShadow: "0 0 20px rgba(245, 158, 11, 0.15)"
  },
  systemName: {
    fontSize: "1.6rem",
    fontWeight: "700",
    color: "var(--text-primary)",
    letterSpacing: "-0.02em"
  },
  systemSlogan: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
    marginTop: "6px"
  },
  errorAlert: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "var(--accent-red-glow)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    color: "var(--accent-red)",
    padding: "12px",
    borderRadius: "8px",
    fontSize: "0.85rem",
    marginBottom: "24px"
  },
  form: {
    display: "flex",
    flexDirection: "column"
  },
  inputWrapper: {
    position: "relative",
    width: "100%"
  },
  inputIcon: {
    position: "absolute",
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none"
  },
  inputWithIcon: {
    paddingLeft: "42px"
  },
  submitBtn: {
    width: "100%",
    justifyContent: "center",
    padding: "12px",
    fontSize: "0.95rem"
  },
  quickLoginSection: {
    marginTop: "32px"
  },
  divider: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px"
  },
  dividerText: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    padding: "0 10px",
    position: "relative"
  },
  quickBtnGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px"
  },
  quickBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: "10px 12px",
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },
  quickBtnTitle: {
    fontSize: "0.8rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  },
  quickBtnEmail: {
    fontSize: "0.65rem",
    color: "var(--text-secondary)",
    marginTop: "4px"
  }
};
export default Login;
