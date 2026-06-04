import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { formatCNY, formatPercent, formatDate } from "../../lib/formatters";
import { useNavigate } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Plus, Link2, Eye, Pencil, Search } from "lucide-react";

export function Pools() {
  const navigate = useNavigate();
  const { pools, loading, createPool, addPoolInvestment, updatePool } = usePools();
  
  // 模态弹窗控制
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  
  // 新建资金池表单状态
  const [poolId, setPoolId] = useState("");
  const [poolName, setPoolName] = useState("");
  const [poolContractNo, setPoolContractNo] = useState("");
  const [poolDesc, setPoolDesc] = useState("");
  const [totalCommitted, setTotalCommitted] = useState("");
  const [poolType, setPoolType] = useState("capital");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 新建池间投资表单状态
  const [parentPoolId, setParentPoolId] = useState("");
  const [childPoolId, setChildPoolId] = useState("");
  const [investedAmount, setInvestedAmount] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [linkNote, setLinkNote] = useState("");

  // 编辑资金池状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState(null);
  const [editPoolId, setEditPoolId] = useState("");
  const [editPoolName, setEditPoolName] = useState("");
  const [editPoolContractNo, setEditPoolContractNo] = useState("");
  const [editPoolDesc, setEditPoolDesc] = useState("");
  const [editTotalCommitted, setEditTotalCommitted] = useState("");
  const [editPoolType, setEditPoolType] = useState("capital");
  const [editPoolStatus, setEditPoolStatus] = useState("active");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [startDateFrom, setStartDateFrom] = useState("");
  const [startDateTo, setStartDateTo] = useState("");

  const filteredPools = React.useMemo(() => {
    let result = pools;

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(keyword) || p.id.toLowerCase().includes(keyword) || (p.contract_no && p.contract_no.toLowerCase().includes(keyword)));
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

    return result;
  }, [pools, searchKeyword, filterStatus, startDateFrom, startDateTo]);

  const handleOpenNewPool = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    let newId = "";
    let attempts = 0;
    do {
      const random3 = Math.floor(100 + Math.random() * 900);
      newId = `Pro-${dateStr}-${random3}`;
      attempts++;
    } while (pools.some(p => p.id === newId) && attempts < 100);
    
    setPoolId(newId);
    setIsPoolModalOpen(true);
  };

  const handleCreatePool = async (e) => {
    e.preventDefault();
    if (!poolId || !poolName || !totalCommitted) return;
    
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      alert("结束日期不能早于起始日期！");
      return;
    }

    try {
      await createPool({
        id: poolId,
        name: poolName,
        contractNo: poolContractNo,
        description: poolDesc,
        totalCommitted: Number(totalCommitted),
        type: poolType,
        startDate: startDate || null,
        endDate: endDate || null,
        createdBy: "admin"
      });
      // 重置表单并关闭
      setPoolId("");
      setPoolName("");
      setPoolContractNo("");
      setPoolDesc("");
      setTotalCommitted("");
      setPoolType("capital");
      setStartDate("");
      setEndDate("");
      setIsPoolModalOpen(false);
    } catch (err) {
      alert("创建资金池失败：" + err.message);
    }
  };

  const handleCreateLink = async (e) => {
    e.preventDefault();
    if (!parentPoolId || !childPoolId || !investedAmount || !sharePct) {
      alert("请填写完整投资关联参数");
      return;
    }
    if (parentPoolId === childPoolId) {
      alert("资金池不能向自身进行出资投资");
      return;
    }
    try {
      await addPoolInvestment({
        parentPoolId,
        childPoolId,
        investedAmount: Number(investedAmount),
        sharePct: Number(sharePct),
        note: linkNote
      });
      // 重置
      setParentPoolId("");
      setChildPoolId("");
      setInvestedAmount("");
      setSharePct("");
      setLinkNote("");
      setIsLinkModalOpen(false);
      alert("池间投资关系配置成功！");
    } catch (err) {
      alert("配置关联失败：" + err.message);
    }
  };

  // 打开编辑弹窗，预填当前数据
  const handleOpenEdit = (pool, e) => {
    e.stopPropagation();
    setEditingPool(pool);
    setEditPoolId(pool.id);
    setEditPoolName(pool.name);
    setEditPoolContractNo(pool.contract_no || "");
    setEditPoolDesc(pool.description || "");
    setEditTotalCommitted(String(pool.total_committed));
    setEditPoolType(pool.type || "capital");
    setEditPoolStatus(pool.status || "active");
    setEditStartDate(pool.start_date ? pool.start_date.slice(0, 10) : "");
    setEditEndDate(pool.end_date ? pool.end_date.slice(0, 10) : "");
    setIsEditModalOpen(true);
  };

  const handleEditPoolSubmit = async (e) => {
    e.preventDefault();
    if (!editPoolName || !editTotalCommitted) return;

    if (editStartDate && editEndDate && new Date(editEndDate) < new Date(editStartDate)) {
      alert("结束日期不能早于起始日期！");
      return;
    }

    try {
      await updatePool(editingPool.id, {
        name: editPoolName,
        contractNo: editPoolContractNo,
        description: editPoolDesc,
        totalCommitted: Number(editTotalCommitted),
        type: editPoolType,
        status: editPoolStatus,
        startDate: editStartDate || null,
        endDate: editEndDate || null
      });
      setIsEditModalOpen(false);
      setEditingPool(null);
      alert("资金池信息已更新！");
    } catch (err) {
      alert("更新失败：" + err.message);
    }
  };

  const poolTypesLabel = {
    capital: "公司股本金",
    temporary_quarterly: "季度临时资金",
    temporary_annually: "年度临时资金"
  };

  const headers = [
    { key: "name", label: "资金池名称", render: (v, row) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "id", label: "资金池 ID", render: (v) => <span className="mono badge badge-active">{v}</span> },
    { 
      key: "type", 
      label: "类型", 
      render: (v) => <Badge text={poolTypesLabel[v] || "未知"} status={v === 'capital' ? 'active' : 'warning'} /> 
    },
    { key: "total_committed", label: "认缴规模", render: (v) => formatCNY(v, false) },
    { key: "available_balance", label: "现金可用余额", render: (v) => formatCNY(v, false) },
    { key: "status", label: "状态", render: (v) => <Badge text={v === 'active' ? '运营中' : '已关闭'} status={v} /> },
    { key: "start_date", label: "起始日期", render: (v) => formatDate(v) },
    { 
      key: "end_date", 
      label: "结束日期", 
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
            onClick={(e) => handleOpenEdit(row, e)}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem", gap: "4px" }}
          >
            <Pencil size={14} />
            <span>编辑</span>
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/pools/${v}`);
            }}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "0.8rem", gap: "4px" }}
          >
            <Eye size={14} />
            <span>详情账本</span>
          </button>
        </div>
      )
    }
  ];

  return (
    <div style={styles.container}>
      {/* 顶部标题与操作栏 */}
      <div style={styles.pageHeader}>
        <div>
          <h2>资金池管理</h2>
          <p>录入各层级实体池子，配置大池向小池投资折算比例。</p>
        </div>
        <div style={styles.actionGroup}>
          <button onClick={() => setIsLinkModalOpen(true)} className="btn-secondary" style={{ gap: "6px" }}>
            <Link2 size={18} />
            <span>配置大池投小池</span>
          </button>
          <button onClick={handleOpenNewPool} className="btn-primary" style={{ gap: "6px" }}>
            <Plus size={18} />
            <span>新建实体池子</span>
          </button>
        </div>
      </div>

      {/* 搜索与筛选栏 */}
      <div className="glass-card no-hover" style={{ padding: "16px 20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", backgroundColor: "rgba(9, 13, 26, 0.5)", marginBottom: "20px" }}>
        <div className="search-box" style={{ width: "260px" }}>
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="搜索资金池名称、编号..." 
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="search-input"
          />
        </div>

        <select 
          value={filterStatus} 
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-input"
          style={{ width: "160px" }}
        >
          <option value="">全部状态</option>
          <option value="active">运营中</option>
          <option value="closed">已关闭</option>
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

      {/* 资金池列表表格 */}
      <div className="glass-card no-hover" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={filteredPools} 
          emptyMessage={loading ? "加载中..." : "暂无符合条件的资金池"}
          onRowClick={(row) => navigate(`/admin/pools/${row.id}`)}
        />
      </div>

      {/* 弹窗 1：创建资金池 */}
      <Modal isOpen={isPoolModalOpen} onClose={() => setIsPoolModalOpen(false)} title="新建资金池 (MySQL Entity)">
        <form onSubmit={handleCreatePool} style={styles.form}>
          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">资金池 ID *</label>
              <input 
                type="text" 
                required
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                placeholder="如：Pro-20240101-123"
                className="form-input mono"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={poolContractNo}
                onChange={(e) => setPoolContractNo(e.target.value)}
                placeholder="如：HT-2024-001"
                className="form-input mono"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">资金池名称 *</label>
            <input 
              type="text" 
              required
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              placeholder="如：2024年度大中华成长一期池"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">资金池类型 *</label>
            <select 
              value={poolType} 
              onChange={(e) => setPoolType(e.target.value)}
              className="form-input"
              required
            >
              <option value="capital">公司股本金 (Share Capital)</option>
              <option value="temporary_quarterly">季度临时资金 (Quarterly Temporary Fund)</option>
              <option value="temporary_annually">年度临时资金 (Annual Temporary Fund)</option>
            </select>
          </div>

          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">运行起始日期</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input mono"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">运行结束日期</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-input mono"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">总认缴规模 *</label>
            <AmountInput 
              value={totalCommitted} 
              onChange={setTotalCommitted} 
              placeholder="请输入总认缴规模（元）"
            />
          </div>

          <div className="form-group">
            <label className="form-label">备注说明</label>
            <textarea 
              value={poolDesc}
              onChange={(e) => setPoolDesc(e.target.value)}
              placeholder="说明资金池投资策略..."
              className="form-input"
              rows={3}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsPoolModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">确认创建</button>
          </div>
        </form>
      </Modal>

      {/* 弹窗 2：大池投小池 投资关系配置 */}
      <Modal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} title="配置池间投资比例 (Multi-level Hierarchy)">
        <form onSubmit={handleCreateLink} style={styles.form}>
          <div className="form-group">
            <label className="form-label">母资金池 (大池/出资方) *</label>
            <select 
              value={parentPoolId} 
              onChange={(e) => setParentPoolId(e.target.value)}
              className="form-input"
              required
            >
              <option value="">-- 请选择大池子 --</option>
              {pools.map(p => (
                <option key={p.id} value={p.id}>{p.name} (可用余额: {formatCNY(p.available_balance, false)})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">子资金池 (小池/被投资方) *</label>
            <select 
              value={childPoolId} 
              onChange={(e) => setChildPoolId(e.target.value)}
              className="form-input"
              required
            >
              <option value="">-- 请选择小池子 --</option>
              {pools.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">投资划拨金额 *</label>
            <AmountInput 
              value={investedAmount} 
              onChange={setInvestedAmount}
              placeholder="母池拨给子池的计划总出资额"
            />
          </div>

          <div className="form-group">
            <label className="form-label">占子资金池份额比例 (%) *</label>
            <div style={styles.pctWrapper}>
              <input 
                type="number" 
                step="0.0001"
                min="0.0001"
                max="100.0000"
                required
                value={sharePct}
                onChange={(e) => setSharePct(e.target.value)}
                placeholder="例如 50.0000"
                className="form-input mono"
                style={{ paddingRight: "40px", textAlign: "right" }}
              />
              <span style={styles.pctSymbol}>%</span>
            </div>
            <p style={styles.tipText}>该占比用来将母池内各 LP 的持股份额等比折算计算。</p>
          </div>

          <div className="form-group">
            <label className="form-label">关联备注说明</label>
            <input 
              type="text" 
              value={linkNote}
              onChange={(e) => setLinkNote(e.target.value)}
              placeholder="如：大池 A 出资一半作为锚定基金"
              className="form-input"
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsLinkModalOpen(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">完成关联配置</button>
          </div>
        </form>
      </Modal>

      {/* 弹窗 3：编辑资金池 */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`编辑资金池：${editingPool?.name || ""}`}>
        <form onSubmit={handleEditPoolSubmit} style={styles.form}>
          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">资金池 ID</label>
              <input 
                type="text" 
                disabled
                value={editPoolId}
                className="form-input mono"
                style={{ backgroundColor: "var(--background)", cursor: "not-allowed" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">相关合同编号</label>
              <input 
                type="text" 
                value={editPoolContractNo}
                onChange={(e) => setEditPoolContractNo(e.target.value)}
                placeholder="如：HT-2024-001"
                className="form-input mono"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">资金池名称 *</label>
            <input 
              type="text" 
              required
              value={editPoolName}
              onChange={(e) => setEditPoolName(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">资金池类型 *</label>
              <select 
                value={editPoolType} 
                onChange={(e) => setEditPoolType(e.target.value)}
                className="form-input"
                required
              >
                <option value="capital">公司股本金 (Share Capital)</option>
                <option value="temporary_quarterly">季度临时资金 (Quarterly Temporary Fund)</option>
                <option value="temporary_annually">年度临时资金 (Annual Temporary Fund)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">当前状态 *</label>
              <select 
                value={editPoolStatus} 
                onChange={(e) => setEditPoolStatus(e.target.value)}
                className="form-input"
                required
              >
                <option value="active">运营中 (Active)</option>
                <option value="closed">已关闭/清算 (Closed)</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ display: "flex", gap: "16px" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">运行起始日期</label>
              <input 
                type="date" 
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="form-input mono"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">运行结束日期</label>
              <input 
                type="date" 
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="form-input mono"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">总认缴规模 *</label>
            <AmountInput 
              value={editTotalCommitted} 
              onChange={setEditTotalCommitted} 
              placeholder="请输入总认缴规模（元）"
            />
          </div>

          <div className="form-group">
            <label className="form-label">备注说明</label>
            <textarea 
              value={editPoolDesc}
              onChange={(e) => setEditPoolDesc(e.target.value)}
              className="form-input"
              rows={3}
              style={{ resize: "none" }}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn-secondary">取消</button>
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
  actionGroup: {
    display: "flex",
    gap: "12px"
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
  pctWrapper: {
    position: "relative",
    width: "100%"
  },
  pctSymbol: {
    position: "absolute",
    right: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    fontWeight: "700",
    color: "var(--text-secondary)"
  },
  tipText: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "6px"
  }
};
export default Pools;
