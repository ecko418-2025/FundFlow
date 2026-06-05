import { app } from "./cloudbase";

// 本地开发模拟数据，保障前端立即可以 WOW 预览
const mockDb = {
  pools: [
    { id: "pool-1", name: "2024综合大池 A", description: "年度主要资金池", status: "active", currency: "CNY", total_committed: 50000000, available_balance: 5000000, type: "capital", start_date: "2024-01-01", end_date: "2029-12-31", created_at: "2024-01-01 10:00:00", created_by: "admin" },
    { id: "pool-2", name: "2024科技成长池 B", description: "高成长性项目专项池", status: "active", currency: "CNY", total_committed: 30000000, available_balance: 10000000, type: "temporary_annually", start_date: "2024-01-01", end_date: "2024-12-31", created_at: "2024-02-15 14:30:00", created_by: "admin" },
    { id: "pool-3", name: "2024新能源子池 C", description: "新能源子项目投资池", status: "closed", currency: "CNY", total_committed: 10000000, available_balance: 0, type: "temporary_quarterly", start_date: "2024-01-01", end_date: "2024-03-31", created_at: "2024-03-01 09:00:00", created_by: "admin" }
  ],
  investors: [
    { id: "inv-1", name: "张三", type: "individual", email: "zhangsan@example.com", uid: "uid-zhangsan", phone: "13800001111", contact: "张三", note: "大额个人出资人", created_at: "2024-01-01 10:30:00" },
    { id: "inv-2", name: "李四", type: "individual", email: "lisi@example.com", uid: "uid-lisi", phone: "13800002222", contact: "李四", note: "普通合伙人", created_at: "2024-01-02 11:00:00" },
    { id: "inv-3", name: "未来资本基金", type: "fund", email: "future@example.com", uid: "uid-future", phone: "021-88888888", contact: "王经理", note: "机构出资方", created_at: "2024-01-03 15:00:00" }
  ],
  pool_members: [
    { id: "pm-1", pool_id: "pool-1", investor_id: "inv-1", committed_amount: 20000000, called_amount: 15000000, share_pct: 42.8571, status: "active", joined_at: "2024-01-01 11:00:00" },
    { id: "pm-2", pool_id: "pool-1", investor_id: "inv-3", committed_amount: 30000000, called_amount: 20000000, share_pct: 57.1429, status: "active", joined_at: "2024-01-01 11:00:00" },
    { id: "pm-3", pool_id: "pool-2", investor_id: "inv-2", committed_amount: 10000000, called_amount: 5000000, share_pct: 25.0000, status: "active", joined_at: "2024-02-15 15:00:00" },
    { id: "pm-4", pool_id: "pool-2", investor_id: "inv-3", committed_amount: 20000000, called_amount: 15000000, share_pct: 75.0000, status: "active", joined_at: "2024-02-15 15:00:00" }
  ],
  pool_investments: [
    { id: "pi-1", parent_pool_id: "pool-1", child_pool_id: "pool-3", invested_amount: 5000000, share_pct: 50.0000, status: "active", invested_at: "2024-03-01 10:00:00", note: "大池A出资一半" },
    { id: "pi-2", parent_pool_id: "pool-2", child_pool_id: "pool-3", invested_amount: 5000000, share_pct: 50.0000, status: "active", invested_at: "2024-03-02 11:00:00", note: "大池B出资一半" }
  ],
  projects: [
    { id: "proj-1", pool_id: "pool-1", name: "芯片半导体制造项目", code: "P-2024-001", status: "active", start_date: "2024-01-10", expected_end_date: "2026-12-31", actual_end_date: null, committed_amount: 20000000, invested_amount: 20000000, returned_amount: 0, description: "先进制程制造研发投融资", tags: ["芯片", "硬科技"], created_at: "2024-01-10 11:00:00" },
    { id: "proj-2", pool_id: "pool-2", name: "高倍率固态锂电池研发", code: "P-2024-002", status: "exited", start_date: "2024-03-05", expected_end_date: "2025-12-31", actual_end_date: "2024-05-20", committed_amount: 10000000, invested_amount: 10000000, returned_amount: 10000000, description: "新能源固态电池项目（已退出）", tags: ["固态电池", "新能源"], created_at: "2024-03-05 10:00:00" },
    { id: "proj-3", pool_id: "pool-1", name: "人形机器人研发中心", code: "P-2024-003", status: "active", start_date: "2024-04-10", expected_end_date: "2027-12-31", actual_end_date: null, committed_amount: 30000000, invested_amount: 30000000, returned_amount: 0, description: "具身智能和人形机器人核心部件研发", tags: ["机器人", "AI"], created_at: "2024-04-10 11:00:00" },
    { id: "proj-4", pool_id: "pool-3", name: "低空经济无人机制造", code: "P-2024-004", status: "active", start_date: "2024-05-05", expected_end_date: "2026-12-31", actual_end_date: null, committed_amount: 15000000, invested_amount: 15000000, returned_amount: 0, description: "eVTOL 及工业级无人机量产产线", tags: ["低空经济", "高端制造"], created_at: "2024-05-05 10:00:00" },
    { id: "proj-5", pool_id: "pool-1", name: "商业航天卫星组网项目 (考察中)", code: "P-2024-005", status: "pre", start_date: null, expected_end_date: "2030-12-31", actual_end_date: null, committed_amount: 0, invested_amount: 0, returned_amount: 0, description: "低轨卫星互联网星座", tags: ["商业航天"], created_at: "2024-06-01 10:00:00" }
  ],
  transactions: [
    // Pool 1 Capital Calls
    { id: "tx-1", pool_id: "pool-1", project_id: null, investor_id: "inv-1", type: "capital_call", direction: "in", amount: 15000000, date: "2024-01-02", description: "张三实缴出资", reference_no: "RE-20240102-01", attachment_url: null, created_at: "2024-01-02 10:00:00", created_by: "admin" },
    { id: "tx-2", pool_id: "pool-1", project_id: null, investor_id: "inv-3", type: "capital_call", direction: "in", amount: 20000000, date: "2024-01-02", description: "未来资本实缴出资", reference_no: "RE-20240102-02", attachment_url: null, created_at: "2024-01-02 10:05:00", created_by: "admin" },
    // Pool 2 Capital Calls
    { id: "tx-3", pool_id: "pool-2", project_id: null, investor_id: "inv-2", type: "capital_call", direction: "in", amount: 5000000, date: "2024-02-16", description: "李四实缴出资", reference_no: "RE-20240216-01", attachment_url: null, created_at: "2024-02-16 10:00:00", created_by: "admin" },
    { id: "tx-4", pool_id: "pool-2", project_id: null, investor_id: "inv-3", type: "capital_call", direction: "in", amount: 15000000, date: "2024-02-16", description: "未来资本实缴出资", reference_no: "RE-20240216-02", attachment_url: null, created_at: "2024-02-16 10:05:00", created_by: "admin" },
    // Project 1 Investments (1500w from pool-1, 500w from inv-1)
    { id: "tx-5", pool_id: "pool-1", project_id: "proj-1", investor_id: "pool-1", type: "investment", direction: "out", amount: 15000000, date: "2024-01-15", description: "大池A向芯片项目打款", reference_no: "PAY-20240115-01", attachment_url: null, created_at: "2024-01-15 14:00:00", created_by: "admin" },
    { id: "tx-6", pool_id: null, project_id: "proj-1", investor_id: "inv-1", type: "investment", direction: "out", amount: 5000000, date: "2024-01-16", description: "张三直投芯片项目", reference_no: "PAY-20240116-01", attachment_url: null, created_at: "2024-01-16 10:00:00", created_by: "admin" },
    // Project 2 Investments (1000w from pool-2)
    { id: "tx-7", pool_id: "pool-2", project_id: "proj-2", investor_id: "pool-2", type: "investment", direction: "out", amount: 10000000, date: "2024-03-06", description: "大池B向电池项目打款", reference_no: "PAY-20240306-01", attachment_url: null, created_at: "2024-03-06 14:00:00", created_by: "admin" },
    // Pool Transfers (pool-1 -> pool-3, pool-2 -> pool-3)
    { id: "tx-8", pool_id: "pool-1", project_id: null, investor_id: null, related_pool_id: "pool-3", type: "pool_transfer_out", direction: "out", amount: 5000000, date: "2024-03-01", description: "大池A划拨子池C", reference_no: "TR-20240301-01", attachment_url: null, created_at: "2024-03-01 10:00:00", created_by: "admin" },
    { id: "tx-9", pool_id: "pool-3", project_id: null, investor_id: null, related_pool_id: "pool-1", type: "pool_transfer_in", direction: "in", amount: 5000000, date: "2024-03-01", description: "收到大池A划拨", reference_no: "TR-20240301-01", attachment_url: null, created_at: "2024-03-01 10:00:00", created_by: "admin" },
    { id: "tx-10", pool_id: "pool-2", project_id: null, investor_id: null, related_pool_id: "pool-3", type: "pool_transfer_out", direction: "out", amount: 5000000, date: "2024-03-02", description: "大池B划拨子池C", reference_no: "TR-20240302-01", attachment_url: null, created_at: "2024-03-02 11:00:00", created_by: "admin" },
    { id: "tx-11", pool_id: "pool-3", project_id: null, investor_id: null, related_pool_id: "pool-2", type: "pool_transfer_in", direction: "in", amount: 5000000, date: "2024-03-02", description: "收到大池B划拨", reference_no: "TR-20240302-01", attachment_url: null, created_at: "2024-03-02 11:00:00", created_by: "admin" },
    // Project 3 Investments (1000w from pool-1, 2000w from inv-3)
    { id: "tx-12", pool_id: "pool-1", project_id: "proj-3", investor_id: "pool-1", type: "investment", direction: "out", amount: 10000000, date: "2024-04-15", description: "大池A向机器人项目打款", reference_no: "PAY-20240415-01", attachment_url: null, created_at: "2024-04-15 14:00:00", created_by: "admin" },
    { id: "tx-13", pool_id: null, project_id: "proj-3", investor_id: "inv-3", type: "investment", direction: "out", amount: 20000000, date: "2024-04-16", description: "未来资本直投机器人项目", reference_no: "PAY-20240416-01", attachment_url: null, created_at: "2024-04-16 10:00:00", created_by: "admin" },
    // Project 4 Investments (1000w from pool-3, 500w from pool-2)
    { id: "tx-14", pool_id: "pool-3", project_id: "proj-4", investor_id: "pool-3", type: "investment", direction: "out", amount: 10000000, date: "2024-05-06", description: "子池C向无人机项目打款", reference_no: "PAY-20240506-01", attachment_url: null, created_at: "2024-05-06 14:00:00", created_by: "admin" },
    { id: "tx-15", pool_id: "pool-2", project_id: "proj-4", investor_id: "pool-2", type: "investment", direction: "out", amount: 5000000, date: "2024-05-07", description: "大池B向无人机项目打款", reference_no: "PAY-20240507-01", attachment_url: null, created_at: "2024-05-07 10:00:00", created_by: "admin" },
    // Project 2 Returns (1200w to pool-2)
    { id: "tx-16", pool_id: "pool-2", project_id: "proj-2", investor_id: "pool-2", type: "return", direction: "in", amount: 10000000, date: "2024-05-20", description: "电池项目退出回款", reference_no: "RET-20240520-01", attachment_url: null, created_at: "2024-05-20 10:00:00", created_by: "admin" }
  ],
  project_investors: [
    { id: "pi-inv-1", project_id: "proj-1", investor_id: "pool-1", committed_amount: 15000000, invested_amount: 15000000, status: "active", joined_at: "2024-01-10 12:00:00" },
    { id: "pi-inv-2", project_id: "proj-1", investor_id: "inv-1", committed_amount: 5000000, invested_amount: 5000000, status: "active", joined_at: "2024-01-10 12:00:00" },
    { id: "pi-inv-3", project_id: "proj-2", investor_id: "pool-2", committed_amount: 10000000, invested_amount: 10000000, status: "active", joined_at: "2024-03-05 12:00:00" },
    { id: "pi-inv-4", project_id: "proj-3", investor_id: "pool-1", committed_amount: 10000000, invested_amount: 10000000, status: "active", joined_at: "2024-04-10 12:00:00" },
    { id: "pi-inv-5", project_id: "proj-3", investor_id: "inv-3", committed_amount: 20000000, invested_amount: 20000000, status: "active", joined_at: "2024-04-10 12:00:00" },
    { id: "pi-inv-6", project_id: "proj-4", investor_id: "pool-3", committed_amount: 10000000, invested_amount: 10000000, status: "active", joined_at: "2024-05-05 12:00:00" },
    { id: "pi-inv-7", project_id: "proj-4", investor_id: "pool-2", committed_amount: 5000000, invested_amount: 5000000, status: "active", joined_at: "2024-05-05 12:00:00" }
  ],
  distributions: [],
  distribution_items: [],
  settings: [
    { 
      key: "system_tags", 
      value: JSON.stringify([
        {
          id: "cat_attr",
          name: "公司属性分类",
          color: "var(--accent-blue)",
          tags: ["芯片", "硬科技", "人工智能", "低空经济", "机器人", "固态电池", "新能源", "AI", "高端制造"]
        },
        {
          id: "cat_team",
          name: "团队分类标签",
          color: "var(--accent-gold)",
          tags: []
        },
        {
          id: "cat_nature",
          name: "项目性质标签",
          color: "var(--accent-green)",
          tags: []
        }
      ])
    }
  ],
  users: [
    { uid: "uid-admin", email: "admin@example.com", role: "admin", investor_id: null, display_name: "系统管理员" },
    { uid: "uid-ecko418", email: "ecko418@gmail.com", role: "admin", investor_id: null, display_name: "ecko418（管理员）" },
    { uid: "uid-zhangsan", email: "zhangsan@example.com", role: "lp", investor_id: "inv-1", display_name: "张三" },
    { uid: "uid-lisi", email: "lisi@example.com", role: "lp", investor_id: "inv-2", display_name: "李四" },
    { uid: "uid-future", email: "future@example.com", role: "lp", investor_id: "inv-3", display_name: "未来资本" }
  ]
};

