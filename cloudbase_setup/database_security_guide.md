# FundFlow / 贷管家 - 数据库与 API 安全升级指南

本指南旨在指导如何在生产环境部署时，对“贷管家”系统的云开发（CloudBase）环境进行安全升级。

当前系统为了快速演示原型，在前端使用了通用的 **SQL 执行代理（`executeSQL` 云函数）**。此方式在生产环境中会带来严重的安全风险，必须通过“开正门，堵后门”的策略进行重构。

---

## 核心安全升级架构

安全升级包含两个核心动作：
1. **新建 LP 个人信息修改专用云函数（“开正门”）**：为普通出资人开辟一条高安全性、受限的专属数据修改通道。
2. **限制通用 SQL 代理执行权限（“堵后门”）**：限制 `executeSQL` 云函数仅允许系统管理员（`admin`）调用，杜绝出资人越权执行任意 SQL。

```
                     ┌──────────────────┐
                     │   出资人 (LP)     │
                     └────────┬─────────┘
                              │
                    ┌─────────┴─────────┐
                    │ 腾讯云开发安全网关 │
                    └─────────┬─────────┘
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
   [专用云函数: updateLPProfile]      [通用代理: executeSQL]
   ✔ 校验 context.auth.uid            ❌ 检测用户 Role !== 'admin'
   ✔ 锁死 WHERE uid = 自身ID          ❌ 直接拦截，拒绝执行
   ✔ 仅允许修改 phone, contact 等      
             │                                 │
             ▼                                 ▼
       【 写入成功 】                     【 拦截报错 (403) 】
```

---

## 第一步：新建 `updateLPProfile` 专用云函数

该函数专门供登录的 LP 出资人修改个人联系信息使用。

### 1. 目录结构
在 `cloudbase_setup/functions/` 下新建一个云函数目录：
```text
cloudbase_setup/functions/updateLPProfile/
├── index.js
└── package.json
```

### 2. 云函数代码实现 (`index.js`)
```javascript
const mysql = require('mysql2/promise');

// 数据库连接配置 (从环境变量读取)
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'fundflow',
  port: process.env.DB_PORT || 3306
};

exports.main = async (event, context) => {
  // 1. 安全校验：获取云端验证过的当前登录用户 UID
  const currentUserUid = context.auth?.uid;
  if (!currentUserUid) {
    return { code: 401, message: "未登录，无权操作" };
  }

  // 2. 参数提取：仅接收允许被修改的非敏感字段，杜绝修改金额、持股比例等
  const { phone, contact, note } = event;

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // 3. 执行更新：强行绑定 WHERE uid = ?，确保出资人只能修改自己关联的数据
    const sql = `
      UPDATE investors 
      SET phone = ?, contact = ?, note = ? 
      WHERE uid = ?
    `;
    const [result] = await connection.execute(sql, [
      phone || null,
      contact || null,
      note || null,
      currentUserUid
    ]);

    if (result.affectedRows === 0) {
      return { code: 404, message: "未找到当前出资人登记记录" };
    }

    return { code: 0, message: "个人资料更新成功" };
  } catch (err) {
    console.error("更新个人资料失败:", err);
    return { code: 500, message: "服务器内部错误: " + err.message };
  } finally {
    if (connection) await connection.end();
  }
};
```

---

## 第二步：升级通用 `executeSQL` 云函数安全防护

必须对旧有的通用 SQL 代理函数进行升级，只允许 `role = 'admin'` 的用户执行。

### 修改后的 `executeSQL/index.js` 逻辑：
```javascript
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'fundflow',
  port: process.env.DB_PORT || 3306
};

exports.main = async (event, context) => {
  // 1. 获取当前登录用户的 UID
  const currentUserUid = context.auth?.uid;
  if (!currentUserUid) {
    return { code: 401, message: "未登录" };
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // 2. 核心鉴权：查询当前用户在系统中的真实角色
    const [users] = await connection.execute(
      "SELECT role FROM users WHERE uid = ?", 
      [currentUserUid]
    );
    const dbUser = users[0];

    // 3. 严格判定：如果不是 admin 角色，立即拦截并报错 403
    if (!dbUser || dbUser.role !== 'admin') {
      return { code: 403, message: "无权调用通用 SQL 代理接口" };
    }

    // 4. 只有管理员通过后，才允许执行前端发来的任意 SQL
    const { sql, params } = event;
    const [data] = await connection.execute(sql, params);
    
    return { code: 0, data };
  } catch (err) {
    console.error("执行 SQL 失败:", err);
    return { code: 500, message: err.message };
  } finally {
    if (connection) await connection.end();
  }
};
```

---

## 第三步：前端（Vite 应用）对接方式

当出资人修改资料时，前端不要再调用通用的 `querySQL` 方法，而是改为直接触发云函数。

### 前端调用示例：
```javascript
import app from "../lib/cloudbase";

async function handleUpdateProfile(profileData) {
  // profileData 格式如: { phone: "13800138000", contact: "张三" }
  try {
    const res = await app.callFunction({
      name: "updateLPProfile",
      data: profileData
    });
    
    if (res.result.code === 0) {
      alert("更新个人资料成功！");
    } else {
      alert("更新失败: " + res.result.message);
    }
  } catch (err) {
    alert("网络或接口调用失败: " + err.message);
  }
}
```

---

## 🔒 生产环境安全检查清单 (Checklist)

在正式将系统对出资人开放前，请确认以下配置：
* [ ] 已在腾讯云控制台的云函数配置中，为 `executeSQL` 和 `updateLPProfile` 配置了正确的数据库连接环境变量 (`DB_HOST`, `DB_USER`, `DB_PASSWORD`)。
* [ ] `executeSQL` 云函数的安全角色判定代码已上线。
* [ ] 出资人（LP）在本地使用控制台直接调用 `executeSQL` 云函数时，能正确返回 `403` 拦截响应。
* [ ] 数据库中的用户角色表 `users` 内的 `role` 字段未对外暴露修改接口，管理员角色（`admin`）在数据库中定义准确。
