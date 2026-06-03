import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { usePools } from "../../hooks/usePools";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Plus, Briefcase, Download, Upload, FileSpreadsheet } from "lucide-react";
import { exportToExcel, importFromExcel, downloadTemplate } from "../../lib/excel";

const EXPORT_HEADERS_MAP = {
  name: "项目名称",
  code: "项目唯一编号",
  pool_name: "出资来源池名称",
  committed_amount: "计划出资规模",
  status: "立项阶段",
  tags: "标签",
  description: "项目详情描述"
};

const IMPORT_HEADERS_MAP = {
  "项目名称": "name",
  "项目唯一编号": "code",
  "出资来源池名称": "pool_name",
  "计划出资规模": "committed_amount",
  "立项阶段": "status",
  "标签": "tags",
  "项目详情描述": "description"
};

export function Projects() {
  const { pools } = usePools();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 新增项目表单状态
  const [poolId, setPoolId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("pre");
  const [committedAmount, setCommittedAmount] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await querySQL(`
        SELECT pr.*, p.name AS pool_name 
        FROM projects pr
        JOIN pools p ON pr.pool_id = p.id
        ORDER BY pr.created_at DESC
      `);
      setProjects(data);
    } catch (err) {
      console.error("加载项目列表失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!poolId || !name || !code || !committedAmount) return;
    try {
      const projId = `proj-${Date.now()}`;
      const sql = `
        INSERT INTO projects (
          id, pool_id, name, code, status, committed_amount, invested_amount, returned_amount, description, tags
        ) VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, ?)
      `;
      
      const tags = tagsInput ? JSON.stringify(tagsInput.split(",").map(t => t.trim())) : JSON.stringify([]);

      await querySQL(sql, [
        projId,
        poolId,
        name,
        code,
        status,
        Number(committedAmount),
        description,
        tags
      ]);

      setPoolId("");
      setName("");
      setCode("");
      setStatus("pre");
      setCommittedAmount("");
      setDescription("");
      setTagsInput("");
      setIsModalOpen(false);
      await fetchProjects();
      alert("新投资组合项目立项登记成功！");
    } catch (err) {
      alert("立项登记失败：" + err.message);
    }
  };

  const handleExport = () => {
    const statusLabels = { pre: "投前考察", active: "存续管理", exited: "退出清算" };
    const dataToExport = projects.map(p => {
      let tagsStr = "";
      if (p.tags) {
        try {
          const parsed = typeof p.tags === "string" ? JSON.parse(p.tags) : p.tags;
          if (Array.isArray(parsed)) {
            tagsStr = parsed.join(", ");
          }
        } catch (e) {
          tagsStr = p.tags.toString();
        }
      }
      return {
        ...p,
        status: statusLabels[p.status] || p.status,
        tags: tagsStr
      };
    });
    exportToExcel(dataToExport, EXPORT_HEADERS_MAP, "项目列表备份");
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(Object.values(EXPORT_HEADERS_MAP), "项目导入模板");
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
      const existingCodes = projects.map(p => p.code.toLowerCase());

      rawData.forEach((row, index) => {
        const rowNum = index + 2;
        const rName = (row.name || "").toString().trim();
        const rCode = (row.code || "").toString().trim();
        const rPoolName = (row.pool_name || "").toString().trim();
        const rCommitted = Number(row.committed_amount);
        let rStatus = (row.status || "").toString().trim();
        const rTags = (row.tags || "").toString().trim();
        const rDesc = (row.description || "").toString().trim();

        if (!rName) {
          errors.push(`第 ${rowNum} 行: 项目名称必填`);
          return;
        }
        if (!rCode) {
          errors.push(`第 ${rowNum} 行: 项目唯一编号必填`);
          return;
        }
        if (!rPoolName) {
          errors.push(`第 ${rowNum} 行: 出资来源池名称必填`);
          return;
        }
        if (isNaN(rCommitted) || rCommitted <= 0) {
          errors.push(`第 ${rowNum} 行: 计划出资规模必须是大于 0 的数值`);
          return;
        }

        if (existingCodes.includes(rCode.toLowerCase())) {
          errors.push(`第 ${rowNum} 行: 项目唯一编号已在系统中存在 (${rCode})`);
          return;
        }

        const pool = pools.find(p => p.name.trim() === rPoolName);
        if (!pool) {
          errors.push(`第 ${rowNum} 行: 资金池 "${rPoolName}" 在系统中不存在`);
          return;
        }

        if (rStatus.includes("投前") || rStatus.toLowerCase().includes("pre")) {
          rStatus = "pre";
        } else if (rStatus.includes("存续") || rStatus.toLowerCase().includes("active")) {
          rStatus = "active";
        } else if (rStatus.includes("退出") || rStatus.toLowerCase().includes("exited")) {
          rStatus = "exited";
        } else {
          rStatus = "pre";
        }

        const tagsArray = rTags ? rTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

        validatedData.push({
          name: rName,
          code: rCode,
          poolId: pool.id,
          committedAmount: rCommitted,
          status: rStatus,
          tags: JSON.stringify(tagsArray),
          description: rDesc
        });
      });

      if (errors.length > 0) {
        alert(`导入数据校验失败：\n${errors.join("\n")}`);
        e.target.value = "";
        return;
      }

      const confirmImport = window.confirm(`校验成功！解析出 ${validatedData.length} 条项目记录，确定导入吗？`);
      if (!confirmImport) {
        e.target.value = "";
        return;
      }

      setLoading(true);
      let successCount = 0;

      for (let i = 0; i < validatedData.length; i++) {
        const record = validatedData[i];
        const projId = `proj-${Date.now()}-${i}`;

        const sql = `
          INSERT INTO projects (
            id, pool_id, name, code, status, committed_amount, invested_amount, returned_amount, description, tags
          ) VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, ?)
        `;

        await querySQL(sql, [
          projId,
          record.poolId,
          record.name,
          record.code,
          record.status,
          record.committedAmount,
          record.description,
          record.tags
        ]);

        successCount++;
      }

      alert(`成功导入 ${successCount} 个项目记录！`);
      await fetchProjects();
    } catch (err) {
      alert("导入失败: " + err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const headers = [
    { key: "name", label: "项目名称", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "code", label: "项目编号", render: (v) => <span className="mono badge badge-active">{v}</span> },
    { key: "pool_name", label: "出资来源池子" },
    { key: "status", label: "立项状态", render: (v) => {
        const labels = { pre: "投前考察", active: "存续管理", exited: "退出清算" };
        return <Badge text={labels[v] || v} status={v} />;
      }
    },
    { key: "committed_amount", label: "计划投放额", render: (v) => formatCNY(v, false) },
    { key: "invested_amount", label: "已打款金额", render: (v) => formatCNY(v, false) },
    { key: "returned_amount", label: "已回款金额", render: (v) => formatCNY(v, false) },
    { key: "created_at", label: "登记日期", render: (v) => formatDate(v) }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>投建项目管理</h2>
          <p>录入实体投资项目组合，关联其所属层级的资金池来源。</p>
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
          <span>立项登记</span>
        </button>
      </div>

      <div className="glass-card" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={projects} 
          emptyMessage={loading ? "加载中..." : "暂无已录入的投资项目"}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="新建投资项目登记 (立项)">
        <form onSubmit={handleCreate} style={styles.form}>
          <div className="form-group">
            <label className="form-label">项目名称 *</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：高倍率固态锂电池二期研发"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">项目唯一编号 *</label>
            <input 
              type="text" 
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="如：P-2024-002"
              className="form-input mono"
            />
          </div>

          <div className="form-group">
            <label className="form-label">出资方资金池 *</label>
            <select 
              value={poolId} 
              onChange={(e) => setPoolId(e.target.value)}
              className="form-input"
              required
            >
              <option value="">-- 请选择出资来源池子 --</option>
              {pools.map(p => (
                <option key={p.id} value={p.id}>{p.name} (余额: {formatCNY(p.available_balance, false)})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">计划出资规模 *</label>
            <AmountInput 
              value={committedAmount} 
              onChange={setCommittedAmount}
              placeholder="请输入计划出资额（元）"
            />
          </div>

          <div className="form-group">
            <label className="form-label">立项阶段 *</label>
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
              className="form-input"
            >
              <option value="pre">投前储备阶段 (Pre-investment)</option>
              <option value="active">存续运营阶段 (Active Portfolio)</option>
              <option value="exited">完全退出阶段 (Exited)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">项目分类标签</label>
            <input 
              type="text" 
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="标签用逗号隔开，如：固态电池, 新能源, 早期"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">项目详情描述</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细描述项目主营业务、估值、主要回款约定..."
              className="form-input"
              rows={3}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认立项登记</button>
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
  }
};
export default Projects;
