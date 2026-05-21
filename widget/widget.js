/**
 * Code Marker Widget v2 - 发布者嵌入组件
 *
 * 使用方式：
 * <div class="code-marker" data-codes="CODE1,CODE2,CODE3" data-page-id="可选"></div>
 * <script src="https://code-marker.kevenbrown770.workers.dev/widget.js"></script>
 *
 * API 地址自动从 <script src> 的 origin 推导，无需手动配置。
 */
(function () {
  'use strict';

  var THRESHOLD = 3;
  var VID_KEY = 'cm_vid';
  var STYLE_ID = 'cm-widget-style';

  // --- 推导 API 地址 ---
  function resolveApiBase() {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src;
      if (src.indexOf('widget.js') !== -1) {
        try {
          var u = new URL(src);
          return u.origin;
        } catch (e) {}
      }
    }
    // fallback: 同源
    return location.origin;
  }

  var API_BASE = resolveApiBase();

  // --- 访客 ID ---
  function getVisitorId() {
    var v = localStorage.getItem(VID_KEY);
    if (v) return v;
    v = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(VID_KEY, v);
    return v;
  }

  // --- 样式注入 ---
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = '\
.cm-box{border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;background:#fff;color:#1a202c;max-width:640px;margin:8px 0}\
.cm-hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid #f1f5f9}\
.cm-hdr-t{font-weight:600;color:#475569;font-size:13px}\
.cm-hdr-h{font-size:11px;color:#94a3b8}\
.cm-row{display:flex;align-items:center;padding:6px 8px;margin:3px 0;border-radius:5px;transition:background .15s}\
.cm-row:hover{filter:brightness(.98)}\
.cm-row.s-hi{background:#fef2f2}\
.cm-row.s-md{background:#fffbeb}\
.cm-row.s-ok{background:#f0fdf4}\
.cm-code{flex:1;font-family:"SF Mono","Fira Code",Menlo,Consolas,monospace;font-size:13px;user-select:all;word-break:break-all}\
.cm-row.s-hi .cm-code{text-decoration:line-through;opacity:.55}\
.cm-stat{font-size:10px;margin:0 4px;white-space:nowrap}\
.cm-stat-u{color:#ef4444}\
.cm-stat-a{color:#22c55e}\
.cm-btn{border:none;border-radius:3px;padding:2px 7px;margin:0 2px;font-size:11px;cursor:pointer;transition:all .12s;line-height:1.5}\
.cm-btn:hover{transform:scale(1.06)}\
.cm-btn-u{background:#fee2e2;color:#dc2626}\
.cm-btn-u.on{background:#dc2626;color:#fff}\
.cm-btn-a{background:#dcfce7;color:#16a34a}\
.cm-btn-a.on{background:#16a34a;color:#fff}\
.cm-btn-c{background:#f1f5f9;color:#475569}\
.cm-ft{text-align:right;margin-top:8px;font-size:10px;color:#cbd5e1}\
.cm-toast{position:fixed;bottom:20px;right:20px;background:#1e293b;color:#fff;padding:7px 14px;border-radius:5px;font-size:12px;z-index:99999;opacity:0;transition:opacity .25s;pointer-events:none}\
.cm-toast.on{opacity:1}';
    document.head.appendChild(s);
  }

  // --- Toast ---
  function toast(msg) {
    var t = document.querySelector('.cm-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'cm-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._tid);
    t._tid = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  // --- API 调用 ---
  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(API_BASE + path, opts).then(function (r) { return r.json(); });
  }

  // --- Widget 类 ---
  function Widget(el) {
    this.el = el;
    this.codes = (el.dataset.codes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    this.pageId = el.dataset.pageId || location.pathname + location.search;
    this.vid = getVisitorId();
    this.state = {};

    if (!this.codes.length) {
      el.innerHTML = '<p style="color:#e53e3e;font-size:12px">[code-marker] data-codes 为空</p>';
      return;
    }

    // 标记为激活，让油猴脚本退让
    el.dataset.cmActive = 'true';
    this.init();
  }

  Widget.prototype.init = function () {
    var self = this;
    api('GET', '/api/codes?page=' + encodeURIComponent(this.pageId) + '&vid=' + encodeURIComponent(this.vid))
      .then(function (data) {
        if (data && data.codes) self.state = data.codes;
        // 补充本地 codes 里有但服务端还没有的
        self.codes.forEach(function (c) {
          if (!self.state[c]) self.state[c] = { code: c, usedCount: 0, availableCount: 0, myVote: null };
        });
        self.render();
      })
      .catch(function () {
        // API 不可用时仍渲染空状态
        self.codes.forEach(function (c) {
          self.state[c] = { code: c, usedCount: 0, availableCount: 0, myVote: null };
        });
        self.render();
      });
  };

  Widget.prototype.render = function () {
    var self = this;
    var h = '<div class="cm-box"><div class="cm-hdr">';
    h += '<span class="cm-hdr-t">试用码 (' + this.codes.length + ')</span>';
    h += '<span class="cm-hdr-h">点击标记帮助他人判断</span></div>';

    this.codes.forEach(function (code) {
      var info = self.state[code] || { usedCount: 0, availableCount: 0, myVote: null };
      var cls = info.usedCount >= THRESHOLD ? 's-hi' : info.usedCount > 0 ? 's-md' : info.availableCount > 0 ? 's-ok' : '';

      h += '<div class="cm-row ' + cls + '">';
      h += '<span class="cm-code">' + escHtml(code) + '</span>';
      if (info.usedCount > 0) h += '<span class="cm-stat cm-stat-u">' + info.usedCount + '人标记已用</span>';
      if (info.availableCount > 0) h += '<span class="cm-stat cm-stat-a">' + info.availableCount + '人标记可用</span>';
      h += '<button class="cm-btn cm-btn-u' + (info.myVote === 'used' ? ' on' : '') + '" data-a="used" data-c="' + escAttr(code) + '">已用</button>';
      h += '<button class="cm-btn cm-btn-a' + (info.myVote === 'available' ? ' on' : '') + '" data-a="available" data-c="' + escAttr(code) + '">可用</button>';
      h += '<button class="cm-btn cm-btn-c" data-a="copy" data-c="' + escAttr(code) + '">复制</button>';
      h += '</div>';
    });

    h += '<div class="cm-ft">code-marker | 社区协作标记</div></div>';
    this.el.innerHTML = h;

    // 事件委托
    this.el.onclick = function (e) {
      var btn = e.target.closest ? e.target.closest('.cm-btn') : null;
      if (!btn && e.target.classList && e.target.classList.contains('cm-btn')) btn = e.target;
      if (!btn) return;
      var action = btn.dataset.a;
      var code = btn.dataset.c;
      if (action === 'copy') {
        copyText(code);
        toast('已复制: ' + code);
        return;
      }
      self.mark(code, action);
    };
  };

  Widget.prototype.mark = function (code, action) {
    var self = this;
    var info = this.state[code];
    // 如果已经是当前投票则为取消
    var realAction = (info && info.myVote === action) ? 'clear' : action;

    // 乐观更新
    if (info) {
      if (info.myVote === 'used') info.usedCount = Math.max(0, info.usedCount - 1);
      if (info.myVote === 'available') info.availableCount = Math.max(0, info.availableCount - 1);
      if (realAction === 'used') info.usedCount++;
      else if (realAction === 'available') info.availableCount++;
      info.myVote = realAction === 'clear' ? null : realAction;
      this.render();
    }

    api('POST', '/api/codes/mark', {
      pageId: this.pageId,
      code: code,
      action: realAction,
      visitorId: this.vid
    }).then(function (res) {
      if (res && res.success) {
        self.state[code].usedCount = res.usedCount;
        self.state[code].availableCount = res.availableCount;
        self.state[code].myVote = res.myVote;
        self.render();
      }
    }).catch(function () {
      // 网络失败时保留乐观状态
    });

    var msgs = { used: '标记为「已用」', available: '标记为「可用」', clear: '已取消标记' };
    toast(msgs[realAction] || '');
  };

  // --- Helpers ---
  function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function copyText(text) {
    if (navigator.clipboard) { navigator.clipboard.writeText(text); return; }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // --- 初始化 ---
  function initAll() {
    injectStyles();
    var els = document.querySelectorAll('.code-marker');
    for (var i = 0; i < els.length; i++) {
      if (!els[i]._cmInit) {
        els[i]._cmInit = true;
        new Widget(els[i]);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  window.CodeMarker = { init: initAll, Widget: Widget };
})();
