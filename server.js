import { createServer } from "node:http";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, chmod, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.SEO_MCP_DATA_DIR ? path.resolve(process.env.SEO_MCP_DATA_DIR) : path.join(__dirname, "data");
const CONFIG_FILE = process.env.SEO_MCP_CONFIG_FILE ? path.resolve(process.env.SEO_MCP_CONFIG_FILE) : path.join(DATA_DIR, "config.json");
const USERS_FILE = process.env.SEO_MCP_USERS_FILE ? path.resolve(process.env.SEO_MCP_USERS_FILE) : path.join(DATA_DIR, "users.json");
const RUNTIME_FILE = process.env.SEO_MCP_RUNTIME_FILE ? path.resolve(process.env.SEO_MCP_RUNTIME_FILE) : path.join(DATA_DIR, "runtime.json");
const KEY_FILE = process.env.SEO_MCP_KEY_FILE ? path.resolve(process.env.SEO_MCP_KEY_FILE) : path.join(__dirname, ".seo-mcp-key");
const RUNNER_FILE = path.join(__dirname, "bin", "run-seo-mcp.js");
const DEFAULT_ENGINE_FILE = path.join(__dirname, "vendor", "search-console-mcp", "dist", "index.js");
const HOST = process.env.HOST || "127.0.0.1";
const PORT_MIN = 49152;
const PORT_MAX = 65535;
const sessions = new Map();

const PERMISSION_DEFINITIONS = [
  { key: "gscRead", label: "GSC 读取与 SEO 分析", defaultEnabled: true, risk: "low" },
  { key: "ga4Read", label: "GA4 读取", defaultEnabled: true, risk: "low" },
  { key: "sitemapRead", label: "读取 Sitemap", defaultEnabled: true, risk: "low" },
  { key: "urlInspection", label: "URL Inspection", defaultEnabled: true, risk: "medium" },
  { key: "pageSpeed", label: "PageSpeed 与结构化数据", defaultEnabled: true, risk: "low" },
  { key: "crossPlatform", label: "GSC + GA4 交叉分析", defaultEnabled: true, risk: "low" },
  { key: "bingRead", label: "Bing 读取", defaultEnabled: false, risk: "medium" },
  { key: "siteManagement", label: "添加站点（需 GSC 写入授权）", defaultEnabled: false, risk: "high" },
  { key: "sitemapWrite", label: "提交 Sitemap（需 GSC 写入授权）", defaultEnabled: false, risk: "high" },
  { key: "indexingWrite", label: "Google/Bing 索引提交", defaultEnabled: false, risk: "high" },
  { key: "bingWrite", label: "Bing URL 提交", defaultEnabled: false, risk: "high" },
  { key: "destructive", label: "删除与移除操作", defaultEnabled: false, risk: "critical" }
];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const runtimeConfig = await ensureRuntimeConfig();
let PORT = Number(runtimeConfig.port);
const encryptionKey = await ensureKey();

async function ensureRuntimeConfig() {
  await mkdir(DATA_DIR, { recursive: true });
  if (process.env.PORT) return { port: Number(process.env.PORT), generated: false };
  try {
    const existing = JSON.parse(await readFile(RUNTIME_FILE, "utf8"));
    if (Number.isInteger(existing.port) && existing.port >= PORT_MIN && existing.port <= PORT_MAX) {
      return { ...existing, generated: false };
    }
  } catch {
    // Create below.
  }
  const runtime = {
    port: PORT_MIN + randomBytes(2).readUInt16BE(0) % (PORT_MAX - PORT_MIN + 1),
    createdAt: new Date().toISOString()
  };
  await writeFile(RUNTIME_FILE, JSON.stringify(runtime, null, 2), { mode: 0o600 });
  return runtime;
}

