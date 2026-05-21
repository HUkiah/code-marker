# V2EX 试用码协作标记 - 油猴脚本

自动识别 V2EX 帖子中的试用码/邀请码，支持社区协作标记使用状态。

## 安装

### 前置要求

安装以下任一用户脚本管理器：

- [Tampermonkey](https://www.tampermonkey.net/)（推荐，支持 Chrome/Firefox/Edge/Safari）
- [Violentmonkey](https://violentmonkey.github.io/)
- [Greasemonkey](https://www.greasespot.net/)（仅 Firefox）

### 安装脚本

**方式一：直接安装**

点击 [v2ex-code-marker.user.js](https://raw.githubusercontent.com/你的用户名/code-marker/main/userscript/v2ex-code-marker.user.js)，脚本管理器会自动弹出安装确认。

**方式二：手动安装**

1. 打开 Tampermonkey → 添加新脚本
2. 复制 `userscript/v2ex-code-marker.user.js` 的全部内容
3. 粘贴并保存

## 功能

- **自动识别**：正则匹配帖子正文中的邀请码（支持自定义规则）
- **评论区解析**：自动识别回复中的「已用」「已使用」等标记
- **协作标记**：点击按钮标记「已用」或「可用」，数据同步到云端
- **置信度显示**：根据标记人数显示颜色（绿→黄→红）
- **一键复制**：点击复制按钮快速复制码
- **组件退让**：如果发布者已使用 Code Marker Widget，脚本自动退让

## 自定义正则规则

脚本内置了常见邀请码格式（如 `XXX-YYY-ZZZ`、8位以上字母数字混合），但每个产品的码格式可能不同。

### 添加自定义规则

1. 点击浏览器中 Tampermonkey 图标
2. 在「V2EX 试用码协作标记」下选择 **添加自定义匹配规则**
3. 输入正则表达式（不含 `/` 和 flags，自动加 `g`）

示例：
```
[A-F0-9]{32}           # 匹配 32 位 HEX 串
sk-[A-Za-z0-9]{48}    # 匹配 OpenAI API Key 格式
[A-Z]{4}-\d{4}-\d{4}  # 匹配 ABCD-1234-5678 格式
```

### 管理规则

- **查看/删除自定义规则**：在 Tampermonkey 菜单中选择对应项
- **重置为默认规则**：清除所有自定义规则，恢复内置默认

## 内置规则

默认识别以下格式：

| 格式 | 示例 |
|------|------|
| 连字符分隔（每段≥3字符） | `INVITE-AX8K2-2024`、`VPN-TRIAL-7DAY-X8K2M` |
| 字母数字混合（8-32位） | `A8kM2xNp9Q`、`ABCD1234EFGH5678` |

## 排除规则

以下模式不会被误识别为邀请码：
- URL 片段（`https`、`localhost`）
- HTTP 状态码格式（`HTTP-200`）
- Git SHA（40位纯小写hex）
- 纯数字串
- 编码名称（`UTF-8`）

## 配置

脚本顶部 `CONFIG` 对象可修改：

```javascript
const CONFIG = {
  API: 'https://code-marker.xxx.workers.dev',  // 后端地址
  THRESHOLD: 3,        // 多少人标记视为高置信度
  WIDGET_WAIT: 600,    // 等待 widget 加载的时间(ms)
};
```

## 工作流程

```
页面加载
  ↓
等待 600ms（给 widget 加载时间）
  ↓
检测 [data-cm-active] ─── 存在 → 退让，不做任何操作
  ↓ 不存在
提取 .topic_content 中的候选码
  ↓
调 API 获取已有标记状态
  ↓
扫描 .reply_content 评论区关键词
  ↓
注入行内标记按钮 + 摘要栏
```

## 适用范围

- `https://www.v2ex.com/t/*`
- `https://v2ex.com/t/*`
- `https://global.v2ex.com/t/*`

如需适配其他社区，修改脚本头部的 `@match` 规则即可。

## 隐私

- 仅生成一个随机匿名 ID（存储在本地），用于防止重复投票
- 不收集任何个人信息
- 不读取页面中邀请码以外的内容
- 所有网络请求仅发往 Code Marker API 服务器
