const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3456;

// 内存存储（模拟 CF Workers KV）
const store = new Map();

app.use(cors());
app.use(express.json());

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
// 让 /widget.js 能直接访问
app.use('/widget.js', express.static(path.join(__dirname, '..', 'widget', 'widget.js')));

// --- 辅助函数 ---

function kvKey(pageId) {
  let hash = 0;
  for (let i = 0; i < pageId.length; i++) {
    const c = pageId.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return 'page:' + Math.abs(hash).toString(36);
}

function loadPage(pageId) {
  const key = kvKey(pageId);
  return store.get(key) || { codes: {} };
}

function savePage(pageId, data) {
  store.set(kvKey(pageId), data);
}

// --- 路由（镜像 CF Workers API） ---

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/codes', (req, res) => {
  const pageId = req.query.page;
  if (!pageId) return res.status(400).json({ error: '缺少 page 参数' });

  const visitorId = req.headers['x-visitor-id'] || req.query.vid || '';
  const data = loadPage(pageId);

  const codes = {};
  for (const [code, info] of Object.entries(data.codes)) {
    codes[code] = {
      code,
      usedCount: info.usedVoters.length,
      availableCount: info.availableVoters.length,
      myVote: info.usedVoters.includes(visitorId) ? 'used'
            : info.availableVoters.includes(visitorId) ? 'available'
            : null
    };
  }

  res.json({ pageId, codes });
});

app.post('/api/codes/mark', (req, res) => {
  const { pageId, code, action, visitorId } = req.body;

  if (!pageId || !code || !action) {
    return res.status(400).json({ error: '缺少必要参数 (pageId, code, action)' });
  }
  if (!['used', 'available', 'clear'].includes(action)) {
    return res.status(400).json({ error: 'action 必须为 used/available/clear' });
  }
  if (!visitorId) {
    return res.status(400).json({ error: '缺少 visitorId' });
  }

  const data = loadPage(pageId);

  if (!data.codes[code]) {
    data.codes[code] = { usedVoters: [], availableVoters: [] };
  }
  const codeData = data.codes[code];

  // 移除旧投票
  codeData.usedVoters = codeData.usedVoters.filter(v => v !== visitorId);
  codeData.availableVoters = codeData.availableVoters.filter(v => v !== visitorId);

  // 新投票
  if (action === 'used') codeData.usedVoters.push(visitorId);
  else if (action === 'available') codeData.availableVoters.push(visitorId);

  codeData.updatedAt = new Date().toISOString();
  savePage(pageId, data);

  res.json({
    success: true,
    code,
    usedCount: codeData.usedVoters.length,
    availableCount: codeData.availableVoters.length,
    myVote: action === 'clear' ? null : action
  });
});

// --- 启动 ---

app.listen(PORT, () => {
  console.log('[code-marker dev]');
  console.log(`  API:          http://localhost:${PORT}`);
  console.log(`  健康检查:     http://localhost:${PORT}/health`);
  console.log(`  Widget JS:    http://localhost:${PORT}/widget.js`);
  console.log(`  演示(有组件): http://localhost:${PORT}/demo-with-widget.html`);
  console.log(`  演示(无组件): http://localhost:${PORT}/demo-without-widget.html`);
});
