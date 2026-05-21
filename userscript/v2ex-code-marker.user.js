// ==UserScript==
// @name         V2EX 试用码协作标记
// @namespace    https://github.com/code-marker
// @version      2.0.0
// @description  自动识别帖子中的试用码/邀请码，支持社区协作标记使用状态。支持自定义正则规则。
// @match        https://www.v2ex.com/t/*
// @match        https://v2ex.com/t/*
// @match        https://global.v2ex.com/t/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      code-marker.YOUR.workers.dev
// @connect      localhost
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 配置 ====================

  const CONFIG = {
    // 后端 API 地址（部署后替换为你的 CF Worker 地址）
    API: 'https://code-marker.kevenbrown770.workers.dev',

    // 置信度阈值
    THRESHOLD: 3,

    // Widget 退让检测等待时间 (ms)
    WIDGET_WAIT: 600,

    // 内置正则规则（覆盖常见邀请码格式）
    DEFAULT_PATTERNS: [
      // 连字符分隔：XXXXX-XXXXX-XXXXX（至少两段，每段3+字符）
      '[A-Za-z0-9]{3,}(?:[-_][A-Za-z0-9]{3,}){1,}',
      // 纯字母数字混合（8-32位，必须同时含字母和数字）
      '(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{8,32}',
    ],

    // 排除模式（误识别过滤）
    EXCLUDE: [
      /^https?$/i,
      /^localhost$/i,
      /^undefined$/i,
      /^function$/i,
      /^[A-Z]{2,5}-\d{3}$/,       // HTTP-200 等
      /^UTF-?8$/i,
      /^[a-f0-9]{40}$/,           // git SHA
      /^\d{8,}$/,                  // 纯数字
      /^(?:January|February|March|April|May|June|July|August|September|October|November|December)/i,
    ],

    // 评论区"已用"关键词
    USED_KEYWORDS: /已用|已使用|用过了|用完了|已经用了|已被使用|used|taken|claimed|redeemed|失效/,
  };

  // ==================== 自定义正则管理 ====================

  function getCustomPatterns() {
    const raw = GM_getValue('custom_patterns', '[]');
    try { return JSON.parse(raw); } catch (e) { return []; }
  }

  function saveCustomPatterns(patterns) {
    GM_setValue('custom_patterns', JSON.stringify(patterns));
  }

  function getAllPatterns() {
    const custom = getCustomPatterns();
    const all = [...CONFIG.DEFAULT_PATTERNS, ...custom];
    return all.map(p => {
      try { return new RegExp(p, 'g'); } catch (e) { return null; }
    }).filter(Boolean);
  }

  // 注册菜单命令
  GM_registerMenuCommand('添加自定义匹配规则', () => {
    const input = prompt(
      '输入正则表达式（不含 / 和 flags，自动加 g 标志）\n\n' +
      '示例：\n' +
      '  [A-F0-9]{32}          匹配32位HEX\n' +
      '  sk-[A-Za-z0-9]{48}   匹配OpenAI key格式\n\n' +
      '当前自定义规则：' + (getCustomPatterns().join(', ') || '无')
    );
    if (!input) return;
    try {
      new RegExp(input, 'g'); // 验证合法性
      const patterns = getCustomPatterns();
      patterns.push(input);
      saveCustomPatterns(patterns);
      alert('规则已添加！刷新页面生效。\n当前自定义规则：' + patterns.join(', '));
    } catch (e) {
      alert('正则语法错误: ' + e.message);
    }
  });

  GM_registerMenuCommand('查看/删除自定义规则', () => {
    const patterns = getCustomPatterns();
    if (!patterns.length) { alert('当前没有自定义规则'); return; }
    const msg = patterns.map((p, i) => `${i + 1}. ${p}`).join('\n');
    const idx = prompt('当前自定义规则：\n' + msg + '\n\n输入序号删除，或输入 0 清除全部：');
    if (idx === null) return;
    const n = parseInt(idx, 10);
    if (n === 0) { saveCustomPatterns([]); alert('已清除全部自定义规则'); }
    else if (n >= 1 && n <= patterns.length) {
      patterns.splice(n - 1, 1);
      saveCustomPatterns(patterns);
      alert('已删除。剩余规则：' + (patterns.join(', ') || '无'));
    }
  });

  GM_registerMenuCommand('重置为默认规则', () => {
    if (confirm('确定清除所有自定义规则，恢复默认？')) {
      saveCustomPatterns([]);
      alert('已重置。刷新页面生效。');
    }
  });

  // ==================== 访客 ID ====================

  function getVisitorId() {
    let v = GM_getValue('cm_vid', '');
    if (!v) {
      // 同时写入 localStorage 以与 widget 共享
      v = localStorage.getItem('cm_vid');
    }
    if (!v) {
      v = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      GM_setValue('cm_vid', v);
      try { localStorage.setItem('cm_vid', v); } catch (e) {}
    }
    return v;
  }

  // ==================== API 调用 ====================

  function apiGet(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: CONFIG.API + path,
        headers: { 'X-Visitor-Id': getVisitorId() },
        onload: (resp) => {
          try { resolve(JSON.parse(resp.responseText)); }
          catch (e) { reject(e); }
        },
        onerror: reject
      });
    });
  }

  function apiPost(path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: CONFIG.API + path,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ ...body, visitorId: getVisitorId() }),
        onload: (resp) => {
          try { resolve(JSON.parse(resp.responseText)); }
          catch (e) { reject(e); }
        },
        onerror: reject
      });
    });
  }

  // ==================== 码提取 ====================

  function extractCodes(textContent) {
    const patterns = getAllPatterns();
    const found = new Set();

    for (const regex of patterns) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(textContent)) !== null) {
        const code = m[0];
        // 长度过滤
        if (code.length < 5 || code.length > 64) continue;
        // 排除误识别
        if (CONFIG.EXCLUDE.some(ex => ex.test(code))) continue;
        found.add(code);
      }
    }

    return Array.from(found);
  }

  // ==================== 评论区解析 ====================

  function parseCommentsForUsed(codes) {
    const usedSet = new Set();
    const replies = document.querySelectorAll('.reply_content');

    replies.forEach(el => {
      const text = el.textContent;
      codes.forEach(code => {
        if (!text.includes(code)) return;
        // 取码前后30字符的上下文
        const idx = text.indexOf(code);
        const context = text.substring(Math.max(0, idx - 30), idx + code.length + 30);
        if (CONFIG.USED_KEYWORDS.test(context)) {
          usedSet.add(code);
        }
      });
    });

    return usedSet;
  }

  // ==================== 样式注入 ====================

  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
