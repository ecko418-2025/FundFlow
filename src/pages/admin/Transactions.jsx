import React, { useState, useEffect } from "react";
import { useTransactions } from "../../hooks/useTransactions";
import { usePools } from "../../hooks/usePools";
import { querySQL } from "../../lib/db";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { Badge } from "../../components/ui/Badge";
import { formatCNY, formatDate } from "../../lib/formatters";
import { Plus, DollarSign, Download, Upload, FileSpreadsheet } from "lucide-react";
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
  const { getTransactions, createTransaction } = useTransactions();
  const { pools } = usePools();
  
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // 用于下拉关联的动态数据
  const [investors, setInvestors] = useState([]);
  const [projects, setProjects] = useState([]);

  // 新增流水表单状态
  const [poolId, setPoolId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [investorId, setInvestorId] = useState("");
  const [type, setType] = useState("capital_call");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

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
      const projs = await querySQL("SELECT id, name FROM projects");
      setProjects(projs);
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
      capital_call: "in",      // LP 实缴流入
      investment: "out",       // 投资打款流出
      return: "in",            // 项目回款流入
      distribution: "out",     // 收益分配流出
      fee: "out",              // 管理费支出流出
      pool_transfer_out: "out", // 母池投子池流出
      pool_transfer_in: "in"    // 子池收到投资流入
    };
    return map[t] || "in";
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!poolId || !type || !amount || !date) {
      alert("请填写必填项");
      return;
    }

    try {
      const direction = getDirectionByType(type);
      await createTransaction({
        poolId,
        projectId: projectId || null,
        investorId: investorId || null,
        type,
        direction,
        amount: Number(amount),
        date,
        description,
        referenceNo,
        createdBy: "admin"
      });

      // 重置表单
      setPoolId("");
      setProjectId("");
      setInvestorId("");
      setType("capital_call");
      setAmount("");
      setDescription("");
      setReferenceNo("");
      setIsModalOpen(false);
      
      // 重新拉取
      await fetchTxs();
      alert("流水记账录入成功，并已同步更新相关池余额与实体状态！");
    } catch (err) {
      alert("录入流水失败：" + err.message);
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
    { key: "pool_name", label: "涉及资金池", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { 
      key: "type", 
      label: "交易类型", 
      render: (v) => {
        const typeMap = {
          capital_call: "LP实缴出资",
          investment: "投向项目",
          return: "项目回款",
          distribution: "收益分红",
          fee: "管理费/支出",
          pool_transfer_out: "母子池划出",
          pool_transfer_in: "母子池划入",
          adjustment: "人工核校"
        };
        return typeMap[v] || v;
      }
    },
    { key: "direction", label: "流向", render: (v) => <Badge text={v === 'in' ? '流入池' : '流出池'} status={v} /> },
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
    { key: "investor_name", label: "出资人", render: (v) => v || "-" },
    { key: "project_name", label: "关联项目", render: (v) => v || "-" },
    { key: "reference_no", label: "凭证号", className: "mono" },
    { key: "description", label: "摘要说明" }
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

      <div className="glass-card" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={txs} 
          emptyMessage={loading ? "加载中..." : "暂无记账流水记录"}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="财务记账录入 (Ledger Transaction)">
        <form onSubmit={handleCreate} style={styles.form}>
          <div className="form-group">
            <label className="form-label">涉及资金池 *</label>
            <select 
              value={poolId} 
              onChange={(e) => setPoolId(e.target.value)}
              className="form-input"
              required
            >
              <option value="">-- 请选择关联资金池 --</option>
              {pools.map(p => (
                <option key={p.id} value={p.id}>{p.name} (可用: {formatCNY(p.available_balance, false)})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">流水类型 *</label>
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value)}
              className="form-input"
            >
              <option value="capital_call">LP实缴出资 (Capital Call)</option>
              <option value="investment">资金投向项目 (Investment)</option>
              <option value="return">项目利息回款 (Project Return)</option>
              <option value="distribution">收益分红给LP (LP Distribution)</option>
              <option value="fee">管理费/日常支出 (Mgmt Fee / Expense)</option>
              <option value="pool_transfer_out">划拨母池资金至子池 (Transfer Out)</option>
              <option value="pool_transfer_in">子池收到母池划拨 (Transfer In)</option>
            </select>
          </div>

          {/* 只有 LP 出资、分红显示 LP 下拉选择 */}
          {(type === "capital_call" || type === "distribution") && (
            <div className="form-group">
              <label className="form-label">对应出资人 (LP)</label>
              <select 
                value={investorId} 
                onChange={(e) => setInvestorId(e.target.value)}
                className="form-input"
              >
                <option value="">-- 请选择涉及出资人 --</option>
                {investors.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 只有项目投资、项目回款显示项目下拉选择 */}
          {(type === "investment" || type === "return") && (
            <div className="form-group">
              <label className="form-label">对应关联项目</label>
              <select 
                value={projectId} 
                onChange={(e) => setProjectId(e.target.value)}
                className="form-input"
              >
                <option value="">-- 请选择涉及投资组合 --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">发生金额 *</label>
            <AmountInput 
              value={amount} 
              onChange={setAmount}
              placeholder="请输入流水具体金额"
            />
          </div>

          <div className="form-group">
            <label className="form-label">交易发生日期 *</label>
            <input 
              type="date" 
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="form-input mono"
            />
          </div>

          <div className="form-group">
            <label className="form-label">记账凭证编号</label>
            <input 
              type="text" 
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="如网银电子回单号"
              className="form-input mono"
            />
          </div>

          <div className="form-group">
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
  }
};
export default Transactions;
