# Agent 调用说明

本说明给 Codex、Claude、Cursor 或其他 MCP Agent 使用。目标是让 Agent 通过 SEO MCP Connector 读取 GSC、GA4、Bing 和 SEO 数据，同时避免默认获得写入、删除、提交等高风险能力。

## 连接器名称

建议 MCP server 名称：

```text
seo-search-console
```

## 调用总原则

- 需要了解当前可用平台和工具时，先调用 `get_started`。
- 需要站点列表时调用 `sites_list`，不要凭记忆猜 GSC property。
- 必须连接 wrapper，不要绕过它直连 `search-console-mcp`。
- GSC domain property 使用 `sc-domain:example.com`。
- GA4 查询使用 property ID，例如 `123456789`。
- 写入、删除、提交 sitemap、索引提交、Bing URL 提交等工具默认关闭。
- 如果工具不存在或调用被拒绝，提示用户在本地管理页面开启对应权限，不要尝试绕过 runner。

## 常用调用

### 查看站点

```json
{
  "tool": "sites_list",
  "arguments": {
    "engine": "google"
  }
}
```

### 查询 GSC 搜索表现

```json
{
  "tool": "analytics_query",
  "arguments": {
    "siteUrl": "sc-domain:example.com",
    "startDate": "2026-05-01",
    "endDate": "2026-05-31",
    "dimensions": ["query"],
    "type": "web",
    "limit": 25
  }
}
```

### 查询页面搜索词

```json
{
  "tool": "analytics_query",
  "arguments": {
    "siteUrl": "sc-domain:example.com",
    "startDate": "2026-05-01",
    "endDate": "2026-05-31",
    "dimensions": ["query"],
    "filters": [
      {
        "dimension": "page",
        "operator": "equals",
        "expression": "https://www.example.com/page/"
      }
    ],
    "limit": 50
  }
}
```

### URL Inspection

```json
{
  "tool": "inspection_inspect",
  "arguments": {
    "siteUrl": "sc-domain:example.com",
    "inspectionUrl": "https://www.example.com/page/",
    "languageCode": "zh-CN"
  }
}
```

### GA4 页面表现

```json
{
  "tool": "analytics_page_performance",
  "arguments": {
    "propertyId": "123456789",
    "startDate": "2026-05-01",
    "endDate": "2026-05-31",
    "limit": 50
  }
}
```

### GA4 实时数据

```json
{
  "tool": "analytics_realtime",
  "arguments": {
    "propertyId": "123456789"
  }
}
```

### GSC + GA4 交叉分析

```json
{
  "tool": "page_analysis",
  "arguments": {
    "gscSiteUrl": "sc-domain:example.com",
    "ga4PropertyId": "123456789",
    "startDate": "2026-05-01",
    "endDate": "2026-05-31",
    "limit": 50
  }
}
```

## 默认关闭的写入类工具

这些工具需要用户在管理页面明确开启后才能使用：

- `sites_add`
- `sites_delete`
- `sitemaps_submit`
- `sitemaps_delete`
- `indexing_submit_url`
- `indexing_batch_submit`
- `indexing_remove_url`
- `bing_url_submit`
- `bing_url_submit_batch`
- `bing_index_now`

如果用户要求使用这些能力，先说明风险，再让用户在本地管理页面开启对应权限。

## 输出建议

Agent 输出 SEO 分析时应包含：

- 查询日期范围
- 使用的 GSC property 或 GA4 property ID
- 指标口径：clicks、impressions、CTR、position、sessions、engagement 等
- 明确区分工具返回的数据和 Agent 自己的推断
- 如果数据为空，说明可能原因：日期太近、property 不匹配、页面 URL 不一致、GA4 与 GSC 口径不同

不要展示 OAuth token、refresh token、Bing API Key、client secret、service account JSON 内容或本地配置文件内容。