async function saveRuntimePort(port) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(RUNTIME_FILE, JSON.stringify({ port, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

async function ensureKey() {
  try {
    const existing = Buffer.from((await readFile(KEY_FILE, "utf8")).trim(), "base64");
    if (existing.length === 32) return existing;
  } catch {
    // Create below.
  }
  const key = randomBytes(32);
  await writeFile(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  try {
    await chmod(KEY_FILE, 0o600);
  } catch {
    // Some filesystems ignore chmod.
  }
  return key;
}

function encryptText(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptText(value) {
  const [ivText, tagText, encryptedText] = String(value || "").split(".");
  if (!ivText || !tagText || !encryptedText) return "";
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function defaultPermissions() {
  return Object.fromEntries(PERMISSION_DEFINITIONS.map((item) => [item.key, item.defaultEnabled]));
}

async function loadConfig({ includeSecrets = false } = {}) {
  await mkdir(DATA_DIR, { recursive: true });
  let parsed = {};
  try {
    parsed = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    parsed = {};
  }
  const config = {
    enginePath: process.env.SEO_MCP_ENGINE_PATH || parsed.enginePath || DEFAULT_ENGINE_FILE,
    allowedSites: Array.isArray(parsed.allowedSites) ? parsed.allowedSites : [],
    permissions: { ...defaultPermissions(), ...(parsed.permissions || {}) },
    notes: parsed.notes || "",
    secrets: parsed.secrets || {},
    updatedAt: parsed.updatedAt || null
  };
  if (includeSecrets) {
    config.decryptedSecrets = Object.fromEntries(Object.keys(config.secrets).map((name) => [name, safeDecrypt(config.secrets[name])]));
  }
  return config;
}

async function saveConfig(input) {
  const current = await loadConfig({ includeSecrets: true });
  const nextSecrets = { ...(current.secrets || {}) };
  for (const name of ["googleClientId", "googleClientSecret", "bingApiKey", "googleApplicationCredentials"]) {
    if (Object.hasOwn(input.secrets || {}, name)) {
      const value = String(input.secrets[name] || "").trim();
      if (value) nextSecrets[name] = encryptText(value);
    }
  }
  if (input.clearSecrets) {
    for (const name of input.clearSecrets) delete nextSecrets[name];
  }

  const config = {
    enginePath: cleanText(input.enginePath || current.enginePath, 1000),
    allowedSites: normalizeAllowlist(input.allowedSites),
    permissions: normalizePermissions(input.permissions),
    notes: cleanText(input.notes || "", 1000),
    secrets: nextSecrets,
    updatedAt: new Date().toISOString()
  };
  await writeJson(CONFIG_FILE, config);
  return config;
}

async function loadUsers() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(USERS_FILE, "utf8"));
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if (error.code === "ENOENT") return { users: [] };
    throw error;
  }
}

async function saveUsers(store) {
  await writeJson(USERS_FILE, { users: store.users || [] });
}

function hashPassword(password, salt = randomBytes(16).toString("base64")) {
  const hash = scryptSync(String(password), salt, 64).toString("base64");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = Buffer.from(hashPassword(password, salt).split("$")[2], "base64");
  const expected = Buffer.from(hash, "base64");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function createSession(res, user) {
  const token = randomBytes(32).toString("base64url");
  sessions.set(sessionHash(token), {
    userId: user.id,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  });
  res.setHeader("set-cookie", `seo_mcp_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
}

function clearSession(res) {
  res.setHeader("set-cookie", "seo_mcp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return ["", ""];
    return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function sessionHash(token) {
  return createHash("sha256").update(token).digest("base64url");
}

async function currentUser(req) {
  const token = parseCookies(req).seo_mcp_session;
  if (!token) return null;
  const session = sessions.get(sessionHash(token));
  if (!session || session.expiresAt < Date.now()) return null;
  const store = await loadUsers();
  return store.users.find((user) => user.id === session.userId) || null;
}

async function requireUser(req) {
  const user = await currentUser(req);
  if (!user) throw httpError(401, "请先登录。");
  return user;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function routeApi(req, res, pathname) {
  if (pathname === "/api/auth/status" && req.method === "GET") {
    const users = await loadUsers();
    const user = await currentUser(req);
    return sendJson(res, 200, {
      authenticated: Boolean(user),
      setupRequired: users.users.length === 0,
      user: user ? sanitizeUser(user) : null
    });
  }

  if (pathname === "/api/auth/setup" && req.method === "POST") {
    const users = await loadUsers();
    if (users.users.length) throw httpError(409, "本地管理员已存在。");
    const body = await readJson(req);
    const username = cleanText(body.username, 80);
    if (!username || String(body.password || "").length < 6) throw httpError(400, "用户名必填，密码至少 6 位。");
    const user = {
      id: randomBytes(12).toString("hex"),
      username,
      passwordHash: hashPassword(body.password),
      role: "admin",
      createdAt: new Date().toISOString()
    };
    await saveUsers({ users: [user] });
    createSession(res, user);
    return sendJson(res, 200, { user: sanitizeUser(user), setupRequired: false });
  }

  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const users = await loadUsers();
    const user = users.users.find((item) => item.username === body.username);
    if (!user || !verifyPassword(body.password, user.passwordHash)) throw httpError(401, "用户名或密码不正确。");
    user.lastLoginAt = new Date().toISOString();
    await saveUsers(users);
    createSession(res, user);
    return sendJson(res, 200, { user: sanitizeUser(user) });
  }

  if (pathname === "/api/auth/logout" && req.method === "POST") {
    clearSession(res);
    return sendJson(res, 200, { ok: true });
  }

  await requireUser(req);

  if (pathname === "/api/config" && req.method === "GET") {
    const config = await loadConfig({ includeSecrets: true });
    const accounts = await getAccounts(config);
    return sendJson(res, 200, {
      config: sanitizeConfig(config),
      accounts,
      permissionDefinitions: PERMISSION_DEFINITIONS,
      mcpConfig: mcpConfig()
    });
  }

  if (pathname === "/api/config" && req.method === "PUT") {
    const body = await readJson(req);
    const config = await saveConfig(body);
    return sendJson(res, 200, { config: sanitizeConfig(await loadConfig({ includeSecrets: true })), mcpConfig: mcpConfig(), saved: config.updatedAt });
  }

  if (pathname === "/api/test" && req.method === "POST") {
    const config = await loadConfig({ includeSecrets: true });
    const result = await runMcpCall("diagnostics", {}, config);
    return sendJson(res, 200, result);
  }

  throw httpError(404, "接口不存在。");
}

async function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/docs/")) {
    const docsRoot = path.join(__dirname, "docs");
    const docsPath = path.normalize(path.join(docsRoot, pathname.slice("/docs/".length)));
    if (!docsPath.startsWith(docsRoot)) throw httpError(403, "禁止访问。");
    await stat(docsPath);
    const ext = path.extname(docsPath);
    res.writeHead(200, { "content-type": CONTENT_TYPES[ext] || "text/plain; charset=utf-8" });
    streamFile(docsPath, res);
    return;
  }

  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) throw httpError(403, "禁止访问。");
  await stat(filePath);
  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": CONTENT_TYPES[ext] || "application/octet-stream" });
  streamFile(filePath, res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { error: "Not found" });
    } else {
      sendJson(res, error.status || 500, { error: error.message || "服务错误" });
    }
  }
});

server.on("error", async (error) => {
  if (error.code === "EADDRINUSE" && !process.env.PORT) {
    PORT = PORT_MIN + randomBytes(2).readUInt16BE(0) % (PORT_MAX - PORT_MIN + 1);
    await saveRuntimePort(PORT);
    server.listen(PORT, HOST);
    return;
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`SEO MCP Connector is running at http://${HOST}:${PORT}`);
});

function sanitizeConfig(config) {
  const secrets = config.decryptedSecrets || {};
  return {
    enginePath: config.enginePath,
    allowedSites: config.allowedSites,
    permissions: config.permissions,
    notes: config.notes,
    updatedAt: config.updatedAt,
    secrets: {
      googleClientId: maskSecret(secrets.googleClientId),
      googleClientSecret: maskSecret(secrets.googleClientSecret),
      bingApiKey: maskSecret(secrets.bingApiKey),
      googleApplicationCredentials: secrets.googleApplicationCredentials || ""
    }
  };
}

function mcpConfig() {
  return {
    mcpServers: {
      "seo-search-console": {
        command: "node",
        args: [RUNNER_FILE]
      }
    }
  };
}

function normalizePermissions(input = {}) {
  const defaults = defaultPermissions();
  return Object.fromEntries(PERMISSION_DEFINITIONS.map((item) => [item.key, Boolean(input[item.key] ?? defaults[item.key])]));
}

function normalizeAllowlist(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 200)).filter(Boolean);
  return String(value || "").split(/\r?\n|,/).map((item) => cleanText(item, 200)).filter(Boolean);
}

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeDecrypt(value) {
  try {
    return decryptText(value);
  } catch {
    return "";
  }
}

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return "••••";
  return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || "admin",
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(tmp, filePath);
}

function buildEngineEnv(config) {
  const secrets = config.decryptedSecrets || {};
  return {
    ...process.env,
    ...(secrets.googleClientId ? { GOOGLE_CLIENT_ID: secrets.googleClientId } : {}),
    ...(secrets.googleClientSecret ? { GOOGLE_CLIENT_SECRET: secrets.googleClientSecret } : {}),
    ...(secrets.bingApiKey ? { BING_API_KEY: secrets.bingApiKey } : {}),
    ...(secrets.googleApplicationCredentials ? { GOOGLE_APPLICATION_CREDENTIALS: secrets.googleApplicationCredentials } : {})
  };
}

async function getAccounts(config) {
  try {
    const output = await runCommand(process.execPath, [config.enginePath, "accounts", "list"], {
      cwd: path.dirname(config.enginePath),
      env: buildEngineEnv(config),
      timeoutMs: 20000
    });
    return JSON.parse(output.stdout || "{}").accounts || [];
  } catch (error) {
    return [{ error: error.message }];
  }
}

async function runMcpCall(name, args, config) {
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "seo-dashboard", version: "0.1.0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }
  ].map((line) => JSON.stringify(line)).join("\n");

  const output = await runCommand(process.execPath, [RUNNER_FILE], {
    cwd: ROOT_DIR(),
    env: buildEngineEnv(config),
    input: `${lines}\n`,
    timeoutMs: 30000
  });

  const responses = output.stdout.split(/\r?\n/).filter((line) => line.trim().startsWith("{")).map((line) => JSON.parse(line));
  return {
    ok: true,
    status: output.stderr.split(/\r?\n/).find((line) => line.includes("Search Console MCP running")) || "MCP started",
    response: responses.find((item) => item.id === 2) || null
  };
}

function ROOT_DIR() {
  return __dirname;
}

function runCommand(command, args, { cwd, env, input, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`命令超时：${command}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `命令退出：${code}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function streamFile(filePath, res) {
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    }
    res.end(JSON.stringify({ error: "Not found" }));
  });
  stream.pipe(res);
}
