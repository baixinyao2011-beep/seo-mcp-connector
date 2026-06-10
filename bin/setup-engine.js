#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);
const DATA_DIR = process.env.SEO_MCP_DATA_DIR ? path.resolve(process.env.SEO_MCP_DATA_DIR) : path.join(ROOT_DIR, "data");
const CONFIG_FILE = process.env.SEO_MCP_CONFIG_FILE ? path.resolve(process.env.SEO_MCP_CONFIG_FILE) : path.join(DATA_DIR, "config.json");
const KEY_FILE = process.env.SEO_MCP_KEY_FILE ? path.resolve(process.env.SEO_MCP_KEY_FILE) : path.join(ROOT_DIR, ".seo-mcp-key");
const DEFAULT_ENGINE_FILE = path.join(ROOT_DIR, "vendor", "search-console-mcp", "dist", "index.js");

const rawArgs = process.argv.slice(2);
const forceSearchConsoleWrite = rawArgs.includes("--gsc-write");
const args = rawArgs.filter((arg) => arg !== "--gsc-write");
if (!args.length) {
  console.error("Usage: node bin/setup-engine.js setup --engine=google|ga4|bing");
  console.error("   or: node bin/setup-engine.js accounts list");
  process.exit(1);
}

const config = loadConfig();
const child = spawn(process.execPath, [config.enginePath, ...args], {
  cwd: path.dirname(config.enginePath),
  stdio: "inherit",
  env: {
    ...process.env,
    ...buildEngineEnv(config),
    ...(forceSearchConsoleWrite ? { SEO_MCP_GSC_WRITE_SCOPE: "1" } : {})
  }
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

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
    if (!value || !key) continue;
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
