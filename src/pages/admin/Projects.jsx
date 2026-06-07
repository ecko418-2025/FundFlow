import React, { useState, useEffect } from "react";
import { querySQL } from "../../lib/db";
import { writeAuditLog } from "../../lib/audit";
import { useAuthContext } from "../../context/AuthContext";
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
  "计划出资规模": "committed_amount",
  "立项阶段": "status",
  "起始日期": "start_date",
  "预计结束日期": "expected_end_date",
  "标签": "tags",
  "项目详情描述": "description"
};

export function Projects() {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
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

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, filterStatus, startDateFrom, startDateTo, filterTag]);

  const paginatedProjects = React.useMemo(() => {
    return filteredProjects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredProjects.length / pageSize);

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
        SELECT pi.project_id, COALESCE(i.name, p.name) AS name
        FROM project_investors pi 
        LEFT JOIN investors i ON pi.investor_id = i.id
        LEFT JOIN pools p ON pi.investor_id = p.id
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

      await writeAuditLog({
        actor: currentUser,
        action: "create",
        module: "projects",
        targetType: "project",
        targetId: projectId,
        targetLabel: name,
        status: "success",
        message: "创建项目",
        afterData: { id: projectId, name, status, committedAmount: Number(committedAmount), startDate, endDate, contractNo, tags }
      });

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
      await writeAuditLog({
        actor: currentUser,
        action: "create",
        module: "projects",
        targetType: "project",
        targetId: projectId,
        targetLabel: name,
        status: "failure",
        message: "创建项目失败",
        requestPayload: { projectId, name, status, committedAmount, startDate, endDate, contractNo },
        errorMessage: err.message
      });
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
      await writeAuditLog({
        actor: currentUser,
        action: "update",
        module: "projects",
        targetType: "project",
        targetId: editingProject.id,
        targetLabel: editProjName,
        status: "success",
        message: "更新项目信息",
        beforeData: editingProject,
        afterData: { id: editingProject.id, name: editProjName, status: editProjStatus, committedAmount: Number(editProjCommitted), tags: tagsArray }
      });
      setIsEditProjectOpen(false);
      setEditingProject(null);
      await fetchProjects();
      alert("项目信息已更新！");
    } catch (err) {
      await writeAuditLog({
        actor: currentUser,
        action: "update",
        module: "projects",
        targetType: "project",
        targetId: editingProject?.id,
        targetLabel: editProjName,
        status: "failure",
        message: "更新项目信息失败",
        errorMessage: err.message
      });
      alert("更新失败：" + err.message);
    }
  };

  const handleExport = async () => {
    const statusLabels = { pre: "投前考察", active: "存续管理", exited: "退出清算", archived: "项目归档" };
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
    await writeAuditLog({
      actor: currentUser,
      action: "export",
      module: "projects",
      targetType: "project",
      status: "success",
      message: `导出项目列表 ${dataToExport.length} 条`,
      requestPayload: { count: dataToExport.length, fileName: "项目列表备份" }
    });
  };

  const handleDownloadTemplate = async () => {
    downloadTemplate(Object.values(EXPORT_HEADERS_MAP), "项目导入模板");
    await writeAuditLog({
      actor: currentUser,
      action: "download_template",
      module: "projects",
      targetType: "template",
      targetId: "projects_import",
      targetLabel: "项目导入模板",
      status: "success",
      message: "下载项目导入模板"
    });
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
      const existingIds = projects.map(p => String(p.id || "").toLowerCase());

      rawData.forEach((row, index) => {
        const rowNum = index + 2;
        const rId = (row.id || "").toString().trim();
        const rName = (row.name || "").toString().trim();
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
        } else if (rStatus.includes("归档") || rStatus.toLowerCase().includes("archive")) {
          rStatus = "archived";
        } else {
          rStatus = "pre";
        }

        const tagsArray = rTags ? rTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

        validatedData.push({
          id: rId,
          name: rName,
          poolId: null,
          committedAmount: rCommitted,
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

      await writeAuditLog({
        actor: currentUser,
        action: "import",
        module: "projects",
        targetType: "project",
        status: "success",
        message: `批量导入项目 ${successCount} 条`,
        afterData: validatedData.map(item => ({ id: item.id, name: item.name, status: item.status }))
      });

      alert(`成功导入 ${successCount} 个项目记录！`);
      await fetchProjects();
    } catch (err) {
      await writeAuditLog({
        actor: currentUser,
        action: "import",
        module: "projects",
        targetType: "project",
        status: "failure",
        message: "批量导入项目失败",
        errorMessage: err.message
      });
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
      width: "260px",
      summaryRender: (v) => <span style={{ fontWeight: 600, color: "var(--accent-gold)" }}>{v}</span>,
      render: (v, row) => {
        let tags = [];
        try {
          tags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
        } catch(e) {}
        return (
          <div style={styles.projectNameCell}>
            <span style={styles.projectNameText}>{v}</span>
            {Array.isArray(tags) && tags.length > 0 && (
              <div style={styles.projectTagRow}>
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
                        fontSize: "0.64rem",
                        padding: "2px 5px",
                        backgroundColor: bgColor,
                        color,
                        border: `1px solid ${borderColor}`,
                        textTransform: "none"
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
    { key: "id", label: "项目 ID", width: "160px", render: (v) => <span className="mono badge badge-active" style={styles.projectIdBadge}>{v}</span> },
    {
      key: "status",
      label: "立项状态",
      width: "110px",
      render: (v) => {
        const labels = { pre: "投前考察", active: "存续管理", exited: "退出清算", archived: "项目归档" };
        return <Badge text={labels[v] || v} status={v} />;
      }
    },
    { key: "committed_amount", label: "计划投放额", align: "right", width: "130px", render: (v) => <span className="mono amt-bold">{formatCNY(v, false)}</span> },
    { key: "invested_amount", label: "已打款金额", align: "right", width: "130px", render: (v) => <span className="mono amt-out">{formatCNY(v, false)}</span> },
    { key: "returned_amount", label: "已回款金额", align: "right", width: "130px", render: (v) => <span className="mono amt-in">{formatCNY(v, false)}</span> },
    { key: "start_date", label: "起始日期", width: "110px", render: (v) => <span className="mono">{formatDate(v)}</span> },
    {
      key: "expected_end_date",
      label: "预计结束日期",
      width: "150px",
      render: (v) => {
        if (!v) return "-";
        const isExpired = new Date(v) < new Date();
        return (
          <span style={styles.dateWithFlag}>
            <span className="mono" style={{ color: isExpired ? "var(--accent-red)" : "inherit" }}>{formatDate(v)}</span>
            {isExpired && <span className="badge badge-danger" style={styles.expiredBadge}>已到期</span>}
          </span>
        );
      }
    },
    {
      key: "id",
      label: "操作",
      align: "right",
      width: "96px",
      render: (v, row) => (
        <div style={styles.rowActions}>
          <button
            onClick={(e) => handleOpenEditProject(row, e)}
            className="btn-secondary"
            style={styles.compactActionBtn}
          >
            <Pencil size={14} />
            <span>编辑</span>
          </button>
        </div>
      )
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>投建项目管理</h2>
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
          <option value="archived">项目归档</option>
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

      <div className="glass-card no-hover" style={styles.projectTableCard}>
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
            <>
              <DataTable 
                headers={headers} 
                data={paginatedProjects} 
                emptyMessage={loading ? "加载中..." : "暂无符合条件的项目"}
                onRowClick={(row) => navigate(`/admin/projects/${row.id}`)}
                summaryData={summaryData}
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
                    共 {filteredProjects.length} 条记录
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
            </>
          );
        })()}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="新建投资组合项目 (New Portfolio)">
        <form onSubmit={handleCreate} style={styles.form}>
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">项目 ID *</label>
              <input 
                type="text" 
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="请填写"
                className="form-input mono"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={contractNo}
                onChange={(e) => setContractNo(e.target.value)}
                placeholder="请填写"
                className="form-input mono"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 2, marginBottom: "12px" }}>
              <label className="form-label">项目名称 *</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请填写"
                className="form-input"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">立项阶段 *</label>
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                className="form-input"
                style={{ height: "42px" }}
              >
                <option value="pre">投前储备</option>
                <option value="active">存续运营</option>
                <option value="exited">完全退出</option>
                <option value="archived">项目归档</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">计划出资规模 *</label>
              <AmountInput 
                value={committedAmount} 
                onChange={setCommittedAmount}
                placeholder="请填写"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">运行起始日期 *</label>
              <input 
                type="date" 
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input mono"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
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

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label" style={{ marginBottom: "4px" }}>项目分类标签</label>
            {systemTags.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "6px" }}>
                {systemTags.map(cat => (
                  <div key={cat.id} style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", minWidth: "70px" }}>{cat.name}:</span>
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
                            fontSize: "0.75rem",
                            padding: "2px 6px",
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
              placeholder="请填写"
              className="form-input"
              style={{ height: "36px", fontSize: "0.85rem" }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">项目详情描述</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请填写"
              className="form-input"
              rows={2}
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
          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">项目 ID</label>
              <input 
                type="text" 
                disabled
                value={editProjId}
                className="form-input mono"
                style={{ backgroundColor: "var(--background)", cursor: "not-allowed" }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
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

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 2, marginBottom: "12px" }}>
              <label className="form-label">项目名称 *</label>
              <input type="text" required value={editProjName} onChange={(e) => setEditProjName(e.target.value)} className="form-input" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">立项阶段 *</label>
              <select value={editProjStatus} onChange={(e) => setEditProjStatus(e.target.value)} className="form-input" style={{ height: "42px" }}>
                <option value="pre">投前储备阶段</option>
                <option value="active">存续运营阶段</option>
                <option value="exited">完全退出阶段</option>
                <option value="archived">项目归档阶段</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">计划出资规模 *</label>
              <AmountInput value={editProjCommitted} onChange={setEditProjCommitted} placeholder="请输入计划出资额（元）" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">运行起始日期</label>
              <input type="date" value={editProjStartDate} onChange={(e) => setEditProjStartDate(e.target.value)} className="form-input mono" />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: "12px" }}>
              <label className="form-label">预计结束日期</label>
              <input type="date" value={editProjEndDate} onChange={(e) => setEditProjEndDate(e.target.value)} className="form-input mono" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label" style={{ marginBottom: "4px" }}>项目分类标签</label>
            {systemTags.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "6px" }}>
                {systemTags.map(cat => (
                  <div key={cat.id} style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-secondary)", minWidth: "70px" }}>{cat.name}:</span>
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
                            fontSize: "0.75rem",
                            padding: "2px 6px",
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
              value={editProjTags} 
              onChange={(e) => setEditProjTags(e.target.value)} 
              placeholder="自定义标签用逗号隔开，或者点击上方已有标签快速添加" 
              className="form-input" 
              style={{ height: "36px", fontSize: "0.85rem" }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "12px" }}>
            <label className="form-label">项目详情描述</label>
            <textarea value={editProjDesc} onChange={(e) => setEditProjDesc(e.target.value)} className="form-input" rows={2} style={{ resize: "none" }} />
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
    justifydynamiccontent: "flex-end",
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
  },
  projectTableCard: {
    padding: "16px",
    overflow: "hidden"
  },
  projectNameCell: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0
  },
  projectNameText: {
    fontWeight: 700,
    color: "var(--text-primary)",
    lineHeight: 1.25
  },
  projectTagRow: {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap"
  },
  projectIdBadge: {
    maxWidth: "150px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    borderRadius: "5px",
    textTransform: "none"
  },
  dateWithFlag: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap"
  },
  expiredBadge: {
    padding: "2px 6px",
    fontSize: "0.68rem",
    textTransform: "none",
    borderRadius: "5px"
  },
  rowActions: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end"
  },
  compactActionBtn: {
    padding: "6px 10px",
    fontSize: "0.78rem",
    gap: "4px",
    borderRadius: "6px"
  }
};
export default Projects;
