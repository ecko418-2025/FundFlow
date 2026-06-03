# 项目制资金池记账系统 — 完整开发规划

> 项目名称：FundFlow（资金流）  
> 技术栈：React 18 + Vite + Firebase（Auth + Data Connect/PostgreSQL + Hosting）  
> 开发语言：中文界面 / 单一人民币

---

## 一、产品定位与核心场景

### 使用角色
| 角色 | 说明 | 权限 |
|------|------|------|
| **管理员 (Admin)** | 负责记账、配置的核心用户（1-3人） | 全量读写 |
| **出资方 (LP)** | 查看自己在各资金池的份额和收益 | 只读自己相关数据 |

### 核心业务流程

```
1. 管理员 → 创建资金池（可包含最深三层的母子池层级，且一个小池可有多个母池投资）
2. 管理员 → 设定池间投资关系（如大池投小池，记录投资占比）
3. 出资方 → 实缴出资（管理员录入认缴/实缴记录）
4. 管理员 → 记录项目投放（钱从池子出去打到项目）
5. 管理员 → 记录项目回款（钱从项目回流到池子）
6. 管理员 → 运行分配计算 → 系统通过递归查询计算出资方的有效份额（直接份额 + 通过各级母池折算的间接份额） → 按最终有效份额比例分钱
7. 出资方 → 登录查看自己在各个池子的有效份额（含直接/间接来源明细）与收益
```

> **有效份额累加说明**：
> 如果张三直接投资了小池 C（10%），同时投资了大池 B（20%），大池 B 又投资了小池 C（30%）；
> 且张三还投资了超大池 A（50%），超大池 A 投资了大池 B（40%）。
> 则在小池 C 中，张三的有效份额将通过递归逻辑将直接投资与所有间接折算路径进行累加。

---

## 二、数据模型（CloudBase SQL - MySQL 关系表设计）

> 使用腾讯云开发 CloudBase SQL (MySQL 8.0+ 兼容)。
> 原有文档型设计变更为关系型设计，支持外键约束、多表 JOIN、事务以及 `WITH RECURSIVE` 递归查询。

### 关系表结构总览

```
pools                → 资金池主表
investors            → 出资方主表
pool_members         → 池-出资方直接持股关系及份额（多对多）
pool_investments     → 池间投资关系表（大池投资小池，支持最深三层、多母池投资）
projects             → 项目主表
transactions         → 全量流水表（核心账本）
distributions        → 收益分配记录主表
distribution_items   → 分配明细表（记录每个 LP 最终实分得的直接/间接/有效份额及金额）
users                → 账号与角色映射表
```

### ER 关系图

```
┌──────────┐     ┌───────────────┐     ┌──────────┐
│  pools   │◄────│ pool_members  │────►│investors │
│          │     │ (直接份额)     │     │          │
└────┬─────┘     └───────────────┘     └────┬─────┘
     │                                      │
     │  ┌──────────────────┐                │
     ├──│ pool_investments │──┐             │
     │  │ (大池→小池投资)    │  │             │
     │  └──────────────────┘  │             │
     │                        │             │
     ▼                        ▼             │
┌──────────┐           ┌──────────┐         │
│ projects │           │  pools   │         │
│ (项目)    │           │ (子池)   │         │
└──────────┘           └──────────┘         │
     │                                      │
     ▼                                      ▼
┌──────────────┐     ┌─────────────────────────┐
│ transactions │     │ distributions            │
│ (流水账本)    │     │  └─ distribution_items   │
└──────────────┘     │     (记录有效/直接/间接份额)│
                     └─────────────────────────┘
```

---

### 字段详细设计（MySQL 8.0 规范）

#### `pools` — 资金池

