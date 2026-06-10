# SEO MCP Connector

SEO MCP Connector 是一个本地运行的 SEO 数据 MCP 管理壳，用来把 [`search-console-mcp`](https://www.npmjs.com/package/search-console-mcp) 标准化成可控、可管理、适合 Agent 调用的产品。

它可以让 MCP 客户端通过一个本地入口访问 Google Search Console、GA4、Bing Webmaster Tools、PageSpeed 和 SEO 分析工具，同时由管理页面控制密钥、站点白名单和工具权限。

## 功能

- 本地管理页面：管理 Google OAuth client、Bing API Key、service account 路径、站点白名单和权限开关。
- 本地加密保存密钥：使用 AES-256-GCM。
- MCP 权限过滤：同时过滤 `tools/list` 和 `tools/call`。
- 默认只开放读取、分析类能力；写入、删除、提交类能力默认关闭。
- 通过安装脚本准备 `search-console-mcp@1.14.0`，不上传本地 token 或第三方依赖。
- 提供中英文产品说明和 Agent 调用说明。

## 脱敏与隐私

这个仓库不包含任何真实账号、OAuth token、邮箱、域名、GA4 Property ID、API Key 或本地密钥。

以下文件只保存在本机，已被 `.gitignore` 排除：

- `.seo-mcp-key`
- `data/config.json`
- `data/runtime.json`
- `data/users.json`
- `vendor/`
- `.env`

不要把这些文件提交到 GitHub，也不要复制给别人。

## 环境要求

- Node.js 20 或以上。
- Google Cloud OAuth 客户端。建议使用 Desktop app 类型。
- 需要启用的 Google API：
  - Google Search Console API
  - Google Analytics Data API
  - Google Analytics Admin API
- 可选：Bing Webmaster Tools API Key。

## 安装与启动

```bash
git clone https://github.com/<owner>/seo-mcp-connector.git
cd seo-mcp-connector
npm run prepare-engine
npm start
```

启动后终端会显示本地管理地址，例如：

```text
SEO MCP Connector is running at http://127.0.0.1:54321
```

没有默认用户名和密码。第一次打开页面时，需要创建本机管理员账号。这个账号只用于保护本地管理页面，不会发送给 Google、Bing 或任何第三方。

## 连接 Google Search Console 和 GA4

1. 打开本地管理页面。
2. 保存你的 Google OAuth client ID 和 client secret。
3. 授权 Google Search Console：

```bash
npm run setup:gsc
```

4. 如果需要提交 sitemap、添加站点等 Search Console 写入操作，重新授权完整 Search Console scope：

```bash
npm run setup:gsc:write
```

只在管理页面开启权限还不够，Google 账号本身也必须授予 `https://www.googleapis.com/auth/webmasters`。

5. 授权 GA4：

```bash
npm run setup:ga4
```

6. 查看已连接账号：

```bash
npm run accounts:list
```

这些 setup 命令会读取管理页面里加密保存的密钥，并把它们传给底层 `search-console-mcp`。OAuth token 由 `search-console-mcp` 保存在本机。

## 可选：连接 Bing

在管理页面保存 Bing API Key 后运行：

```bash
npm run setup:bing
```

Bing 读取和写入权限默认关闭，需要在管理页面手动开启。

## MCP 客户端配置

把路径换成你电脑上的绝对路径：

```json
{
  "mcpServers": {
    "seo-search-console": {
      "command": "node",
      "args": [
        "/absolute/path/to/seo-mcp-connector/bin/run-seo-mcp.js"
      ]
    }
  }
}
```

Agent 应连接这个 wrapper，不要绕过它直连 `npx search-console-mcp`。这样权限白名单、站点白名单和高风险工具拦截才会生效。

## 默认权限

默认开启：

- GSC 读取与 SEO 分析
- GA4 读取
- 读取 sitemap
- URL Inspection
- PageSpeed 与结构化数据验证
- GSC + GA4 交叉分析

默认关闭：

- Bing 读取
- 添加站点，需要额外运行 `npm run setup:gsc:write`
- 提交 sitemap，需要额外运行 `npm run setup:gsc:write`
- Google/Bing 索引提交
- Bing URL 提交
- 删除与移除操作

即使 Agent 猜到被关闭工具的名称，`bin/run-seo-mcp.js` 也会在调用时拒绝。

## 文档

- 英文说明：[`README.md`](README.md)
- 英文 Agent 调用说明：[`docs/AGENT_USAGE.md`](docs/AGENT_USAGE.md)
- 中文 Agent 调用说明：[`docs/AGENT_USAGE.zh-CN.md`](docs/AGENT_USAGE.zh-CN.md)

## 常用维护命令

```bash
npm run check
npm run prepare-engine
npm run accounts:list
```
