# Agent Usage Guide

This guide is for Codex, Claude, Cursor, or any MCP agent connected to SEO MCP Connector.

## Server Name

Recommended MCP server name:

```text
seo-search-console
```

## Core Rules

- Start with `get_started` when you need to understand available platforms and tools.
- Use `sites_list` before choosing a Google Search Console property.
- Use the wrapper server. Do not bypass it by launching `search-console-mcp` directly.
- Use `sc-domain:example.com` for Google Search Console domain properties.
- Use a GA4 property ID string such as `123456789` for GA4 tools.
- Write, delete, sitemap submission, indexing submission, and Bing URL submission tools are disabled by default.
- If a tool is missing or rejected, ask the user to enable the matching permission in the local dashboard.
- For `sites_add` and `sitemaps_submit`, dashboard permission is not enough; the user must also reauthorize Google Search Console with `npm run setup:gsc:write`.

## Common Calls

### List Sites

```json
{
  "tool": "sites_list",
  "arguments": {
    "engine": "google"
  }
}
```

### Query GSC Search Performance

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

### Query Page Queries

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
    "languageCode": "en-US"
  }
}
```

### GA4 Page Performance

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

### GA4 Realtime

```json
{
  "tool": "analytics_realtime",
  "arguments": {
    "propertyId": "123456789"
  }
}
```

### GSC + GA4 Page Analysis

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

## Disabled by Default

These tools require explicit dashboard approval before use:

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

When a user asks for one of these actions, explain the risk and ask them to enable the relevant local permission.

For `sites_add`, `sites_delete`, `sitemaps_submit`, and `sitemaps_delete`, also verify that the Google account was authorized with the full Search Console `webmasters` scope. If the call fails with an insufficient-permission error, ask the user to run:

```bash
npm run setup:gsc:write
```

## Output Guidance

SEO analysis should include:

- Date range
- GSC property or GA4 property ID
- Metric definitions such as clicks, impressions, CTR, position, sessions, and engagement
- Clear distinction between tool data and inference
- A short explanation when data is empty or delayed

Never reveal OAuth tokens, refresh tokens, API keys, client secrets, service account JSON contents, or local config files.