```sql
CREATE TABLE pools (
    id                 VARCHAR(36) PRIMARY KEY,      -- 资金池唯一ID (UUID)
    name               VARCHAR(100) NOT NULL,        -- 资金池名称，如"2024年度综合池"
    description        TEXT,                         -- 备注说明
    status             VARCHAR(20) NOT NULL DEFAULT 'active', -- active / closed
    currency           VARCHAR(10) NOT NULL DEFAULT 'CNY',    -- 币种，默认人民币
    total_committed    DECIMAL(18,2) NOT NULL DEFAULT 0.00,   -- 总认缴规模（元）
    available_balance  DECIMAL(18,2) NOT NULL DEFAULT 0.00,   -- 可用余额（实时更新）
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(128) NOT NULL         -- 创建人 UID
);
```

#### `investors` — 出资方

```sql
CREATE TABLE investors (
    id          VARCHAR(36) PRIMARY KEY,      -- 出资方唯一ID (UUID)
    name        VARCHAR(100) NOT NULL,        -- 出资方名称
    type        VARCHAR(20) NOT NULL,         -- 类型：individual(个人) / fund(机构/母基金)
    email       VARCHAR(255) UNIQUE,          -- 登录邮箱
    uid         VARCHAR(128),                 -- 关联的 Auth UID
    phone       VARCHAR(20),                  -- 联系电话
    contact     VARCHAR(100),                 -- 联系人姓名（主要针对机构）
    note        TEXT,                         -- 备注
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### `pool_members` — 池-出资方关系（直接份额）

```sql
CREATE TABLE pool_members (
    id                VARCHAR(36) PRIMARY KEY,
    pool_id           VARCHAR(36) NOT NULL,
    investor_id       VARCHAR(36) NOT NULL,
    committed_amount  DECIMAL(18,2) NOT NULL DEFAULT 0.00, -- 认缴金额
    called_amount     DECIMAL(18,2) NOT NULL DEFAULT 0.00, -- 累计实缴（从流水聚合）
    share_pct         DECIMAL(6,4) NOT NULL DEFAULT 0.0000, -- 直接份额比例（例如 35.5% 记为 35.5000）
    status            VARCHAR(20) NOT NULL DEFAULT 'active', -- active / withdrawn
    joined_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pool_id) REFERENCES pools(id),
    FOREIGN KEY (investor_id) REFERENCES investors(id),
    UNIQUE (pool_id, investor_id) -- 联合唯一约束
);
```

#### ⭐ `pool_investments` — 池间投资关系表

> **支持大池投资小池，允许最多三层投资关系嵌套（如：母池 A → 子池 B → 孙池 C），且同一个子池允许被多个母池投资。**

```sql
CREATE TABLE pool_investments (
    id                VARCHAR(36) PRIMARY KEY,
    parent_pool_id    VARCHAR(36) NOT NULL,         -- 母池ID (大池)
    child_pool_id     VARCHAR(36) NOT NULL,         -- 子池ID (小池)
    invested_amount   DECIMAL(18,2) NOT NULL DEFAULT 0.00,  -- 投资金额
    share_pct         DECIMAL(6,4) NOT NULL DEFAULT 0.0000, -- 母池在子池中所占的份额比例
    status            VARCHAR(20) NOT NULL DEFAULT 'active', -- active / exited
    invested_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note              TEXT,
    FOREIGN KEY (parent_pool_id) REFERENCES pools(id),
    FOREIGN KEY (child_pool_id) REFERENCES pools(id),
    UNIQUE (parent_pool_id, child_pool_id),          -- 避免重复建立投资关系
    CHECK (parent_pool_id <> child_pool_id)          -- 限制自投
);
```

#### `projects` — 项目表

```sql
CREATE TABLE projects (
    id                VARCHAR(36) PRIMARY KEY,
    pool_id           VARCHAR(36) NOT NULL,
    name              VARCHAR(200) NOT NULL,
    code              VARCHAR(50) NOT NULL UNIQUE,          -- 项目唯一编号
    status            VARCHAR(20) NOT NULL DEFAULT 'pre',   -- pre(投前) / active(存续) / exited(退出)
    start_date        DATE,
    expected_end_date DATE,
    actual_end_date   DATE,
    committed_amount  DECIMAL(18,2) NOT NULL DEFAULT 0.00,  -- 计划投放金额
    invested_amount   DECIMAL(18,2) NOT NULL DEFAULT 0.00,  -- 累计实际投入
    returned_amount   DECIMAL(18,2) NOT NULL DEFAULT 0.00,  -- 累计回款
    description       TEXT,
    tags              JSON,                                 -- 标签数组，例如 ["半导体", "天使轮"]
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pool_id) REFERENCES pools(id)
);
```

#### `transactions` — 流水账本

```sql
CREATE TABLE transactions (
    id              VARCHAR(36) PRIMARY KEY,
    pool_id         VARCHAR(36) NOT NULL,
    project_id      VARCHAR(36),
    investor_id     VARCHAR(36),
    type            VARCHAR(30) NOT NULL,                   -- capital_call / investment / return / distribution / fee / adjustment / pool_transfer_out / pool_transfer_in
    direction       VARCHAR(3) NOT NULL,                    -- in(流入池) / out(流出池)
    amount          DECIMAL(18,2) NOT NULL,                 -- 发生金额
    date            DATE NOT NULL,
    description     TEXT,
    reference_no    VARCHAR(100),                           -- 凭证号
    attachment_url  TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(128) NOT NULL,                  -- 操作人 UID
    FOREIGN KEY (pool_id) REFERENCES pools(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (investor_id) REFERENCES investors(id),
    CHECK (amount > 0),
    CHECK (direction IN ('in', 'out'))
);
```

#### `distributions` — 分配记录主表

```sql
CREATE TABLE distributions (
    id                 VARCHAR(36) PRIMARY KEY,
    pool_id            VARCHAR(36) NOT NULL,
    project_id         VARCHAR(36),
    total_amount       DECIMAL(18,2) NOT NULL,              -- 分配总金额
    distribution_date  DATE NOT NULL,
    description        TEXT,
    status             VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft / confirmed
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at       DATETIME,
    FOREIGN KEY (pool_id) REFERENCES pools(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

#### `distribution_items` — 分配明细表

```sql
CREATE TABLE distribution_items (
    id                   VARCHAR(36) PRIMARY KEY,
    distribution_id      VARCHAR(36) NOT NULL,
    investor_id          VARCHAR(36) NOT NULL,
    direct_share_pct     DECIMAL(6,4) NOT NULL DEFAULT 0.0000, -- 获得分配时，在该池直接份额
    indirect_share_pct   DECIMAL(6,4) NOT NULL DEFAULT 0.0000, -- 获得分配时，各母池折算间接份额
    effective_share_pct  DECIMAL(6,4) NOT NULL DEFAULT 0.0000, -- 最终有效份额 (= 直接 + 间接)
    amount               DECIMAL(18,2) NOT NULL,               -- 实分金额
    FOREIGN KEY (distribution_id) REFERENCES distributions(id) ON DELETE CASCADE,
    FOREIGN KEY (investor_id) REFERENCES investors(id),
    UNIQUE (distribution_id, investor_id)
);
```

#### `users` — 账号角色映射表

```sql
CREATE TABLE users (
    uid           VARCHAR(128) PRIMARY KEY,             -- 关联认证系统 UID
    email         VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'lp',    -- admin / lp
    investor_id   VARCHAR(36),                          -- LP 账号绑定的出资方ID
    display_name  VARCHAR(100),
    FOREIGN KEY (investor_id) REFERENCES investors(id)
);
```

---

### 核心 SQL 算法：多层嵌套下 LP 有效份额递归计算

当计算某个目标池子（如 `:target_pool_id`）中的所有 LP 有效份额时，由于存在最深三层母子池嵌套、多母池投资的情况，必须在 SQL 中使用递归公用表表达式（`WITH RECURSIVE`）自下而上回溯所有持股路径：

```sql
WITH RECURSIVE pool_hierarchy AS (
    -- 1. 锚点部分：目标池子本身，路径乘数初始为 1.0，层级设为 0
    SELECT 
        id AS pool_id, 
        CAST(1.0 AS DECIMAL(16,10)) AS path_multiplier,
        0 AS lvl
    FROM pools 
    WHERE id = :target_pool_id

    UNION ALL

    -- 2. 递归部分：查找投资了当前层级池子的 active 母池，层数递增，乘数累乘
    -- 特别设定最多查找 3 层结构以符合业务设定，并防止环状数据引发死循环
    SELECT 
        pi.parent_pool_id AS pool_id,
        CAST(ph.path_multiplier * (pi.share_pct / 100.0) AS DECIMAL(16,10)) AS path_multiplier,
        ph.lvl + 1 AS lvl
    FROM pool_investments pi
    JOIN pool_hierarchy ph ON pi.child_pool_id = ph.pool_id
    WHERE pi.status = 'active'
      AND ph.lvl < 3 -- 限制最多穿透 3 层（孙池→子池→母池）
)
-- 3. 汇总所有持股路径，按投资者维度进行累加
SELECT 
    pm.investor_id,
    i.name AS investor_name,
    -- 直接份额：仅在目标池中直接持有的份额
    SUM(CASE WHEN ph.pool_id = :target_pool_id THEN pm.share_pct ELSE 0.0000 END) AS direct_share,
    -- 间接份额：从所有母池/祖父池路径折算过来的份额之和
    SUM(CASE WHEN ph.pool_id <> :target_pool_id THEN pm.share_pct * ph.path_multiplier ELSE 0.0000 END) AS indirect_share,
    -- 最终有效分配份额 = 直接份额 + 所有路径的折算间接份额
    SUM(pm.share_pct * ph.path_multiplier) AS effective_share
FROM pool_hierarchy ph
JOIN pool_members pm ON pm.pool_id = ph.pool_id
JOIN investors i ON i.id = pm.investor_id
WHERE pm.status = 'active'
GROUP BY pm.investor_id, i.name
ORDER BY effective_share DESC;
```

---

## 三、安全规则与数据隔离（CloudBase 云开发设计）

> 区别于 NoSQL 的前端直连数据库规则，CloudBase SQL (MySQL) 采用**云后台 / 云函数 API 网关**进行统一的安全控制。
> 所有的客户端请求需经过云函数过滤，禁止前端直接拼装不安全的 SQL。

### 1. 统一身份与角色验证中间件 (Middleware)

前端请求通过 CloudBase SDK 携带用户的 ID Token (来自 Auth)。云函数接收后先解析 Token 获取 `uid`，并查询 `users` 表：

```javascript
// 云函数权限校验伪代码
async function checkAuth(context) {
  const auth = context.auth; // CloudBase 自动注入的认证上下文
  if (!auth || !auth.uid) {
    throw new Error('未授权访问');
  }
  
  // 查询用户角色
  const user = await db.query('SELECT role, investor_id FROM users WHERE uid = ?', [auth.uid]);
  if (!user || user.length === 0) {
    throw new Error('用户不存在');
  }
  
  return {
    uid: auth.uid,
    role: user[0].role, // 'admin' 或 'lp'
    investorId: user[0].investor_id
  };
}
```

---

### 2. 核心数据隔离与权限对照表

| 业务数据表 | 管理员权限 (admin) | 出资方权限 (lp) | 云后台 SQL 权限实现逻辑 |
|---|---|---|---|
| `pools` (资金池) | 全量读写 | 只读 | **Admin**: 直接查 `pools`<br>**LP**: 只能查其有直接或间接投资记录的 pools |
| `investors` (出资方) | 全量读写 | 只能读自己 | **LP 限制**: `WHERE id = :myInvestorId` |
| `pool_members` (成员) | 全量读写 | 只能读自己 | **LP 限制**: `WHERE investor_id = :myInvestorId` |
| `pool_investments` (池间投资)| 全量读写 | 只能读自己关联的 | **LP 限制**: 只有该 LP 参与了 parent 或 child 池时才可见该项记录 |
| `projects` (项目) | 全量读写 | 只读 | **LP 限制**: 只能查其所参与池子下的关联项目 |
| `transactions` (流水) | 全量读写 | 只读自己关联的 | **LP 限制**: `WHERE investor_id = :myInvestorId` |
| `distributions` (分配主表)| 全量读写 | 只读自己关联的 | **LP 限制**: 只有自己在 `distribution_items` 中有明细时才可见主表 |
| `distribution_items` (明细)| 全量读写 | 只读自己 | **LP 限制**: `WHERE investor_id = :myInvestorId` |
| `users` (账号) | 全量读写 | 只能读写自己 | **LP 限制**: `WHERE uid = :myUid` |

---

### 3. 数据隔离查询示例 (LP 查看自己流水)

当 LP 登录后请求流水列表，云后台接口固定拼接 `investor_id` 过滤项，防止越权：

```sql
-- LP 端流水查询
SELECT * FROM transactions 
WHERE investor_id = :myInvestorId 
ORDER BY date DESC, created_at DESC;
```

---

## 四、前端页面与组件设计

### 页面目录

```
src/
├── pages/
│   ├── Login.jsx                  // 登录页
│   ├── admin/
│   │   ├── Dashboard.jsx          // 管理员总览
│   │   ├── Pools.jsx              // 资金池列表
│   │   ├── PoolDetail.jsx         // 资金池详情（含项目/成员/流水Tab）
│   │   ├── Investors.jsx          // 出资方管理
│   │   ├── InvestorDetail.jsx     // 出资方详情
│   │   ├── Projects.jsx           // 项目列表
│   │   ├── ProjectDetail.jsx      // 项目详情
│   │   ├── Transactions.jsx       // 全量流水录入与查询
│   │   ├── Distribution.jsx       // 分配计算器
│   │   └── Reports.jsx            // 报表中心
│   └── lp/
│       ├── LPDashboard.jsx        // LP总览（我参与的池子）
│       ├── LPPoolView.jsx         // LP查看某个池子的我的数据
│       └── LPStatement.jsx        // LP对账单（可导出PDF）
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx           // 整体布局（侧边栏+顶栏）
│   │   ├── Sidebar.jsx
│   │   └── TopBar.jsx
│   ├── ui/
│   │   ├── StatCard.jsx           // 数字统计卡片
│   │   ├── DataTable.jsx          // 通用表格（带排序/筛选）
│   │   ├── Modal.jsx              // 弹窗组件
│   │   ├── Badge.jsx              // 状态徽章
│   │   ├── AmountInput.jsx        // 金额输入（自动格式化）
│   │   └── DatePicker.jsx         // 日期选择
│   ├── charts/
│   │   ├── PoolBalanceTrend.jsx   // 资金池余额趋势折线图
│   │   ├── InvestorPieChart.jsx   // 出资方份额环形图
│   │   └── ProjectStatusBar.jsx   // 项目状态进度条
│   └── forms/
│       ├── TransactionForm.jsx    // 流水录入表单
│       ├── ProjectForm.jsx        // 项目新建/编辑表单
│       └── DistributionForm.jsx   // 分配计算表单
├── hooks/
│   ├── useAuth.js                 // 认证状态 (云开发 Auth)
│   ├── usePools.js                // 资金池数据 (云开发 SQL)
│   ├── useTransactions.js         // 流水数据
│   ├── useEffectiveShares.js      // 新增：用于计算递归累加后的 LP 有效份额
│   └── useDistribution.js         // 分配计算
├── lib/
│   ├── cloudbase.js               // 腾讯云开发初始化
│   ├── db.js                      // 云开发 SQL (MySQL) 查询操作封装
│   └── formatters.js              // 金额/日期格式化工具
└── App.jsx                        // 路由入口
```

---

## 五、关键页面交互设计

### 管理员总览（Dashboard）

```
┌────────────────────────────────────────────────┐
│  📊 FundFlow 资金管理系统          [管理员] 张三 ▼│
├─────────┬──────────────────────────────────────┤
│ 🏦 总览  │  总览卡片行                           │
│ 📁 资金池 │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│ 👥 出资方 │  │管理中  │ │总投入  │ │总回款  │ │可用  ││
│ 📁 项目  │  │3个池   │ │3,200万│ │1,800万│ │420万 ││
│ 💳 流水  │  └──────┘ └──────┘ └──────┘ └──────┘│
│ 💰 分配  │                                      │
│ 📊 报表  │  ┌─────────────┐  ┌───────────────┐  │
│ ⚙️ 设置  │  │ 余额趋势图   │  │  出资方份额图  │  │
│          │  │ (折线图)    │  │   (环形图)    │  │
│          │  └─────────────┘  └───────────────┘  │
│          │                                      │
│          │  最近流水          [+ 新增流水]        │
│          │  ┌────────────────────────────────┐  │
│          │  │ 日期  │ 类型  │ 金额 │ 摘要    │  │
│          │  └────────────────────────────────┘  │
└─────────┴──────────────────────────────────────┘
```

### 资金池详情页（Tab 设计）

```
资金池：2024综合池    [状态: 运营中]   总规模: ¥5,000万
总投入: ¥3,200万     可用余额: ¥420万  出资方: 8人

[概览] [出资方] [项目] [流水] [分配记录]

--- 概览 Tab ---
4张统计卡 + 余额趋势图 + 最近10笔流水

--- 出资方 Tab ---
出资方列表（份额比例 / 认缴 / 实缴 / 累计分配）
  ✏️ 可编辑份额比例（实时校验总和=100%）

--- 项目 Tab ---
项目列表（状态标签 / 投入 / 回款 / ROI）
  [+ 新增项目]

--- 流水 Tab ---
流水列表（带类型筛选 / 日期筛选）
  [+ 录入流水]

--- 分配记录 Tab ---
历史分配列表（含草稿状态）
  [+ 新建分配]
```

### 分配计算器

```
新建分配计算
────────────────────────────────
资金池：[2024子池 C ▼]
关联项目：[不限定 ▼]（可选）
分配总额：[¥ 1,000,000 ]
分配日期：[YYYY-MM-DD]
说明备注：[          ]

────────────────────────────────
自动计算结果（递归穿透路径计算）：

  出资方    | 直接份额 | 间接份额 (母池折算) | 有效份额 | 分配金额
  ──────────┼──────────┼─────────────────────┼──────────┼───────────
  张三      |   10.00% |  20.00% (大池A折算) |   30.00% | ¥ 300,000
  李四      |   20.00% |   0.00%             |   20.00% | ¥ 200,000
  王基金    |    0.00% |  50.00% (大池B折算) |   50.00% | ¥ 500,000
  ──────────┼──────────┼─────────────────────┼──────────┼───────────
  合计      |   30.00% |  70.00%             |  100.00% | ¥ 1,000,000 ✓

  [ 保存草稿 ]    [ 确认分配 → 写入流水并存入 distribution_items ]
```

### LP 个人视图（出资方登录后）

```
您好，张三  [退出]

我参与的资金池 (3 个)

┌────────────────────────────────────────────────────────┐
│ 2024子池 C                                   [运营中]   │
│ 我的份额:                                              │
│   ├─ 直接持有: 10.00%                                  │
│   └─ 间接持有: 20.00% (通过大池 A 持股 40% × 大池 A 投小池 50%)│
│   └─ 最终有效: 30.00%                                  │
│ 认缴(直接): ¥500万    实缴(直接): ¥500万                 │
│ 累计分配收到: ¥60万 (按有效份额折算)                     │
│                                              [查看详情] │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 2024大池 A                                   [运营中]   │
│ 我的份额: 40.00% (直接)                                 │
│ ...                                                    │
└────────────────────────────────────────────────────────┘

[ 导出我的完整对账单 PDF ]
```

---

## 六、UI 设计系统

### 色彩体系

```css
/* 主背景 */
--bg-primary:    #0D1117;   /* 深黑 */
--bg-secondary:  #161B22;   /* 卡片背景 */
--bg-tertiary:   #21262D;   /* 输入框/表格行 */

/* 主题色 */
--accent-blue:   #2563EB;   /* 操作按钮 */
--accent-gold:   #F59E0B;   /* 数字高亮/金额 */
--accent-green:  #10B981;   /* 正向 / 流入 */
--accent-red:    #EF4444;   /* 负向 / 流出 */

/* 文字 */
--text-primary:  #E6EDF3;
--text-secondary:#8B949E;
--text-muted:    #484F58;

/* 边框 */
--border:        #30363D;
```

### 字体

```css
/* 中文 */
font-family: 'Noto Sans SC', -apple-system, sans-serif;
/* 数字 (等宽/金融感) */
font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
```

### 微动效规范

```css
/* 卡片悬浮 */
transition: transform 0.2s ease, box-shadow 0.2s ease;
card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }

/* 按钮点击 */
button:active { transform: scale(0.97); }

/* 数字变化 */
/* 使用 countup.js 动态滚动数字 */

/* 页面切换 */
/* fade-in: opacity 0→1, translateY 8px→0, 150ms */
```

---

## 七、分阶段开发计划

### Phase 1 — 基础架构（Day 1）
- [ ] Vite + React 项目初始化
- [ ] 腾讯云开发 CloudBase 项目创建与初始化（环境配置、Auth 启用、SQL 数据库开通）
- [ ] 数据库表结构初始化（导入 pools, investors, pool_members, pool_investments 等 SQL 表结构）
- [ ] 路由设置（React Router v6）
- [ ] 设计系统（CSS Variables + 全局样式）
- [ ] AppShell 布局（侧边栏 + 顶栏）
- [ ] 登录页（邮箱密码登录，基于 CloudBase Auth，根据角色重定向）

### Phase 2 — 核心数据管理（Day 2-3）
- [ ] 资金池管理（列表 + 新建 + 详情）
- [ ] 出资方管理（列表 + 新建 + 直接份额设置）
- [ ] 池间投资关系配置（管理员设置母池投子池的份额占比）
- [ ] 项目管理（列表 + 新建 + 状态流转）
- [ ] 流水录入与分类账本表单（全类型支持，自动更新池余额与项目已投金额）

### Phase 3 — 分配与报表（Day 4）
- [ ] 有效份额递归计算接口（部署云函数，执行 `WITH RECURSIVE` 算法）
- [ ] 分配计算器前端（输入分配总额，显示直接/间接/有效份额明细并自动折算金额，确认写入）
- [ ] 出资方对账单页面
- [ ] 管理员报表中心（多维汇总表）
- [ ] LP 专属对账单 PDF 导出功能

### Phase 4 — 可视化（Day 5）
- [ ] 余额趋势折线图（基于 transactions 按月/季度统计）
- [ ] 出资方最终有效份额饼图/环形图
- [ ] 管理员总览仪表盘（全池资金流监控）

### Phase 5 — LP 视图 + 接口安全（Day 5-6）
- [ ] LP 登录后的路由隔离与数据过滤
- [ ] LP 个人视图（跨池资产汇总，直观展示间接持有份额链条）
- [ ] 云函数层级数据隔离校验部署
- [ ] 静态网站部署至 CloudBase Hosting

---

## 八、关键待确认项

> [!IMPORTANT]
> **CloudBase 环境配置**：开始开发前需注册腾讯云并开通云开发服务（确保已建有包含 MySQL 实例的环境）。我们可以一起走完这个流程（约 5 分钟）。

> [!NOTE]
> **初始管理员账号**：首个管理员账号由您直接在云开发 Auth 控制台创建，并在 `users` 关系表中手动为该 UID 插入一行，设置 `role = 'admin'`。后续 LP 的登录账号及出资人绑定记录可通过系统管理员后台直接录入生成。

> [!NOTE]
> **份额比例精度与误差**：数据库份额比例字段采用 `DECIMAL(6,4)`，精度保留四位小数（例如 `33.3333%`）。若多方等比均分出现微小尾差（如 0.0001%），建议允许管理员手动调整某位 LP 的份额以确保该池直接投资/池间投资的总和严格等于 100%。

> [!NOTE]
> **凭证附件上传**：流水凭证（如打款回执 PDF 或图片）在 Phase 2 中可先使用文本链接，后续直接集成 CloudBase Storage 存储服务来实现一键上传和安全链接访问。
