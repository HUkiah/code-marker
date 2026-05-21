# Code Marker

社区试用码/邀请码协作标记工具。帮助用户快速识别哪些码已被使用，避免逐条尝试的低效体验。

## 工作原理

两种互补入口，共享同一个后端数据层：

```
┌────────────────────────────────────────────────────────┐
│ 场景 A：读者安装了油猴脚本                                │
│                                                        │
│  帖子有 widget？──是──→ 脚本自动退让，widget 接管         │
│        │                                               │
│        否                                              │
│        ↓                                               │
│  脚本自动识别码 → 注入标记按钮 → 解析评论区 → 调 API      │
├────────────────────────────────────────────────────────┤
│ 场景 B：读者没装脚本                                      │
│                                                        │
│  帖子有 widget？──是──→ widget 提供完整交互               │
│        │                                               │
│        否 → 无增强（原始体验）                            │
└────────────────────────────────────────────────────────┘
                        ↓
          ┌──────────────────────────┐
          │  Cloudflare Workers + KV  │
          │      （统一后端）          │
          └──────────────────────────┘
```

## 项目结构

```
code-marker/
├── worker/                    # Cloudflare Workers 后端 API
│   ├── index.js
│   └── wrangler.toml
├── widget/                    # 发布者嵌入的交互组件
│   └── widget.js
├── userscript/                # 油猴脚本（读者安装）
│   └── v2ex-code-marker.user.js
└── dev-server/                # 本地开发/演示服务器
    ├── index.js
    └── public/
```

## 快速开始

### 本地开发

```bash
npm install
npm run dev
# 访问 http://localhost:3456/demo-with-widget.html
```

### 部署后端

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 KV 存储
cd worker
wrangler kv namespace create CODE_MARKER
wrangler kv namespace create CODE_MARKER --preview

# 将输出的 id 和 preview_id 填入 wrangler.toml

# 部署
wrangler deploy
```

部署完成后会得到一个 URL（如 `https://code-marker.xxx.workers.dev`），这就是 API 地址。

## 使用方式

### 方式一：发布者嵌入组件

适用于支持自定义 HTML 的平台。发布者在帖子中粘贴：

```html
<div class="code-marker"
     data-codes="CODE1,CODE2,CODE3"
     data-page-id="可选的唯一标识"></div>
<script src="https://code-marker.xxx.workers.dev/widget.js"></script>
```

效果：显示一个交互式码列表，所有读者可标记「已用」或「可用」。

### 方式二：读者安装油猴脚本

适用于 V2EX 等不支持自定义 HTML 的社区。读者安装脚本后：

1. 自动识别帖子中的邀请码
2. 在每个码旁边注入标记按钮
3. 解析评论区中的「已用」回复
4. 所有标记数据同步到后端

详见 [油猴脚本安装说明](userscript/README.md)。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/codes?page={pageId}&vid={visitorId}` | 获取页面所有码的标记状态 |
| POST | `/api/codes/mark` | 标记/取消标记一个码 |
| GET | `/widget.js` | 获取 widget 脚本 |

### POST /api/codes/mark

```json
{
  "pageId": "页面唯一标识",
  "code": "INVITE-XXXXX",
  "action": "used | available | clear",
  "visitorId": "访客唯一标识"
}
```

## 置信度机制

- 0 人标记 → 灰色「待验证」
- 1-2 人标记已用 → 黄色警告
- ≥3 人标记已用 → 红色 + 删除线（高置信度已用）
- 有人标记可用 → 绿色

## 免费额度

Cloudflare Workers 免费层：

| 资源 | 限制 |
|------|------|
| Workers 请求 | 10 万次/天 |
| KV 读取 | 10 万次/天 |
| KV 写入 | 1,000 次/天 |
| KV 存储 | 1 GB |

对社区级使用量完全充足。

## License

MIT
