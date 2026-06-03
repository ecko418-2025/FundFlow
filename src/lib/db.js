import { app } from "./cloudbase";

// 本地开发模拟数据，保障前端立即可以 WOW 预览
const mockDb = {
  pools: [
    { id: "pool-1", name: "2024综合大池 A", description: "年度主要资金池", status: "active", currency: "CNY", total_committed: 50000000, available_balance: 14200000, created_at: "2024-01-01 10:00:00", created_by: "admin" },
    { id: "pool-2", name: "2024科技成长池 B", description: "高成长性项目专项池", status: "active", currency: "CNY", total_committed: 30000000, available_balance: 8500000, created_at: "2024-02-15 14:30:00", created_by: "admin" },
    { id: "pool-3", name: "2024新能源子池 C", description: "新能源子项目投资池", status: "active", currency: "CNY", total_committed: 10000000, available_balance: 4200000, created_at: "2024-03-01 09:00:00", created_by: "admin" }
  ],
  investors: [
    { id: "inv-1", name: "张三", type: "individual", email: "zhangsan@example.com", uid: "uid-zhangsan", phone: "13800001111", contact: "张三", note: "大额个人出资人", created_at: "2024-01-01 10:30:00" },
    { id: "inv-2", name: "李四", type: "individual", email: "lisi@example.com", uid: "uid-lisi", phone: "13800002222", contact: "李四", note: "普通合伙人", created_at: "2024-01-02 11:00:00" },
    { id: "inv-3", name: "未来资本基金", type: "fund", email: "future@example.com", uid: "uid-future", phone: "021-88888888", contact: "王经理", note: "机构出资方", created_at: "2024-01-03 15:00:00" }
  ],
  pool_members: [
    // pool-1 (大池 A): 张三 40%, 未来资本 60%
    { id: "pm-1", pool_id: "pool-1", investor_id: "inv-1", committed_amount: 20000000, called_amount: 15000000, share_pct: 40.0000, status: "active", joined_at: "2024-01-01 11:00:00" },
    { id: "pm-2", pool_id: "pool-1", investor_id: "inv-3", committed_amount: 30000000, called_amount: 20800000, share_pct: 60.0000, status: "active", joined_at: "2024-01-01 11:00:00" },
    // pool-2 (大池 B): 李四 20%, 未来资本 80%
    { id: "pm-3", pool_id: "pool-2", investor_id: "inv-2", committed_amount: 6000000, called_amount: 5000000, share_pct: 20.0000, status: "active", joined_at: "2024-02-15 15:00:00" },
    { id: "pm-4", pool_id: "pool-2", investor_id: "inv-3", committed_amount: 24000000, called_amount: 16500000, share_pct: 80.0000, status: "active", joined_at: "2024-02-15 15:00:00" },
    // pool-3 (子池 C): 张三 10% 直接持股
    { id: "pm-5", pool_id: "pool-3", investor_id: "inv-1", committed_amount: 1000000, called_amount: 1000000, share_pct: 10.0000, status: "active", joined_at: "2024-03-01 09:30:00" },
    { id: "pm-6", pool_id: "pool-3", investor_id: "inv-2", committed_amount: 2000000, called_amount: 2000000, share_pct: 20.0000, status: "active", joined_at: "2024-03-01 09:30:00" }
  ],
  pool_investments: [
    // 2024综合大池 A (pool-1) 投资了 2024新能源子池 C (pool-3) 占 50%
    { id: "pi-1", parent_pool_id: "pool-1", child_pool_id: "pool-3", invested_amount: 5000000, share_pct: 50.0000, status: "active", invested_at: "2024-03-01 10:00:00", note: "大池A出资一半" },
    // 2024科技成长池 B (pool-2) 投资了 2024新能源子池 C (pool-3) 占 20%
    { id: "pi-2", parent_pool_id: "pool-2", child_pool_id: "pool-3", invested_amount: 2000000, share_pct: 20.0000, status: "active", invested_at: "2024-03-02 11:00:00", note: "大池B出资五分之一" }
  ],
  projects: [
    { id: "proj-1", pool_id: "pool-1", name: "芯片半导体制造项目", code: "P-2024-001", status: "active", start_date: "2024-01-10", expected_end_date: "2026-12-31", actual_end_date: null, committed_amount: 15000000, invested_amount: 15000000, returned_amount: 5000000, description: "先进制程制造研发投融资", tags: ["芯片", "硬科技"], created_at: "2024-01-10 11:00:00" },
    { id: "proj-2", pool_id: "pool-3", name: "高倍率固态锂电池研发", code: "P-2024-002", status: "active", start_date: "2024-03-05", expected_end_date: "2025-12-31", actual_end_date: null, committed_amount: 5000000, invested_amount: 4000000, returned_amount: 0, description: "新能源固态电池项目", tags: ["固态电池", "新能源"], created_at: "2024-03-05 10:00:00" }
  ],
  transactions: [
    { id: "tx-1", pool_id: "pool-1", project_id: null, investor_id: "inv-1", type: "capital_call", direction: "in", amount: 15000000, date: "2024-01-02", description: "张三第一期实缴出资", reference_no: "RE-20240102-01", attachment_url: null, created_at: "2024-01-02 10:00:00", created_by: "admin" },
    { id: "tx-2", pool_id: "pool-1", project_id: null, investor_id: "inv-3", type: "capital_call", direction: "in", amount: 20800000, date: "2024-01-02", description: "未来资本首期出资", reference_no: "RE-20240102-02", attachment_url: null, created_at: "2024-01-02 10:05:00", created_by: "admin" },
    { id: "tx-3", pool_id: "pool-1", project_id: "proj-1", investor_id: null, type: "investment", direction: "out", amount: 15000000, date: "2024-01-15", description: "向芯片项目打款第一笔", reference_no: "PAY-20240115-01", attachment_url: null, created_at: "2024-01-15 14:00:00", created_by: "admin" }
  ],
  distributions: [],
  distribution_items: []
};

