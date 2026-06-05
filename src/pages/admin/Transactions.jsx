import React, { useState, useEffect } from "react";
import { useTransactions } from "../../hooks/useTransactions";
import { usePools } from "../../hooks/usePools";
import { querySQL } from "../../lib/db";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Plus, DollarSign, Download, Upload, FileSpreadsheet, Trash2, Search } from "lucide-react";
import { exportToExcel, importFromExcel, downloadTemplate } from "../../lib/excel";

const EXPORT_HEADERS_MAP = {
  date: "交易日期",
  pool_name: "涉及资金池名称",
  type: "流水类型",
  amount: "发生金额",
  investor_name: "对应出资人名称",
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
  "对应关联项目名称": "project_name",
  "记账凭证编号": "reference_no",
  "交易摘要说明": "description"
};

export function Transactions() {
  const { getTransactions, createTransaction, deleteTransaction } = useTransactions();
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

  const getSourceName = (row) => {
    if (row.type === "capital_call") return row.investor_name || "";
    if (row.type === "investment") return row.investor_name || row.pool_name || "";
    if (row.type === "return" || row.type === "distribution") return row.project_name || "";
    if (row.type === "pool_transfer_out") return row.pool_name || "";
    if (row.type === "pool_transfer_in") return row.related_pool_name || "";
    return row.direction === "in" ? "外部来源" : (row.pool_name || "");
  };

  const getTargetName = (row) => {
    if (row.type === "capital_call") return row.pool_name || "";
    if (row.type === "investment") return row.project_name || "";
    if (row.type === "return" || row.type === "distribution") return row.investor_name || row.pool_name || "";
    if (row.type === "pool_transfer_out") return row.related_pool_name || "";
    if (row.type === "pool_transfer_in") return row.pool_name || "";
    return row.direction === "in" ? (row.pool_name || "") : "外部去向";
  };

  const filteredTxs = React.useMemo(() => {
    let result = txs;

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(t => {
        const refNo = (t.reference_no || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        const sourceName = getSourceName(t).toLowerCase();
        const targetName = getTargetName(t).toLowerCase();
        return refNo.includes(keyword) || 
               desc.includes(keyword) || 
               sourceName.includes(keyword) || 
               targetName.includes(keyword);
      });
    }

    if (filterType) {
      result = result.filter(t => t.type === filterType);
    }

    if (dateFrom) {
      result = result.filter(t => t.date && t.date >= dateFrom);
    }

    if (dateTo) {
      result = result.filter(t => t.date && t.date <= dateTo);
    }

    return result;
  }, [txs, searchKeyword, filterType, dateFrom, dateTo]);

  const paginatedTxs = React.useMemo(() => {
    return filteredTxs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredTxs, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTxs.length / pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, filterType, dateFrom, dateTo, txs.length]);

  
  // 用于下拉关联的动态数据
  const [investors, setInvestors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [poolMembers, setPoolMembers] = useState([]); // 特定资金池的出资人名单（遗留支持）
  const [allPoolMembers, setAllPoolMembers] = useState([]); // 系统中所有归属了资金池的出资人（用于扁平化选择）
  const [allProjectInvestors, setAllProjectInvestors] = useState([]); // 项目出资方映射
  const [allPoolInvestments, setAllPoolInvestments] = useState([]); // 资金池间投资映射

  // 新增流水表单状态
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  
  // 新增 Tab 控制状态
  const [txTab, setTxTab] = useState("pool_in"); // 'pool_in', 'invest_out', 'project_return'
  
  // 新的一进一出关联实体状态
  const [sourceEntity, setSourceEntity] = useState(""); 
  const [targetEntity, setTargetEntity] = useState("");

  const [customType, setCustomType] = useState("capital_call");

  useEffect(() => {
    if (txTab === "pool_in") {
      if (sourceEntity.startsWith('pool:')) {
        setCustomType("pool_transfer_in");
      } else {
        setCustomType("capital_call");
      }
    } else if (txTab === "invest_out") {
      setCustomType("investment");
    } else if (txTab === "project_return") {
      setCustomType("return");
    } else if (txTab === "pool_liquidation") {
      setCustomType("return");
    }
  }, [txTab, sourceEntity, targetEntity]);

  const fetchTxs = async () => {
    setLoading(true);
    try {
      const data = await getTransactions();
      setTxs(data);
    } catch (err) {
      console.error("加载流水账目失败", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDropdownData = async () => {
    try {
      const invs = await querySQL("SELECT id, name FROM investors");
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
        SELECT pi.parent_pool_id, pi.child_pool_id, pi.invested_amount, p.name AS parent_pool_name 
        FROM pool_investments pi 
        JOIN pools p ON pi.parent_pool_id = p.id
        WHERE pi.status = 'active'
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

  // 根据类型自动变更流向
  const getDirectionByType = (t) => {
    const map = {
      capital_call: "in",
      investment: "out",
      return: "in",
      distribution: "out",
      fee: "out",
      pool_transfer_out: "out",
      pool_transfer_in: "in",
      adjustment: "in"
    };
    return map[t] || "in";
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    let resolvedType, finalPoolId, finalProjectId, finalInvestorId, finalRelatedPoolId;

    if (txTab === "pool_in") {
      if (!targetEntity) return alert("请选择进账资金池");
      if (!sourceEntity) return alert("请选择出账方");
      
      finalPoolId = targetEntity; 
      if (sourceEntity.startsWith('pool:')) {
        resolvedType = "pool_transfer_in";
        finalRelatedPoolId = sourceEntity.split(':')[1];
      } else if (sourceEntity.startsWith('investor:')) {
        resolvedType = "capital_call";
        const parts = sourceEntity.split(':');
        finalInvestorId = parts[2];
      }
    } else if (txTab === "invest_out") {
      if (!sourceEntity) return alert("请选择出账方");
      if (!targetEntity) return alert("请选择投资项目");

      finalProjectId = targetEntity;
      resolvedType = "investment";

      if (sourceEntity.startsWith('pool:')) {
        finalPoolId = sourceEntity.split(':')[1];
        finalInvestorId = finalPoolId; // 资金池作为出资方主体参与投资
      } else if (sourceEntity.startsWith('investor:')) {
        const parts = sourceEntity.split(':');
        finalPoolId = parts[1] === "null" ? null : parts[1];
        finalInvestorId = parts[2];
      }
    } else if (txTab === "project_return") {
      if (!sourceEntity) return alert("请选择来源项目");
      if (!targetEntity) return alert("请选择进账方");

      finalProjectId = sourceEntity;
      resolvedType = "return";

      if (targetEntity.startsWith('pool:')) {
        finalPoolId = targetEntity.split(':')[1];
        finalInvestorId = finalPoolId; // 资金池作为出资方主体收回投资
      } else if (targetEntity.startsWith('investor:')) {
        const parts = targetEntity.split(':');
        finalPoolId = parts[1] === "null" ? null : parts[1];
        finalInvestorId = parts[2];
      }
    } else if (txTab === "pool_liquidation") {
      if (!sourceEntity) return alert("请选择清算资金池");
      if (!targetEntity) return alert("请选择资金退回方");

      finalPoolId = sourceEntity; 
      
      if (targetEntity.startsWith('pool:')) {
        resolvedType = "pool_transfer_out";
        finalRelatedPoolId = targetEntity.split(':')[1];
      } else if (targetEntity.startsWith('investor:')) {
        resolvedType = "distribution";
        const parts = targetEntity.split(':');
        finalInvestorId = parts[2];
      }
    }

    if (!finalPoolId || !amount || !date) {
      alert("信息填写不完整");
      return;
    }

    // ======== 新增：回款/清算最大额度校验 ========
    let maxAllowed = Infinity;
    let typeName = "";
    if (txTab === "project_return") {
      typeName = "项目回款(本金)";
      const targetId = targetEntity.startsWith('pool:') ? targetEntity.split(':')[1] : targetEntity.split(':')[2];
      const pi = allProjectInvestors.find(x => x.project_id === finalProjectId && x.investor_id === targetId);
      const investedAmt = pi ? Number(pi.invested_amount || 0) : 0;
      
      const cumulativeReturned = txs.filter(tx => 
        tx.project_id === finalProjectId && 
        tx.type === "return" && 
        ((targetEntity.startsWith('pool:') && tx.pool_id === targetId) || 
         (targetEntity.startsWith('investor:') && tx.investor_id === targetId))
      ).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      
      maxAllowed = investedAmt - cumulativeReturned;
    } else if (txTab === "pool_liquidation") {
      typeName = "资金池清算退款";
      if (targetEntity.startsWith('pool:')) {
        const parentPoolId = targetEntity.split(':')[1];
        const pinv = allPoolInvestments.find(x => x.child_pool_id === finalPoolId && x.parent_pool_id === parentPoolId);
        const investedAmt = pinv ? Number(pinv.invested_amount || 0) : 0;
        
        const cumulativeReturned = txs.filter(tx => 
          tx.pool_id === finalPoolId && 
          tx.type === "pool_transfer_out" && 
          tx.related_pool_id === parentPoolId
        ).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        
        maxAllowed = investedAmt - cumulativeReturned;
      } else if (targetEntity.startsWith('investor:')) {
        const invId = targetEntity.split(':')[2];
        const pm = allPoolMembers.find(x => x.pool_id === finalPoolId && x.investor_id === invId);
        const calledAmt = pm ? Number(pm.called_amount || 0) : 0;

        const cumulativeReturned = txs.filter(tx => 
          tx.pool_id === finalPoolId && 
          tx.type === "distribution" && 
          tx.investor_id === invId
        ).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        
        maxAllowed = calledAmt - cumulativeReturned;
      }
    }

    if ((txTab === "project_return" || txTab === "pool_liquidation") && Number(amount) > maxAllowed) {
      alert(`为保持等式平衡，${typeName}不得高于该主体的实缴总额！\n\n本次最多可退回本金：¥${(maxAllowed/10000).toFixed(2)}万\n\n超出的部分请在“收益分配”中单独处理。`);
      return;
    }
    // =====================================

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
        createdBy: "admin"
      });

      setSourceEntity("");
      setTargetEntity("");
      setAmount("");
      setDescription("");
      setReferenceNo("");
      setIsModalOpen(false);
      await fetchTxs();
      alert("流水记账录入成功，并已同步更新相关池余额与实体状态！");
    } catch (err) {
      alert("录入流水失败：" + err.message);
    }
  };

  const handleDelete = async (txId) => {
    const confirmDelete = window.confirm("确定要删除这笔流水吗？此操作将自动扣减或退回相关资金池、项目与出资方的对应金额，且不可恢复！");
    if (!confirmDelete) return;

    try {
      await deleteTransaction(txId);
      alert("流水删除成功，相关余额已自动冲回！");
      await fetchTxs();
    } catch (err) {
      alert("删除流水失败：" + err.message);
    }
  };

  const handleExport = () => {
    const typeLabels = {
      capital_call: "LP实缴出资",
      investment: "资金投向项目",
      return: "项目利息回款",
      distribution: "收益分红给LP",
      fee: "管理费/日常支出",
      pool_transfer_out: "划拨母池资金至子池",
      pool_transfer_in: "子池收到母池划拨",
      adjustment: "人工核校"
    };

    const dataToExport = txs.map(t => ({
      ...t,
      type: typeLabels[t.type] || t.type
    }));
    exportToExcel(dataToExport, EXPORT_HEADERS_MAP, "核心流水账本备份");
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(Object.values(EXPORT_HEADERS_MAP), "流水账本导入模板");
  };

  const mapImportType = (val) => {
    const v = val.toString().trim();
    if (v.includes("实缴") || v.toLowerCase().includes("capital_call")) return "capital_call";
    if (v.includes("投向") || v.includes("投资") || v.toLowerCase().includes("investment")) return "investment";
    if (v.includes("回款") || v.toLowerCase().includes("return")) return "return";
    if (v.includes("分红") || v.toLowerCase().includes("distribution")) return "distribution";
    if (v.includes("管理费") || v.includes("支出") || v.toLowerCase().includes("fee")) return "fee";
    if (v.includes("划出") || v.toLowerCase().includes("transfer_out")) return "pool_transfer_out";
    if (v.includes("划入") || v.toLowerCase().includes("transfer_in")) return "pool_transfer_in";
    return null;
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

      rawData.forEach((row, index) => {
        const rowNum = index + 2;
        
        // 校验日期
        let formattedDate = "";
        if (row.date) {
          const d = new Date(row.date);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toISOString().slice(0, 10);
          } else {
            formattedDate = row.date.toString().trim();
          }
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(formattedDate)) {
          errors.push(`第 ${rowNum} 行: 交易日期格式必须为 YYYY-MM-DD，如 "2024-01-02" (${row.date || ""})`);
          return;
        }

        // 校验金额
        const rAmount = Number(row.amount);
        if (isNaN(rAmount) || rAmount <= 0) {
          errors.push(`第 ${rowNum} 行: 发生金额必须是大于 0 的数值`);
          return;
        }

        // 校验流水类型
        const rType = mapImportType(row.type || "");
        if (!rType) {
          errors.push(`第 ${rowNum} 行: 流水类型 "${row.type || ""}" 无法识别，请使用: LP实缴出资、资金投向项目、项目利息回款、收益分红给LP、管理费/日常支出 等`);
          return;
        }

        // 匹配资金池
        const poolName = (row.pool_name || "").toString().trim();
        const pool = pools.find(p => p.name.trim() === poolName);
        if (!pool) {
          errors.push(`第 ${rowNum} 行: 资金池 "${poolName}" 在系统中不存在`);
          return;
        }

        // 匹配出资人
        let investorId = null;
        if (rType === "capital_call" || rType === "distribution") {
          const invName = (row.investor_name || "").toString().trim();
          if (!invName) {
            errors.push(`第 ${rowNum} 行: 当流水类型为实缴/分红时，必须填写 "对应出资人名称"`);
            return;
          }
          const investor = investors.find(i => i.name.trim() === invName);
          if (!investor) {
            errors.push(`第 ${rowNum} 行: 出资人 "${invName}" 在系统中不存在`);
            return;
          }
          investorId = investor.id;
        } else if (rType === "investment" || rType === "return") {
          // 对于投资或回款，如果填了出资人名称就匹配（可以是具体LP或资金池名称），没填则自动使用该流水的资金池 ID 作为出资人主体
          const invName = (row.investor_name || "").toString().trim();
          if (invName) {
            const investor = investors.find(i => i.name.trim() === invName);
            if (investor) {
              investorId = investor.id;
            } else {
              errors.push(`第 ${rowNum} 行: 指定的投资方/退款方 "${invName}" 在系统中不存在`);
              return;
            }
          } else if (pool) {
            investorId = pool.id;
          }
        }

        // 匹配项目
        let projectId = null;
        if (rType === "investment" || rType === "return") {
          const projName = (row.project_name || "").toString().trim();
          if (!projName) {
            errors.push(`第 ${rowNum} 行: 当流水类型为投资/回款时，必须填写 "对应关联项目名称"`);
            return;
          }
          const project = projects.find(p => p.name.trim() === projName);
          if (!project) {
            errors.push(`第 ${rowNum} 行: 项目 "${projName}" 在系统中不存在`);
            return;
          }
          projectId = project.id;
        }

        validatedData.push({
          date: formattedDate,
          poolId: pool.id,
          projectId,
          investorId,
          type: rType,
          amount: rAmount,
          referenceNo: (row.reference_no || "").toString().trim(),
          description: (row.description || "").toString().trim()
        });
      });

      if (errors.length > 0) {
        alert(`导入数据校验失败：\n${errors.join("\n")}`);
        e.target.value = "";
        return;
      }

      const confirmImport = window.confirm(`校验成功！解析出 ${validatedData.length} 条流水账目，确定导入并执行资金联动吗？`);
      if (!confirmImport) {
        e.target.value = "";
        return;
      }

      setLoading(true);
      let successCount = 0;

      // 依次执行登账，以触发相应的余额联动与事务逻辑
      for (let i = 0; i < validatedData.length; i++) {
        const record = validatedData[i];
        const direction = getDirectionByType(record.type);

        await createTransaction({
          poolId: record.poolId,
          projectId: record.projectId,
          investorId: record.investorId,
          type: record.type,
          direction,
          amount: record.amount,
          date: record.date,
          description: record.description,
          referenceNo: record.referenceNo,
          createdBy: "admin"
        });

        successCount++;
      }

      alert(`成功导入 ${successCount} 条流水账目，相关池余额与实体状态已同步更新！`);
      await fetchTxs();
    } catch (err) {
      alert("导入失败: " + err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const headers = [
    { key: "date", label: "发生日期", render: (v) => formatDate(v) },
    { 
      key: "sourceName", 
      label: "出账方 (Source)", 
      render: (_, row) => {
        let name = "未知";
        if (row.type === "capital_call") name = row.investor_name;
        else if (row.type === "investment") name = row.investor_name || row.pool_name;
        else if (row.type === "return" || row.type === "distribution") name = row.project_name;
        else if (row.type === "pool_transfer_out") name = row.pool_name;
        else if (row.type === "pool_transfer_in") name = row.related_pool_name;
        else name = row.direction === "in" ? "外部来源" : (row.pool_name || "未知");
        
        return <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name || "未知"}</span>;
      }
    },
    { 
      key: "targetName", 
      label: "进账方 (Target)", 
      render: (_, row) => {
        let name = "未知";
        if (row.type === "capital_call") name = row.pool_name;
        else if (row.type === "investment") name = row.project_name;
        else if (row.type === "return" || row.type === "distribution") name = row.investor_name || row.pool_name;
        else if (row.type === "pool_transfer_out") name = row.related_pool_name;
        else if (row.type === "pool_transfer_in") name = row.pool_name;
        else name = row.direction === "in" ? (row.pool_name || "未知") : "外部去向";
        
        return <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{name || "未知"}</span>;
      }
    },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => {
        const typeMap = {
          capital_call: "LP实缴打款",
          investment: "项目投资",
          return: "项目回款",
          distribution: "收益分红",
          fee: "管理费/支出",
          pool_transfer_out: "资金池划出",
          pool_transfer_in: "资金池划入",
          adjustment: "人工核校"
        };
        const colorMap = {
          capital_call: "warning", // 金色
          investment: "danger", // 红色
          pool_transfer_out: "default", // 灰色
          pool_transfer_in: "default", // 灰色
        };
        const badgeStatus = colorMap[v] || "success";
        return <Badge text={typeMap[v] || v} status={badgeStatus} />;
      }
    },
    { 
      key: "amount", 
      label: "金额", 
      align: "right",
      render: (v, row) => (
        <span className={`mono amt-bold ${row.direction === 'in' ? 'amt-in' : 'amt-out'}`}>
          {row.direction === 'in' ? '+' : '-'}{formatCNY(v, false)}
        </span>
      )
    },
    { key: "reference_no", label: "凭证号", className: "mono" },
    { key: "description", label: "摘要说明" },
    {
      key: "actions",
      label: "操作",
      align: "center",
      render: (_, row) => (
        <button 
          onClick={() => handleDelete(row.id)}
          style={{ 
            padding: "6px 12px", 
            fontSize: "0.8rem", 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "4px",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            color: "var(--accent-red)",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--accent-red)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
            e.currentTarget.style.color = "var(--accent-red)";
          }}
        >
          <Trash2 size={14} />
          <span>删除</span>
        </button>
      )
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h2>核心资金流水账本 (Ledger)</h2>
          <p>录入系统全量财务流水，自动计算各级池子的动态余额与实缴数据。</p>
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
          <span>记账录入</span>
        </button>
      </div>

      {/* 搜索与筛选栏 */}
      <div className="glass-card no-hover" style={{ padding: "16px 20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", backgroundColor: "rgba(9, 13, 26, 0.5)", marginBottom: "20px" }}>
        <div className="search-box" style={{ width: "280px" }}>
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="搜索凭证号、摘要、收付款方..." 
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="search-input"
          />
        </div>

        <select 
          value={filterType} 
          onChange={(e) => setFilterType(e.target.value)}
          className="form-input"
          style={{ width: "180px" }}
        >
          <option value="">全部交易类型</option>
          <option value="capital_call">LP实缴打款</option>
          <option value="investment">项目投资</option>
          <option value="return">项目回款</option>
          <option value="distribution">收益分红</option>
          <option value="fee">管理费/支出</option>
          <option value="pool_transfer_out">资金池划出</option>
          <option value="pool_transfer_in">资金池划入</option>
          <option value="adjustment">人工核校</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>交易日期范围：</span>
          <input 
            type="date" 
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="form-input"
            style={{ width: "140px" }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>至</span>
          <input 
            type="date" 
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="form-input"
            style={{ width: "140px" }}
          />
        </div>
      </div>

      <div className="glass-card no-hover" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={paginatedTxs} 
          emptyMessage={loading ? "加载中..." : "暂无记账流水记录"}
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
              共 {filteredTxs.length} 条记录
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="财务记账录入 (Ledger Transaction)">
        {/* Tabs */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", overflowX: "auto", paddingBottom: "4px" }}>
          <button 
            type="button"
            className={txTab === "pool_in" ? "btn-primary" : "btn-secondary"}
            onClick={() => { setTxTab("pool_in"); setSourceEntity(""); setTargetEntity(""); }}
          >
            1. 资金池注资打款
          </button>
          <button 
            type="button"
            className={txTab === "invest_out" ? "btn-primary" : "btn-secondary"}
            onClick={() => { setTxTab("invest_out"); setSourceEntity(""); setTargetEntity(""); }}
          >
            2. 向单独项目打款
          </button>
          <button 
            type="button"
            className={txTab === "project_return" ? "btn-primary" : "btn-secondary"}
            onClick={() => { setTxTab("project_return"); setSourceEntity(""); setTargetEntity(""); }}
          >
            3. 项目回款入账
          </button>
          <button 
            type="button"
            className={txTab === "pool_liquidation" ? "btn-primary" : "btn-secondary"}
            onClick={() => { setTxTab("pool_liquidation"); setSourceEntity(""); setTargetEntity(""); }}
          >
            4. 资金池清算退款
          </button>
        </div>

        <form onSubmit={handleCreate} style={styles.form}>

          {txTab === "pool_in" && (
            <>
              <div className="form-group">
                <label className="form-label">进账方 (B) - 收款资金池 *</label>
                <select value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} className="form-input" required>
                  <option value="">-- 请选择收款的资金池 --</option>
                  {pools.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (当前可用: {formatCNY(p.available_balance, false)})</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">出账方 (A) - 资金来源 *</label>
                {!targetEntity ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "6px 0" }}>⬆️ 请先选择上方的进账资金池，才能选择对应的出账方</p>
                ) : (
                  <select value={sourceEntity} onChange={(e) => setSourceEntity(e.target.value)} className="form-input" required>
                    <option value="">-- 请选择打款的出账方 --</option>
                    <optgroup label="上级母池资金划拨">
                      {pools.filter(p => p.id !== targetEntity).map(p => (
                        <option key={`pool:${p.id}`} value={`pool:${p.id}`}>{p.name} (可用: {formatCNY(p.available_balance, false)})</option>
                      ))}
                    </optgroup>
                    <optgroup label="本池出资人(LP)实缴">
                      {allPoolMembers.filter(m => m.pool_id === targetEntity).map(m => (
                        <option key={`investor:${m.pool_id}:${m.investor_id}`} value={`investor:${m.pool_id}:${m.investor_id}`}>
                          {m.investor_name} ({m.investor_type === "individual" ? "个人" : "机构"})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                )}
              </div>
            </>
          )}

          {txTab === "invest_out" && (
            <>
              <div className="form-group">
                <label className="form-label">出账方 (A) - 资金拨出方 *</label>
                <select value={sourceEntity} onChange={(e) => setSourceEntity(e.target.value)} className="form-input" required>
                  <option value="">-- 请选择出账的主体 --</option>
                  <optgroup label="资金池直接投资">
                    {pools.map(p => (
                      <option key={`pool:${p.id}`} value={`pool:${p.id}`}>{p.name} (可用: {formatCNY(p.available_balance, false)})</option>
                    ))}
                  </optgroup>
                  <optgroup label="独立出资方直投 (个人/机构)">
                    {investors.map(i => (
                      <option key={`investor:null:${i.id}`} value={`investor:null:${i.id}`}>
                        {i.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">进账方 (B) - 目标投资项目 *</label>
                <select value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} className="form-input" required>
                  <option value="">-- 请选择打款的目标项目 --</option>
                  {projects.filter(p => p.status === "pre").map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {txTab === "project_return" && (
            <>
              <div className="form-group">
                <label className="form-label">出账方 (A) - 退款来源项目 *</label>
                <select value={sourceEntity} onChange={(e) => { setSourceEntity(e.target.value); setTargetEntity(""); }} className="form-input" required>
                  <option value="">-- 请选择退款来源项目 --</option>
                  {projects.filter(p => p.status === "exited").map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">进账方 (B) - 资金退回方 *</label>
                <select value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} className="form-input" required disabled={!sourceEntity}>
                  <option value="">-- 请选择收款的主体 --</option>
                  {(() => {
                    const projectInvs = allProjectInvestors.filter(pi => pi.project_id === sourceEntity);
                    const poolInvs = projectInvs.filter(pi => pi.investor_type === 'pool' || pi.investor_type === undefined); // pools from mock
                    const indInvs = projectInvs.filter(pi => pi.investor_type !== 'pool' && pi.investor_type !== undefined);
                    
                    return (
                      <>
                        {poolInvs.length > 0 && (
                          <optgroup label="退回资金池公共账户">
                            {poolInvs.map(pi => {
                              const pool = pools.find(p => p.id === pi.investor_id);
                              return pool ? <option key={`pool:${pool.id}`} value={`pool:${pool.id}`}>{pool.name}</option> : null;
                            })}
                          </optgroup>
                        )}
                        {indInvs.length > 0 && (
                          <optgroup label="退回独立出资方 (直接退回)">
                            {indInvs.map(pi => {
                              return (
                                <option key={`investor:null:${pi.investor_id}`} value={`investor:null:${pi.investor_id}`}>
                                  {pi.investor_name} (直投退出)
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </>
                    );
                  })()}
                </select>
              </div>
            </>
          )}

          {txTab === "pool_liquidation" && (
            <>
              <div className="form-group">
                <label className="form-label">出账方 (A) - 退款/待清算资金池 *</label>
                <select value={sourceEntity} onChange={(e) => { setSourceEntity(e.target.value); setTargetEntity(""); }} className="form-input" required>
                  <option value="">-- 请选择退款的资金池 --</option>
                  {pools.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.status === 'closed' ? '(已清算)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">进账方 (B) - 资金退回方 *</label>
                <select value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} className="form-input" required disabled={!sourceEntity}>
                  <option value="">-- 请选择收款的主体 --</option>
                  {(() => {
                    const parentPools = allPoolInvestments.filter(pi => pi.child_pool_id === sourceEntity);
                    const directLPs = allPoolMembers.filter(pm => pm.pool_id === sourceEntity);
                    
                    return (
                      <>
                        {parentPools.length > 0 && (
                          <optgroup label="退回母资金池账户">
                            {parentPools.map(pi => (
                              <option key={`pool:${pi.parent_pool_id}`} value={`pool:${pi.parent_pool_id}`}>{pi.parent_pool_name}</option>
                            ))}
                          </optgroup>
                        )}
                        {directLPs.length > 0 && (
                          <optgroup label="退回给本级直接出资人">
                            {directLPs.map(pm => (
                              <option key={`investor:${pm.pool_id}:${pm.investor_id}`} value={`investor:${pm.pool_id}:${pm.investor_id}`}>
                                {pm.investor_name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    );
                  })()}
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '16px', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: '12px' }}>
              <label className="form-label">发生金额 *</label>
              <AmountInput 
                value={amount} 
                onChange={setAmount}
                placeholder="请输入流水具体金额"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: '12px' }}>
              <label className="form-label">交易发生日期 *</label>
              <input 
                type="date" 
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input mono"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: '12px' }}>
              <label className="form-label">交易类型 (系统定义) *</label>
              <select value={customType} onChange={(e) => setCustomType(e.target.value)} className="form-input" required style={{ height: '42px' }}>
                <option value="capital_call">LP实缴打款 (capital_call)</option>
                <option value="investment">项目投资 (investment)</option>
                <option value="return">项目回款 (return)</option>
                <option value="distribution">收益分红 (distribution)</option>
                <option value="fee">管理费/支出 (fee)</option>
                <option value="pool_transfer_out">资金池划出 (pool_transfer_out)</option>
                <option value="pool_transfer_in">资金池划入 (pool_transfer_in)</option>
                <option value="adjustment">人工核校 (adjustment)</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: '12px' }}>
              <label className="form-label">记账凭证编号</label>
              <input 
                type="text" 
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="如网银电子回单号"
                className="form-input mono"
                style={{ height: '42px' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">交易摘要说明</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充流水摘要备注信息"
              className="form-input"
              rows={2}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认登账</button>
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
export default Transactions;
