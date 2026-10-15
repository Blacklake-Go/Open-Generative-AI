// 运行期环境变量只来自部署层注入（systemd EnvironmentFile=/etc/supdance.env）
// 或 node 的 --env-file-if-exists 参数。启动守卫脚本不再自行加载工作目录下的
// 私有 env 文件，否则同一份代码在不同机器上会连到不同的数据库。
let value = String(process.env.DATABASE_URL || '').trim();

if (!value) {
  console.error('[startup] DATABASE_URL is required; PostgreSQL 16 is the only supported database.');
  process.exit(1);
}

try {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('scheme');
} catch {
  console.error('[startup] DATABASE_URL must be a valid postgres:// or postgresql:// URL.');
  process.exit(1);
}

console.log('[startup] PostgreSQL connection configuration present.');
