import React, { useState, useEffect } from "react";
import { usePools } from "../../hooks/usePools";
import { DataTable } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Modal";
import { AmountInput } from "../../components/ui/AmountInput";
import { formatCNY, formatPercent } from "../../lib/formatters";
import { useNavigate } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Plus, Link2, Eye } from "lucide-react";

export function Pools() {
  const navigate = useNavigate();
  const { pools, loading, createPool, addPoolInvestment } = usePools();
  
  // 模态弹窗控制
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  
  // 新建资金池表单状态
  const [poolName, setPoolName] = useState("");
  const [poolDesc, setPoolDesc] = useState("");
  const [totalCommitted, setTotalCommitted] = useState("");

  // 新建池间投资表单状态
  const [parentPoolId, setParentPoolId] = useState("");
  const [childPoolId, setChildPoolId] = useState("");
  const [investedAmount, setInvestedAmount] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [linkNote, setLinkNote] = useState("");

  const handleCreatePool = async (e) => {
    e.preventDefault();
    if (!poolName || !totalCommitted) return;
    try {
      await createPool({
        name: poolName,
        description: poolDesc,
        totalCommitted: Number(totalCommitted),
        createdBy: "admin"
      });
      // 重置表单并关闭
      setPoolName("");
      setPoolDesc("");
      setTotalCommitted("");
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

  const headers = [
    { key: "name", label: "资金池名称", render: (v, row) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: "total_committed", label: "认缴规模", render: (v) => formatCNY(v, false) },
    { key: "available_balance", label: "现金可用余额", render: (v) => formatCNY(v, false) },
    { key: "status", label: "状态", render: (v) => <Badge text={v === 'active' ? '运营中' : '已关闭'} status={v} /> },
    { key: "description", label: "备注摘要" },
    { 
      key: "id", 
      label: "操作", 
      align: "right",
      render: (v) => (
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
          <button onClick={() => setIsPoolModalOpen(true)} className="btn-primary" style={{ gap: "6px" }}>
            <Plus size={18} />
            <span>新建实体池子</span>
          </button>
        </div>
      </div>

      {/* 资金池列表表格 */}
      <div className="glass-card" style={{ padding: "20px" }}>
        <DataTable 
          headers={headers} 
          data={pools} 
          emptyMessage={loading ? "加载中..." : "暂无已录入资金池，请先点击右上角创建"}
          onRowClick={(row) => navigate(`/admin/pools/${row.id}`)}
        />
      </div>

      {/* 弹窗 1：创建资金池 */}
      <Modal isOpen={isPoolModalOpen} onClose={() => setIsPoolModalOpen(false)} title="新建资金池 (MySQL Entity)">
        <form onSubmit={handleCreatePool} style={styles.form}>
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
              placeholder="说明资金池投资策略或起止时间"
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