// 是否开启 Mock 模式。默认开启，只有在 localStorage 中明确设置为 "false" 时才关闭
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
    console.error("云数据库执行失败：", error.message);
    throw error;
  }
}

/**
 * 检查数据库连接状态（云函数可达性）
 * @returns {Promise<boolean>} true 表示可以正常连接，false 表示连接失败或使用 Mock 数据
 */
export async function checkDBConnection() {
  if (USE_MOCK) {
    // 在本地 Mock 模式下，默认认为可以访问
    return true;
  }
  try {
    const res = await app.callFunction({
      name: "ping",
      data: {}
    });
    // 假设云函数返回 { code: 0, data: 'pong' }
    return res.result && res.result.code === 0;
  } catch (error) {
    console.warn("数据库连接检查失败：", error.message);
    return false;
  }
}

/**
 * 本地极简 SQL 仿真器，用于前端独立无缝演示
 */
function simulateSQL(sql, params) {
  const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
  
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // 0a. 查询特定流水 (获取流水详情用于冲回)
      if (normalizedSql.startsWith("select * from transactions") && normalizedSql.includes("where id = ?")) {
        const txId = params[0];
        const tx = mockDb.transactions.find(t => t.id === txId);
        resolve(tx ? [JSON.parse(JSON.stringify(tx))] : []);
        return;
      }

      // 0b. 删除特定流水
      if (normalizedSql.startsWith("delete from transactions") && normalizedSql.includes("where id = ?")) {
        const txId = params[0];
        mockDb.transactions = mockDb.transactions.filter(t => t.id !== txId);
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 0c. 自动修复历史流水中缺失 investor_id (将池级投资/回款的 investor_id 兜底填为 pool_id)
      if (normalizedSql.startsWith("update transactions") && normalizedSql.includes("set investor_id = pool_id")) {
        mockDb.transactions.forEach(t => {
          if (!t.investor_id && t.pool_id && (t.type === 'investment' || t.type === 'return')) {
            t.investor_id = t.pool_id;
          }
        });
        resolve({ code: 0, message: "OK", affectedRows: mockDb.transactions.length, data: [] });
        return;
      }

      // 1. 获取所有资金池
      if (normalizedSql.startsWith("select * from pools")) {
        const attachDynamicBalance = (pool) => {
          const poolTxs = mockDb.transactions.filter(t => t.pool_id === pool.id);
          const dynamicBalance = poolTxs.reduce((sum, tx) => {
            return sum + (tx.direction === 'in' ? tx.amount : -tx.amount);
          }, 0);
          return { ...pool, available_balance: dynamicBalance };
        };

        // Handle filter by id if queried
        if (normalizedSql.includes("where id = ?")) {
          const poolId = params[0];
          const pool = mockDb.pools.find(p => p.id === poolId);
          resolve(pool ? [JSON.parse(JSON.stringify(attachDynamicBalance(pool)))] : []);
          return;
        }
        resolve(JSON.parse(JSON.stringify(mockDb.pools.map(attachDynamicBalance))));
        return;
      }
      
      // 2. 获取所有出资方
      if (normalizedSql.startsWith("select * from investors")) {
        if (normalizedSql.includes("where id = ?")) {
          const invId = params[0];
          const result = mockDb.investors.find(i => i.id === invId);
          resolve(result ? [JSON.parse(JSON.stringify(result))] : []);
          return;
        }
        resolve(JSON.parse(JSON.stringify(mockDb.investors)));
        return;
      }

      // Settings 查询
      if (normalizedSql.startsWith("select * from settings")) {
        resolve(JSON.parse(JSON.stringify(mockDb.settings)));
        return;
      }

      // Users 查询
      if (normalizedSql.startsWith("select * from users")) {
        if (normalizedSql.includes("where investor_id = ?")) {
          const invId = params[0];
          const result = (mockDb.users || []).filter(u => u.investor_id === invId);
          resolve(JSON.parse(JSON.stringify(result)));
          return;
        }
        if (normalizedSql.includes("where uid = ?")) {
          const uidVal = params[0];
          const result = (mockDb.users || []).filter(u => u.uid === uidVal);
          resolve(JSON.parse(JSON.stringify(result)));
          return;
        }
        resolve(JSON.parse(JSON.stringify(mockDb.users || [])));
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

      // 5. 获取某个资金池成员（支持 JOIN investors 联表查询，兼容多种 SELECT 写法）
      if (
        normalizedSql.includes("from pool_members pm") ||
        normalizedSql.includes("select * from pool_members")
      ) {
        let result = mockDb.pool_members;
        if (normalizedSql.includes("where pool_id = ?") || normalizedSql.includes("where pm.pool_id = ?")) {
          const poolId = params[0] || "pool-1";
          result = result.filter(pm => pm.pool_id === poolId);
        } else if (normalizedSql.includes("where pm.investor_id = ?")) {
          const invId = params[0];
          result = result.filter(pm => pm.investor_id === invId);
        }
        const statusFilter = normalizedSql.includes("pm.status = 'active'") || normalizedSql.includes("pm.status = ?");
        result = result
          .filter(pm => (!statusFilter || pm.status === "active"))
          .map(pm => {
            const investor = mockDb.investors.find(i => i.id === pm.investor_id);
            const pool = mockDb.pools.find(p => p.id === pm.pool_id);
            return {
              ...pm,
              investor_name: investor ? investor.name : "未知 LP",
              investor_type: investor ? investor.type : "individual",
              pool_name: pool ? pool.name : "未知资金池"
            };
          });
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 6. 获取池间投资关系
      if (normalizedSql.includes("from pool_investments")) {
        let result = [...mockDb.pool_investments];
        if (normalizedSql.includes("where pi.parent_pool_id = ?") || normalizedSql.includes("parent_pool_id = ?")) {
          const pid = params[0];
          result = result.filter(pi => pi.parent_pool_id === pid).map(pi => {
            const childPool = mockDb.pools.find(p => p.id === pi.child_pool_id);
            return { ...pi, child_pool_name: childPool ? childPool.name : "未知子池" };
          });
        } else if (normalizedSql.includes("where pi.child_pool_id = ?") || normalizedSql.includes("child_pool_id = ?")) {
          const cid = params[0];
          result = result.filter(pi => pi.child_pool_id === cid).map(pi => {
            const parentPool = mockDb.pools.find(p => p.id === pi.parent_pool_id);
            return { ...pi, parent_pool_name: parentPool ? parentPool.name : "未知母池" };
          });
        }
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 7. 项目列表查询 (带 pool_name)
      if (normalizedSql.includes("select pr.*, p.name as pool_name from projects pr")) {
        // Check filter by project ID
        if (normalizedSql.includes("where pr.id = ?")) {
          const projId = params[0];
          const pr = mockDb.projects.find(p => p.id === projId);
          if (pr) {
            const pool = mockDb.pools.find(p => p.id === pr.pool_id);
            resolve([JSON.parse(JSON.stringify({ ...pr, pool_name: pool ? pool.name : "未知资金池" }))]);
          } else {
            resolve([]);
          }
          return;
        }
        const result = mockDb.projects.map(pr => {
          const pool = mockDb.pools.find(p => p.id === pr.pool_id);
          return { ...pr, pool_name: pool ? pool.name : "未知资金池" };
        });
        result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 9. 获取分配历史 (distributions)
      if (normalizedSql.includes("from distributions d")) {
        let result = mockDb.distributions;
        if (normalizedSql.includes("where d.pool_id = ?")) {
          const poolId = params[0];
          result = result.filter(d => d.pool_id === poolId);
        }
        result = result.map(d => {
          const pr = mockDb.projects.find(p => p.id === d.project_id);
          const pl = mockDb.pools.find(p => p.id === d.pool_id);
          return { 
            ...d, 
            project_name: pr ? pr.name : null, 
            project_code: pr ? pr.code : null,
            pool_name: pl ? pl.name : null,
            pool_code: pl ? pl.contract_no : null
          };
        });
        result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 10. 获取分配明细 (distribution_items)
      if (normalizedSql.includes("from distribution_items di") && normalizedSql.includes("where di.distribution_id = ?")) {
        const distId = params[0];
        let result = mockDb.distribution_items.filter(di => di.distribution_id === distId).map(di => {
          const inv = mockDb.investors.find(i => i.id === di.investor_id);
          const pool = mockDb.pools.find(p => p.id === di.investor_id);
          return { ...di, investor_name: inv ? inv.name : (pool ? pool.name : null) };
        });
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 10b. 出资方的所有分配明细 (带分配日期)
      if (normalizedSql.includes("from distribution_items di") && normalizedSql.includes("join distributions d") && normalizedSql.includes("where di.investor_id = ?")) {
        const invId = params[0];
        let result = mockDb.distribution_items.filter(di => di.investor_id === invId).map(di => {
          const dist = mockDb.distributions.find(d => d.id === di.distribution_id);
          const pool = dist ? mockDb.pools.find(p => p.id === dist.pool_id) : null;
          const project = dist ? mockDb.projects.find(p => p.id === dist.project_id) : null;
          return { 
            ...di, 
            ...dist, 
            pool_name: pool ? pool.name : null,
            project_name: project ? project.name : null,
            dist_pool_id: dist ? dist.pool_id : null,
            dist_project_id: dist ? dist.project_id : null
          };
        });
        result.sort((a, b) => new Date(b.distribution_date || 0) - new Date(a.distribution_date || 0));
        resolve(JSON.parse(JSON.stringify(result)));
        return;
      }

      // 8. 账本流水列表查询 (带 pool_name, project_name, investor_name)
      if (normalizedSql.includes("from transactions t") && normalizedSql.includes("join pools p") && normalizedSql.includes("join projects")) {
        let result = mockDb.transactions.map(t => {
          const pool = mockDb.pools.find(p => p.id === t.pool_id);
          const relatedPool = mockDb.pools.find(p => p.id === t.related_pool_id);
          const project = mockDb.projects.find(pr => pr.id === t.project_id);
          let investor = mockDb.investors.find(i => i.id === t.investor_id);
          if (!investor) {
            const poolAsInvestor = mockDb.pools.find(p => p.id === t.investor_id);
            if (poolAsInvestor) investor = { name: poolAsInvestor.name };
          }
          return {
            ...t,
            pool_name: pool ? pool.name : null,
            related_pool_name: relatedPool ? relatedPool.name : null,
            project_name: project ? project.name : null,
            investor_name: investor ? investor.name : null
          };
        });

        // Apply filters
        // Check if query filters by pool_id
        if (normalizedSql.includes("t.pool_id = ?")) {
          const poolId = params[params.length - 1]; // standard last param, or we can check index
          // Let's search in params
          result = result.filter(r => r.pool_id === poolId);
        }
        // Check if query filters by project_id
        if (normalizedSql.includes("t.project_id = ?")) {
          const projId = params[0];
          result = result.filter(r => r.project_id === projId);
        }
        // Check if query filters by investor_id
        if (normalizedSql.includes("t.investor_id = ?")) {
          const invId = params[0];
          result = result.filter(r => r.investor_id === invId);
        }

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

      // 9b. 出资方全量列表查询（带type）
      if (normalizedSql.startsWith("select id, name, type from investors")) {
        resolve(mockDb.investors.map(i => ({ id: i.id, name: i.name, type: i.type })));
        return;
      }

      // 10. 项目简易下拉列表查询
      if (normalizedSql.startsWith("select id, name") && normalizedSql.includes("from projects")) {
        resolve(mockDb.projects.map(p => ({ id: p.id, name: p.name, status: p.status })));
        return;
      }

      // 10b. 获取项目出资方列表（JOIN investors）
      if (normalizedSql.includes("from project_investors pi") || normalizedSql.includes("from project_investors")) {
        let result = mockDb.project_investors || [];
        
        if (normalizedSql.includes("where pi.project_id = ?") || (normalizedSql.includes("where project_id = ?"))) {
          const projectId = params[0];
          result = result.filter(pi => pi.project_id === projectId);
        } else if (normalizedSql.includes("where pi.investor_id = ?")) {
          const invId = params[0];
          result = result.filter(pi => pi.investor_id === invId);
        } else if (params && params[0]) {
           // Fallback for older queries that might not specify column clearly
           const idParam = params[0];
           if (idParam.startsWith('proj-')) {
             result = result.filter(pi => pi.project_id === idParam);
           }
        }

        result = result.map(pi => {
            let investor = mockDb.investors.find(i => i.id === pi.investor_id);
            if (!investor) {
              const pool = mockDb.pools.find(p => p.id === pi.investor_id);
              if (pool) {
                investor = { name: pool.name, type: 'pool' };
              }
            }
            const project = mockDb.projects.find(pr => pr.id === pi.project_id);
            return {
              ...pi,
              investor_name: investor ? investor.name : "未知",
              investor_type: investor ? investor.type : "individual",
              project_name: project ? project.name : "未知项目",
              project_status: project ? project.status : "pre"
            };
          });
        resolve(JSON.parse(JSON.stringify(result)));
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

      // 11b. 插入资金池直接出资人关系 (pool_members)
      if (normalizedSql.startsWith("insert into pool_members")) {
        const [id, pool_id, investor_id, committed_amount] = params;
        // 检查是否已存在
        const exists = mockDb.pool_members.find(pm => pm.pool_id === pool_id && pm.investor_id === investor_id);
        if (exists) {
          reject(new Error("该出资方已在此资金池中，不可重复添加"));
          return;
        }
        mockDb.pool_members.push({
          id,
          pool_id,
          investor_id,
          committed_amount: Number(committed_amount),
          called_amount: 0,
          share_pct: 0,  // 持股比例由前端实时从 called_amount 动态计算
          status: "active",
          joined_at: new Date().toISOString()
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 11c. 插入项目出资方关系 (project_investors)
      if (normalizedSql.startsWith("insert into project_investors")) {
        const [id, project_id, investor_id, committed_amount] = params;
        if (!mockDb.project_investors) mockDb.project_investors = [];
        const exists = mockDb.project_investors.find(pi => pi.project_id === project_id && pi.investor_id === investor_id);
        if (exists) {
          reject(new Error("该出资方已在此项目中，不可重复添加"));
          return;
        }
        mockDb.project_investors.push({
          id, project_id, investor_id,
          committed_amount: Number(committed_amount),
          invested_amount: 0,
          status: "active",
          joined_at: new Date().toISOString()
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 11c-2. 重算出资方在项目的累计投资额 (select sum 模式)
      if (normalizedSql.startsWith("update project_investors") && normalizedSql.includes("select sum(")) {
        const projectId = params[params.length - 2];
        const investorId = params[params.length - 1];
        const isGlobal = !normalizedSql.includes("where project_id =");
        
        mockDb.project_investors.forEach(pi => {
          if (isGlobal || (pi.project_id === projectId && pi.investor_id === investorId)) {
            const invested = mockDb.transactions
              .filter(t => t.project_id === pi.project_id && t.investor_id === pi.investor_id && t.type === 'investment')
              .reduce((sum, t) => sum + Number(t.amount), 0);
            pi.invested_amount = invested;
          }
        });
        resolve({ code: 0, message: "OK", affectedRows: mockDb.project_investors.length, data: [] });
        return;
      }

      // 11d. 更新项目出资方认缴参考额
      if (normalizedSql.startsWith("update project_investors") && normalizedSql.includes("set committed_amount")) {
        const [committedAmount, projectId, investorId] = params;
        const pi = (mockDb.project_investors || []).find(r => r.project_id === projectId && r.investor_id === investorId);
        if (pi) pi.committed_amount = Number(committedAmount);
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 11e. 更新项目出资方累计实际到账（investment 流水触发/删除冲回）
      if (normalizedSql.startsWith("update project_investors") && normalizedSql.includes("invested_amount")) {
        const [amount, projectId, investorId] = params;
        const pi = (mockDb.project_investors || []).find(r => r.project_id === projectId && r.investor_id === investorId);
        if (pi) {
          const isSub = normalizedSql.includes("invested_amount - ?") || normalizedSql.includes("invested_amount-?");
          if (isSub) {
            pi.invested_amount -= Number(amount);
          } else {
            pi.invested_amount += Number(amount);
          }
        }
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
        // Can be length 8 or 10 or 12
        if (params.length >= 12) {
          const [id, pool_id, name, code, status, committed_amount, invested_amount, returned_amount, description, tags, start_date, expected_end_date, contract_no] = params;
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
            start_date,
            expected_end_date,
            contract_no,
            created_at: new Date().toISOString()
          });
        } else if (params.length >= 10) {
          const [id, pool_id, name, code, status, committed_amount, description, tags, start_date, expected_end_date] = params;
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
            start_date,
            expected_end_date,
            created_at: new Date().toISOString()
          });
        } else {
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
            start_date: null,
            expected_end_date: null,
            created_at: new Date().toISOString()
          });
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 14. 插入流水
      if (normalizedSql.startsWith("insert into transactions")) {
        let id, pool_id, project_id, investor_id, related_pool_id, type, direction, amount, date, description, reference_no, created_by;
        if (params.length === 12) {
          [id, pool_id, project_id, investor_id, related_pool_id, type, direction, amount, date, description, reference_no, created_by] = params;
        } else {
          [id, pool_id, project_id, investor_id, type, direction, amount, date, description, reference_no, created_by] = params;
          related_pool_id = null;
        }
        mockDb.transactions.push({
          id,
          pool_id,
          project_id,
          investor_id,
          related_pool_id,
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

      // 14.5. 插入分配和明细
      if (normalizedSql.startsWith("insert into distributions")) {
        const [id, pool_id, project_id, total_amount, distribution_date, description, status, confirmed_at] = params;
        mockDb.distributions.push({
          id,
          pool_id,
          project_id,
          total_amount: Number(total_amount),
          distribution_date,
          description,
          status,
          confirmed_at,
          created_at: new Date().toISOString()
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      if (normalizedSql.startsWith("insert into distribution_items")) {
        const [id, distribution_id, investor_id, direct_share_pct, indirect_share_pct, effective_share_pct, amount] = params;
        mockDb.distribution_items.push({
          id,
          distribution_id,
          investor_id,
          direct_share_pct: Number(direct_share_pct),
          indirect_share_pct: Number(indirect_share_pct),
          effective_share_pct: Number(effective_share_pct),
          amount: Number(amount)
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      if (normalizedSql.startsWith("delete from distribution_items")) {
        const distId = params[0];
        mockDb.distribution_items = mockDb.distribution_items.filter(di => di.distribution_id !== distId);
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      if (normalizedSql.startsWith("delete from distributions")) {
        const distId = params[0];
        mockDb.distributions = mockDb.distributions.filter(d => d.id !== distId);
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      if (normalizedSql.startsWith("delete from pool_members")) {
        const [pool_id, investor_id] = params;
        mockDb.pool_members = mockDb.pool_members.filter(pm => !(pm.pool_id === pool_id && pm.investor_id === investor_id));
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      if (normalizedSql.startsWith("delete from pool_investments")) {
        const [id] = params;
        mockDb.pool_investments = mockDb.pool_investments.filter(pi => pi.id !== id);
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      if (normalizedSql.startsWith("delete from project_investors")) {
        const [project_id, investor_id] = params;
        mockDb.project_investors = mockDb.project_investors.filter(pi => !(pi.project_id === project_id && pi.investor_id === investor_id));
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 15a. 更新资金池全量基本信息（编辑表单提交）
      if (normalizedSql.startsWith("update pools") && normalizedSql.includes("set name")) {
        if (params.length >= 8) {
          const poolId = params[params.length - 1];
          const pool = mockDb.pools.find(p => p.id === poolId);
          if (pool) {
            pool.name = params[0];
            pool.description = params[1];
            pool.total_committed = Number(params[2]);
            pool.type = params[3];
            pool.start_date = params[4] || null;
            pool.end_date = params[5] || null;
            pool.contract_no = params[6] || "";
            if (params.length === 9) {
              pool.status = params[7];
            }
          }
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // Settings 更新
      if (normalizedSql.startsWith("update settings set value")) {
        const [value, key] = params;
        const setting = mockDb.settings.find(s => s.key === key);
        if (setting) {
          setting.value = value;
        } else {
          mockDb.settings.push({ key, value });
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }
      // 15b-2. 重算资金池可用余额 (select sum 模式)
      if (normalizedSql.startsWith("update pools") && normalizedSql.includes("select sum(")) {
        const poolId = params[params.length - 1];
        const isGlobal = !normalizedSql.includes("where id =");

        mockDb.pools.forEach(pool => {
          if (isGlobal || pool.id === poolId) {
            const balance = mockDb.transactions
              .filter(t => t.pool_id === pool.id)
              .reduce((sum, t) => sum + (t.direction === 'in' ? Number(t.amount) : -Number(t.amount)), 0);
            pool.available_balance = balance;
          }
        });
        resolve({ code: 0, message: "OK", affectedRows: mockDb.pools.length, data: [] });
        return;
      }

      // 15b. 更新资金池可用余额（流水触发）
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
      // 16a-2. 重算项目累计投资额与回款额 (select sum 模式)
      if (normalizedSql.startsWith("update projects") && normalizedSql.includes("select sum(")) {
        const projId = params[params.length - 1];
        const isGlobal = !normalizedSql.includes("where id =");

        mockDb.projects.forEach(project => {
          if (isGlobal || project.id === projId) {
            const invested = mockDb.transactions
              .filter(t => t.project_id === project.id && t.type === 'investment')
              .reduce((sum, t) => sum + Number(t.amount), 0);
            const returned = mockDb.transactions
              .filter(t => t.project_id === project.id && t.type === 'return')
              .reduce((sum, t) => sum + Number(t.amount), 0);
            project.invested_amount = invested;
            project.returned_amount = returned;
          }
        });
        resolve({ code: 0, message: "OK", affectedRows: mockDb.projects.length, data: [] });
        return;
      }

      // 16a. 更新项目全量基本信息（编辑表单提交）
      if (normalizedSql.startsWith("update projects") && normalizedSql.includes("set name")) {
        if (params.length >= 9) {
           // We might have contract_no or not.
           const hasContract = params.length === 10;
           const [name, code, status, committed_amount, description, tags, start_date, expected_end_date, contract_no, projId] = hasContract ? params : [...params.slice(0, 8), undefined, params[8]];
           const project = mockDb.projects.find(p => p.id === projId);
           if (project) {
             project.name = name;
             project.code = code;
             project.status = status;
             project.committed_amount = Number(committed_amount);
             project.description = description;
             project.tags = tags ? JSON.parse(tags) : [];
             project.start_date = start_date || null;
             project.expected_end_date = expected_end_date || null;
             if (contract_no !== undefined) project.contract_no = contract_no;
           }
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 16b. 更新项目已投金额或收回金额（流水触发）
      if (normalizedSql.startsWith("update projects")) {
        const [amount, projId] = params;
        const project = mockDb.projects.find(p => p.id === projId);
        if (project) {
          const isInvested = normalizedSql.includes("invested_amount + ?") || normalizedSql.includes("invested_amount+?");
          const isInvestedSub = normalizedSql.includes("invested_amount - ?") || normalizedSql.includes("invested_amount-?");
          const isReturned = normalizedSql.includes("returned_amount + ?") || normalizedSql.includes("returned_amount+?");
          const isReturnedSub = normalizedSql.includes("returned_amount - ?") || normalizedSql.includes("returned_amount-?");
          if (isInvested) {
            project.invested_amount += Number(amount);
          } else if (isInvestedSub) {
            project.invested_amount -= Number(amount);
          } else if (isReturned) {
            project.returned_amount += Number(amount);
          } else if (isReturnedSub) {
            project.returned_amount -= Number(amount);
          }
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }
      // 17b-2. 重算成员累计实缴额 (select sum 模式)
      if (normalizedSql.startsWith("update pool_members") && normalizedSql.includes("select sum(")) {
        const poolId = params[params.length - 2];
        const investorId = params[params.length - 1];
        const isGlobal = !normalizedSql.includes("where pool_id =");

        mockDb.pool_members.forEach(pm => {
          if (isGlobal || (pm.pool_id === poolId && pm.investor_id === investorId)) {
            const called = mockDb.transactions
              .filter(t => t.pool_id === pm.pool_id && t.investor_id === pm.investor_id && t.type === 'capital_call')
              .reduce((sum, t) => sum + Number(t.amount), 0);
            pm.called_amount = called;
          }
        });
        resolve({ code: 0, message: "OK", affectedRows: mockDb.pool_members.length, data: [] });
        return;
      }

      // 17a. 更新成员认缴参考额（编辑表单，持股比例动态计算不存储）
      if (normalizedSql.startsWith("update pool_members") && normalizedSql.includes("set committed_amount")) {
        const [committedAmount, poolId, investorId] = params;
        const member = mockDb.pool_members.find(pm => pm.pool_id === poolId && pm.investor_id === investorId);
        if (member) {
          member.committed_amount = Number(committedAmount);
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 17b. 更新成员累计实缴（capital_call 流水触发/删除冲回）
      if (normalizedSql.startsWith("update pool_members")) {
        const [amount, poolId, investorId] = params;
        const member = mockDb.pool_members.find(pm => pm.pool_id === poolId && pm.investor_id === investorId);
        if (member) {
          const isSub = normalizedSql.includes("called_amount - ?") || normalizedSql.includes("called_amount-?");
          if (isSub) {
            member.called_amount -= Number(amount);
          } else {
            member.called_amount += Number(amount);
          }
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 18. 插入新资金池
      if (normalizedSql.startsWith("insert into pools")) {
        const [id, name, description, total_committed, available_balance, type, start_date, end_date, created_by, contract_no] = params.length === 10 ? params : [...params, undefined];
        mockDb.pools.push({
          id,
          name,
          description,
          total_committed: Number(total_committed),
          available_balance: Number(available_balance),
          type,
          start_date,
          end_date,
          status: "active",
          currency: "CNY",
          contract_no,
          created_at: new Date().toISOString(),
          created_by
        });
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 19. 更新出资方基本信息与UID
      if (normalizedSql.startsWith("update investors") && normalizedSql.includes("set name")) {
        const [name, type, email, uid, phone, contact, note, id] = params;
        const inv = mockDb.investors.find(i => i.id === id);
        if (inv) {
          inv.name = name;
          inv.type = type;
          inv.email = email;
          inv.uid = uid;
          inv.phone = phone;
          inv.contact = contact;
          inv.note = note;
        }
        resolve({ code: 0, message: "OK", affectedRows: 1, data: [] });
        return;
      }

      // 20. 更新或创建关联登录用户映射表
      if (normalizedSql.startsWith("update users")) {
        const [uid, email, display_name, investor_id] = params;
        if (!mockDb.users) mockDb.users = [];
        const user = mockDb.users.find(u => u.investor_id === investor_id);
        if (user) {
          user.uid = uid;
          user.email = email;
          user.display_name = display_name;
        } else {
          mockDb.users.push({ uid, email, role: "lp", investor_id, display_name });
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
