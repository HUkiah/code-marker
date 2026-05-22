// 本地验证脚本：用真实 V2EX 样例页面测试新正则匹配率
// 用法：node test-regex.js

const fs = require('fs');
const path = require('path');

// === 与 userscript 中保持一致的配置 ===
const DEFAULT_PATTERNS = [
  '\\b(?=[A-Z0-9-]*\\d)[A-Z0-9]{3,8}(?:-[A-Z0-9]{3,8}){1,3}\\b',
  '\\b[a-f0-9]{16}\\b',
  '\\b[a-f0-9]{32}\\b',
  '\\b[A-F0-9]{32}\\b',
  '\\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\\d)[A-Z0-9]{16}\\b',
];

const EXCLUDE = [
  /^https?$/i, /^localhost$/i, /^undefined$/i, /^function$/i,
  /^[A-Z]{2,5}-\d{1,3}$/, /^UTF-?8$/i,
  /^[a-f0-9]{40}$/, /^[a-f0-9]{64}$/,
  /^\d+$/,
  /^(?:January|February|March|April|May|June|July|August|September|October|November|December)/i,
  /^t-\d+$/i,
  /^v\d+(?:[-.]\d+){1,3}$/i,
];

function extractCodes(text) {
  const found = new Set();
  for (const p of DEFAULT_PATTERNS) {
    const re = new RegExp(p, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const code = m[0];
      if (code.length < 5 || code.length > 64) continue;
      if (EXCLUDE.some(ex => ex.test(code))) continue;
      found.add(code);
    }
  }
  return Array.from(found);
}

// === 极简 HTML -> 正文文本提取（仅取 <div class="topic_content">...</div> 内容） ===
function extractTopicTexts(html) {
  const blocks = [];
  let idx = 0;
  while (true) {
    const start = html.indexOf('class="topic_content"', idx);
    if (start === -1) break;
    const openEnd = html.indexOf('>', start);
    if (openEnd === -1) break;
    let depth = 1;
    let i = openEnd + 1;
    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf('<div', i);
      const nextClose = html.indexOf('</div>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 4;
      } else {
        depth--;
        i = nextClose + 6;
      }
    }
    blocks.push(html.slice(openEnd + 1, i - 6));
    idx = i;
  }
  return blocks.map(b =>
    b.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const samples = [
  {
    file: 'd:/____Han____/example/[送 CDK] 1024Proxy 免费开放流量试用，住宅 IP 可体验 - V2EX.html',
    expected: ['BGTC-XKP6-WLP7', 'PM5H-E47T-98YN', 'AZ9Z-RLF9-BPKM', 'D2SX-6L87-JDFQ'],
  },
  {
    file: 'd:/____Han____/example/API 老站 Crazyrouter.com 兑换码 - V2EX.html',
    expected: [
      'f4e431b607cc4c939428e2c335c7d5da',
      'da34f6536d3444df8fc09027458f7bbf',
      'dc3db1f158fd4ce79405cb5aa48ae6d1',
      'a228e8f9ea074ed884e055993521fa0b',
      '9e9eec6f437345ccaf9b8505d5a3610c',
      '65af1a7f1bfd4c8ea2f481f9a79f9752',
      'fa3adc5f347745fe86c0c1d639aec9cc',
      'bfb93956d18246b18835d39037112509',
      'ec52412e41a64b9c9db9c3181172c76d',
      '520a6ce94bce4af3ab519078fa90939e',
    ],
  },
  {
    file: 'd:/____Han____/example/B 站邀请码，每个月更新 - V2EX.html',
    expected: [
      // 主帖正文
      '6ff2d6e925acc6dd', '64dc171ba5aece08', '374156ceeabdda9f',
      // 第 2 条附言
      'a591636d01f29c8b', '4d477699aa9613ba', 'fc2f054014226984',
      // 第 3 条附言
      '1dc1de78381baba6', '1e2cee5c36960da0', '36eac6f13cd54d9f',
      // 第 4 条附言
      'eba93ef2ca092192', 'b0e741688f14e913', '303c4e783c6c17a2',
    ],
  },
];

let totalPass = 0;
samples.forEach(({ file, expected }) => {
  const html = fs.readFileSync(file, 'utf8');
  const blocks = extractTopicTexts(html);
  const text = blocks.join('\n');
  const codes = extractCodes(text);

  const name = path.basename(file).slice(0, 40);
  console.log('\n=== ' + name + ' ===');
  console.log('内容块数（正文+附言）:', blocks.length);
  console.log('正文长度:', text.length);
  console.log('识别到', codes.length, '个候选码:');
  codes.forEach(c => console.log('  -', c));

  const missed = expected.filter(c => !codes.includes(c));
  const extra = codes.filter(c => !expected.includes(c));
  console.log('\n应识别', expected.length, '个，实际识别', codes.length, '个');
  if (missed.length) console.log('  ❌ 漏报:', missed);
  if (extra.length) console.log('  ⚠️  误报:', extra);
  if (!missed.length && !extra.length) {
    console.log('  ✅ 完美匹配');
    totalPass++;
  }
});

console.log('\n========================================');
console.log(`总计：${totalPass}/${samples.length} 个样本完美匹配`);
