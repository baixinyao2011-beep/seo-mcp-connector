#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);
const DATA_DIR = process.env.SEO_MCP_DATA_DIR ? path.resolve(process.env.SEO_MCP_DATA_DIR) : path.join(ROOT_DIR, "data");
const CONFIG_FILE = process.env.SEO_MCP_CONFIG_FILE ? path.resolve(process.env.SEO_MCP_CONFIG_FILE) : path.join(DATA_DIR, "config.json");
const KEY_FILE = process.env.SEO_MCP_KEY_FILE ? path.resolve(process.env.SEO_MCP_KEY_FILE) : path.join(ROOT_DIR, ".seo-mcp-key");
const DEFAULT_ENGINE_FILE = path.join(ROOT_DIR, "vendor", "search-console-mcp", "dist", "index.js");

const READ_ONLY_TOOLS = new Set([
  "get_started",
  "diagnostics",
  "sites_list",
  "sites_get",
  "analytics_query",
  "analytics_performance_summary",
  "analytics_compare_periods",
  "analytics_top_queries",
  "analytics_top_pages",
  "analytics_by_country",
  "analytics_search_appearance",
  "analytics_trends",
  "analytics_anomalies",
  "analytics_drop_attribution",
  "analytics_time_series",
  "seo_recommendations",
  "seo_low_hanging_fruit",
  "seo_striking_distance",
  "seo_low_ctr_opportunities",
  "seo_cannibalization",
  "seo_lost_queries",
  "seo_brand_vs_nonbrand",
  "seo_primitive_ranking_bucket",
  "seo_primitive_traffic_delta",
  "seo_primitive_is_brand",
  "seo_primitive_is_cannibalized",
  "schema_validate"
]);

const TOOL_PERMISSIONS = {
  sites_health_check: "gscRead",
  sites_add: "siteManagement",
  sites_delete: "destructive",
  sitemaps_submit: "sitemapWrite",
  sitemaps_delete: "destructive",
  sitemaps_list: "sitemapRead",
  sitemaps_get: "sitemapRead",
  inspection_inspect: "urlInspection",
  inspection_batch: "urlInspection",
  pagespeed_analyze: "pageSpeed",
  pagespeed_core_web_vitals: "pageSpeed",
  indexing_submit_url: "indexingWrite",
  indexing_batch_submit: "indexingWrite",
  indexing_remove_url: "destructive",
  indexing_status: "indexingWrite",
  compare_engines: "bingRead",
  bing_sites_list: "bingRead",
  bing_sites_health: "bingRead",
  bing_sitemaps_list: "bingRead",
  bing_analytics_query: "bingRead",
  bing_analytics_trends: "bingRead",
  bing_analytics_detect_anomalies: "bingRead",
  bing_analytics_compare_periods: "bingRead",
  bing_analytics_drop_attribution: "bingRead",
  bing_analytics_time_series: "bingRead",
  bing_opportunity_finder: "bingRead",
  bing_seo_recommendations: "bingRead",
  bing_striking_distance: "bingRead",
  bing_low_ctr_opportunities: "bingRead",
  bing_seo_cannibalization: "bingRead",
  bing_seo_lost_queries: "bingRead",
  bing_brand_analysis: "bingRead",
  bing_url_info: "bingRead",
  bing_link_counts: "bingRead",
  bing_crawl_issues: "bingRead",
  bing_url_submission_quota: "bingRead",
  bing_sitemaps_submit: "bingWrite",
  bing_sitemaps_delete: "destructive",
  bing_url_submit: "bingWrite",
  bing_url_submit_batch: "bingWrite",
  bing_index_now: "bingWrite",
  analytics_page_performance: "ga4Read",
  analytics_traffic_sources: "ga4Read",
  analytics_organic_landing_pages: "ga4Read",
  analytics_content_performance: "ga4Read",
  analytics_conversion_funnel: "ga4Read",
  analytics_user_behavior: "ga4Read",
  analytics_audience_segments: "ga4Read",
  analytics_realtime: "ga4Read",
  analytics_ecommerce: "ga4Read",
  analytics_pagespeed_correlation: "ga4Read",
  page_analysis: "crossPlatform",
  traffic_health_check: "crossPlatform",
  opportunity_matrix: "crossPlatform",
  brand_analysis: "crossPlatform"
};

const DEFAULT_PERMISSIONS = {
  gscRead: true,
  ga4Read: true,
  sitemapRead: true,
  urlInspection: true,
  pageSpeed: true,
  crossPlatform: true,
  bingRead: false,
  siteManagement: false,
  sitemapWrite: false,
  indexingWrite: false,
  bingWrite: false,
  destructive: false
};

const config = loadConfig();
const child = spawn(process.execPath, [config.enginePath || DEFAULT_ENGINE_FILE], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    ...buildEngineEnv(config)
  }
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  if (text.trim()) process.stderr.write(text);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

const pending = new Map();
let proxyId = 1000000;

