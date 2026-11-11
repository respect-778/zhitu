const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

test('learning preferences and most-read history stay private in an isolated database', async suite => {
  const originalDatabase = process.env.DB_NAME || 'zhitu';
  const database = `zhitu_preferences_test_${crypto.randomBytes(6).toString('hex')}`;
  const quote = value => '`' + value.replaceAll('`', '``') + '`';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: originalDatabase,
  });
  const rowCounts = async () => {
    const [tables] = await connection.query(`SHOW TABLES FROM ${quote(originalDatabase)}`);
    const counts = {};
    for (const table of tables.map(row => Object.values(row)[0])) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS count FROM ${quote(originalDatabase)}.${quote(table)}`,
      );
      counts[table] = rows[0].count;
    }
    return counts;
  };
  const before = await rowCounts();
  let created = false;
  let server;
  let pool;

  try {
    await connection.query(
      `CREATE DATABASE ${quote(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of ['users', 'posts']) {
      const [ddl] = await connection.query(
        `SHOW CREATE TABLE ${quote(originalDatabase)}.${quote(table)}`,
      );
      await connection.query(`USE ${quote(database)}`);
      await connection.query(ddl[0]['Create Table']);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS=1');

    process.env.DB_NAME = database;
    process.env.JWT_SECRET = crypto.randomUUID();
    process.env.JWT_REFRESH_SECRET = crypto.randomUUID();
    require('ts-node').register({
      project: path.join(__dirname, '../tsconfig.json'),
      transpileOnly: true,
    });

    pool = require('../src/utils/db').default;
    const { ReadingHistoryModel } = require('../src/models/ReadingHistory');
    await ReadingHistoryModel.ensureTable();

    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/user', require('../src/routes/userRoutes').default);
    app.use('/community', require('../src/routes/communityRoutes').default);
    server = await new Promise(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { generateAccessToken } = require('../src/utils/authToken');

    const users = [];
    for (const name of ['preferences-owner', 'preferences-other']) {
      const [result] = await connection.execute(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [name, `${name}@example.invalid`, 'isolated-test-only'],
      );
      users.push(result.insertId);
    }
    const tokens = users.map(generateAccessToken);
    const request = async (method, endpoint, body, userIndex = 0) => {
      const response = await fetch(baseUrl + endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(userIndex === null ? {} : { Authorization: `Bearer ${tokens[userIndex]}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };

    await suite.test('authentication and account isolation are enforced', async () => {
      assert.equal((await request('GET', '/user/learning-preferences', undefined, null)).status, 401);
      const first = await request('GET', '/user/learning-preferences');
      const second = await request('GET', '/user/learning-preferences', undefined, 1);
      assert.deepEqual(first.body.data, { direction: '', stage: '', goal: '', keywords: [] });
      assert.deepEqual(second.body.data, { direction: '', stage: '', goal: '', keywords: [] });
    });

    await suite.test('updates are trimmed, deduplicated and limited without touching another account', async () => {
      const keywords = ['React', 'react', '', ...Array.from({ length: 24 }, (_, index) => `主题${index}`)];
      const response = await request('PUT', '/user/learning-preferences', {
        direction: '软件工程'.repeat(30),
        stage: '准备实习',
        goal: '完成真实项目并准备面试'.repeat(10),
        keywords,
      });
      assert.equal(response.status, 200);
      assert.equal(Array.from(response.body.data.direction).length, 80);
      assert.equal(Array.from(response.body.data.goal).length, 50);
      assert.equal(response.body.data.keywords.length, 20);
      assert.equal(response.body.data.keywords.filter(item => item.toLowerCase() === 'react').length, 1);

      const owner = await request('GET', '/user/learning-preferences');
      const other = await request('GET', '/user/learning-preferences', undefined, 1);
      assert.deepEqual(owner.body.data, response.body.data);
      assert.deepEqual(other.body.data, { direction: '', stage: '', goal: '', keywords: [] });
    });

    await suite.test('most-read history is ordered by read count and remains private', async () => {
      const postIds = [];
      for (const title of ['阅读较少', '阅读最多', '阅读居中']) {
        const [result] = await connection.execute(
          'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
          [users[0], title, `${title}正文`],
        );
        postIds.push(result.insertId);
      }
      for (const [postId, count] of [[postIds[0], 2], [postIds[1], 9], [postIds[2], 5]]) {
        await connection.execute(
          'INSERT INTO reading_history (user_id, post_id, read_count) VALUES (?, ?, ?)',
          [users[0], postId, count],
        );
      }

      const owner = await request('GET', '/community/history?sort=most_read&pageSize=3');
      assert.equal(owner.status, 200);
      assert.deepEqual(owner.body.data.list.map(item => item.read_count), [9, 5, 2]);
      const other = await request('GET', '/community/history?sort=most_read&pageSize=3', undefined, 1);
      assert.deepEqual(other.body.data.list, []);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (created) {
      assert.match(database, /^zhitu_preferences_test_[a-f0-9]{12}$/);
      await connection.query(`DROP DATABASE ${quote(database)}`);
    }
    assert.deepEqual(await rowCounts(), before, 'original business tables must remain unchanged');
    await connection.end();
    console.log('Temporary preferences database removed; original business table counts unchanged.');
  }
});
