import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { Settings as SettingsIcon, Plus, X, Tag, Database as DatabaseIcon, RefreshCw } from "lucide-react";

export function Settings() {
  const [systemTags, setSystemTags] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // States for adding new tag to a category
  const [newTagInputs, setNewTagInputs] = useState({});
  const [reconciling, setReconciling] = useState(false);

  const handleReconcile = async () => {
    if (!window.confirm("确定要对系统内的所有项目、资金池、出资方的累计财务数据进行一次全局重算与校准吗？\n\n该操作会根据所有的流水记录重新计算每个主体的统计金额，并修复历史由于直接增量删除或导入错误导致的误差。")) {
      return;
    }
    setReconciling(true);
    try {
      // 0. 自动修复历史流水中缺失 investor_id 的数据（将池级投资/回款的 investor_id 兜底填为 pool_id）
      await querySQL(`
        UPDATE transactions 
        SET investor_id = pool_id 
        WHERE investor_id IS NULL 
          AND pool_id IS NOT NULL 
          AND (type = 'investment' OR type = 'return')
      `);

      // 1. 重算 projects
      await querySQL(`
        UPDATE projects SET
          invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = projects.id AND type = 'investment'), 0),
          returned_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = projects.id AND type = 'return'), 0)
      `);
      
      // 2. 重算 project_investors
      await querySQL(`
        UPDATE project_investors SET
          invested_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id = project_investors.project_id AND investor_id = project_investors.investor_id AND type = 'investment'), 0)
      `);

      // 3. 重算 pool_members
      await querySQL(`
        UPDATE pool_members SET
          called_amount = COALESCE((SELECT SUM(amount) FROM transactions WHERE pool_id = pool_members.pool_id AND investor_id = pool_members.investor_id AND type = 'capital_call'), 0)
      `);

      // 4. 重算 pools
      await querySQL(`
        UPDATE pools SET
          available_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) FROM transactions WHERE pool_id = pools.id), 0)
      `);

      alert("校准成功！已从底层流水表全量重新汇总并覆写所有统计数据（包括：项目已投/已回、出资人各项目实缴、资金池成员累计实缴、资金池可用余额）。");
    } catch (err) {
      console.error("Reconcile failed", err);
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
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await querySQL(`SELECT * FROM settings`);
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

  const saveTags = async (tagsData) => {
    try {
      await querySQL(`UPDATE settings SET value = ? WHERE key = ?`, [JSON.stringify(tagsData), "system_tags"]);
      setSystemTags(tagsData);
    } catch (err) {
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