.cm-wrap{display:inline-flex;align-items:center;gap:3px;margin:0 2px;padding:2px 5px;border-radius:4px;background:#f7f8fa;border:1px solid #e2e8f0;vertical-align:middle;line-height:1.4}
.cm-wrap.s-hi{background:#fef2f2;border-color:#fecaca}
.cm-wrap.s-md{background:#fffbeb;border-color:#fde68a}
.cm-wrap.s-ok{background:#f0fdf4;border-color:#bbf7d0}
.cm-wrap .cm-c{font-family:"SF Mono","Fira Code",Menlo,monospace;font-size:13px;user-select:all}
.cm-wrap.s-hi .cm-c{text-decoration:line-through;opacity:.55}
.cm-wrap .cm-s{font-size:10px;color:#94a3b8;white-space:nowrap}
.cm-wrap .cm-b{border:none;border-radius:3px;padding:1px 5px;font-size:11px;cursor:pointer;transition:all .12s;line-height:1.4}
.cm-wrap .cm-b:hover{transform:scale(1.08)}
.cm-b-u{background:#fee2e2;color:#dc2626}
.cm-b-u.on{background:#dc2626;color:#fff}
.cm-b-a{background:#dcfce7;color:#16a34a}
.cm-b-a.on{background:#16a34a;color:#fff}
.cm-b-c{background:#f1f5f9;color:#475569}
.cm-summary{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin:10px 0;font-size:12px;color:#64748b;display:flex;align-items:center;gap:12px}
.cm-summary strong{color:#334155}
.cm-toast{position:fixed;bottom:20px;right:20px;background:#1e293b;color:#fff;padding:7px 14px;border-radius:5px;font-size:12px;z-index:99999;opacity:0;transition:opacity .25s;pointer-events:none}
.cm-toast.on{opacity:1}
`;
    document.head.appendChild(s);
  }

  function toast(msg) {
    let t = document.querySelector('.cm-toast');
    if (!t) { t = document.createElement('div'); t.className = 'cm-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('on'), 1800);
  }

  // ==================== UI 注入 ====================

  function buildInlineHtml(code, info, commentUsed) {
    const uc = (info ? info.usedCount : 0) + (commentUsed ? 1 : 0);
    const ac = info ? info.availableCount : 0;
    const myVote = info ? info.myVote : null;
    const cls = uc >= CONFIG.THRESHOLD ? 's-hi' : uc > 0 ? 's-md' : ac > 0 ? 's-ok' : '';

    let stat = '';
    if (uc > 0) stat += `<span class="cm-s" style="color:#ef4444">${uc}✗</span>`;
    if (ac > 0) stat += `<span class="cm-s" style="color:#22c55e">${ac}✓</span>`;

    return `<span class="cm-wrap ${cls}" data-cm-code="${escAttr(code)}">` +
      `<span class="cm-c">${escHtml(code)}</span>` +
      stat +
      `<button class="cm-b cm-b-u${myVote === 'used' ? ' on' : ''}" data-a="used" title="标记已用">✗</button>` +
      `<button class="cm-b cm-b-a${myVote === 'available' ? ' on' : ''}" data-a="available" title="标记可用">✓</button>` +
      `<button class="cm-b cm-b-c" data-a="copy" title="复制">⎘</button>` +
      `</span>`;
  }

  function injectSummary(container, codes, state, commentUsedSet) {
    const usedCount = codes.filter(c => {
      const uc = (state[c] ? state[c].usedCount : 0) + (commentUsedSet.has(c) ? 1 : 0);
      return uc >= CONFIG.THRESHOLD;
    }).length;

    const summary = document.createElement('div');
    summary.className = 'cm-summary';
    summary.innerHTML = `
      <span>识别到 <strong>${codes.length}</strong> 个码</span>
      <span>|</span>
      <span>高置信度已用 <strong>${usedCount}</strong> / 待验证 <strong>${codes.length - usedCount}</strong></span>
      <span style="margin-left:auto;font-size:11px;color:#a0aec0">code-marker 协作标记</span>
    `;
    container.parentNode.insertBefore(summary, container.nextSibling);
  }

  // ==================== 主流程 ====================

  async function main() {
    // Step 1: 等待可能的 widget 挂载
    await new Promise(r => setTimeout(r, CONFIG.WIDGET_WAIT));

    // Step 2: 检测 widget 是否已存在
    if (document.querySelector('[data-cm-active]')) {
      console.log('[code-marker] 检测到 widget 已激活，脚本退让');
      return;
    }

    // Step 3: 定位帖子正文
    const topicContent = document.querySelector('.topic_content');
    if (!topicContent) return;

    // Step 4: 提取码
    const codes = extractCodes(topicContent.textContent);
    if (!codes.length) return;

    console.log('[code-marker] 识别到', codes.length, '个候选码:', codes);

    // 注入样式
    injectStyles();

    // Step 5: 获取 API 标记状态
    const pageId = location.pathname;
    let state = {};
    try {
      const resp = await apiGet('/api/codes?page=' + encodeURIComponent(pageId));
      if (resp && resp.codes) state = resp.codes;
    } catch (e) {
      console.warn('[code-marker] API 不可用，仅使用评论区数据');
    }

    // Step 6: 解析评论区
    const commentUsedSet = parseCommentsForUsed(codes);

    // Step 7: 注入 UI
    let html = topicContent.innerHTML;
    codes.forEach(code => {
      const info = state[code] || null;
      const fromComment = commentUsedSet.has(code);
      const replacement = buildInlineHtml(code, info, fromComment);
      // 只替换第一次出现（避免重复替换）
      html = html.replace(code, replacement);
    });
    topicContent.innerHTML = html;

    // 摘要栏
    injectSummary(topicContent, codes, state, commentUsedSet);

    // Step 8: 事件绑定（事件委托）
    topicContent.addEventListener('click', async (e) => {
      const btn = e.target.closest('.cm-b');
      if (!btn) return;

      const wrap = btn.closest('.cm-wrap');
      if (!wrap) return;
      const code = wrap.dataset.cmCode;
      const action = btn.dataset.a;

      if (action === 'copy') {
        try { await navigator.clipboard.writeText(code); } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = code; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        }
        toast('已复制: ' + code);
        return;
      }

      // 确定实际动作
      const currentVote = state[code] ? state[code].myVote : null;
      const realAction = currentVote === action ? 'clear' : action;

      try {
        const res = await apiPost('/api/codes/mark', { pageId, code, action: realAction });
        if (res && res.success) {
          state[code] = state[code] || { code, usedCount: 0, availableCount: 0, myVote: null };
          state[code].usedCount = res.usedCount;
          state[code].availableCount = res.availableCount;
          state[code].myVote = res.myVote;

          // 更新该行 UI
          const newHtml = buildInlineHtml(code, state[code], commentUsedSet.has(code));
          wrap.outerHTML = newHtml;
        }
      } catch (err) {
        console.error('[code-marker] 标记失败:', err);
      }

      const msgs = { used: '标记为「已用」', available: '标记为「可用」', clear: '已取消标记' };
      toast(msgs[realAction] || '');
    });
  }

  // --- Helpers ---
  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
