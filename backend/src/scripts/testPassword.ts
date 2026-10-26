// 用于测试 bcrypt 密码和生成正确的 hash
import bcrypt from 'bcryptjs';

async function testPasswords() {
  console.log('🔐 测试密码 hash...\n');

  // 测试密码
  const passwords = [
    { password: '123456', username: 'testuser/alice/bob/carol' },
    { password: 'admin123', username: 'admin' }
  ];

  for (const { password, username } of passwords) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`用户: ${username}`);
    console.log(`密码: ${password}`);
    console.log(`Hash: ${hash}`);

    // 验证
    const isValid = await bcrypt.compare(password, hash);
    console.log(`验证结果: ${isValid ? '✅ 成功' : '❌ 失败'}`);
    console.log('');
  }

  // 测试数据库中的 hash
  console.log('测试数据库中现有的 hash:\n');

  const dbHash1 = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const test1 = await bcrypt.compare('123456', dbHash1);
  console.log(`数据库 hash (testuser): ${test1 ? '✅ 匹配 123456' : '❌ 不匹配'}`);

  const dbHash2 = '$2a$10$8Z3.3Qz3gXqLJk4xVJXxo.OBBhM6yR2F8wFp9F0QjPs.RKOc2mZjO';
  const test2 = await bcrypt.compare('admin123', dbHash2);
  console.log(`数据库 hash (admin): ${test2 ? '✅ 匹配 admin123' : '❌ 不匹配'}`);
}

testPasswords();
