import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 数据库连接池配置
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'zhitu',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// 测试数据库连接
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接成功');
    connection.release();
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
};

// 执行查询的通用方法
export const query = async <T = any>(sql: string, params?: any[]): Promise<T> => {
  try {
    console.log('执行 SQL:', sql.trim());
    console.log('参数:', params);
    console.log('参数类型:', params?.map(p => typeof p));

    const [rows] = await pool.execute(sql, params || []);
    return rows as T;
  } catch (error) {
    console.error('数据库查询错误:', error);
    throw error;
  }
};

// 执行单条查询
export const queryOne = async <T = any>(sql: string, params?: any[]): Promise<T | null> => {
  try {
    const [rows] = await pool.execute(sql, params);
    const result = rows as any[];
    return result.length > 0 ? result[0] as T : null;
  } catch (error) {
    console.error('数据库查询错误:', error);
    throw error;
  }
};

export default pool;