const childReader = readline.createInterface({ input: child.stdout });
childReader.on("line", (line) => {
  if (!line.trim().startsWith("{")) {
    process.stderr.write(`${line}\n`);
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stderr.write(`${line}\n`);
    return;
  }

  const mapped = message.id !== undefined ? pending.get(message.id) : null;
  if (mapped) {
    pending.delete(message.id);
    message.id = mapped.originalId;
    if (mapped.method === "tools/list" && message.result?.tools) {
      message.result.tools = message.result.tools.filter((tool) => isToolAllowed(tool.name, config));
    }
  }

  process.stdout.write(`${JSON.stringify(message)}\n`);
});

const inputReader = readline.createInterface({ input: process.stdin });
inputReader.on("line", (line) => {
  if (!line.trim()) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify(errorResponse(null, "Invalid JSON-RPC message."))}\n`);
    return;
  }

  if (message.method === "tools/call") {
    const toolName = message.params?.name;
    const allowed = validateToolCall(toolName, message.params?.arguments || {}, config);
    if (!allowed.ok) {
      process.stdout.write(`${JSON.stringify(errorResponse(message.id, allowed.message))}\n`);
      return;
    }
  }

  if (message.method === "tools/list" || message.method === "tools/call") {
    const outgoingId = proxyId++;
    pending.set(outgoingId, {
      originalId: message.id,
      method: message.method
    });
    message.id = outgoingId;
  }

  child.stdin.write(`${JSON.stringify(message)}\n`);
});

inputReader.on("close", () => {
  child.stdin.end();
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

function loadConfig() {
  let parsed = {};
  try {
    parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    parsed = {};
  }

  const key = loadKey();
  return {
    enginePath: process.env.SEO_MCP_ENGINE_PATH || parsed.enginePath || DEFAULT_ENGINE_FILE,
    permissions: { ...DEFAULT_PERMISSIONS, ...(parsed.permissions || {}) },
    allowedSites: Array.isArray(parsed.allowedSites) ? parsed.allowedSites : [],
    secrets: decryptSecrets(parsed.secrets || {}, key)
  };
}

function loadKey() {
  try {
    const key = Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function decryptSecrets(secrets, key) {
  const result = {};
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) continue;
    if (!key) continue;
    try {
      result[name] = decryptText(value, key);
    } catch {
      result[name] = "";
    }
  }
  return result;
}

function decryptText(value, key) {
  const [ivText, tagText, encryptedText] = String(value || "").split(".");
  if (!ivText || !tagText || !encryptedText) return "";
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function buildEngineEnv(config) {
  const env = {};
  if (config.secrets.googleClientId) env.GOOGLE_CLIENT_ID = config.secrets.googleClientId;
  if (config.secrets.googleClientSecret) env.GOOGLE_CLIENT_SECRET = config.secrets.googleClientSecret;
  if (config.secrets.bingApiKey) env.BING_API_KEY = config.secrets.bingApiKey;
  if (config.secrets.googleApplicationCredentials) env.GOOGLE_APPLICATION_CREDENTIALS = config.secrets.googleApplicationCredentials;
  return env;
}

function isToolAllowed(toolName, config) {
  if (READ_ONLY_TOOLS.has(toolName)) return Boolean(config.permissions.gscRead);
  const permission = TOOL_PERMISSIONS[toolName];
  if (!permission) {
    if (toolName.startsWith("bing_")) return Boolean(config.permissions.bingRead);
    if (toolName.startsWith("seo_")) return Boolean(config.permissions.gscRead);
    if (toolName.startsWith("analytics_")) return Boolean(config.permissions.gscRead || config.permissions.ga4Read);
    return false;
  }
  return Boolean(config.permissions[permission]);
}

function validateToolCall(toolName, args, config) {
  if (!isToolAllowed(toolName, config)) {
    return {
      ok: false,
      message: `Permission disabled for tool "${toolName}". Open the SEO MCP Connector dashboard and enable the required permission.`
    };
  }

  if (!siteAllowed(args, config)) {
    return {
      ok: false,
      message: "This site or GA4 property is not in the dashboard allowlist."
    };
  }

  return { ok: true };
}

function siteAllowed(args, config) {
  const allowlist = (config.allowedSites || []).map(normalizeSite).filter(Boolean);
  if (!allowlist.length) return true;

  const candidates = [
    args.siteUrl,
    args.gscSiteUrl,
    args.bingSiteUrl,
    args.url,
    args.inspectionUrl,
    args.propertyId,
    args.ga4PropertyId
  ].filter(Boolean);

  if (!candidates.length) return true;
  return candidates.every((candidate) => {
    const normalized = normalizeSite(candidate);
    if (!normalized) return true;
    return allowlist.some((allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`));
  });
}

function normalizeSite(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  if (raw.startsWith("sc-domain:")) return raw.slice("sc-domain:".length);
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

function errorResponse(id, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32001,
      message
    }
  };
}
