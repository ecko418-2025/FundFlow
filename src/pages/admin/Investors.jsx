import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { Link } from "react-router-dom";
import { formatDate } from "../../lib/formatters";
import { Plus, Users, Download, Upload, FileSpreadsheet } from "lucide-react";
import { exportToExcel, importFromExcel, downloadTemplate } from "../../lib/excel";

const EXPORT_HEADERS_MAP = {
  name: "出资方名称",
  type: "投资者性质",
  email: "对账邮箱",
  phone: "联系电话",
  contact: "对接人",
  note: "备注"
};

const IMPORT_HEADERS_MAP = {
  "出资方名称": "name",
  "投资者性质": "type",
  "对账邮箱": "email",
  "联系电话": "phone",
  "对接人": "contact",
  "备注": "note"
};

export function Investors() {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [filterType, setFilterType] = useState("investors");

  const filteredInvestors = React.useMemo(() => {
    let result = investors;
    if (filterType === "investors") {
      result = result.filter(inv => inv.type === "individual" || inv.type === "fund");
    } else if (filterType === "pools") {
      result = result.filter(inv => inv.type === "pool");
    }
    return result;
  }, [investors, filterType]);

  const paginatedInvestors = React.useMemo(() => {
    return filteredInvestors.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredInvestors, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredInvestors.length / pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredInvestors.length, filterType]);

  // 新增出资方表单状态
  const [name, setName] = useState("");
  const [type, setType] = useState("individual");
  const [email, setEmail] = useState("");
  const [cloudbaseUid, setCloudbaseUid] = useState("");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  // 编辑出资方表单状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("individual");
  const [editEmail, setEditEmail] = useState("");
  const [editUid, setEditUid] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editNote, setEditNote] = useState("");

  const openEditModal = (inv) => {
    setEditingInvestor(inv);
    setEditName(inv.name || "");
    setEditType(inv.type || "individual");
    setEditEmail(inv.email || "");
    setEditUid(inv.uid || "");
    setEditPhone(inv.phone || "");
    setEditContact(inv.contact || "");
    setEditNote(inv.note || "");
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editName || !editEmail) return;
    try {
      const targetUid = editUid.trim() || `uid-${editName.toLowerCase().replace(/\s+/g, "")}`;
      // 1. 更新 investors 表
      const sql = `
        UPDATE investors 
        SET name = ?, type = ?, email = ?, uid = ?, phone = ?, contact = ?, note = ?
        WHERE id = ?
      `;
      await querySQL(sql, [
        editName,
        editType,
        editEmail,
        targetUid,
        editPhone,
        editContact || editName,
        editNote,
        editingInvestor.id
      ]);

      // 2. 更新 users 表中的 uid, email, display_name
      const usersData = await querySQL("SELECT * FROM users WHERE investor_id = ?", [editingInvestor.id]);
      if (usersData && usersData.length > 0) {
        const userSql = `
          UPDATE users 
          SET uid = ?, email = ?, display_name = ?
          WHERE investor_id = ?
        `;
        await querySQL(userSql, [
          targetUid,
          editEmail,
          editName,
          editingInvestor.id
        ]);
      } else {
        const userSql = `
          INSERT INTO users (uid, email, role, investor_id, display_name)
          VALUES (?, ?, 'lp', ?, ?)
        `;
        await querySQL(userSql, [
          targetUid,
          editEmail,
          editingInvestor.id,
          editName
        ]);
      }

      setIsEditModalOpen(false);
      setEditingInvestor(null);
      await fetchInvestors();
      alert("出资方信息及关联账号更新成功！");
    } catch (err) {
      alert("更新出资方失败：" + err.message);
    }
  };

  const fetchInvestors = async () => {
    setLoading(true);
    try {
      const data = await querySQL("SELECT * FROM investors ORDER BY created_at DESC");
      setInvestors(data);
    } catch (err) {
      console.error("加载出资人失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestors();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !email) return;
    try {
      const invId = `inv-${Date.now()}`;
      const sql = `
        INSERT INTO investors (id, name, type, email, uid, phone, contact, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      // uid 可以暂时生成一个 mock 格式，对应 mock 登录
      const mockUid = `uid-${name.toLowerCase().replace(/\s+/g, "")}`;
      const actualUid = cloudbaseUid.trim() || mockUid;
      
      await querySQL(sql, [
        invId,
        name,
        type,
        email,
        actualUid,
        phone,
        contact || name,
        note
      ]);

      // 同时插入用户账号角色映射表，关联登录角色
      const userSql = `
        INSERT INTO users (uid, email, role, investor_id, display_name)
        VALUES (?, ?, 'lp', ?, ?)
      `;
      await querySQL(userSql, [
        actualUid,
        email,
        invId,
        name
      ]);

      setName("");
      setEmail("");
      setPhone("");
      setContact("");
      setNote("");
      setCloudbaseUid("");
      setIsModalOpen(false);
      await fetchInvestors();
      alert("出资人录入并已创建关联登录账号！");
    } catch (err) {
      alert("录入出资人失败：" + err.message);
    }
  };

  const handleExport = () => {
    const dataToExport = investors.map(inv => ({
      ...inv,
      type: inv.type === "individual" ? "个人投资者" : "机构基金/母基金"
    }));
    exportToExcel(dataToExport, EXPORT_HEADERS_MAP, "出资方列表备份");
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(Object.values(EXPORT_HEADERS_MAP), "出资方导入模板");
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const rawData = await importFromExcel(file, IMPORT_HEADERS_MAP);
      if (!rawData || rawData.length === 0) {
        alert("未能在 Excel 中解析到数据记录！");
        return;
      }

      const validatedData = [];
      const errors = [];
      const existingEmails = investors.map(i => i.email.toLowerCase());
      const existingNames = investors.map(i => i.name.toLowerCase());

      rawData.forEach((row, index) => {
        const rowNum = index + 2;
        const rName = (row.name || "").toString().trim();
        const rEmail = (row.email || "").toString().trim();
        let rType = (row.type || "").toString().trim();
        const rPhone = (row.phone || "").toString().trim();
        const rContact = (row.contact || "").toString().trim();
        const rNote = (row.note || "").toString().trim();

        if (!rName) {
          errors.push(`第 ${rowNum} 行: 出资方名称必填`);
          return;
        }
        if (!rEmail) {
          errors.push(`第 ${rowNum} 行: 对账邮箱必填`);
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(rEmail)) {
          errors.push(`第 ${rowNum} 行: 邮箱格式不正确 (${rEmail})`);
          return;
        }

        if (existingEmails.includes(rEmail.toLowerCase())) {
          errors.push(`第 ${rowNum} 行: 对账邮箱已在系统中存在 (${rEmail})`);
          return;
        }
        if (existingNames.includes(rName.toLowerCase())) {
          errors.push(`第 ${rowNum} 行: 出资方名称已在系统中存在 (${rName})`);
          return;
        }

        if (rType.includes("个人") || rType.toLowerCase().includes("individual")) {
          rType = "individual";
        } else if (rType.includes("机构") || rType.includes("基金") || rType.toLowerCase().includes("fund")) {
          rType = "fund";
        } else {
          rType = "individual";
        }

        validatedData.push({
          name: rName,
          email: rEmail,
          type: rType,
          phone: rPhone,
          contact: rContact || rName,
          note: rNote
        });
      });

      if (errors.length > 0) {
        alert(`导入数据校验失败：\n${errors.join("\n")}`);
        e.target.value = "";
        return;
      }

      const confirmImport = window.confirm(`校验成功！解析出 ${validatedData.length} 条有效记录，确定导入吗？`);
      if (!confirmImport) {
        e.target.value = "";
        return;
      }

      setLoading(true);
      let successCount = 0;

      for (let i = 0; i < validatedData.length; i++) {
        const record = validatedData[i];
        const invId = `inv-${Date.now()}-${i}`;
        const mockUid = `uid-${record.name.toLowerCase().replace(/\s+/g, "")}-${i}`;

        const sql = `
          INSERT INTO investors (id, name, type, email, uid, phone, contact, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await querySQL(sql, [
          invId,
          record.name,
          record.type,
          record.email,
          mockUid,
          record.phone,
          record.contact,
          record.note
        ]);

        const userSql = `
          INSERT INTO users (uid, email, role, investor_id, display_name)
          VALUES (?, ?, 'lp', ?, ?)
        `;
        await querySQL(userSql, [
          mockUid,
          record.email,
          invId,
          record.name
        ]);

        successCount++;
      }

      alert(`成功导入 ${successCount} 个出资方记录，并自动创建关联登录账号！`);
      await fetchInvestors();
    } catch (err) {
      alert("导入失败: " + err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const headers = [
    { key: "name", label: "出资人/机构/资金池", render: (v, item) => (
      item.type === 'pool'
        ? <span style={{ fontWeight: 600, color: "var(--accent-gold)" }}>🏦 {v}</span>
        : <Link to={`/admin/investors/${item.id}`} className="text-link" style={{ fontWeight: 600 }}>{v}</Link>
    )},
    { key: "type", label: "类型", render: (v) => {
      if (v === 'pool') return <Badge text="资金池主体" status="active" />;
      if (v === 'individual') return <Badge text="个人 LPs" status={v} />;
      return <Badge text="机构基金 LPs" status={v} />;
    }},
    { key: "email", label: "登录及对账邮箱", className: "mono", render: (v) => v || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span> },
    { key: "uid", label: "云开发 UID", className: "mono", render: (v) => v || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>未绑定</span> },
    { key: "phone", label: "联系电话" },
    { key: "contact", label: "主要对接人" },
    { key: "note", label: "备注摘要" },
    { 
      key: "actions", 
      label: "操作", 
      render: (_, item) => (
        item.type === 'pool'
          ? <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontStyle: "italic" }}>在资金池管理编辑</span>
          : (
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(item); }} 
              className="btn-secondary" 
              style={{ padding: "4px 8px", fontSize: "0.8rem", height: "auto" }}
            >
              编辑 / 绑定 UID
            </button>
          )
      )
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>出资方管理</h2>
          <p>维护系统内所有资金参与主体，包括个人投资者、外部母基金实体，以及作为项目出资方的内部资金池（🏦 自动同步，不可在此编辑）。</p>
        </div>
      </div>

      <div style={styles.actionRow}>
        <div style={styles.leftActions}>
          <button onClick={handleExport} className="btn-secondary" style={{ gap: "6px" }}>
            <Download size={18} />
            <span>导出备份</span>
          </button>
          <button onClick={handleDownloadTemplate} className="btn-secondary" style={{ gap: "6px" }}>
            <FileSpreadsheet size={18} />
            <span>下载模板</span>
          </button>
          <label className="btn-secondary" style={{ gap: "6px", cursor: "pointer", marginBottom: 0 }}>
            <Upload size={18} />
            <span>导入 Excel</span>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleImport}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary" style={{ gap: "6px" }}>
          <Plus size={18} />
          <span>录入出资方</span>
        </button>
      </div>

      <div className="glass-card no-hover" style={{ padding: "20px" }}>
        <div style={{ display: "flex", gap: "16px", marginBottom: "16px", alignItems: "center" }}>
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="form-input"
            style={{ width: "200px" }}
          >
            <option value="investors">出资人/机构</option>
            <option value="pools">内部资金池</option>
            <option value="all">全部主体</option>
          </select>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            提示：只有当选中全部主体或者出资人/机构时，才可以查看到系统内部同步的资金池作为出资方的情况
          </span>
        </div>

        <DataTable 
          headers={headers} 
          data={paginatedInvestors} 
          emptyMessage={loading ? "加载中..." : "暂无符合条件的出资方"}
        />

        {/* 分页控制栏 */}
        <div style={styles.paginationRow}>
          <div style={styles.paginationLeft}>
            <span>每页显示：</span>
            <select 
              value={pageSize} 
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="form-input"
              style={styles.pageSizeSelect}
            >
              <option value={10}>10 条</option>
              <option value={20}>20 条</option>
              <option value={50}>50 条</option>
            </select>
            <span style={{ marginLeft: "12px", color: "var(--text-secondary)" }}>
              共 {investors.length} 条记录
            </span>
          </div>
          
          {totalPages > 1 && (
            <div style={styles.paginationRight}>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="btn-secondary"
                style={styles.pageBtn}
              >
                上一页
              </button>
              <span style={styles.pageIndicator}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn-secondary"
                style={styles.pageBtn}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="录入出资方信息">
        <form onSubmit={handleCreate} style={styles.form}>
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">出资方名称 *</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：张三 或 招商局母基金二期"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">投资者性质 *</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value)}
                className="form-input"
                style={{ height: "42px" }}
              >
                <option value="individual">个人投资者</option>
                <option value="fund">机构基金/母基金</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">对账/登录邮箱 *</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="如：zhangsan@example.com"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">云开发 Auth UID (选填)</label>
              <input 
                type="text" 
                value={cloudbaseUid}
                onChange={(e) => setCloudbaseUid(e.target.value)}
                placeholder="云开发控制台 UID，不填则自动生成演示 Mock UID"
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">联系电话</label>
              <input 
                type="text" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="如：13800000000"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">核心对接人姓名</label>
              <input 
                type="text" 
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="机构出资人必须填写"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">出资人备注说明</label>
            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="补充资产归属、特殊分成协议等"
              className="form-input"
              rows={2}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认录入</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingInvestor(null); }} title="编辑出资方信息 & 绑定 UID">
        <form onSubmit={handleUpdate} style={styles.form}>
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">出资方名称 *</label>
              <input 
                type="text" 
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="如：张三 或 招商局母基金二期"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">投资者性质 *</label>
              <select 
                value={editType} 
                onChange={(e) => setEditType(e.target.value)}
                className="form-input"
                style={{ height: "42px" }}
              >
                <option value="individual">个人投资者</option>
                <option value="fund">机构基金/母基金</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">对账/登录邮箱 *</label>
              <input 
                type="email" 
                required
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="如：zhangsan@example.com"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">云开发 Auth UID (选填)</label>
              <input 
                type="text" 
                value={editUid}
                onChange={(e) => setEditUid(e.target.value)}
                placeholder="绑定腾讯云开发的 Auth UID (W-xYz...)"
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">联系电话</label>
              <input 
                type="text" 
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="如：13800000000"
                className="form-input"
              />
            </div>

            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">核心对接人姓名</label>
              <input 
                type="text" 
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
                placeholder="主要联系人"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">出资人备注说明</label>
            <textarea 
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="补充说明"
              className="form-input"
              rows={2}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingInvestor(null); }} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">保存修改</button>
          </div>
        </form>
      </Modal>
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
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  leftActions: {
    display: "flex",
    gap: "12px",
    alignItems: "center"
  },
  form: {
    display: "flex",
    flexDirection: "column"
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "16px",
    borderTop: "1px solid var(--border)",
    paddingTop: "16px"
  },
  paginationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "20px",
    paddingTop: "16px",
    borderTop: "1px solid var(--border)"
  },
  paginationLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "var(--text-secondary)",
    fontSize: "0.85rem"
  },
  pageSizeSelect: {
    padding: "4px 8px",
    fontSize: "0.85rem",
    width: "90px",
    height: "32px",
    borderRadius: "4px",
    backgroundColor: "var(--bg-secondary)",
    borderColor: "var(--border)",
    color: "var(--text-primary)"
  },
  paginationRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  pageBtn: {
    padding: "6px 12px",
    fontSize: "0.85rem",
    borderRadius: "4px",
    cursor: "pointer",
    height: "32px",
    display: "flex",
    alignItems: "center"
  },
  pageIndicator: {
    color: "var(--text-primary)",
    fontSize: "0.85rem",
    fontWeight: "500"
  }
};
export default Investors;
