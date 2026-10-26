// 更新数据库中用户的密码为正确的 hash
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: 'zhitu'
};

async function updatePasswords() {
  let connection;

  try {
    console.log('🔄 正在连接到数据库...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 已连接');

    console.log('\n🔐 正在生成新的密码 hash...');

    // 为不同用户生成正确的密码 hash
    const hash123456 = await bcrypt.hash('123456', 10);
    const hashAdmin123 = await bcrypt.hash('admin123', 10);

    console.log(`  ✓ 123456 的 hash: ${hash123456.substring(0, 20)}...`);
    console.log(`  ✓ admin123 的 hash: ${hashAdmin123.substring(0, 20)}...`);

    console.log('\n🔄 正在更新数据库中的密码...');

    // 更新 testuser, alice, bob, carol 的密码
    const result1 = await connection.query(
      `UPDATE users SET password = ? WHERE username IN ('testuser', 'alice', 'bob', 'carol')`,
      [hash123456]
    );
    console.log(`  ✓ 更新了 testuser, alice, bob, carol 的密码`);

    // 更新 admin 的密码
    const result2 = await connection.query(
      `UPDATE users SET password = ? WHERE username = 'admin'`,
      [hashAdmin123]
    );
    console.log(`  ✓ 更新了 admin 的密码`);

    console.log('\n✅ 密码更新完成！');
    console.log('\n📋 现在可以使用以下账号登录：');
    console.log('  用户名: testuser  密码: 123456');
    console.log('  用户名: admin     密码: admin123');
    console.log('  用户名: alice     密码: 123456');
    console.log('  用户名: bob       密码: 123456');
    console.log('  用户名: carol     密码: 123456');
    console.log('');

  } catch (error: any) {
    console.error('\n❌ 密码更新失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

updatePasswords();
