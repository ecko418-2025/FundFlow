import { useState, useEffect, useCallback } from "react";
import { querySQL } from "../lib/db";
import { writeAuditLog } from "../lib/audit";

export function usePools() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await querySQL("SELECT * FROM pools ORDER BY created_at DESC");
      setPools(data);
    } catch (err) {
      setError(err.message || "获取资金池失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  /**
   * 获取资金池详情，包括关联的直接成员、项目以及池间投资
   */
  const getPoolDetail = async (poolId) => {
    try {
      // 1. 获取基本信息
      const poolInfoResult = await querySQL("SELECT * FROM pools WHERE id = ?", [poolId]);
      if (poolInfoResult.length === 0) {
        throw new Error("资金池不存在");
      }
      const pool = poolInfoResult[0];

      // 2. 获取直接成员列表 (pool_members，包含个人和机构母池)
      const membersResult = await querySQL(
        `SELECT pm.*, i.name AS investor_name, i.type AS investor_type 
         FROM pool_members pm 
         JOIN investors i ON pm.investor_id = i.id 
         WHERE pm.pool_id = ?`,
         [poolId]
      );

      // 动态计算所有成员在当前池中的持股比例 (以实缴额为准)
      const totalCalled = membersResult.reduce((sum, m) => sum + Number(m.called_amount || 0), 0);
      const members = membersResult.map(m => ({
        ...m,
        dynamic_share_pct: totalCalled > 0 ? (Number(m.called_amount || 0) / totalCalled * 100) : 0
      }));

      // 3. 获取池下的项目 (projects)
      const projects = await querySQL(
        "SELECT * FROM projects WHERE pool_id = ? ORDER BY created_at DESC",
        [poolId]
      );

      // 4. 获取作为母池，对外投资的子池 (通过查询当前池子作为 investor 出现在哪些池子的成员名单中)
      const childInvestments = await querySQL(
        `SELECT pm.pool_id AS child_pool_id, p.name AS child_pool_name, pm.called_amount AS invested_amount
         FROM pool_members pm
         JOIN pools p ON pm.pool_id = p.id
         WHERE pm.investor_id = ?`,
         [poolId]
      );

      // 5. 获取作为子池，接受哪些母池的投资 (即当前池子成员中，类型为 'pool' 的记录)
      const parentInvestments = members.filter(m => m.investor_type === 'pool').map(m => ({
        parent_pool_id: m.investor_id,
        parent_pool_name: m.investor_name,
        invested_amount: m.called_amount,
        dynamic_share_pct: m.dynamic_share_pct
      }));

      return {
        pool,
        members,
        projects,
        childInvestments,
        parentInvestments
      };
    } catch (err) {
      console.error("获取资金池详情失败:", err);
      throw err;
    }
  };

  /**
   * 创建新的资金池
   */
  const createPool = async (pool) => {
    const id = pool.id || `POOL-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const sql = `
      INSERT INTO pools (id, name, description, total_committed, available_balance, type, start_date, end_date, created_by, contract_no)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      id,
      pool.name,
      pool.description || "",
      pool.totalCommitted || 0,
      pool.totalCommitted || 0, // 初始可用余额等于总认缴
      pool.type || "capital",
      pool.startDate || null,
      pool.endDate || null,
      pool.createdBy || "admin",
      pool.contractNo || ""
    ];
    await querySQL(sql, params);

    // 同步写入 investors 表镜像行（共享主键，type='pool'）
    // 使用 INSERT IGNORE 防止重复插入（幂等）
    await querySQL(
      `INSERT IGNORE INTO investors (id, name, type, note)
       VALUES (?, ?, 'pool', ?)`,
      [id, pool.name, pool.description || ""]
    );

    await writeAuditLog({
      actor: pool.actor,
      action: "create",
      module: "pools",
      targetType: "pool",
      targetId: id,
      targetLabel: pool.name,
      status: "success",
      message: "创建资金池",
      afterData: { id, ...pool },
      requestPayload: pool
    });

    await fetchPools();
    return id;
  };

  /**
   * 配置池间投资关系（大池投小池）
   * 统一模型：将母池作为成员添加到子池中
   */
  const addPoolInvestment = async (investment) => {
    const { parentPoolId, childPoolId, committedAmount } = investment;
    await addPoolMember({
      poolId: childPoolId,
      investorId: parentPoolId,
      committedAmount: committedAmount || 0,
      actor: investment.actor
    });
  };

  /**
   * 更新资金池基本信息（不含 available_balance，余额只通过流水变化）
   */
  const updatePool = async (poolId, updates) => {
    const before = await querySQL("SELECT * FROM pools WHERE id = ?", [poolId]);
    const sql = `
      UPDATE pools
      SET name = ?, description = ?, total_committed = ?, type = ?, start_date = ?, end_date = ?, contract_no = ?, status = ?
      WHERE id = ?
    `;
    const params = [
      updates.name,
      updates.description || "",
      updates.totalCommitted,
      updates.type,
      updates.startDate || null,
      updates.endDate || null,
      updates.contractNo || "",
      updates.status || "active",
      poolId
    ];
    await querySQL(sql, params);

    // 同步更新 investors 镜像行名称（若池子改名则镜像行也跟着改）
    await querySQL(
      `UPDATE investors SET name = ?, note = ? WHERE id = ? AND type = 'pool'`,
      [updates.name, updates.description || "", poolId]
    );

    await writeAuditLog({
      actor: updates.actor,
      action: "update",
      module: "pools",
      targetType: "pool",
      targetId: poolId,
      targetLabel: updates.name,
      status: "success",
      message: "更新资金池信息",
      beforeData: before[0],
      afterData: { id: poolId, ...updates },
      requestPayload: updates
    });

    await fetchPools();
  };

  /**
   * 添加直接出资人到资金池（个人/机构 LP → pool_members）
   * 持股比例由实缴流水自动计算，不在此处存储
   */
  const addPoolMember = async ({ poolId, investorId, committedAmount, actor }) => {
    const id = `PM-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const sql = `
      INSERT INTO pool_members (id, pool_id, investor_id, committed_amount, called_amount, share_pct, status)
      VALUES (?, ?, ?, ?, 0, 0, 'active')
    `;
    await querySQL(sql, [id, poolId, investorId, committedAmount]);
    await writeAuditLog({
      actor,
      action: "create",
      module: "pool_members",
      targetType: "pool_member",
      targetId: id,
      targetLabel: `${poolId} / ${investorId}`,
      status: "success",
      message: "新增资金池出资方",
      afterData: { id, poolId, investorId, committedAmount }
    });
  };

  /**
   * 更新直接出资人的认缴参考金额（持股比例由实缴数据自动计算，不存储）
   */
  const updatePoolMember = async (poolId, investorId, { committedAmount, actor }) => {
    const before = await querySQL("SELECT * FROM pool_members WHERE pool_id = ? AND investor_id = ?", [poolId, investorId]);
    const sql = `
      UPDATE pool_members
      SET committed_amount = ?
      WHERE pool_id = ? AND investor_id = ?
    `;
    await querySQL(sql, [committedAmount, poolId, investorId]);
    await writeAuditLog({
      actor,
      action: "update",
      module: "pool_members",
      targetType: "pool_member",
      targetId: before[0]?.id || `${poolId}:${investorId}`,
      targetLabel: `${poolId} / ${investorId}`,
      status: "success",
      message: "更新资金池出资方认缴金额",
      beforeData: before[0],
      afterData: { poolId, investorId, committedAmount }
    });
  };

  const removePoolMember = async (poolId, investorId, actor) => {
    const before = await querySQL("SELECT * FROM pool_members WHERE pool_id = ? AND investor_id = ?", [poolId, investorId]);
    const sql = `
      DELETE FROM pool_members
      WHERE pool_id = ? AND investor_id = ?
    `;
    await querySQL(sql, [poolId, investorId]);
    await writeAuditLog({
      actor,
      action: "delete",
      module: "pool_members",
      targetType: "pool_member",
      targetId: before[0]?.id || `${poolId}:${investorId}`,
      targetLabel: `${poolId} / ${investorId}`,
      status: "success",
      message: "删除资金池出资方",
      beforeData: before[0]
    });
  };

  return {
    pools,
    loading,
    error,
    fetchPools,
    getPoolDetail,
    createPool,
    addPoolInvestment,
    addPoolMember,
    updatePool,
    updatePoolMember,
    removePoolMember
  };
}
export default usePools;
