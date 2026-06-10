# SEO MCP Connector

SEO MCP Connector is a local management console and permission wrapper for [`search-console-mcp`](https://www.npmjs.com/package/search-console-mcp). It lets an MCP client use Google Search Console, Google Analytics 4, Bing Webmaster Tools, PageSpeed, and SEO analysis tools through one controlled local entry point.

The wrapper is designed for agent use: agents connect to `bin/run-seo-mcp.js`, while the dashboard controls credentials, site allowlists, and which tool categories are exposed.

## Features

- Local dashboard for OAuth client details, Bing API keys, service account paths, allowlists, and permission switches.
- Encrypted local secret storage using AES-256-GCM.
- MCP tool filtering at both `tools/list` and `tools/call`.
- Defaults to read-only SEO and analytics workflows; write, delete, and submit actions are disabled by default.
- Portable engine installer for `search-console-mcp@1.14.0`.
- Bilingual user and agent documentation.

## Privacy Model

This project is local-first. It does not ship with credentials, tokens, account emails, domains, GA4 property IDs, or API keys.

Ignored local runtime files:

- `.seo-mcp-key`
- `data/config.json`
- `data/runtime.json`
- `data/users.json`
- `vendor/`
- `.env`

Do not commit or share those files. They are generated on each machine.

## Requirements

- Node.js 20 or newer.
- A Google Cloud OAuth client. A Desktop app client is recommended for local OAuth.
- Enabled Google APIs:
  - Google Search Console API
  - Google Analytics Data API
  - Google Analytics Admin API
- Optional: Bing Webmaster Tools API key.

## Install

```bash
git clone https://github.com/<owner>/seo-mcp-connector.git
cd seo-mcp-connector
npm run prepare-engine
npm start
```

Open the local URL printed in the terminal, for example:

```text
SEO MCP Connector is running at http://127.0.0.1:54321
```

There is no default username or password. The first visit asks you to create a local admin account for this machine.

## Connect Google Search Console and GA4

1. Open the dashboard.
2. Save your Google OAuth client ID and client secret.
3. Run Google Search Console OAuth:

```bash
npm run setup:gsc
```

4. If you need Search Console write operations such as sitemap submission or site management, reauthorize with the full Search Console scope:

```bash
npm run setup:gsc:write
```

Dashboard permissions alone are not enough for write operations. The Google account must also grant `https://www.googleapis.com/auth/webmasters`.

5. Run GA4 OAuth:

```bash
npm run setup:ga4
```

6. Check connected accounts:

```bash
npm run accounts:list
```

The setup commands read encrypted dashboard secrets and pass them to the underlying engine as environment variables. OAuth tokens are stored by `search-console-mcp` on the local machine.

## Optional Bing Setup

Add a Bing API key in the dashboard, then run:

```bash
npm run setup:bing
```

Bing read and write permissions are disabled by default until enabled in the dashboard.

## MCP Client Configuration

Use the absolute path on your machine:

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

Agents should connect to the wrapper above, not directly to `npx search-console-mcp`.

## Default Permissions

Enabled by default:

- Google Search Console read and SEO analysis
- GA4 read
- Sitemap read
- URL Inspection
- PageSpeed and structured data validation
- Cross-platform GSC + GA4 analysis

Disabled by default:

- Bing read
- Site management, which also requires `npm run setup:gsc:write`
- Sitemap submission, which also requires `npm run setup:gsc:write`
- Google/Bing indexing submission
- Bing URL submission
- Delete and remove operations

If a disabled tool is guessed by an agent, `bin/run-seo-mcp.js` rejects the call.

## Documentation

- Chinese guide: [`README.zh-CN.md`](README.zh-CN.md)
- English agent guide: [`docs/AGENT_USAGE.md`](docs/AGENT_USAGE.md)
- Chinese agent guide: [`docs/AGENT_USAGE.zh-CN.md`](docs/AGENT_USAGE.zh-CN.md)

## Maintenance

```bash
npm run check
npm run prepare-engine
npm run accounts:list
```
