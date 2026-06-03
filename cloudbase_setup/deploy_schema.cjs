const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envId = "cloud1-d2gpq0fat0dd3c17f";
const sqlPath = path.join(__dirname, 'init_schema.sql');

if (!fs.existsSync(sqlPath)) {
  console.error("找不到 DDL 脚本文件: init_schema.sql");
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// 简单按分号分割 SQL 语句
const statements = sqlContent
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('SET FOREIGN_KEY_CHECKS'));

console.log(`>>> 开始部署结构至腾讯云环境 [${envId}]`);
console.log(`>>> 共解析出 ${statements.length} 条 SQL 命令...`);

// 临时关闭外键检查（方便重建表）
console.log("临时关闭外键检查...");
spawnSync('cloudbase', ['db', 'execute', '-e', envId, '--sql', 'SET FOREIGN_KEY_CHECKS = 0'], { stdio: 'ignore' });

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  
  // 打印前60个字符作为进度显示
  const preview = stmt.substring(0, 60).replace(/\n/g, ' ') + "...";
  console.log(`[${i + 1}/${statements.length}] 执行中: ${preview}`);
  
  const res = spawnSync('cloudbase', ['db', 'execute', '-e', envId, '--sql', stmt], {
    encoding: 'utf8'
  });

  if (res.status !== 0) {
    console.warn(`⚠️ 执行第 ${i + 1} 条语句时出现警告或错误:`);
    console.warn(res.stderr || res.stdout);
  }
}

// 恢复外键检查
console.log("恢复外键检查...");
spawnSync('cloudbase', ['db', 'execute', '-e', envId, '--sql', 'SET FOREIGN_KEY_CHECKS = 1'], { stdio: 'ignore' });

console.log(">>> 数据库表结构与测试数据部署完成！");
