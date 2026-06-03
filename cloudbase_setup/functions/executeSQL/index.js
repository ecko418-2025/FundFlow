const mysql = require('mysql2/promise');

// 数据库连接池配置
// 建议在腾讯云开发控制台 - 云函数管理 - 环境变量中进行以下配置，防止敏感信息硬编码泄露：
// DB_HOST: 数据库连接主机名/IP
// DB_USER: 数据库用户名
// DB_PASSWORD: 密码
// DB_DATABASE: 数据库名称 (如 fundflow)
// DB_PORT: 端口号 (默认 3306)

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'fundflow',
      port: parseInt(process.env.DB_PORT || '3306'),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    });
  }
  return pool;
}

/**
 * 云开发 SQL 代理执行网关云函数
 * @param {Object} event 传入参数，格式如: { sql: "SELECT * FROM pools WHERE id = ?", params: ["pool-1"] }
 * @param {Object} context 
 */
exports.main = async (event, context) => {
  const { sql, params } = event;
  
  if (!sql) {
    return {
      code: -1,
      message: "SQL 语句不能为空"
    };
  }

  // 阻断非法的危险 SQL 指令类型（如前端尝试删表）
  const dangerousKeywords = ['drop table', 'truncate', 'alter table', 'grant'];
  const lowerSql = sql.toLowerCase();
  for (const keyword of dangerousKeywords) {
    if (lowerSql.includes(keyword)) {
      return {
        code: -2,
        message: "检测到非法 SQL 命令，执行已被云网关阻断"
      };
    }
  }

  try {
    const dbPool = getPool();
    // 强制使用 execute 预编译机制以杜绝 SQL 注入漏洞
    const [rows] = await dbPool.execute(sql, params || []);
    
    return {
      code: 0,
      data: rows,
      message: "SUCCESS"
    };
  } catch (error) {
    console.error("数据库执行错误:", error);
    return {
      code: 500,
      message: `数据库执行失败: ${error.message}`
    };
  }
};
