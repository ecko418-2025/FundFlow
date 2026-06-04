import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { usePools } from "../../hooks/usePools";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { useNavigate } from "react-router-dom";
import { Plus, Briefcase, Download, Upload, FileSpreadsheet, Eye, Pencil, Search } from "lucide-react";
import { exportToExcel, importFromExcel, downloadTemplate } from "../../lib/excel";

const EXPORT_HEADERS_MAP = {
  name: "项目名称",
  id: "项目 ID",
  pool_name: "出资来源池名称",
  committed_amount: "计划出资规模",
  status: "立项阶段",
  start_date: "起始日期",
  expected_end_date: "预计结束日期",
  tags: "标签",
  description: "项目详情描述"
};

const IMPORT_HEADERS_MAP = {
  "项目名称": "name",
  "项目 ID": "id",
  "出资来源池名称": "pool_name",
  "计划出资规模": "committed_amount",
  "立项阶段": "status",
  "起始日期": "start_date",
  "预计结束日期": "expected_end_date",
  "标签": "tags",
  "项目详情描述": "description"
};

export function Projects() {
  const navigate = useNavigate();
  const { pools } = usePools();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [status, setStatus] = useState("pre");
  const [committedAmount, setCommittedAmount] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // 编辑项目完整状态
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editProjId, setEditProjId] = useState("");
  const [editProjName, setEditProjName] = useState("");
  const [editProjContractNo, setEditProjContractNo] = useState("");
  const [editProjStatus, setEditProjStatus] = useState("pre");
  const [editProjCommitted, setEditProjCommitted] = useState("");
  const [editProjDesc, setEditProjDesc] = useState("");
  const [editProjTags, setEditProjTags] = useState("");
  const [editProjStartDate, setEditProjStartDate] = useState("");
  const [editProjEndDate, setEditProjEndDate] = useState("");

  const [filterTag, setFilterTag] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [startDateFrom, setStartDateFrom] = useState("");
  const [startDateTo, setStartDateTo] = useState("");

  const [systemTags, setSystemTags] = useState([]);

  const filteredProjects = React.useMemo(() => {
    let result = projects;

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(keyword) || p.id.toLowerCase().includes(keyword));
    }

    if (filterStatus) {
      result = result.filter(p => p.status === filterStatus);
    }

    if (startDateFrom) {
      result = result.filter(p => p.start_date && p.start_date >= startDateFrom);
    }

    if (startDateTo) {
      result = result.filter(p => p.start_date && p.start_date <= startDateTo);
    }

    if (filterTag) {
      result = result.filter(p => {
        if (!p.tags) return false;
        try {
          const parsed = typeof p.tags === "string" ? JSON.parse(p.tags) : p.tags;
          if (Array.isArray(parsed)) {
            return parsed.includes(filterTag);
          }
        } catch(e) {}
        return false;
      });
    }

    return result;
  }, [projects, searchKeyword, filterStatus, startDateFrom, startDateTo, filterTag]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await querySQL(`
        SELECT pr.*, p.name AS pool_name 
        FROM projects pr
        LEFT JOIN pools p ON pr.pool_id = p.id
        ORDER BY pr.created_at DESC
      `);

      const invData = await querySQL(`
        SELECT pi.project_id, i.name 
        FROM project_investors pi 
        JOIN investors i ON pi.investor_id = i.id
      `);

      const invMap = {};
      invData.forEach(inv => {
        if (!invMap[inv.project_id]) invMap[inv.project_id] = [];
        invMap[inv.project_id].push(inv.investor_name || inv.name);
      });

      const settingsData = await querySQL(`SELECT * FROM settings`);
      const tagsSetting = settingsData.find(s => s.key === "system_tags");
      if (tagsSetting) {
        setSystemTags(JSON.parse(tagsSetting.value));
      }

      const processedData = data.map(p => ({
        ...p,
        investors: invMap[p.id] || []
      }));

      setProjects(processedData);
    } catch (err) {
      console.error("加载项目列表失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleOpenNewProject = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    let newId = "";
    let attempts = 0;
    do {
      const random3 = Math.floor(100 + Math.random() * 900);
      newId = `Pro-${dateStr}-${random3}`;
      attempts++;
    } while (projects.some(p => p.id === newId) && attempts < 100);
    
    setProjectId(newId);
    setIsModalOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !projectId || !committedAmount || !startDate || !endDate) {
      alert("请填写全部必填项");
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      alert("结束日期不能早于起始日期！");
      return;
    }

    try {
      const sql = `
        INSERT INTO projects (
          id, pool_id, name, code, status, committed_amount, invested_amount, returned_amount, description, tags, start_date, expected_end_date, contract_no
        ) VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, ?, ?, ?, ?)
      `;
      
      const tags = tagsInput ? JSON.stringify(tagsInput.split(",").map(t => t.trim())) : JSON.stringify([]);

      await querySQL(sql, [
        projectId,
        null,
        name,
        projectId, // also store as code for backward compatibility
        status,
        Number(committedAmount),
        description,
        tags,
        startDate,
        endDate,
        contractNo || ""
      ]);

      setProjectId("");
      setName("");
      setContractNo("");
      setStatus("pre");
      setCommittedAmount("");
      setDescription("");
      setTagsInput("");
      setStartDate("");
      setEndDate("");
      setIsModalOpen(false);
      await fetchProjects();
      alert("新投资组合项目立项登记成功！");
    } catch (err) {
      alert("立项登记失败：" + err.message);
    }
  };

  const handleOpenEditProject = (row, e) => {
    e.stopPropagation();
    setEditingProject(row);
    setEditProjId(row.id);
    setEditProjName(row.name);
    setEditProjContractNo(row.contract_no || "");
    setEditProjStatus(row.status);
    setEditProjCommitted(String(row.committed_amount));
    setEditProjDesc(row.description || "");
    let tagsStr = "";
    if (row.tags) {
      try {
        const parsed = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
        tagsStr = Array.isArray(parsed) ? parsed.join(", ") : row.tags.toString();
      } catch (_) { tagsStr = row.tags.toString(); }
    }
    setEditProjTags(tagsStr);
    setEditProjStartDate(row.start_date ? row.start_date.slice(0, 10) : "");
    setEditProjEndDate(row.expected_end_date ? row.expected_end_date.slice(0, 10) : "");
    setIsEditProjectOpen(true);
  };

  const handleEditProjectSubmit = async (e) => {
    e.preventDefault();
    if (!editProjName || !editProjId || !editProjCommitted || !editProjStartDate || !editProjEndDate) {
      alert("请填写所有必填项");
      return;
    }
    if (editProjStartDate && editProjEndDate && new Date(editProjEndDate) < new Date(editProjStartDate)) {
      alert("结束日期不能早于起始日期！");
      return;
    }
    try {
      const tagsArray = editProjTags ? editProjTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      const sql = `
        UPDATE projects
        SET name = ?, code = ?, status = ?, committed_amount = ?,
            description = ?, tags = ?, start_date = ?, expected_end_date = ?, contract_no = ?
        WHERE id = ?
      `;
      await querySQL(sql, [
        editProjName,
        editProjId, // update code with id too
        editProjStatus,
        Number(editProjCommitted),
        editProjDesc,
        JSON.stringify(tagsArray),
        editProjStartDate || null,
        editProjEndDate || null,
        editProjContractNo || "",
        editingProject.id
      ]);
      setIsEditProjectOpen(false);
      setEditingProject(null);
      await fetchProjects();
      alert("项目信息已更新！");
    } catch (err) {
      alert("更新失败：" + err.message);
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
        start_date: p.start_date ? formatDate(p.start_date) : "",
        expected_end_date: p.expected_end_date ? formatDate(p.expected_end_date) : "",
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
        const rId = (row.id || "").toString().trim();
        const rName = (row.name || "").toString().trim();
        const rPool = (row.pool_name || "").toString().trim();
        const rCommitted = Number(row.committed_amount || 0);
        let rStatus = (row.status || "").toString().trim();
        const rTags = (row.tags || "").toString().trim();
        const rDesc = (row.description || "").toString().trim();

        let formattedStartDate = "";
        let formattedEndDate = "";
        if (row.start_date) {
          const d = new Date(row.start_date);
          if (!isNaN(d.getTime())) formattedStartDate = d.toISOString().slice(0, 10);
        }
        if (row.expected_end_date) {
          const d = new Date(row.expected_end_date);
          if (!isNaN(d.getTime())) formattedEndDate = d.toISOString().slice(0, 10);
        }

        if (!rId) {
          errors.push(`第 ${rowNum} 行: 项目 ID 必填`);
          return;
        }
        if (!rName) {
          errors.push(`第 ${rowNum} 行: 项目名称必填`);
          return;
        }
        if (isNaN(rCommitted) || rCommitted <= 0) {
          errors.push(`第 ${rowNum} 行: 计划出资规模必须是大于 0 的数值`);
          return;
        }
        if (!formattedStartDate) {
          errors.push(`第 ${rowNum} 行: 起始日期必填且必须为有效日期`);
          return;
        }
        if (!formattedEndDate) {
          errors.push(`第 ${rowNum} 行: 预计结束日期必填且必须为有效日期`);
          return;
        }
        if (new Date(formattedEndDate) < new Date(formattedStartDate)) {
          errors.push(`第 ${rowNum} 行: 预计结束日期不能早于起始日期`);
          return;
        }

        if (existingIds.includes(rId.toLowerCase())) {
          errors.push(`第 ${rowNum} 行: 项目 ID 已在系统中存在 (${rId})`);
          return;
        }

        if (rStatus.includes("存续") || rStatus.toLowerCase().includes("active")) {
          rStatus = "active";
        } else if (rStatus.includes("退出") || rStatus.toLowerCase().includes("exited")) {
          rStatus = "exited";
        } else {
          rStatus = "pre";
        }

        const tagsArray = rTags ? rTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
        const poolObj = pools.find(p => p.name === rPool);

        validatedData.push({
          id: rId,
          name: rName,
          poolId: poolObj ? poolObj.id : null,
          committedAmount: rAmt,
          status: rStatus,
          tags: JSON.stringify(tagsArray),
          description: rDesc,
          startDate: formattedStartDate,
          expectedEndDate: formattedEndDate
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

      for (const record of validatedData) {
        const sql = `
          INSERT INTO projects (
            id, pool_id, name, code, status, committed_amount, invested_amount, returned_amount, description, tags, start_date, expected_end_date
          ) VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, ?, ?, ?)
        `;

        await querySQL(sql, [
          record.id,
          record.poolId,
          record.name,
          record.id,
          record.status,
          record.committedAmount,
          record.description,
          record.tags,
          record.startDate,
          record.expectedEndDate
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
    { 
      key: "name", 
      label: "项目名称", 
      summaryRender: (v) => <span style={{ fontWeight: 600, color: "var(--accent-gold)" }}>{v}</span>,
      render: (v, row) => {
        let tags = [];
        try {
          tags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
        } catch(e) {}
        return (
          <div>
            <span style={{ fontWeight: 600 }}>{v}</span>
            {Array.isArray(tags) && tags.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                {tags.map((t, i) => {
                  const category = systemTags.find(cat => cat.tags && cat.tags.includes(t));
                  const color = category ? category.color : "var(--text-secondary)";
                  const bgColor = category ? `${category.color}20` : "var(--bg-tertiary)";
                  const borderColor = category ? `${category.color}40` : "var(--border)";
                  return (
                    <span 
                      key={i} 
                      className="badge" 
                      style={{ 
                        fontSize: '0.65rem', 
                        padding: '2px 6px', 
                        backgroundColor: bgColor, 
                        color: color,
                        border: `1px solid ${borderColor}`,
                        textTransform: 'none' 
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      }
    },
    { key: "id", label: "项目 ID", render: (v) => <span className="mono badge badge-active">{v}</span> },
    { 
      key: "investors", 
      label: "出资方", 
      render: (v, row) => {
        if (!v || v.length === 0) return <span style={{ color: "var(--text-secondary)" }}>-</span>;
        if (v.length > 2) {
          return (
            <span style={{ color: "var(--accent-blue)" }} title={v.join("，")}>
              {v.slice(0, 2).join("，")} 等 {v.length} 方
            </span>
          );
        }
        return <span style={{ color: "var(--accent-blue)" }}>{v.join("，")}</span>;
      } 
    },
    { key: "status", label: "立项状态", render: (v) => {
        const labels = { pre: "投前考察", active: "存续管理", exited: "退出清算" };
        return <Badge text={labels[v] || v} status={v} />;
      }
    },
    { key: "committed_amount", label: "计划投放额", render: (v) => formatCNY(v, false) },
    { key: "invested_amount", label: "已打款金额", render: (v) => formatCNY(v, false) },
    { key: "returned_amount", label: "已回款金额", render: (v) => formatCNY(v, false) },
    { key: "start_date", label: "起始日期", render: (v) => formatDate(v) },
    { 
      key: "expected_end_date", 
      label: "预计结束日期", 
      render: (v) => {
        if (!v) return "-";
        const isExpired = new Date(v) < new Date();
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="mono" style={{ color: isExpired ? "var(--accent-red)" : "inherit" }}>{formatDate(v)}</span>
            {isExpired && <span className="badge badge-danger" style={{ padding: "2px 6px", fontSize: "0.7rem", textTransform: "none" }}>已到期</span>}
          </span>
        );
      }
    },
    { 
      key: "id", 
      label: "操作", 
      align: "right", 
      render: (v, row) => (
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button 
            onClick={(e) => handleOpenEditProject(row, e)}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem", gap: "4px" }}
          >
            <Pencil size={14} />
            <span>编辑</span>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/projects/${v}`);
            }}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem", gap: "4px" }}
          >
            <Eye size={14} />
            <span>详情明细</span>
          </button>
        </div>
      )
    },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>投建项目管理</h2>
          <p>录入实体投资项目组合，并管理其出资方和收支明细。</p>
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
        <button onClick={handleOpenNewProject} className="btn-primary" style={{ gap: "6px" }}>
          <Plus size={18} />
          <span>立项登记</span>
        </button>
      </div>

      <div className="glass-card no-hover" style={{ padding: "16px 20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", backgroundColor: "rgba(9, 13, 26, 0.5)" }}>
        <div className="search-box" style={{ width: "260px" }}>
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="搜索项目名称 / 项目 ID..." 
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="form-input"
            style={{ paddingLeft: "36px" }}
          />
        </div>
        
        <select 
          value={filterStatus} 
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-input"
          style={{ width: "160px" }}
        >
          <option value="">全部立项状态</option>
          <option value="pre">投前考察</option>
          <option value="active">存续管理</option>
          <option value="exited">退出清算</option>
        </select>

        <select 
          value={filterTag} 
          onChange={(e) => setFilterTag(e.target.value)}
          className="form-input"
          style={{ width: "160px" }}
        >
          <option value="">全部标签</option>
          {systemTags.map(cat => (
            <optgroup key={cat.id} label={cat.name}>
              {cat.tags && cat.tags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>起始日期范围：</span>
          <input 
            type="date" 
            value={startDateFrom}
            onChange={(e) => setStartDateFrom(e.target.value)}
            className="form-input"
            style={{ width: "140px" }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>至</span>
          <input 
            type="date" 
            value={startDateTo}
            onChange={(e) => setStartDateTo(e.target.value)}
            className="form-input"
            style={{ width: "140px" }}
          />
        </div>
      </div>

      <div className="glass-card no-hover" style={{ padding: "20px" }}>
        {(() => {
          const totalCommitted = filteredProjects.reduce((sum, p) => sum + (Number(p.committed_amount) || 0), 0);
          const totalInvested = filteredProjects.reduce((sum, p) => sum + (Number(p.invested_amount) || 0), 0);
          const totalReturned = filteredProjects.reduce((sum, p) => sum + (Number(p.returned_amount) || 0), 0);
          const summaryData = {
            name: "总计汇总",
            committed_amount: totalCommitted,
            invested_amount: totalInvested,
            returned_amount: totalReturned
          };

          return (
            <DataTable 
              headers={headers} 
              data={filteredProjects} 
              emptyMessage={loading ? "加载中..." : "暂无符合条件的项目"}
              onRowClick={(row) => navigate(`/admin/projects/${row.id}`)}
              summaryData={summaryData}
            />
          );
        })()}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="新建投资组合项目 (New Portfolio)">
        <form onSubmit={handleCreate} style={styles.form}>
          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">项目 ID *</label>
              <input 
                type="text" 
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="如：Pro-20240101-123"
                className="form-input mono"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={contractNo}
                onChange={(e) => setContractNo(e.target.value)}
                placeholder="如：HT-2024-001"
                className="form-input mono"
              />
            </div>
          </div>

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

          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">运行起始日期 *</label>
              <input 
                type="date" 
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input mono"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">预计结束日期 *</label>
              <input 
                type="date" 
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-input mono"
              />
            </div>
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
            {systemTags.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                {systemTags.map(cat => (
                  <div key={cat.id} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", minWidth: "80px" }}>{cat.name}:</span>
                    {cat.tags && cat.tags.map(tag => {
                      const currentTags = tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);
                      const isSelected = currentTags.includes(tag);
                      return (
                        <span 
                          key={tag} 
                          onClick={() => {
                            if (isSelected) {
                              setTagsInput(currentTags.filter(t => t !== tag).join(", "));
                            } else {
                              setTagsInput([...currentTags, tag].join(", "));
                            }
                          }}
                          className={`badge ${isSelected ? 'badge-active' : ''}`}
                          style={{ 
                            cursor: "pointer", 
                            border: isSelected ? "none" : `1px solid ${cat.color}40`, 
                            backgroundColor: isSelected ? cat.color : "transparent", 
                            color: isSelected ? "#fff" : cat.color 
                          }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <input 
              type="text" 
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="自定义标签用逗号隔开，或者点击上方已有标签快速添加"
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

      {/* 弹窗：编辑项目（完整字段） */}
      <Modal isOpen={isEditProjectOpen} onClose={() => setIsEditProjectOpen(false)} title={`编辑项目：${editingProject?.name || ""}`}>
        <form onSubmit={handleEditProjectSubmit} style={styles.form}>
          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">项目 ID</label>
              <input 
                type="text" 
                disabled
                value={editProjId}
                className="form-input mono"
                style={{ backgroundColor: "var(--background)", cursor: "not-allowed" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={editProjContractNo}
                onChange={(e) => setEditProjContractNo(e.target.value)}
                placeholder="如：HT-2024-001"
                className="form-input mono"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">项目名称 *</label>
            <input type="text" required value={editProjName} onChange={(e) => setEditProjName(e.target.value)} className="form-input" />
          </div>

          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">运行起始日期</label>
              <input type="date" value={editProjStartDate} onChange={(e) => setEditProjStartDate(e.target.value)} className="form-input mono" />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">预计结束日期</label>
              <input type="date" value={editProjEndDate} onChange={(e) => setEditProjEndDate(e.target.value)} className="form-input mono" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">计划出资规模 *</label>
            <AmountInput value={editProjCommitted} onChange={setEditProjCommitted} placeholder="请输入计划出资额（元）" />
          </div>

          <div className="form-group">
            <label className="form-label">立项阶段 *</label>
            <select value={editProjStatus} onChange={(e) => setEditProjStatus(e.target.value)} className="form-input">
              <option value="pre">投前储备阶段 (Pre-investment)</option>
              <option value="active">存续运营阶段 (Active Portfolio)</option>
              <option value="exited">完全退出阶段 (Exited)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">项目分类标签</label>
            {systemTags.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                {systemTags.map(cat => (
                  <div key={cat.id} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", minWidth: "80px" }}>{cat.name}:</span>
                    {cat.tags && cat.tags.map(tag => {
                      const currentTags = editProjTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
                      const isSelected = currentTags.includes(tag);
                      return (
                        <span 
                          key={tag} 
                          onClick={() => {
                            if (isSelected) {
                              setEditProjTags(currentTags.filter(t => t !== tag).join(", "));
                            } else {
                              setEditProjTags([...currentTags, tag].join(", "));
                            }
                          }}
                          className={`badge ${isSelected ? 'badge-active' : ''}`}
                          style={{ 
                            cursor: "pointer", 
                            border: isSelected ? "none" : `1px solid ${cat.color}40`, 
                            backgroundColor: isSelected ? cat.color : "transparent", 
                            color: isSelected ? "#fff" : cat.color 
                          }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <input type="text" value={editProjTags} onChange={(e) => setEditProjTags(e.target.value)} placeholder="自定义标签用逗号隔开，或者点击上方已有标签快速添加" className="form-input" />
          </div>

          <div className="form-group">
            <label className="form-label">项目详情描述</label>
            <textarea value={editProjDesc} onChange={(e) => setEditProjDesc(e.target.value)} className="form-input" rows={3} style={{ resize: "none" }} />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsEditProjectOpen(false)} className="btn-secondary">取消</button>
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
  }
};
export default Projects;
