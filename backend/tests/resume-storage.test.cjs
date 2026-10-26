const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

test('resume storage uses an isolated MySQL database', async suite => {
  const originalDatabase = process.env.DB_NAME || 'zhitu';
  const database = `zhitu_resume_test_${crypto.randomBytes(6).toString('hex')}`;
  const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD, database: originalDatabase });
  const quote = value => '`' + value.replaceAll('`', '``') + '`';
  const rowCounts = async () => {
    const [tables] = await connection.query(`SHOW TABLES FROM ${quote(originalDatabase)}`);
    const counts = {};
    for (const table of tables.map(row => Object.values(row)[0])) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM ${quote(originalDatabase)}.${quote(table)}`);
      counts[table] = rows[0].count;
    }
    return counts;
  };
  const before = await rowCounts();
  let created = false, server, pool;
  try {
    await connection.query(`CREATE DATABASE ${quote(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of ['users', 'growth_workspace']) {
      const [ddl] = await connection.query(`SHOW CREATE TABLE ${quote(originalDatabase)}.${quote(table)}`);
      await connection.query(`USE ${quote(database)}`);
      await connection.query(ddl[0]['Create Table']);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    process.env.DB_NAME = database;
    process.env.JWT_SECRET = crypto.randomUUID();
    process.env.JWT_REFRESH_SECRET = crypto.randomUUID();
    require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
    pool = require('../src/utils/db').default;
    const { GrowthWorkspaceModel } = require('../src/models/GrowthWorkspace');
    await GrowthWorkspaceModel.ensureSchema();
    const express = require('express');
    const app = express();
    app.use('/resume', express.json({ limit: '10mb' }));
    app.use(express.json());
    app.use('/growth', require('../src/routes/growthRoutes').default);
    const { ResumeWorkspaceModel } = require('../src/models/ResumeWorkspace');
    await ResumeWorkspaceModel.ensureSchema();
    await ResumeWorkspaceModel.ensureSchema();
    app.use('/resume', require('../src/routes/resumeRoutes').default);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { generateAccessToken } = require('../src/utils/authToken');
    const users = [];
    for (const name of ['resume-owner', 'resume-other', 'resume-race', 'resume-ui']) {
      const [result] = await connection.execute('INSERT INTO users (username,email,password) VALUES (?,?,?)', [name, `${name}@example.invalid`, 'isolated-test-only']);
      users.push(result.insertId);
    }
    const tokens = users.map(generateAccessToken);
    const request = async (method, body, index = 0) => {
      const response = await fetch(baseUrl + '/resume/workspace', { method, headers: { 'Content-Type': 'application/json', ...(index === null ? {} : { Authorization: `Bearer ${tokens[index]}` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
    };
    const data = { resumes: [{ id: 'resume-1', title: '验收简历', templateId: 'minimalist', createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z', basic: { name: '测试同学', photo: '' }, education: [], experience: [], projects: [], certificates: [], customData: {}, skillContent: 'TypeScript', selfEvaluationContent: '', menuSections: [], globalSettings: {} }] };
    const save = (value, revision, index = 0) => request('PUT', { data: value, revision }, index);
    const get = (index = 0) => request('GET', undefined, index);

    await suite.test('a new account reads an empty versioned collection; unauthenticated requests are denied', async () => {
      assert.equal((await get(null)).status, 401);
      assert.deepEqual((await get()).body, { data: null, revision: 0 });
    });
    await suite.test('a resume saved to the server can be restored without browser storage', async () => {
      const result = await save(data, 0);
      assert.equal(result.status, 200);
      assert.equal(result.body.revision, 1);
      assert.deepEqual((await get()).body.data, data);
    });
    await suite.test('account identity comes from authentication, never from a claimed user ID', async () => {
      assert.deepEqual((await get(1)).body, { data: null, revision: 0 });
      const result = await request('PUT', { data: { resumes: [] }, revision: 0, userId: users[0] }, 1);
      assert.equal(result.status, 200);
      assert.deepEqual((await get()).body.data, data);
    });
    await suite.test('missing or stale revisions cannot overwrite a newer resume', async () => {
      assert.equal((await request('PUT', { data })).status, 400);
      assert.equal((await save({ resumes: [] }, 0)).status, 409);
      assert.deepEqual((await get()).body.data, data);
    });
    await suite.test('concurrent edits at the same revision have one winner', async () => {
      const edits = [structuredClone(data), structuredClone(data)];
      edits[0].resumes[0].title = '并发版本 A';
      edits[1].resumes[0].title = '并发版本 B';
      const results = await Promise.all(edits.map(edit => save(edit, 1)));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      assert.equal((await get()).body.revision, 2);
    });
    await suite.test('concurrent first saves do not create duplicate collections', async () => {
      const results = await Promise.all([save(data, 0, 2), save({ resumes: [] }, 0, 2)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const [rows] = await connection.execute('SELECT COUNT(*) AS count FROM resume_workspace WHERE user_id=?', [users[2]]);
      assert.equal(rows[0].count, 1);
    });
    await suite.test('invalid shapes and duplicate IDs are rejected without changing the stored collection', async () => {
      const before = (await get()).body;
      for (const invalid of [{ resumes: null }, { resumes: [{}] }, { resumes: [data.resumes[0], data.resumes[0]] }, { resumes: [{ ...data.resumes[0], education: null }] }, { resumes: [{ ...data.resumes[0], basic: { name: { broken: true } } }] }]) {
        assert.equal((await save(invalid, before.revision)).status, 400);
      }
      assert.deepEqual((await get()).body, before);
    });
    await suite.test('photo payloads beyond the default 100KB parser limit survive saving', async () => {
      const larger = structuredClone(data);
      larger.resumes[0].basic.photo = 'data:image/png;base64,' + 'a'.repeat(160000);
      assert.equal((await save(larger, 2)).status, 200);
      assert.equal((await get()).body.data.resumes[0].basic.photo.length, larger.resumes[0].basic.photo.length);
    });
    await suite.test('an intentionally emptied cloud collection remains an existing collection', async () => {
      assert.equal((await save({ resumes: [] }, 3)).status, 200);
      assert.deepEqual((await get()).body, { data: { resumes: [] }, revision: 4 });
    });
    if (process.env.RUN_PERSONAL_STORAGE_UI === '1') {
      await suite.test('real resume and learning pages use cloud storage and a shared browser directory', async () => {
        const fixture = { baseUrl, frontendUrl: process.env.WORKSPACE_FRONTEND_URL || 'http://127.0.0.1:5175', userId: String(users[3]), token: tokens[3], otherUserId: String(users[1]), otherToken: tokens[1] };
        const { stdout, stderr } = await promisify(execFile)(process.env.WORKSPACE_PYTHON || 'python', [path.resolve(__dirname, '../../zhitu/tests/personal-storage-ui.py')], { env: { ...process.env, PERSONAL_STORAGE_UI_FIXTURE: JSON.stringify(fixture) }, timeout: 180000, maxBuffer: 1024 * 1024 });
        console.log(stdout.trim());
        if (stderr.trim()) console.error(stderr.trim());
      });
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (created) { assert.match(database, /^zhitu_resume_test_[a-f0-9]{12}$/); await connection.query(`DROP DATABASE ${quote(database)}`); }
    assert.deepEqual(await rowCounts(), before, 'original business tables must remain unchanged');
    await connection.end();
    console.log('Temporary resume database removed; original business table counts unchanged.');
  }
});
