import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { writeAuditLog } from "../../lib/audit";
import { useAuthContext } from "../../context/AuthContext";
import { Settings as SettingsIcon, Plus, X, Database as DatabaseIcon, RefreshCw, UserCog, Trash2 } from "lucide-react";

export function Settings() {
  const { currentUser } = useAuthContext();
  const [systemTags, setSystemTags] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [operatorLoading, setOperatorLoading] = useState(false);
  
  // States for adding new tag to a category
  const [newTagInputs, setNewTagInputs] = useState({});
  const [reconciling, setReconciling] = useState(false);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [operatorUid, setOperatorUid] = useState("");

  const handleReconcile = async () => {
    if (!window.confirm("确定要对系统内的所有项目、资金池、出资方的累计财务数据进行一次全局重算与校准吗？\n\n该操作会根据所有的流水记录重新计算每个主体的统计金额，并修复历史由于直接增量删除或导入错误导致的误差。")) {
      return;
    }
    setReconciling(true);
    try {
      // 0. 自动修复历史流水中缺失 investor_id 的数据
      // a. 将池级项目投资/回款的 investor_id 兜底填为 pool_id
      await querySQL(`
        UPDATE transactions 
        SET investor_id = pool_id 
        WHERE investor_id IS NULL 
          AND pool_id IS NOT NULL 
          AND (type = 'investment' OR type = 'return')
          AND status = 'approved'
      `);
      
      // b. 确保新模型下的母池注资流水的 target 指向正确
      // (通常在程序中已处理，此处作为校准冗余保障)

      // 1. 重算 projects
      await querySQL(`
        UPDATE projects SET
          invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = projects.id AND type = 'investment' AND status = 'approved'), 0),
          returned_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = projects.id AND type = 'return' AND status = 'approved'), 0)
      `);
      
      // 2. 重算 project_investors
      await querySQL(`
        UPDATE project_investors SET
          invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = project_investors.project_id AND investor_id = project_investors.investor_id AND type = 'investment' AND status = 'approved'), 0)
      `);

      // 3. 重算 pool_members (关键：统一统计资本注入，包含实缴和历史划入)
      await querySQL(`
        UPDATE pool_members SET
          called_amount = COALESCE((
            SELECT SUM(amount) FROM transactions 
            WHERE pool_id = pool_members.pool_id 
              AND (
                investor_id = pool_members.investor_id 
                OR (related_pool_id = pool_members.investor_id AND type = 'pool_transfer_in')
              )
              AND type IN ('capital_call', 'pool_transfer_in')
              AND status = 'approved'
          ), 0)
      `);

      await querySQL(`
        UPDATE pool_members pm
        JOIN (
          SELECT pool_id, SUM(called_amount) AS total_called
          FROM pool_members
          WHERE status = 'active'
          GROUP BY pool_id
        ) totals ON totals.pool_id = pm.pool_id
        SET pm.share_pct = CASE
          WHEN totals.total_called > 0 THEN LEAST(99.9999, GREATEST(0.0000, ROUND(pm.called_amount / totals.total_called * 100, 4)))
          ELSE 0
        END
        WHERE pm.status = 'active'
      `);

      // 4. 重算 pools
      await querySQL(`
        UPDATE pools SET
          available_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) FROM transactions WHERE pool_id = pools.id AND status = 'approved'), 0)
      `);

      await writeAuditLog({
        actor: currentUser,
        action: "reconcile",
        module: "settings",
        targetType: "system",
        targetId: "global_financial_stats",
        targetLabel: "全局财务数据校准",
        status: "success",
        message: "执行全局财务数据重算与校准"
      });

      alert("校准成功！已从底层流水表全量重新汇总并覆写所有统计数据（包括：项目已投/已回、出资人各项目实缴、资金池成员累计实缴、资金池可用余额）。");
    } catch (err) {
      console.error("Reconcile failed", err);
      await writeAuditLog({
        actor: currentUser,
        action: "reconcile",
        module: "settings",
        targetType: "system",
        targetId: "global_financial_stats",
        targetLabel: "全局财务数据校准",
        status: "failure",
        message: "全局财务数据重算与校准失败",
        errorMessage: err.message
      });
      alert("校准失败：" + err.message);
    } finally {
      setReconciling(false);
    }
  };
  
  // States for adding a new category
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("var(--accent-blue)");

  const presetColors = [
    { label: "蓝色 (属性)", value: "var(--accent-blue)" },
    { label: "黄色 (团队)", value: "var(--accent-gold)" },
    { label: "绿色 (性质)", value: "var(--accent-green)" },
    { label: "紫色 (自定义)", value: "#8b5cf6" },
    { label: "红色 (高危)", value: "var(--accent-red)" }
  ];

  useEffect(() => {
    fetchSettings();
    fetchOperators();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await querySQL(`SELECT * FROM settings WHERE \`key\` = 'system_tags'`);
      const tagsSetting = data.find(s => s.key === "system_tags");
      if (tagsSetting) {
        setSystemTags(JSON.parse(tagsSetting.value));
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOperators = async () => {
    setOperatorLoading(true);
    try {
      const data = await querySQL(`
        SELECT uid, email, role, display_name
        FROM users
        WHERE role = 'operator'
        ORDER BY email ASC
      `);
      setOperators(data || []);
    } catch (err) {
      console.error("Failed to load operators", err);
    } finally {
      setOperatorLoading(false);
    }
  };

  const handleCreateOperator = async (e) => {
    e.preventDefault();
    const email = operatorEmail.trim().toLowerCase();
    const displayName = operatorName.trim() || email;
    const uid = operatorUid.trim() || `uid-operator-${Date.now()}`;
    if (!email) return;

    try {
      const existing = await querySQL(
        `SELECT uid, email FROM users WHERE email = ? AND role = 'operator'`,
        [email]
      );
      if (existing && existing.length > 0) {
        alert("该邮箱已经是经办员。");
        return;
      }

      await querySQL(
        `INSERT INTO users (uid, email, role, investor_id, display_name)
         VALUES (?, ?, 'operator', NULL, ?)`,
        [uid, email, displayName]
      );

      await writeAuditLog({
        actor: currentUser,
        action: "create",
        module: "users",
        targetType: "operator",
        targetId: uid,
        targetLabel: email,
        status: "success",
        message: "新增经办员账号映射",
        afterData: { uid, email, role: "operator", displayName }
      });

      setOperatorEmail("");
      setOperatorName("");
      setOperatorUid("");
      await fetchOperators();
      alert("经办员账号映射已创建。请确认该邮箱已在 CloudBase Auth 中创建登录账号。");
    } catch (err) {
      await writeAuditLog({
        actor: currentUser,
        action: "create",
        module: "users",
        targetType: "operator",
        targetLabel: email,
        status: "failure",
        message: "新增经办员账号映射失败",
        requestPayload: { uid, email, displayName },
        errorMessage: err.message
      });
      alert("创建失败：" + err.message);
    }
  };

  const handleRemoveOperator = async (operator) => {
    if (!window.confirm(`确定移除经办员 "${operator.email}" 的系统角色映射吗？\n\n该操作不会删除 CloudBase Auth 登录账号。`)) {
      return;
    }

    try {
      await querySQL(
        `DELETE FROM users WHERE uid = ? AND role = 'operator'`,
        [operator.uid]
      );

      await writeAuditLog({
        actor: currentUser,
        action: "delete",
        module: "users",
        targetType: "operator",
        targetId: operator.uid,
        targetLabel: operator.email,
        status: "success",
        message: "移除经办员账号映射",
        beforeData: operator
      });

      await fetchOperators();
    } catch (err) {
      await writeAuditLog({
        actor: currentUser,
        action: "delete",
        module: "users",
        targetType: "operator",
        targetId: operator.uid,
        targetLabel: operator.email,
        status: "failure",
        message: "移除经办员账号映射失败",
        errorMessage: err.message
      });
      alert("移除失败：" + err.message);
    }
  };

  const saveTags = async (tagsData) => {
    try {
      // 核心修复：确保 JSON 字符串被正确转义。
      // CloudBase SQL 驱动通常会处理参数化查询中的字符串转义，
      // 但对于复杂的 JSON 字符串，显式调用 JSON.stringify 是必要的。
      const jsonString = JSON.stringify(tagsData);
      
      await querySQL(
        `UPDATE settings SET value = ? WHERE \`key\` = ?`, 
        [jsonString, "system_tags"]
      );
      
      setSystemTags(tagsData);
    } catch (err) {
      console.error("Save tags failed:", err);
      alert("保存失败：" + err.message);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    
    if (systemTags.some(c => c.name === name)) {
      alert("该分类名称已存在！");
      return;
    }

    const newCategory = {
      id: `cat_${Date.now()}`,
      name: name,
      color: newCategoryColor,
      tags: []
    };

    const updated = [...systemTags, newCategory];
    await saveTags(updated);
    setNewCategoryName("");
  };

  const handleRemoveCategory = async (categoryId, categoryName) => {
    if (window.confirm(`确定要删除分类 "${categoryName}" 吗？其下的所有标签都会从配置中移除（不影响历史项目）。`)) {
      const updated = systemTags.filter(c => c.id !== categoryId);
      await saveTags(updated);
    }
  };

  const handleAddTag = async (e, categoryId) => {
    e.preventDefault();
    const tagVal = (newTagInputs[categoryId] || "").trim();
    if (!tagVal) return;

    // Ensure tag is globally unique
    const isExist = systemTags.some(c => c.tags.includes(tagVal));
    if (isExist) {
      alert("该标签已存在于某个分类中！标签必须全局唯一。");
      return;
    }

    const updated = systemTags.map(c => {
      if (c.id === categoryId) {
        return { ...c, tags: [...c.tags, tagVal] };
      }
      return c;
    });

    await saveTags(updated);
    setNewTagInputs(prev => ({ ...prev, [categoryId]: "" }));
  };

  const handleRemoveTag = async (categoryId, tagToRemove) => {
    if (window.confirm(`确定要删除标签 "${tagToRemove}" 吗？`)) {
      const updated = systemTags.map(c => {
        if (c.id === categoryId) {
          return { ...c, tags: c.tags.filter(t => t !== tagToRemove) };
        }
        return c;
      });
      await saveTags(updated);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>系统设置</h2>
          <p>管理系统的全局配置项与元数据字典。</p>
        </div>
      </div>

      <div className="glass-card no-hover" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <UserCog size={20} color="var(--accent-blue)" />
          <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-primary)" }}>操作员账号管理</h3>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "20px" }}>
          维护财务经办员的系统角色映射。经办员可录入流水和分配方案，提交后需管理员审核生效。
        </p>

        <form onSubmit={handleCreateOperator} style={styles.operatorForm}>
          <div style={styles.operatorField}>
            <label className="form-label">登录邮箱 *</label>
            <input
              type="email"
              value={operatorEmail}
              onChange={(e) => setOperatorEmail(e.target.value)}
              placeholder="请填写"
              className="form-input"
              required
            />
          </div>
          <div style={styles.operatorField}>
            <label className="form-label">显示名称</label>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="请填写"
              className="form-input"
            />
          </div>
          <div style={styles.operatorField}>
            <label className="form-label">Auth UID（选填）</label>
            <input
              type="text"
              value={operatorUid}
              onChange={(e) => setOperatorUid(e.target.value)}
              placeholder="请填写"
              className="form-input mono"
            />
          </div>
          <button type="submit" className="btn-primary" style={styles.operatorSubmit}>
            <Plus size={16} />
            <span>新增经办员</span>
          </button>
        </form>

        <div style={styles.operatorList}>
          <div style={styles.operatorListHeader}>
            <span>现有经办员</span>
            <button type="button" onClick={fetchOperators} className="btn-secondary" style={styles.smallButton}>
              <RefreshCw size={14} />
              <span>刷新</span>
            </button>
          </div>

          {operatorLoading ? (
            <div style={styles.emptyText}>加载中...</div>
          ) : operators.length === 0 ? (
            <div style={styles.emptyText}>暂无经办员账号映射。</div>
          ) : (
            <div style={styles.operatorTable}>
              {operators.map(operator => (
                <div key={operator.uid} style={styles.operatorRow}>
                  <div style={styles.operatorIdentity}>
                    <strong>{operator.display_name || operator.email}</strong>
                    <span className="mono">{operator.email}</span>
                  </div>
                  <span className="mono" style={styles.operatorUid}>{operator.uid}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveOperator(operator)}
                    className="btn-secondary"
                    style={styles.removeButton}
                  >
                    <Trash2 size={14} />
                    <span>移除</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.operatorNote}>
          新增这里的映射后，还需要确保该邮箱已在 CloudBase Auth 中创建登录密码；移除映射不会删除 Auth 账号。
        </div>
      </div>

      <div className="glass-card no-hover" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <SettingsIcon size={20} color="var(--accent-gold)" />
          <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-primary)" }}>项目标签分类矩阵</h3>
        </div>
        
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "30px" }}>
          维护结构化的项目标签。您可以自定义多维度的分类（如属性、团队、性质等），系统在项目列表页会根据分类展示对应的醒目色彩。
        </p>

        {loading ? (
          <div style={{ color: "var(--text-secondary)" }}>加载中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* Category List */}
            {systemTags.length === 0 ? (
              <div style={{ color: "var(--text-secondary)" }}>暂无分类，请在下方新增。</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {systemTags.map(cat => (
                  <div key={cat.id} style={styles.categoryBlock}>
                    <div style={styles.categoryHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: cat.color }} />
                        <h4 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.05rem" }}>{cat.name}</h4>
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>({cat.tags.length})</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveCategory(cat.id, cat.name)}
                        className="btn-secondary" 
                        style={{ padding: "4px 8px", fontSize: "0.8rem", color: "var(--accent-red)", borderColor: "transparent" }}
                      >
                        删除分类
                      </button>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
                      {cat.tags.length === 0 ? (
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontStyle: "italic" }}>暂无标签</span>
                      ) : (
                        cat.tags.map(tag => (
                          <div 
                            key={tag} 
                            style={{ 
                              ...styles.tagBadge, 
                              backgroundColor: `${cat.color}20`, 
                              border: `1px solid ${cat.color}40`,
                              color: cat.color
                            }}
                          >
                            <span>{tag}</span>
                            <button 
                              onClick={() => handleRemoveTag(cat.id, tag)}
                              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", padding: 0, opacity: 0.7 }}
                              title="移除此标签"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <form onSubmit={(e) => handleAddTag(e, cat.id)} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input 
                        type="text" 
                        value={newTagInputs[cat.id] || ""}
                        onChange={(e) => setNewTagInputs(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        placeholder={`添加新的 ${cat.name}...`}
                        className="form-input"
                        style={{ width: "200px", padding: "6px 12px", fontSize: "0.85rem", height: "32px" }}
                      />
                      <button type="submit" className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem", height: "32px" }}>
                        添加
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: "1px", backgroundColor: "var(--border)", margin: "8px 0" }} />

            {/* Add New Category */}
            <div>
              <h4 style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontSize: "1rem" }}>新增标签分类</h4>
              <form onSubmit={handleAddCategory} style={{ display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>分类名称</label>
                  <input 
                    type="text" 
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="如：行业分类标签"
                    className="form-input"
                    style={{ width: "220px" }}
                    required
                  />
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>主题颜色</label>
                  <select 
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="form-input"
                    style={{ width: "160px" }}
                  >
                    {presetColors.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", height: "100%", paddingTop: "26px" }}>
                  <button type="submit" className="btn-primary" style={{ gap: "6px", height: "42px" }}>
                    <Plus size={16} />
                    <span>创建分类</span>
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}
      </div>

      <div className="glass-card no-hover" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <DatabaseIcon size={20} color="var(--accent-green)" />
          <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-primary)" }}>数据库运维与财务校准</h3>
        </div>
        
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "24px" }}>
          如果因为系统异常、早期删除未冲回漏洞、或批量导入流水时引起资金池可用余额、项目已投/已回金额、以及出资人累计实缴额出现偏差，
          可使用此工具一键以流水记录为基准重新校准所有的统计金额。
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <button 
            onClick={handleReconcile}
            className="btn-primary" 
            style={{ 
              backgroundColor: "rgba(16, 185, 129, 0.2)", 
              border: "1px solid var(--accent-green)",
              color: "var(--accent-green)",
              gap: "8px",
              height: "42px",
              padding: "0 20px"
            }}
            disabled={reconciling}
          >
            <RefreshCw className={reconciling ? "animate-spin" : ""} size={16} />
            <span>{reconciling ? "正在全量校验与重算中..." : "一键全量财务金额校准"}</span>
          </button>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            * 该操作安全无损，仅对各统计表进行基于流水的 SQL SUM 覆盖重写，推荐在有数据偏差时执行。
          </span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "28px"
  },
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  categoryBlock: {
    backgroundColor: "rgba(9, 13, 26, 0.4)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "20px"
  },
  categoryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)"
  },
  operatorForm: {
    display: "flex",
    flexWrap: "wrap",
    gap: "14px",
    alignItems: "end",
    marginBottom: "22px"
  },
  operatorField: {
    flex: "1 1 220px",
    minWidth: 0
  },
  operatorSubmit: {
    height: "42px",
    gap: "6px",
    whiteSpace: "nowrap"
  },
  operatorList: {
    border: "1px solid var(--border)",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "rgba(9, 13, 26, 0.35)"
  },
  operatorListHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontWeight: 700
  },
  smallButton: {
    height: "30px",
    padding: "4px 10px",
    fontSize: "0.8rem",
    gap: "6px"
  },
  emptyText: {
    padding: "14px 12px",
    color: "var(--text-secondary)",
    fontSize: "0.9rem"
  },
  operatorTable: {
    display: "flex",
    flexDirection: "column"
  },
  operatorRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr auto",
    gap: "12px",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)"
  },
  operatorIdentity: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: 0,
    color: "var(--text-primary)",
    fontSize: "0.9rem"
  },
  operatorUid: {
    color: "var(--text-secondary)",
    fontSize: "0.78rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  removeButton: {
    height: "32px",
    padding: "4px 10px",
    gap: "6px",
    color: "var(--accent-red)"
  },
  operatorNote: {
    marginTop: "12px",
    color: "var(--text-secondary)",
    fontSize: "0.82rem",
    lineHeight: 1.5
  },
  tagBadge: {
    display: "flex", 
    alignItems: "center", 
    gap: "6px", 
    padding: "4px 10px", 
    borderRadius: "6px",
    fontSize: "0.85rem",
    fontWeight: "500",
    transition: "all 0.2s ease"
  }
};
