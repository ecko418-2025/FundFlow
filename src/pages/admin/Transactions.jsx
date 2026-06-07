import React, { useState, useEffect } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { useTransactions } from "../../hooks/useTransactions";
import { usePools } from "../../hooks/usePools";
import { querySQL } from "../../lib/db";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Plus, DollarSign, Download, Upload, FileSpreadsheet, Trash2, Search, Check, XCircle } from "lucide-react";
import { exportToExcel, importFromExcel, downloadTemplate } from "../../lib/excel";
import { writeAuditLog } from "../../lib/audit";

const EXPORT_HEADERS_MAP = {
  date: "交易日期",
  pool_name: "涉及资金池名称",
  type: "流水类型",
  amount: "发生金额",
  investor_name: "对应出资人名称",
  related_pool_name: "关联资金池名称",
  project_name: "对应关联项目名称",
  reference_no: "记账凭证编号",
  description: "交易摘要说明"
};

const IMPORT_HEADERS_MAP = {
  "交易日期": "date",
  "涉及资金池名称": "pool_name",
  "流水类型": "type",
  "发生金额": "amount",
  "对应出资人名称": "investor_name",
  "关联资金池名称": "related_pool_name",
  "对应关联项目名称": "project_name",
  "记账凭证编号": "reference_no",
  "交易摘要说明": "description"
};

const TX_TYPE_ALIASES = {
  capital_call: "capital_call",
  "实缴打款": "capital_call",
  "实缴打款(入)": "capital_call",
  investment: "investment",
  "项目投资": "investment",
  "项目投资(出)": "investment",
  pool_investment: "pool_investment",
  "母池注资": "pool_investment",
  "母池注资(出)": "pool_investment",
  return: "return",
  "项目回款": "return",
  "项目回款(入)": "return",
  distribution: "distribution",
  "收益分红": "distribution",
  "收益分红(出)": "distribution",
  fee: "fee",
  "管理费": "fee",
  "管理费/支出": "fee",
  adjustment: "adjustment",
  "人工核校": "adjustment"
};

