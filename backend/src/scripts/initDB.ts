import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  multipleStatements: true
};

const readSql = (relativePath: string): string => {
  const filePath = path.resolve(__dirname, '..', '..', relativePath);
  return fs.readFileSync(filePath, 'utf8');
};

async function initDatabase(): Promise<void> {
  let connection: mysql.Connection | null = null;

  try {
    console.log('📧 正在连接 MySQL...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 已连接到 MySQL');

    await connection.query('CREATE DATABASE IF NOT EXISTS zhitu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('✅ 数据库 zhitu 已准备好');

    const initSql = readSql('database/init.sql');
    await connection.query(initSql);
    console.log('✅ 已执行 init.sql');

    const seedSql = readSql('database/seed.sql');
    await connection.query(seedSql);
    console.log('✅ 已执行 seed.sql');

    console.log('🎉 数据库初始化完成');
  } catch (error: any) {
    console.error('❌ 数据库初始化失败:', error?.message || error);
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();
