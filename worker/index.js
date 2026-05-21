/**
 * Code Marker - Cloudflare Workers API
 * 
 * KV 存储结构:
 *   Key: "page:<md5(pageId)>"
 *   Value: { codes: { "CODE1": { usedVoters: [], availableVoters: [] }, ... } }
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS 预处理
    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }));
    }

    try {
      // 路由
      if (pathname === '/health') {
        return corsResponse(json({ ok: true }));
      }

      if (pathname === '/api/codes' && request.method === 'GET') {
        return corsResponse(await handleGetCodes(url, request, env));
      }

      if (pathname === '/api/codes/mark' && request.method === 'POST') {
        return corsResponse(await handleMark(request, env));
      }

      if (pathname === '/widget.js') {
        return corsResponse(new Response(WIDGET_JS_PLACEHOLDER, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
        }));
      }

      return corsResponse(json({ error: 'Not Found' }, 404));
    } catch (e) {
      return corsResponse(json({ error: e.message }, 500));
    }
  }
};

// --- Handlers ---

async function handleGetCodes(url, request, env) {
  const pageId = url.searchParams.get('page');
  if (!pageId) return json({ error: '缺少 page 参数' }, 400);

  const visitorId = request.headers.get('X-Visitor-Id') || url.searchParams.get('vid') || '';
  const data = await loadPage(env, pageId);

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

  return json({ pageId, codes });
}

async function handleMark(request, env) {
  const body = await request.json();
  const { pageId, code, action, visitorId } = body;

  if (!pageId || !code || !action) {
    return json({ error: '缺少必要参数 (pageId, code, action)' }, 400);
  }
  if (!['used', 'available', 'clear'].includes(action)) {
    return json({ error: 'action 必须为 used/available/clear' }, 400);
  }
  if (!visitorId) {
    return json({ error: '缺少 visitorId' }, 400);
  }

  const data = await loadPage(env, pageId);

  // 确保码数据存在
  if (!data.codes[code]) {
    data.codes[code] = { usedVoters: [], availableVoters: [] };
  }
  const codeData = data.codes[code];

  // 移除旧投票
  codeData.usedVoters = codeData.usedVoters.filter(v => v !== visitorId);
  codeData.availableVoters = codeData.availableVoters.filter(v => v !== visitorId);

  // 写入新投票
  if (action === 'used') codeData.usedVoters.push(visitorId);
  else if (action === 'available') codeData.availableVoters.push(visitorId);

  codeData.updatedAt = new Date().toISOString();
  await savePage(env, pageId, data);

  return json({
    success: true,
    code,
    usedCount: codeData.usedVoters.length,
    availableCount: codeData.availableVoters.length,
    myVote: action === 'clear' ? null : action
  });
}

// --- KV helpers ---

function kvKey(pageId) {
  return 'page:' + md5(pageId);
}

async function loadPage(env, pageId) {
  const raw = await env.CODE_MARKER.get(kvKey(pageId), 'text');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* 损坏则重建 */ }
  }
  return { codes: {} };
}

async function savePage(env, pageId, data) {
  await env.CODE_MARKER.put(kvKey(pageId), JSON.stringify(data));
}

// --- Utils ---

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Visitor-Id');
  return new Response(response.body, {
    status: response.status,
    headers
  });
}

// Simple MD5 (for KV key hashing, not security-critical)
function md5(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Placeholder: In production, this would be the actual widget.js content
// served from KV or embedded at build time
const WIDGET_JS_PLACEHOLDER = '/* widget.js - deploy时用构建脚本替换此内容 */';