export function Transactions() {
  const { currentUser } = useAuthContext();
  const { getTransactions, createTransaction, deleteTransaction, approveTransaction, rejectTransaction } = useTransactions();
  const { pools } = usePools();
  
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterType, setFilterType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 记账表单状态
  const [txTab, setTxTab] = useState("pool_in"); // 'pool_in', 'invest_out', 'project_return', 'pool_liquidation'
  
  // 新的一进一出关联实体状态
  const [sourceEntity, setSourceEntity] = useState(""); 
  const [targetEntity, setTargetEntity] = useState("");
  const [searchSource, setSearchSource] = useState(""); 
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); 

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  // 下拉辅助数据
  const [investors, setInvestors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allPoolMembers, setAllPoolMembers] = useState([]);
  const [allProjectInvestors, setAllProjectInvestors] = useState([]);
  const [allPoolInvestments, setAllPoolInvestments] = useState([]);

  const filteredSourceOptions = React.useMemo(() => {
    if (txTab !== "pool_in") return { pools: [], investors: [] };
    const term = searchSource.toLowerCase().trim();
    
    // 1. 内部资金池 (母池)
    const poolsMatches = pools
      .filter(p => p.id !== targetEntity)
      .filter(p => !term || p.name.toLowerCase().includes(term))
      .map(p => ({ 
        value: `pool:${p.id}`, 
        label: p.name, 
        icon: '🏦',
        sub: `可用: ${formatCNY(p.available_balance, false)}`,
        group: '上级母池资金划拨'
      }));

    // 2. 全量出资人 (LP)
    const investorMatches = investors
      .filter(i => !term || i.name.toLowerCase().includes(term))
      .map(i => ({ 
        value: `investor:${targetEntity}:${i.id}`, 
        label: i.name,
        icon: i.type === 'individual' ? '👤' : '🏢',
        sub: i.type === 'individual' ? '个人 LP' : '机构 LP',
        group: '全量出资人 (支持自动登记)'
      }));

    return { pools: poolsMatches, investors: investorMatches };
  }, [txTab, pools, investors, targetEntity, searchSource]);

  const [customType, setCustomType] = useState("capital_call");

  const txTabOptions = [
    { key: "pool_in", label: "资金入池" },
    { key: "invest_out", label: "项目投放" },
    { key: "project_return", label: "项目回款" },
    { key: "pool_liquidation", label: "收益分配" }
  ];

  const selectedSourceLabel = React.useMemo(() => {
    if (!sourceEntity) return "";
    if (sourceEntity.startsWith("pool:")) {
      const poolId = sourceEntity.split(":")[1];
      return pools.find(p => p.id === poolId)?.name || sourceEntity;
    }
    if (sourceEntity.startsWith("investor:")) {
      const investorId = sourceEntity.split(":")[2];
      return investors.find(i => i.id === investorId)?.name || sourceEntity;
    }
    return sourceEntity;
  }, [sourceEntity, pools, investors]);

  const projectInvestorOptions = React.useMemo(() => {
    const projectId = txTab === "project_return" ? sourceEntity : targetEntity;
    if (!projectId) return [];
    return allProjectInvestors
      .filter(pi => pi.project_id === projectId)
      .map(pi => ({
        value: pi.investor_type === "pool" ? `pool:${pi.investor_id}` : `investor:null:${pi.investor_id}`,
        label: pi.investor_name,
        sub: pi.investor_type === "pool" ? "资金池出资方" : "直接出资方"
      }));
  }, [allProjectInvestors, sourceEntity, targetEntity, txTab]);

  const poolMemberOptions = React.useMemo(() => {
    if (!sourceEntity) return [];
    return allPoolMembers
      .filter(pm => pm.pool_id === sourceEntity)
      .map(pm => ({
        value: pm.investor_type === "pool" ? `pool:${pm.investor_id}` : `investor:${sourceEntity}:${pm.investor_id}`,
        label: pm.investor_name,
        sub: pm.investor_type === "pool" ? "关联资金池" : "出资人"
      }));
  }, [allPoolMembers, sourceEntity]);

  useEffect(() => {
    if (txTab === "pool_in") {
      setCustomType("capital_call");
    } else if (txTab === "invest_out") {
      setCustomType("investment");
    } else if (txTab === "project_return") {
      setCustomType("return");
    } else if (txTab === "pool_liquidation") {
      setCustomType("distribution");
    }
  }, [txTab, sourceEntity, targetEntity]);

  useEffect(() => {
    setSourceEntity("");
    setTargetEntity("");
    setSearchSource("");
    setIsDropdownOpen(false);
  }, [txTab]);

  const fetchTxs = async () => {
    setLoading(true);
    try {
      const data = await getTransactions();
      setTxs(data);
    } catch (err) {
      console.error("加载流水失败", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDropdownData = async () => {
    try {
      const invs = await querySQL("SELECT id, name, type FROM investors");
      setInvestors(invs);
      const projs = await querySQL("SELECT id, name, status FROM projects");
      setProjects(projs);
      const allMembers = await querySQL(`
        SELECT pm.pool_id, pm.investor_id, pm.called_amount, p.name AS pool_name, i.name AS investor_name, i.type AS investor_type
        FROM pool_members pm
        JOIN pools p ON pm.pool_id = p.id
        JOIN investors i ON pm.investor_id = i.id
        WHERE pm.status = 'active'
      `);
      setAllPoolMembers(allMembers || []);
      
      const allProjInvs = await querySQL(`
        SELECT pi.project_id, pi.investor_id, pi.invested_amount, 
               COALESCE(i.name, p.name) AS investor_name, 
               COALESCE(i.type, 'pool') AS investor_type 
        FROM project_investors pi 
        LEFT JOIN investors i ON pi.investor_id = i.id
        LEFT JOIN pools p ON pi.investor_id = p.id
      `);
      setAllProjectInvestors(allProjInvs || []);

      const allPoolInvs = await querySQL(`
        SELECT pm.investor_id AS parent_pool_id, pm.pool_id AS child_pool_id, pm.called_amount AS invested_amount, p.name AS parent_pool_name 
        FROM pool_members pm 
        JOIN pools p ON pm.investor_id = p.id
        WHERE pm.status = 'active'
      `);
      setAllPoolInvestments(allPoolInvs || []);
    } catch (err) {
      console.error("加载下拉辅助数据失败", err);
    }
  };

  useEffect(() => {
    fetchTxs();
    loadDropdownData();
  }, []);

  const getDirectionByType = (t) => {
    const map = {
      capital_call: "in",
      investment: "out",
      pool_investment: "out",
      return: "in",
      distribution: "out",
      fee: "out",
      adjustment: "in"
    };
    return map[t] || "in";
  };

  const handleExport = async () => {
    exportToExcel(txs, EXPORT_HEADERS_MAP, "流水备份");
    await writeAuditLog({
      actor: currentUser,
      action: "export",
      module: "transactions",
      targetType: "transaction",
      status: "success",
      message: `导出资金流水 ${txs.length} 条`,
      requestPayload: { count: txs.length, fileName: "流水备份" }
    });
  };

  const handleDownloadTemplate = async () => {
    downloadTemplate(Object.keys(IMPORT_HEADERS_MAP), "核心流水账本");
    await writeAuditLog({
      actor: currentUser,
      action: "download_template",
      module: "transactions",
      targetType: "template",
      targetId: "transactions_import",
      targetLabel: "核心流水账本导入模板",
      status: "success",
      message: "下载资金流水导入模板"
    });
  };

  const normalizeImportDate = (value) => {
    if (!value) return "";
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === "number") {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
      return excelEpoch.toISOString().slice(0, 10);
    }
    const text = value.toString().trim().replace(/\//g, "-");
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return text;
  };

  const findByName = (list, name) => {
    const text = (name || "").toString().trim();
    if (!text) return null;
    return list.find(item => item.name === text) || list.find(item => item.name?.toLowerCase() === text.toLowerCase()) || null;
  };

  const normalizeImportType = (value) => {
    const text = (value || "").toString().trim();
    return TX_TYPE_ALIASES[text] || TX_TYPE_ALIASES[text.toLowerCase()] || "";
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const rawData = await importFromExcel(file, IMPORT_HEADERS_MAP);
      if (!rawData || rawData.length === 0) {
        alert("未能在 Excel 中解析到流水记录！");
        return;
      }

      const txStatus = currentUser?.role === "operator" ? "pending" : "approved";
      const validatedData = [];
      const errors = [];

      rawData.forEach((row, index) => {
        const rowNum = index + 2;
        const type = normalizeImportType(row.type);
        const amountValue = Number(row.amount);
        const txDate = normalizeImportDate(row.date);
        const poolName = (row.pool_name || "").toString().trim();
        const investorName = (row.investor_name || "").toString().trim();
        const relatedPoolName = (row.related_pool_name || "").toString().trim();
        const projectName = (row.project_name || "").toString().trim();

        if (!type) {
          errors.push(`第 ${rowNum} 行: 流水类型无法识别`);
          return;
        }
        if (!txDate) {
          errors.push(`第 ${rowNum} 行: 交易日期必填`);
          return;
        }
        if (isNaN(amountValue) || amountValue <= 0) {
          errors.push(`第 ${rowNum} 行: 发生金额必须是大于 0 的数值`);
          return;
        }

        const poolObj = findByName(pools, poolName);
        const investorObj = findByName(investors, investorName);
        const relatedPoolObj = findByName(pools, relatedPoolName);
        const projectObj = findByName(projects, projectName);

        let poolId = poolObj?.id || null;
        let projectId = projectObj?.id || null;
        let investorId = investorObj?.id || null;
        let relatedPoolId = relatedPoolObj?.id || null;

        if (type === "capital_call") {
          if (!poolId) errors.push(`第 ${rowNum} 行: 实缴打款必须填写已存在的涉及资金池名称`);
          if (!investorId && relatedPoolObj) investorId = relatedPoolObj.id;
          if (!investorId) errors.push(`第 ${rowNum} 行: 实缴打款必须填写已存在的对应出资人名称，或在关联资金池名称中填写母池`);
        } else if (type === "investment") {
          if (!projectId) errors.push(`第 ${rowNum} 行: 项目投资必须填写已存在的对应关联项目名称`);
          if (!poolId && !investorId) errors.push(`第 ${rowNum} 行: 项目投资必须填写出账资金池名称或直接出资人名称`);
          if (poolId && !investorId) investorId = poolId;
        } else if (type === "pool_investment") {
          if (!poolId) errors.push(`第 ${rowNum} 行: 母池注资必须填写出账资金池名称`);
          if (!relatedPoolId) errors.push(`第 ${rowNum} 行: 母池注资必须在关联资金池名称中填写收款资金池`);
        } else if (type === "return") {
          if (!projectId) errors.push(`第 ${rowNum} 行: 项目回款必须填写已存在的对应关联项目名称`);
          if (!poolId && !investorId) errors.push(`第 ${rowNum} 行: 项目回款必须填写收款资金池名称或出资人名称`);
          if (poolId && !investorId) investorId = poolId;
        } else if (type === "distribution") {
          if (!poolId) errors.push(`第 ${rowNum} 行: 收益分红必须填写出账资金池名称`);
          if (!investorId && relatedPoolObj) investorId = relatedPoolObj.id;
          if (!investorId) errors.push(`第 ${rowNum} 行: 收益分红必须填写收款出资人名称，或在关联资金池名称中填写收款资金池`);
        } else if (!poolId) {
          errors.push(`第 ${rowNum} 行: 该流水类型必须填写涉及资金池名称`);
        }

        if (errors.length > 0 && errors[errors.length - 1].startsWith(`第 ${rowNum} 行`)) return;

        validatedData.push({
          poolId,
          projectId,
          investorId,
          relatedPoolId,
          type,
          direction: getDirectionByType(type),
          amount: amountValue,
          date: txDate,
          description: row.description || "",
          referenceNo: row.reference_no || "",
          createdBy: currentUser?.uid || "admin",
          actor: currentUser,
          status: txStatus
        });
      });

      if (errors.length > 0) {
        alert(`导入数据校验失败：\n${errors.join("\n")}`);
        return;
      }

      const confirmImport = window.confirm(`校验成功！解析出 ${validatedData.length} 条流水，确定导入吗？`);
      if (!confirmImport) return;

      setLoading(true);
      let successCount = 0;
      for (const record of validatedData) {
        await createTransaction(record);
        successCount++;
      }

      await writeAuditLog({
        actor: currentUser,
        action: "import",
        module: "transactions",
        targetType: "transaction",
        status: "success",
        message: txStatus === "pending"
          ? `批量提交资金流水 ${successCount} 条（待审核）`
          : `批量导入资金流水 ${successCount} 条（已生效）`,
        afterData: { count: successCount, status: txStatus },
        requestPayload: { count: validatedData.length, status: txStatus }
      });

      await fetchTxs();
      alert(txStatus === "pending" ? `成功提交 ${successCount} 条流水，请等待管理员审核生效。` : `成功导入 ${successCount} 条流水！`);
    } catch (err) {
      await writeAuditLog({
        actor: currentUser,
        action: "import",
        module: "transactions",
        targetType: "transaction",
        status: "failure",
        message: "批量导入资金流水失败",
        requestPayload: { fileName: file?.name || "" },
        errorMessage: err.message
      });
      alert("导入失败：" + err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    let resolvedType, finalPoolId, finalProjectId, finalInvestorId, finalRelatedPoolId;

    const txStatus = currentUser?.role === 'operator' ? 'pending' : 'approved';

    if (txTab === "pool_in") {
      if (!targetEntity) return alert("请选择进账资金池");
      if (!sourceEntity) return alert("请选择出账方");
      finalPoolId = targetEntity; 
      if (sourceEntity.startsWith('pool:')) {
        resolvedType = "capital_call";
        finalInvestorId = sourceEntity.split(':')[1];
      } else if (sourceEntity.startsWith('investor:')) {
        resolvedType = "capital_call";
        finalInvestorId = sourceEntity.split(':')[2];
      }
    } else if (txTab === "invest_out") {
      if (!sourceEntity || !targetEntity) return alert("必填项缺失");
      finalProjectId = targetEntity;
      resolvedType = "investment";
      if (sourceEntity.startsWith('pool:')) {
        finalPoolId = sourceEntity.split(':')[1];
        finalInvestorId = finalPoolId;
      } else if (sourceEntity.startsWith('investor:')) {
        const parts = sourceEntity.split(':');
        finalPoolId = parts[1] === "null" ? null : parts[1];
        finalInvestorId = parts[2];
      }
    } else if (txTab === "project_return") {
      if (!sourceEntity || !targetEntity) return alert("必填项缺失");
      finalProjectId = sourceEntity;
      resolvedType = "return";
      if (targetEntity.startsWith('pool:')) {
        finalPoolId = targetEntity.split(':')[1];
        finalInvestorId = finalPoolId;
      } else if (targetEntity.startsWith('investor:')) {
        const parts = targetEntity.split(':');
        finalPoolId = parts[1] === "null" ? null : parts[1];
        finalInvestorId = parts[2];
      }
    } else if (txTab === "pool_liquidation") {
      if (!sourceEntity || !targetEntity) return alert("必填项缺失");
      finalPoolId = sourceEntity; 
      if (targetEntity.startsWith('pool:')) {
        resolvedType = "pool_investment";
        finalRelatedPoolId = targetEntity.split(':')[1];
      } else if (targetEntity.startsWith('investor:')) {
        resolvedType = "distribution";
        finalInvestorId = targetEntity.split(':')[2];
      }
    }

    if (!finalPoolId || !amount || !date) return alert("信息不完整");

    try {
      const resolvedTypeToUse = customType || resolvedType;
      const direction = getDirectionByType(resolvedTypeToUse);
      await createTransaction({
        poolId: finalPoolId,
        projectId: finalProjectId || null,
        investorId: finalInvestorId || null,
        relatedPoolId: finalRelatedPoolId || null,
        type: resolvedTypeToUse,
        direction,
        amount: Number(amount),
        date,
        description,
        referenceNo,
        createdBy: currentUser?.uid || "admin",
        actor: currentUser,
        status: txStatus
      });

      setSourceEntity(""); setTargetEntity(""); setSearchSource("");
      setIsDropdownOpen(false); setAmount(""); setDescription(""); setReferenceNo("");
      setIsModalOpen(false);
      await fetchTxs();
      alert(txStatus === 'pending' ? "流水已录入，请等待管理员审核生效。" : "录入成功！");
    } catch (err) {
      alert("录入失败：" + err.message);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm("确定核准通过这笔流水吗？")) return;
    try {
      const result = await approveTransaction(id, currentUser);
      const count = result?.approvedIds?.length || 1;
      alert(count > 1 ? `审核通过！同组 ${count} 笔资金池转款流水已同步生效。` : "审核通过！");
      await fetchTxs();
    } catch (err) { alert("审批失败: " + err.message); }
  };

  const handleReject = async (id) => {
    if (!window.confirm("确定要驳回这笔流水吗？")) return;
    try {
      const result = await rejectTransaction(id, currentUser);
      const count = result?.rejectedIds?.length || 1;
      alert(count > 1 ? `已驳回！同组 ${count} 笔资金池转款流水已同步驳回。` : "已驳回。");
      await fetchTxs();
    } catch (err) { alert("驳回失败: " + err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("确定要彻底删除并撤销这笔流水产生的资金影响吗？")) return;
    try {
      const result = await deleteTransaction(id, currentUser);
      const count = result?.deletedIds?.length || 1;
      alert(count > 1 ? `删除成功！同组 ${count} 笔资金池转款流水已同步删除，相关余额已自动回滚。` : "删除成功，相关余额已自动回滚。");
      await fetchTxs();
    } catch (err) { alert("删除失败：" + err.message); }
  };

  const getSourceName = (row) => {
    if (row.type === "capital_call") return row.investor_name || "";
    if (row.type === "investment") return row.investor_name || row.pool_name || "";
    if (row.type === "pool_investment") return row.pool_name || "";
    if (row.type === "return") return row.project_name || "";
    if (row.type === "distribution") return row.pool_name || "";
    return row.direction === "in" ? "外部来源" : (row.pool_name || "");
  };

  const getTargetName = (row) => {
    if (row.type === "capital_call") return row.pool_name || "";
    if (row.type === "investment") return row.project_name || "";
    if (row.type === "pool_investment") return row.related_pool_name || "";
    if (row.type === "return") return row.investor_name || row.pool_name || "";
    if (row.type === "distribution") return row.investor_name || row.pool_name || "";
    return row.direction === "in" ? (row.pool_name || "") : "外部去向";
  };

  const filteredTxs = React.useMemo(() => {
    let result = txs;
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      result = result.filter(t => 
        (t.reference_no && t.reference_no.toLowerCase().includes(kw)) ||
        (t.description && t.description.toLowerCase().includes(kw)) ||
        (getSourceName(t).toLowerCase().includes(kw)) ||
        (getTargetName(t).toLowerCase().includes(kw))
      );
    }
    if (filterType) result = result.filter(t => t.type === filterType);
    if (dateFrom) result = result.filter(t => t.date && t.date >= dateFrom);
    if (dateTo) result = result.filter(t => t.date && t.date <= dateTo);
    return result;
  }, [txs, searchKeyword, filterType, dateFrom, dateTo]);

  const paginatedTxs = React.useMemo(() => {
    return filteredTxs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredTxs, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTxs.length / pageSize);

  const headers = [
    { key: "id", label: "流水编号", render: (v) => <span className="mono" style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{v}</span> },
    { key: "date", label: "发生日期", render: (v) => formatDate(v) },
    { key: "sourceName", label: "出账方", render: (_, row) => <span style={{ fontWeight: 600 }}>{getSourceName(row)}</span> },
    { key: "targetName", label: "进账方", render: (_, row) => <span style={{ fontWeight: 600 }}>{getTargetName(row)}</span> },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => {
        const typeMap = { capital_call: "实缴打款(入)", investment: "项目投资(出)", pool_investment: "母池注资(出)", return: "项目回款(入)", distribution: "收益分红(出)", fee: "管理费/支出", adjustment: "人工核校" };
        const badgeStatus = { capital_call: "warning", investment: "danger", pool_investment: "danger", return: "success", distribution: "success" }[v] || "default";
        return <Badge text={typeMap[v] || v} status={badgeStatus} />;
      }
    },
    { key: "amount", label: "金额", align: "right", render: (v, row) => <span className={`mono amt-bold ${row.direction === 'in' ? 'amt-in' : 'amt-out'}`}>{row.direction === 'in' ? '+' : '-'}{formatCNY(v, false)}</span> },
    { key: "reference_no", label: "凭证号", className: "mono" },
    { key: "status", label: "审核状态", render: (v) => {
        const map = { pending: { text: "待审核 ⏳", status: "warning" }, approved: { text: "已生效 ✅", status: "active" }, rejected: { text: "已驳回 ❌", status: "exited" } };
        const item = map[v] || { text: v, status: "default" };
        return <Badge text={item.text} status={item.status} />;
    }},
    {
      key: "actions", label: "操作", align: "center",
      render: (_, row) => {
        const isAdmin = currentUser?.role === "admin";
        if (row.status === 'pending' && isAdmin) {
          return (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => handleApprove(row.id)} className="btn-primary" style={{ padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "var(--accent-green)", borderColor: "var(--accent-green)" }}><Check size={14} /></button>
              <button onClick={() => handleReject(row.id)} className="btn-secondary" style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--accent-red)" }}><XCircle size={14} /></button>
            </div>
          );
        }
        if (isAdmin || (row.status === 'pending' && row.created_by === currentUser?.uid)) {
          return <button onClick={() => handleDelete(row.id)} className="btn-secondary" style={{ color: "var(--accent-red)", padding: "4px 8px" }}><Trash2 size={14} /></button>;
        }
        return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>受限</span>;
      }
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}><h2>核心资金流水账本</h2></div>
      <div style={styles.actionRow}>
        <div style={styles.leftActions}>
          <button onClick={handleExport} className="btn-secondary"><Download size={18} /><span>导出</span></button>
          <button onClick={handleDownloadTemplate} className="btn-secondary"><FileSpreadsheet size={18} /><span>模板</span></button>
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
        <button onClick={() => setIsModalOpen(true)} className="btn-primary"><Plus size={18} /><span>记账录入</span></button>
      </div>

      <div className="glass-card no-hover" style={{ padding: "16px 20px", display: "flex", gap: "16px", alignItems: "center" }}>
        <input type="text" placeholder="搜索关键词..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} className="form-input" style={{ width: "250px" }} />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="form-input" style={{ width: "180px" }}>
          <option value="">全部类型</option>
          <option value="capital_call">实缴打款</option>
          <option value="investment">项目投资</option>
          <option value="pool_investment">母池注资</option>
          <option value="return">项目回款</option>
        </select>
      </div>

      <div className="glass-card no-hover" style={{ padding: "20px" }}>
        <DataTable headers={headers} data={paginatedTxs} emptyMessage="暂无流水" />
        <div style={styles.paginationRow}>
          <div style={styles.paginationLeft}>
            <span>每页显示：</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="form-input" style={styles.pageSizeSelect}>
              <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
            </select>
            <span>共 {filteredTxs.length} 条</span>
          </div>
          {totalPages > 1 && (
            <div style={styles.paginationRight}>
              <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="btn-secondary">上一页</button>
              <span>{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="btn-secondary">下一页</button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="财务流水录入" maxWidth="800px" className="transaction-entry-modal">
        <form onSubmit={handleCreate} className="transaction-entry-form">
          <div style={styles.formTabs}>
            {txTabOptions.map(tab => (
              <button
                key={tab.key}
                type="button"
                className={txTab === tab.key ? "btn-primary" : "btn-secondary"}
                onClick={() => setTxTab(tab.key)}
                style={styles.formTabBtn}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {currentUser?.role === "operator" && (
            <div style={styles.pendingNotice}>
              经办员提交的流水将进入待审核状态，管理员核准后才会影响余额、项目金额和出资比例。
            </div>
          )}

          <div style={styles.formGrid}>
            {txTab === "pool_in" && (
              <>
                <div className="form-group" style={styles.fullWidth}>
                  <label className="form-label">进账资金池</label>
                  <select value={targetEntity} onChange={e => setTargetEntity(e.target.value)} className="form-input" required>
                    <option value="">请选择资金入账的目标资金池</option>
                    {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="form-group" style={styles.fullWidth}>
                  <label className="form-label">资金来源</label>
                  <div style={{ position: "relative" }}>
                    <button type="button" className="form-input" onClick={() => setIsDropdownOpen(!isDropdownOpen)} style={styles.entityPicker}>
                      <span>{selectedSourceLabel || "搜索并选择出账方 / 出资人 / 上级母池"}</span>
                      <Search size={16} color="var(--text-secondary)" />
                    </button>
                    {isDropdownOpen && (
                      <div className="glass-card" style={styles.dropdownPanel}>
                        <input autoFocus placeholder="输入名称搜索..." value={searchSource} onChange={e => setSearchSource(e.target.value)} className="form-input" onClick={e => e.stopPropagation()} />
                        <div style={styles.dropdownList}>
                          {[...filteredSourceOptions.pools, ...filteredSourceOptions.investors].map(opt => (
                            <button key={opt.value} type="button" onClick={() => { setSourceEntity(opt.value); setIsDropdownOpen(false); }} style={styles.optionRow}>
                              <span>{opt.icon} {opt.label}</span>
                              <small style={styles.optionSub}>{opt.sub}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {txTab === "invest_out" && (
              <>
                <div className="form-group">
                  <label className="form-label">投资项目</label>
                  <select value={targetEntity} onChange={e => { setTargetEntity(e.target.value); setSourceEntity(""); }} className="form-input" required>
                    <option value="">请选择被投项目</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">出账方</label>
                  <select value={sourceEntity} onChange={e => setSourceEntity(e.target.value)} className="form-input" required disabled={!targetEntity}>
                    <option value="">{targetEntity ? "请选择项目出资方" : "请先选择项目"}</option>
                    {projectInvestorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label} - {opt.sub}</option>)}
                  </select>
                </div>
              </>
            )}

            {txTab === "project_return" && (
              <>
                <div className="form-group">
                  <label className="form-label">回款项目</label>
                  <select value={sourceEntity} onChange={e => { setSourceEntity(e.target.value); setTargetEntity(""); }} className="form-input" required>
                    <option value="">请选择产生回款的项目</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">收款方</label>
                  <select value={targetEntity} onChange={e => setTargetEntity(e.target.value)} className="form-input" required disabled={!sourceEntity}>
                    <option value="">{sourceEntity ? "请选择收款主体" : "请先选择项目"}</option>
                    {projectInvestorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label} - {opt.sub}</option>)}
                  </select>
                </div>
              </>
            )}

            {txTab === "pool_liquidation" && (
              <>
                <div className="form-group">
                  <label className="form-label">出账资金池</label>
                  <select value={sourceEntity} onChange={e => { setSourceEntity(e.target.value); setTargetEntity(""); }} className="form-input" required>
                    <option value="">请选择分配资金来源池</option>
                    {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">收款方</label>
                  <select value={targetEntity} onChange={e => setTargetEntity(e.target.value)} className="form-input" required disabled={!sourceEntity}>
                    <option value="">{sourceEntity ? "请选择收款主体" : "请先选择资金池"}</option>
                    {poolMemberOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label} - {opt.sub}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">流水类型</label>
              <select value={customType} onChange={e => setCustomType(e.target.value)} className="form-input">
                <option value="capital_call">实缴打款</option>
                <option value="investment">项目投资</option>
                <option value="return">项目回款</option>
                <option value="distribution">收益分红</option>
                <option value="fee">管理费/支出</option>
                <option value="adjustment">人工核校</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">发生日期</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" required />
            </div>

            <div className="form-group" style={styles.fullWidth}>
              <label className="form-label">金额</label>
              <AmountInput value={amount} onChange={setAmount} />
            </div>

            <div className="form-group" style={styles.fullWidth}>
              <label className="form-label">凭证号</label>
              <input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} className="form-input" placeholder="网银流水号 / 付款凭证号" />
            </div>

            <div className="form-group" style={styles.fullWidth}>
              <label className="form-label">摘要说明</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="form-input" rows={2} placeholder="填写本笔流水的业务说明" />
            </div>
          </div>

          <div style={styles.formActions}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">{currentUser?.role === "operator" ? "提交审核" : "确认录入"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: "28px" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  actionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
  leftActions: { display: "flex", gap: "12px" },
  paginationRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" },
  paginationLeft: { display: "flex", alignItems: "center", gap: "10px", fontSize: "0.85rem", color: "var(--text-secondary)" },
  pageSizeSelect: {
    width: "76px",
    minWidth: "76px",
    height: "38px",
    minHeight: "38px",
    lineHeight: "20px",
    padding: "6px 28px 6px 12px",
    fontSize: "0.9rem",
    color: "var(--text-primary)"
  },
  paginationRight: { display: "flex", alignItems: "center", gap: "12px" },
  formTabs: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px", marginBottom: "10px" },
  formTabBtn: { justifyContent: "center", minHeight: "34px", whiteSpace: "nowrap", padding: "7px 10px" },
  pendingNotice: {
    padding: "8px 10px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "1px solid rgba(245, 158, 11, 0.22)",
    backgroundColor: "var(--accent-gold-glow)",
    color: "var(--accent-gold)",
    fontSize: "0.8rem"
  },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: "12px", rowGap: "10px" },
  formActions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" },
  fullWidth: { gridColumn: "1 / -1" },
  entityPicker: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    cursor: "pointer"
  },
  dropdownPanel: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    right: 0,
    zIndex: 1000,
    padding: "10px",
    maxHeight: "280px",
    overflow: "hidden"
  },
  dropdownList: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px", maxHeight: "210px", overflowY: "auto" },
  optionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "9px 10px",
    border: "1px solid transparent",
    borderRadius: "6px",
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left"
  },
  optionSub: { color: "var(--text-secondary)", whiteSpace: "nowrap" }
};
export default Transactions;
