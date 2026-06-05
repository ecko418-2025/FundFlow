# FundFlow 项目概览

FundFlow 是一个基于 React 19 和腾讯云开发 (CloudBase) 构建的专业基金与投资管理系统。该系统旨在为基金管理人 (GP/Admin) 提供全方位的数字化资产管理工具，同时为有限合伙人 (LP) 提供透明的财富门户。

## 🚀 技术栈

- **前端框架**: [React 19](https://react.dev/) (使用 Vite 构建)
- **路由**: [React Router 7](https://reactrouter.com/) (支持 HashRouter)
- **云服务**: [腾讯云开发 CloudBase](https://cloud.tencent.com/product/tcb) (集成 JS SDK)
- **图表**: [Recharts](https://recharts.org/) (用于数据可视化)
- **图标**: [Lucide React](https://lucide.dev/)
- **数据处理**: [XLSX](https://github.com/SheetJS/sheetjs) (支持 Excel 导入导出)
- **工程化**: ESLint, Prettier

## 🏗️ 核心功能模块

### 1. 资金池管理 (Pools)
- 管理多个投资池（综合池、专项池、年度/季度子池）。
- 实时跟踪各池的认缴总额、实缴余额及可用头寸。
- 支持池间投资逻辑（母池注资子池）。

### 2. 出资人管理 (Investors/LPs)
- 记录 LP 的基本信息、联系方式及投资备注。
- 维护 LP 与不同资金池的认缴/实缴份额关系。
- 提供 LP 财富门户，支持查阅个人资产报告与对账单。

### 3. 项目投资跟踪 (Projects)
- 全生命周期管理投资项目（考察中、已投、已退出）。
- 记录项目所属资金池、已投金额及回收款项。
- 自动汇总各项目的财务表现。

### 4. 财务流水账本 (Transactions)
- 详尽记录每一笔资金流向（出资、投资、划拨、回款）。
- 支持凭证附件关联与流水冲回。
- 自动联动更新资金池、成员实缴及项目财务数据。

### 5. 收益分配 (Distribution)
- 精确的“有效份额”折算算法（支持穿透多层级资金池）。
- 自动生成收益分配清单。
- 记录分配历史供查阅和审计。

## 📂 项目结构说明

- `src/pages/admin/`: 系统管理员后台页面，包含仪表盘、资金池、出资人、项目、流水、收益分配等核心模块。
- `src/pages/lp/`: 针对 LP 用户的门户页面，包含资产总览与财务对账。
- `src/hooks/`: 封装了所有业务逻辑的自定义 Hooks，实现 UI 与业务逻辑分离。
- `src/lib/`: 
  - `db.js`: 数据库访问层，集成了云端 SQL 执行与本地 Mock 仿真器。
  - `cloudbase.js`: 云开发环境初始化。
  - `excel.js`: Excel 导出工具类。
- `cloudbase_setup/`: 包含数据库初始化 SQL 脚本、迁移工具及云函数 (`executeSQL`) 源代码。

## 🛠️ 开发与预览

系统内置了 **Mock 模式**，允许在没有后端云环境的情况下进行全功能前端预览（数据保存在内存中，刷新即重置）。
如需切换到真实云开发环境，请在浏览器 `localStorage` 中将 `USE_MOCK` 设置为 `"false"` 并配置正确的 `cloudbaserc.json`。

---
*本文档由 Gemini CLI 自动生成。*
