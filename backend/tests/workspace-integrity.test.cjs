const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

test('workspace and citation integration in an isolated MySQL database', async (suite) => {
  const originalDatabase = process.env.DB_NAME || 'zhitu';
  const testDatabase = `zhitu_integrity_test_${crypto.randomBytes(6).toString('hex')}`;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD, database: originalDatabase,
  });
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
  let server, pool, created = false;
  try {
    await connection.query(`CREATE DATABASE ${quote(testDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of ['users', 'posts', 'follows', 'ai_chat_session', 'ai_chat_message', 'growth_workspace']) {
      const [ddl] = await connection.query(`SHOW CREATE TABLE ${quote(originalDatabase)}.${quote(table)}`);
      await connection.query(`USE ${quote(testDatabase)}`);
      await connection.query(ddl[0]['Create Table']);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    process.env.DB_NAME = testDatabase;
    process.env.JWT_SECRET = crypto.randomUUID();
    process.env.JWT_REFRESH_SECRET = crypto.randomUUID();
    require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
    pool = require('../src/utils/db').default;
    const { GrowthWorkspaceModel } = require('../src/models/GrowthWorkspace');
    await GrowthWorkspaceModel.ensureSchema();
    await GrowthWorkspaceModel.ensureSchema();
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/growth', require('../src/routes/growthRoutes').default);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { generateAccessToken } = require('../src/utils/authToken');
    const users = [];
    for (const name of ['owner', 'other', 'fresh', 'parallel', 'fresh-chat', 'rejected', 'repair', 'initial-race', 'ui-fresh']) {
      const [result] = await connection.execute('INSERT INTO users (username,email,password) VALUES (?,?,?)', [name, `${name}@example.invalid`, 'isolated-test-only']);
      users.push(result.insertId);
    }
    const tokens = users.map(generateAccessToken);
    const request = async (method, endpoint, body, userIndex = 0) => {
      const response = await fetch(baseUrl + endpoint, {
        method, headers: { 'Content-Type': 'application/json', ...(userIndex === null ? {} : { Authorization: `Bearer ${tokens[userIndex]}` }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const get = async (userIndex = 0) => (await request('GET', '/growth/workspace', undefined, userIndex)).body;
    const save = (data, revision, userIndex = 0) => request('PUT', '/growth/workspace', { data, revision }, userIndex);
    const initial = {
      files: [
        { id: 'folder-cite', name: '引用收藏', type: 'folder', parentId: null, order: 0 },
        { id: 'folder-notes', name: '学习笔记', type: 'folder', parentId: null, order: 1 },
        { id: 'note-a', name: '笔记 A', type: 'file', parentId: 'folder-notes', order: 0, content: 'original note', fileType: 'note' },
      ], openTabs: ['note-a'], activeTabId: 'note-a', expandedFolderIds: [], activePlan: null, mentorId: null,
    };
    const paragraphs = Array.from({ length: 12 }, (_, index) => `学习片段 ${index}，这是独立的引用依据。`);
    const articleContent = '# 示例文章\n\n' + paragraphs.join('\n\n') + '\n\n使用 **双 Token** 配合 [API](https://example.invalid) &amp; 权限校验。';
    const [article] = await connection.execute('INSERT INTO posts (user_id,title,content) VALUES (?,?,?)', [users[0], '真实文章标题', articleContent]);
    const cite = (text, extra = {}, userIndex = 0) => request('POST', '/growth/cite', { text, sourceId: article.insertId, sourceTitle: '伪造标题', ...extra }, userIndex);

    await suite.test('authentication and account isolation remain enforced', async () => {
      assert.equal((await request('GET', '/growth/workspace', undefined, null)).status, 401);
      assert.deepEqual(await get(1), { data: null, revision: 0 });
      assert.equal((await save(initial, 0)).status, 200);
      assert.deepEqual(await get(1), { data: null, revision: 0 });
    });
    await suite.test('missing revision is refused without replacing existing data', async () => {
      assert.equal((await request('PUT', '/growth/workspace', { data: initial })).status, 400);
      assert.equal((await get()).revision, 1);
    });
    await suite.test('an old tab cannot overwrite a newly added citation', async () => {
      const old = await get();
      assert.equal((await cite(paragraphs[0])).status, 200);
      old.data.files.find(file => file.id === 'note-a').content = 'local edit';
      const response = await save(old.data, old.revision);
      assert.equal(response.status, 409);
      assert.equal(response.body.current.data.files.filter(file => file.fileType === 'article_cite').length, 1);
      assert.equal((await get()).data.files.find(file => file.id === 'note-a').content, 'original note');
    });
    await suite.test('ten concurrent references are retained in a single source file', async () => {
      const responses = await Promise.all(paragraphs.slice(1, 11).map(text => cite(text)));
      assert.ok(responses.every(response => response.status === 200));
      const files = (await get()).data.files.filter(file => file.fileType === 'article_cite');
      assert.equal(files.length, 1);
      assert.equal(files[0].metadata.citations.length, 11);
      for (const text of paragraphs.slice(0, 11)) assert.ok(files[0].content.includes(text));
      assert.ok(files[0].content.includes('真实文章标题'));
      assert.ok(!files[0].content.includes('伪造标题'));
    });
    await suite.test('repeated concurrent requests do not duplicate the same reference', async () => {
      await Promise.all(Array.from({ length: 5 }, () => cite(paragraphs[0])));
      assert.equal((await get()).data.files.find(file => file.fileType === 'article_cite').metadata.citations.length, 11);
    });
    await suite.test('concurrent saves using one revision have exactly one winner', async () => {
      const snapshot = await get();
      const responses = await Promise.all(Array.from({ length: 5 }, (_, index) => {
        const data = structuredClone(snapshot.data);
        data.files.find(file => file.id === 'note-a').content = `save ${index}`;
        return save(data, snapshot.revision);
      }));
      assert.equal(responses.filter(response => response.status === 200).length, 1);
      assert.equal(responses.filter(response => response.status === 409).length, 4);
    });
    await suite.test('rendered Markdown selections are accepted', async () => {
      assert.equal((await cite('使用 双 Token 配合 API & 权限校验。')).status, 200);
    });
    await suite.test('missing articles, fabricated excerpts and invalid source types are rejected', async () => {
      assert.equal((await cite('anything', { sourceId: 2147483647 })).status, 404);
      assert.equal((await cite('this is not in the source')).status, 400);
      assert.equal((await cite(paragraphs[0], { sourceType: 'other' })).status, 400);
    });
    const sessions = [];
    const aiMessages = [];
    for (const user of users.slice(0, 2)) {
      const uuid = crypto.randomUUID();
      const [session] = await connection.execute('INSERT INTO ai_chat_session (uuid,user_id,session_title,scene_type) VALUES (?,?,?,?)', [uuid, user, '真实对话标题', 'chat']);
      await connection.execute('INSERT INTO ai_chat_message (session_id,role,content) VALUES (?,?,?)', [session.insertId, 'user', '原始问题']);
      const [message] = await connection.execute('INSERT INTO ai_chat_message (session_id,role,content) VALUES (?,?,?)', [session.insertId, 'ai', '已保存的 AI 回复']);
      sessions.push({ id: session.insertId, uuid });
      aiMessages.push(message.insertId);
    }
    await suite.test('foreign private conversations are denied for UUID and numeric ID', async () => {
      for (const sourceId of [sessions[1].uuid, sessions[1].id]) {
        assert.equal((await cite('已保存的 AI 回复', { sourceType: 'chat', sourceId, messageId: aiMessages[1] })).status, 404);
      }
    });
    await suite.test('messages must exist in the owned conversation and match the stored reply', async () => {
      assert.equal((await cite('已保存的 AI 回复', { sourceType: 'chat', sourceId: sessions[0].uuid })).status, 400);
      assert.equal((await cite('已保存的 AI 回复', { sourceType: 'chat', sourceId: sessions[0].uuid, messageId: aiMessages[1] })).status, 404);
      assert.equal((await cite('伪造 AI 回复', { sourceType: 'chat', sourceId: sessions[0].uuid, messageId: aiMessages[0] })).status, 400);
      const response = await cite('已保存的 AI 回复', { sourceType: 'chat', sourceId: sessions[0].uuid, messageId: aiMessages[0], question: '伪造问题' });
      assert.equal(response.status, 200);
      const file = (await get()).data.files.find(file => file.id === response.body.data.fileId);
      assert.ok(file.content.includes('原始问题'));
      assert.ok(!file.content.includes('伪造问题'));
      assert.equal(file.metadata.citations[0].messageId, aiMessages[0]);
    });
    await suite.test('workspace saves cannot manufacture or rewrite source metadata', async () => {
      let snapshot = await get();
      const forged = structuredClone(snapshot.data);
      forged.files.push({ id: 'fake', type: 'file', name: 'fake', metadata: { sourceId: '999', sourceType: 'community' }, content: 'fake' });
      assert.equal((await save(forged, snapshot.revision)).status, 400);
      snapshot = await get();
      const changed = structuredClone(snapshot.data);
      changed.files.find(file => file.fileType === 'article_cite').metadata.sourceId = '999';
      assert.equal((await save(changed, snapshot.revision)).status, 400);
      const alteredProof = structuredClone(snapshot.data);
      alteredProof.files.find(file => file.fileType === 'article_cite').metadata.citations[0].text = 'invented';
      assert.equal((await save(alteredProof, snapshot.revision)).status, 400);
      assert.equal((await get()).revision, snapshot.revision);
    });
    await suite.test('editing personal note content preserves the canonical reference records', async () => {
      const snapshot = await get();
      const data = structuredClone(snapshot.data);
      const file = data.files.find(file => file.fileType === 'article_cite');
      const proof = structuredClone(file.metadata.citations);
      file.content += '\n我的个人理解';
      assert.equal((await save(data, snapshot.revision)).status, 200);
      assert.deepEqual((await get()).data.files.find(candidate => candidate.id === file.id).metadata.citations, proof);
    });
    await suite.test('a first article reference creates the default workspace without visiting the planner', async () => {
      assert.deepEqual(await get(2), { data: null, revision: 0 });
      const response = await cite(paragraphs[0], {}, 2);
      assert.equal(response.status, 200);
      assert.equal(response.body.revision, 1);
      const snapshot = await get(2);
      assert.equal(snapshot.revision, 1);
      assert.deepEqual(snapshot.data.files.filter(file => file.type === 'folder').map(file => [file.id, file.name]), [
        ['folder-plan', '我的规划'], ['folder-notes', '学习笔记'], ['folder-cite', '引用收藏'],
        ['folder-summary', '周总结'], ['folder-archive', '成长档案'],
      ]);
      assert.deepEqual(snapshot.data.openTabs, []);
      assert.equal(snapshot.data.activeTabId, null);
      assert.equal(snapshot.data.activePlan, null);
      const file = snapshot.data.files.find(file => file.id === response.body.data.fileId);
      assert.equal(file.parentId, 'folder-cite');
      assert.equal(file.metadata.sourceId, String(article.insertId));
      assert.ok(file.content.includes(paragraphs[0]));
      assert.equal(file.metadata.citations.length, 1);
      const repeated = await cite(paragraphs[0], {}, 2);
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.data.duplicate, true);
      assert.equal(repeated.body.data.fileId, file.id);
      assert.equal((await get(2)).data.files.filter(candidate => candidate.fileType === 'article_cite').length, 1);
      assert.deepEqual(await get(4), { data: null, revision: 0 });
    });
    await suite.test('ten concurrent first references create one workspace and retain every excerpt', async () => {
      assert.deepEqual(await get(3), { data: null, revision: 0 });
      const responses = await Promise.all(paragraphs.slice(0, 10).map(text => cite(text, {}, 3)));
      assert.ok(responses.every(response => response.status === 200), JSON.stringify(responses.map(response => ({ status: response.status, message: response.body.message }))));
      const snapshot = await get(3);
      assert.equal(snapshot.revision, 10);
      assert.equal(snapshot.data.files.filter(file => file.id === 'folder-cite').length, 1);
      const files = snapshot.data.files.filter(file => file.fileType === 'article_cite');
      assert.equal(files.length, 1);
      assert.equal(files[0].metadata.citations.length, 10);
      for (const text of paragraphs.slice(0, 10)) assert.ok(files[0].content.includes(text));
      const [rows] = await connection.execute('SELECT COUNT(*) AS count FROM growth_workspace WHERE user_id = ?', [users[3]]);
      assert.equal(rows[0].count, 1);
    });
    await suite.test('a first owned AI reference initializes the workspace and keeps canonical question and message', async () => {
      const uuid = crypto.randomUUID();
      const [session] = await connection.execute('INSERT INTO ai_chat_session (uuid,user_id,session_title,scene_type) VALUES (?,?,?,?)', [uuid, users[4], '首次收藏的对话', 'chat']);
      await connection.execute('INSERT INTO ai_chat_message (session_id,role,content) VALUES (?,?,?)', [session.insertId, 'user', '如何整理学习笔记？']);
      const [message] = await connection.execute('INSERT INTO ai_chat_message (session_id,role,content) VALUES (?,?,?)', [session.insertId, 'ai', '为笔记记录来源并按主题分类。']);
      const response = await cite('为笔记记录来源并按主题分类。', { sourceType: 'chat', sourceId: uuid, messageId: message.insertId, question: '伪造的问题' }, 4);
      assert.equal(response.status, 200);
      const file = (await get(4)).data.files.find(candidate => candidate.id === response.body.data.fileId);
      assert.equal(file.metadata.sourceType, 'chat');
      assert.equal(file.metadata.citations[0].messageId, message.insertId);
      assert.ok(file.content.includes('如何整理学习笔记？'));
      assert.ok(!file.content.includes('伪造的问题'));
    });
    await suite.test('invalid and unauthorized first references leave no workspace behind', async () => {
      assert.equal((await cite(paragraphs[0], {}, null)).status, 401);
      assert.equal((await cite('anything', { sourceId: 2147483647 }, 5)).status, 404);
      assert.equal((await cite('invented excerpt', {}, 5)).status, 400);
      assert.equal((await cite('已保存的 AI 回复', { sourceType: 'chat', sourceId: sessions[0].uuid, messageId: aiMessages[0] }, 5)).status, 404);
      assert.deepEqual(await get(5), { data: null, revision: 0 });
    });
    await suite.test('a missing reference directory is restored without resetting notes or UI state', async () => {
      const data = structuredClone(initial);
      data.files = data.files.filter(file => file.id !== 'folder-cite');
      data.files[0].order = 8;
      data.expandedFolderIds = ['folder-notes'];
      data.activePlan = { id: 'existing-plan', goal: '保留我的规划' };
      assert.equal((await save(data, 0, 6)).status, 200);
      const responses = await Promise.all(paragraphs.slice(0, 3).map(text => cite(text, {}, 6)));
      assert.ok(responses.every(response => response.status === 200));
      const snapshot = await get(6);
      assert.equal(snapshot.data.files.filter(file => file.id === 'folder-cite').length, 1);
      assert.equal(snapshot.data.files.find(file => file.id === 'folder-cite').order, 9);
      for (const file of data.files) assert.deepEqual(snapshot.data.files.find(candidate => candidate.id === file.id), file);
      for (const field of ['openTabs', 'activeTabId', 'expandedFolderIds', 'activePlan', 'mentorId']) assert.deepEqual(snapshot.data[field], data[field]);
      assert.equal(snapshot.data.files.find(file => file.fileType === 'article_cite').metadata.citations.length, 3);
    });
    await suite.test('a reserved folder ID occupied by a file is rejected without deleting user content', async () => {
      const snapshot = await get(6);
      const data = structuredClone(snapshot.data);
      const folder = data.files.find(file => file.id === 'folder-cite');
      folder.type = 'file';
      folder.content = '不能覆盖这份用户内容';
      assert.equal((await save(data, snapshot.revision, 6)).status, 200);
      const before = await get(6);
      assert.equal((await cite(paragraphs[10], {}, 6)).status, 400);
      assert.deepEqual(await get(6), before);
    });
    await suite.test('malformed persisted workspaces are not silently reset during first collection', async () => {
      const malformed = { files: null, marker: 'preserve-corrupted-data' };
      await connection.execute('INSERT INTO growth_workspace (user_id,data,revision) VALUES (?,?,?)', [users[5], JSON.stringify(malformed), 3]);
      assert.equal((await cite(paragraphs[0], {}, 5)).status, 400);
      assert.deepEqual(await get(5), { data: malformed, revision: 3 });
    });
    await suite.test('an old empty planner cannot replace the workspace created by its first reference', async () => {
      const empty = await get(7);
      assert.deepEqual(empty, { data: null, revision: 0 });
      assert.equal((await cite(paragraphs[0], {}, 7)).status, 200);
      assert.equal((await save(initial, empty.revision, 7)).status, 409);
      assert.equal((await get(7)).data.files.find(file => file.fileType === 'article_cite').metadata.citations.length, 1);
    });
    await suite.test('racing initial workspace saves never silently replace each other', async () => {
      const responses = await Promise.all([save(initial, 0, 1), save({ ...initial, activeTabId: null }, 0, 1)]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    });
    if (process.env.RUN_FIRST_CITATION_UI === '1') {
      await suite.test('browser first collection uses the real isolated API and survives planner navigation and reload', async () => {
        assert.deepEqual(await get(8), { data: null, revision: 0 });
        const script = path.resolve(__dirname, '../../zhitu/tests/first-citation-ui.py');
        const fixture = { baseUrl, frontendUrl: process.env.WORKSPACE_FRONTEND_URL || 'http://127.0.0.1:5175', userId: users[8], token: tokens[8], articleId: article.insertId, articleContent, title: '真实文章标题', paragraphs: paragraphs.slice(0, 2) };
        const { stdout, stderr } = await promisify(execFile)(process.env.WORKSPACE_PYTHON || 'python', [script], {
          env: { ...process.env, FIRST_CITATION_UI_FIXTURE: JSON.stringify(fixture) }, timeout: 120000, maxBuffer: 1024 * 1024,
        });
        console.log(stdout.trim());
        if (stderr.trim()) console.error(stderr.trim());
        const snapshot = await get(8);
        const files = snapshot.data.files.filter(file => file.fileType === 'article_cite');
        assert.equal(files.length, 1);
        assert.equal(files[0].metadata.citations.length, 2);
        assert.ok(snapshot.revision >= 3);
      });
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (created) {
      assert.match(testDatabase, /^zhitu_integrity_test_[a-f0-9]{12}$/);
      await connection.query(`DROP DATABASE ${quote(testDatabase)}`);
    }
    assert.deepEqual(await rowCounts(), before, 'original business database row counts must remain unchanged');
    await connection.end();
    console.log('Temporary test database removed; original business table row counts unchanged.');
  }
});