// 是否开启 Mock 模式。如果本地 localStorage 中没有设置连接云开发，默认使用 Mock 数据以保展示效果
const USE_MOCK = localStorage.getItem("USE_MOCK") !== "false";

/**
 * 通用 SQL 查询调用封装
 * @param {string} sql SQL 语句
 * @param {Array} params 参数列表
 * @returns {Promise<any>}
 */
export async function querySQL(sql, params = []) {
  if (USE_MOCK) {
    return simulateSQL(sql, params);
  }

  try {
    const res = await app.callFunction({
      name: "executeSQL",
      data: { sql, params }
    });
    
    if (!res.result || res.result.code !== 0) {
      throw new Error((res.result && res.result.message) || "云函数 SQL 执行失败");
    }
    return res.result.data;
  } catch (error) {
    console.warn("云开发连接失败，降级到本地 Mock 运行。错误：", error.message);
    return simulateSQL(sql, params);
  }
}

/**
 * 本地极简 SQL 仿真器，用于前端独立无缝演示
 */
function simulateSQL(sql, params) {
  const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
  
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // 1. 获取所有资金池
      if (normalizedSql.startsWith("select * from pools")) {
        resolve(JSON.parse(JSON.stringify(mockDb.pools)));
        return;
      }
      
      // 2. 获取所有出资方
      if (normalizedSql.startsWith("select * from investors")) {
        resolve(JSON.parse(JSON.stringify(mockDb.investors)));
        return;
      }

      // 3. 递归有效份额核心模拟逻辑
      if (normalizedSql.includes("with recursive pool_hierarchy")) {
        const targetPoolId = params[0] || "pool-3";
        resolve(calculateEffectiveSharesMock(targetPoolId));
        return;
      }

      // 4. 获取某个资金池关联项目
      if (normalizedSql.includes("select * from projects where pool_id")) {
        const poolId = params[0] || "pool-1";
        const result = mockDb.projects.filter(p => p.pool_id === poolId);
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 5. 获取某个资金池成员
      if (normalizedSql.includes("select * from pool_members where pool_id")) {
        const poolId = params[0] || "pool-1";
        const result = mockDb.pool_members
          .filter(pm => pm.pool_id === poolId)
          .map(pm => {
            const investor = mockDb.investors.find(i => i.id === pm.investor_id);
            return { ...pm, investor_name: investor ? investor.name : "未知 LP" };
          });
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 6. 获取池间投资关系
      if (normalizedSql.includes("select * from pool_investments")) {
        resolve(JSON.parse(JSON.stringify(mockDb.pool_investments)));
        return;
      }

      // 7. 项目列表查询 (带 pool_name)
      if (normalizedSql.includes("select pr.*, p.name as pool_name from projects pr")) {
        const result = mockDb.projects.map(pr => {
          const pool = mockDb.pools.find(p => p.id === pr.pool_id);
          return { ...pr, pool_name: pool ? pool.name : "未知资金池" };
        });
        result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 8. 账本流水列表查询 (带 pool_name, project_name, investor_name)
      if (normalizedSql.includes("from transactions t") && normalizedSql.includes("join pools p") && normalizedSql.includes("left join projects")) {
        // Let's filter by poolId/projectId/investorId if params exist
        // But for mock list, we can just return all since we're simulating global list
        const result = mockDb.transactions.map(t => {
          const pool = mockDb.pools.find(p => p.id === t.pool_id);
          const project = mockDb.projects.find(pr => pr.id === t.project_id);
          const investor = mockDb.investors.find(i => i.id === t.investor_id);
          return {
            ...t,
            pool_name: pool ? pool.name : "未知资金池",
            project_name: project ? project.name : null,
            investor_name: investor ? investor.name : null
          };
        });
        result.sort((a, b) => {
          const dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.created_at) - new Date(a.created_at);
        });
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 9. 出资方简易下拉列表查询
      if (normalizedSql.startsWith("select id, name from investors")) {
        resolve(mockDb.investors.map(i => ({ id: i.id, name: i.name })));
        return;
      }

      // 10. 项目简易下拉列表查询
      if (normalizedSql.startsWith("select id, name from projects")) {
        resolve(mockDb.projects.map(p => ({ id: p.id, name: p.name })));
        return;
      }

      // ==========================================
      // MUTATIONS SIMULATIONS
      // ==========================================

      // 11. 插入出资方
      if (normalizedSql.startsWith("insert into investors")) {
        const [id, name, type, email, uid, phone, contact, note] = params;
        mockDb.investors.push({
          id, name, type, email, uid, phone, contact: contact || name, note,
          created_at: new Date().toISOString()
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 12. 插入关联登录用户
      if (normalizedSql.startsWith("insert into users")) {
        const [uid, email, role, investor_id, display_name] = params;
        if (!mockDb.users) mockDb.users = [];
        mockDb.users.push({ uid, email, role, investor_id, display_name });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 13. 插入项目
      if (normalizedSql.startsWith("insert into projects")) {
        const [id, pool_id, name, code, status, committed_amount, description, tags] = params;
        mockDb.projects.push({
          id,
          pool_id,
          name,
          code,
          status,
          committed_amount: Number(committed_amount),
          invested_amount: 0.00,
          returned_amount: 0.00,
          description,
          tags: tags ? JSON.parse(tags) : [],
          created_at: new Date().toISOString()
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 14. 插入流水
      if (normalizedSql.startsWith("insert into transactions")) {
        const [id, pool_id, project_id, investor_id, type, direction, amount, date, description, reference_no, created_by] = params;
        mockDb.transactions.push({
          id,
          pool_id,
          project_id,
          investor_id,
          type,
          direction,
          amount: Number(amount),
          date,
          description,
          reference_no,
          created_by,
          created_at: new Date().toISOString()
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 15. 更新资金池可用余额
      if (normalizedSql.startsWith("update pools")) {
        const [amount, poolId] = params;
        const pool = mockDb.pools.find(p => p.id === poolId);
        if (pool) {
          const isAdd = normalizedSql.includes("available_balance + ?") || normalizedSql.includes("available_balance+?");
          if (isAdd) {
            pool.available_balance += Number(amount);
          } else {
            pool.available_balance -= Number(amount);
          }
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 16. 更新项目已投金额或收回金额
      if (normalizedSql.startsWith("update projects")) {
        const [amount, projId] = params;
        const project = mockDb.projects.find(p => p.id === projId);
        if (project) {
          const isInvested = normalizedSql.includes("invested_amount + ?") || normalizedSql.includes("invested_amount+?");
          const isReturned = normalizedSql.includes("returned_amount + ?") || normalizedSql.includes("returned_amount+?");
          if (isInvested) {
            project.invested_amount += Number(amount);
          } else if (isReturned) {
            project.returned_amount += Number(amount);
          }
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 17. 更新成员累计实缴
      if (normalizedSql.startsWith("update pool_members")) {
        const [amount, poolId, investorId] = params;
        const member = mockDb.pool_members.find(pm => pm.pool_id === poolId && pm.investor_id === investorId);
        if (member) {
          member.called_amount += Number(amount);
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 默认返回空数组
      resolve([]);
    }, 100);
  });
}

/**
 * 模拟 SQL 递归份额计算算法
 * 算法逻辑：
 * 目标池：pool-3 (子池 C)
 * 直接成员：
 *   - inv-1 (张三)：直接 10%
 *   - inv-2 (李四)：直接 20%
 * 池间投资：
 *   - pool-1 (大池 A) 投资 pool-3 (子池 C) 占 50%
 *     - 大池 A 成员：inv-1 (张三) 40%, inv-3 (未来资本) 60%
 *     - 张三间接获得：40% * 50% = 20%
 *     - 未来资本间接获得：60% * 50% = 30%
 *   - pool-2 (大池 B) 投资 pool-3 (子池 C) 占 20%
 *     - 大池 B 成员：inv-2 (李四) 20%, inv-3 (未来资本) 80%
 *     - 李四间接获得：20% * 20% = 4%
 *     - 未来资本间接获得：80% * 20% = 16%
 * 
 * 汇总：
 *   - 张三：直接 10% + 间接 20% = 30%
 *   - 李四：直接 20% + 间接 4% = 24%
 *   - 未来资本：直接 0% + 间接 (30% + 16%) = 46%
 *   总有效份额 = 30% + 24% + 46% = 100%
 */
function calculateEffectiveSharesMock(targetPoolId) {
  if (targetPoolId !== "pool-3") {
    // 如果不是子池C，普通地直接按直接份额结算
    const members = mockDb.pool_members.filter(pm => pm.pool_id === targetPoolId);
    return members.map(pm => {
      const investor = mockDb.investors.find(i => i.id === pm.investor_id);
      return {
        investor_id: pm.investor_id,
        investor_name: investor ? investor.name : "未知 LP",
        direct_share: pm.share_pct,
        indirect_share: 0,
        effective_share: pm.share_pct
      };
    });
  }

  // 子池 C 的精确折算
  return [
    { investor_id: "inv-3", investor_name: "未来资本基金", direct_share: 0.0000, indirect_share: 46.0000, effective_share: 46.0000 },
    { investor_id: "inv-1", investor_name: "张三", direct_share: 10.0000, indirect_share: 20.0000, effective_share: 30.0000 },
    { investor_id: "inv-2", investor_name: "李四", direct_share: 20.0000, indirect_share: 4.0000, effective_share: 24.0000 }
  ];
}
