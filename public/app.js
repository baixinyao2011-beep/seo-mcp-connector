const state = {
  authenticated: false,
  setupRequired: false,
  config: null,
  permissionDefinitions: [],
  accounts: [],
  mcpConfig: null
};

const els = {
  authShell: document.querySelector("#authShell"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  authMode: document.querySelector("#authMode"),
  authCopy: document.querySelector("#authCopy"),
  authSubmit: document.querySelector("#authSubmit"),
  usernameInput: document.querySelector("#usernameInput"),
  passwordInput: document.querySelector("#passwordInput"),
  refreshButton: document.querySelector("#refreshButton"),
  testButton: document.querySelector("#testButton"),
  saveButton: document.querySelector("#saveButton"),
  logoutButton: document.querySelector("#logoutButton"),
  accountList: document.querySelector("#accountList"),
  updatedAt: document.querySelector("#updatedAt"),
  googleStatus: document.querySelector("#googleStatus"),
  ga4Status: document.querySelector("#ga4Status"),
  bingStatus: document.querySelector("#bingStatus"),
  googleClientIdInput: document.querySelector("#googleClientIdInput"),
  googleClientSecretInput: document.querySelector("#googleClientSecretInput"),
  bingApiKeyInput: document.querySelector("#bingApiKeyInput"),
  googleApplicationCredentialsInput: document.querySelector("#googleApplicationCredentialsInput"),
  googleClientIdMask: document.querySelector("#googleClientIdMask"),
  googleClientSecretMask: document.querySelector("#googleClientSecretMask"),
  bingApiKeyMask: document.querySelector("#bingApiKeyMask"),
  googleApplicationCredentialsMask: document.querySelector("#googleApplicationCredentialsMask"),
  permissionGrid: document.querySelector("#permissionGrid"),
  allowlistInput: document.querySelector("#allowlistInput"),
  configPreview: document.querySelector("#configPreview"),
  copyConfigButton: document.querySelector("#copyConfigButton"),
  toast: document.querySelector("#toast"),
  notice: document.querySelector("#notice")
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    state.authenticated = false;
    showAuth();
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function showAuth() {
  els.appShell.classList.add("hidden");
  els.authShell.classList.remove("hidden");
  els.authMode.textContent = state.setupRequired ? "首次设置" : "本地登录";
  els.authCopy.textContent = state.setupRequired
    ? "创建一个只用于本机管理页面的管理员账号。"
    : "登录后管理权限、Key 和 MCP 配置。";
  els.authSubmit.textContent = state.setupRequired ? "创建并登录" : "登录";
}

function showApp() {
  els.authShell.classList.add("hidden");
  els.appShell.classList.remove("hidden");
}

async function loadAuthStatus() {
  const data = await request("/api/auth/status");
  state.authenticated = data.authenticated;
  state.setupRequired = data.setupRequired;
  if (!state.authenticated) {
    showAuth();
    return false;
  }
  showApp();
  return true;
}

async function submitAuth(event) {
  event.preventDefault();
  const path = state.setupRequired ? "/api/auth/setup" : "/api/auth/login";
  try {
    await request(path, {
      method: "POST",
      body: JSON.stringify({
        username: els.usernameInput.value,
        password: els.passwordInput.value
      })
    });
    els.passwordInput.value = "";
    showApp();
    await loadConfig();
    showToast("已登录");
  } catch (error) {
    showToast(error.message);
  }
}

async function logout() {
  await request("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.authenticated = false;
  showAuth();
}

async function loadConfig() {
  const data = await request("/api/config");
  state.config = data.config;
  state.accounts = data.accounts || [];
  state.permissionDefinitions = data.permissionDefinitions || [];
  state.mcpConfig = data.mcpConfig;
  render();
}

function render() {
  renderAccounts();
  renderStatus();
  renderSecrets();
  renderPermissions();
  els.allowlistInput.value = (state.config.allowedSites || []).join("\n");
  els.updatedAt.textContent = state.config.updatedAt ? `已保存 ${formatDate(state.config.updatedAt)}` : "尚未保存";
  els.configPreview.textContent = JSON.stringify(state.mcpConfig || {}, null, 2);
}

function renderAccounts() {
  els.accountList.innerHTML = "";
  if (!state.accounts.length) {
    els.accountList.innerHTML = `<div class="empty">还没有连接账号</div>`;
    return;
  }
  for (const account of state.accounts) {
    const row = document.createElement("div");
    row.className = "account-row";
    if (account.error) {
      row.innerHTML = `<strong>读取失败</strong><span></span>`;
      row.querySelector("span").textContent = account.error;
    } else {
      row.innerHTML = `<strong></strong><span></span><em></em>`;
      row.querySelector("strong").textContent = account.account;
      row.querySelector("span").textContent = account.engine;
      row.querySelector("em").textContent = account.site;
    }
    els.accountList.append(row);
  }
}

function renderStatus() {
  const engines = new Set(state.accounts.map((account) => String(account.engine || "").toLowerCase()));
  setStatus(els.googleStatus, "Google", engines.has("google"));
  setStatus(els.ga4Status, "GA4", engines.has("ga4"));
  const hasBing = engines.has("bing") || state.config.secrets.bingApiKey;
  setStatus(els.bingStatus, "Bing", hasBing);
}

function setStatus(element, label, ok) {
  const dot = element.parentElement.querySelector(".dot");
  dot.className = `dot ${ok ? "ok" : "idle"}`;
  element.textContent = ok ? `${label} 已配置` : `${label} 未配置`;
}

function renderSecrets() {
  const secrets = state.config.secrets || {};
  els.googleClientIdMask.textContent = secrets.googleClientId || "未配置";
  els.googleClientSecretMask.textContent = secrets.googleClientSecret || "未配置";
  els.bingApiKeyMask.textContent = secrets.bingApiKey || "未配置";
  els.googleApplicationCredentialsMask.textContent = secrets.googleApplicationCredentials || "未配置";
  els.googleClientIdInput.value = "";
  els.googleClientSecretInput.value = "";
  els.bingApiKeyInput.value = "";
  els.googleApplicationCredentialsInput.value = "";
}

function renderPermissions() {
  els.permissionGrid.innerHTML = "";
  const permissions = state.config.permissions || {};
  for (const item of state.permissionDefinitions) {
    const label = document.createElement("label");
    label.className = `permission-item ${item.risk}`;
    label.innerHTML = `
      <input type="checkbox" data-permission="${item.key}" />
      <span></span>
      <em></em>
    `;
    label.querySelector("input").checked = Boolean(permissions[item.key]);
    label.querySelector("span").textContent = item.label;
    label.querySelector("em").textContent = riskLabel(item.risk);
    els.permissionGrid.append(label);
  }
}

function riskLabel(risk) {
  return {
    low: "低风险",
    medium: "中风险",
    high: "高风险",
    critical: "删除"
  }[risk] || risk;
}

async function saveConfig() {
  const permissions = {};
  els.permissionGrid.querySelectorAll("[data-permission]").forEach((input) => {
    permissions[input.dataset.permission] = input.checked;
  });
  const secrets = {};
  if (els.googleClientIdInput.value.trim()) secrets.googleClientId = els.googleClientIdInput.value.trim();
  if (els.googleClientSecretInput.value.trim()) secrets.googleClientSecret = els.googleClientSecretInput.value.trim();
  if (els.bingApiKeyInput.value.trim()) secrets.bingApiKey = els.bingApiKeyInput.value.trim();
  if (els.googleApplicationCredentialsInput.value.trim()) secrets.googleApplicationCredentials = els.googleApplicationCredentialsInput.value.trim();

  try {
    await request("/api/config", {
      method: "PUT",
      body: JSON.stringify({
        enginePath: state.config.enginePath,
        permissions,
        allowedSites: els.allowlistInput.value,
        secrets
      })
    });
    await loadConfig();
    showToast("配置已保存");
  } catch (error) {
    showToast(error.message);
  }
}

async function testMcp() {
  try {
    els.notice.classList.add("busy");
    els.notice.querySelector("span:last-child").textContent = "正在测试 MCP...";
    const data = await request("/api/test", { method: "POST" });
    els.notice.classList.remove("busy");
    els.notice.querySelector("span:last-child").textContent = data.ok ? "MCP 测试完成，权限 wrapper 可正常启动。" : "MCP 测试失败。";
    showToast("测试完成");
  } catch (error) {
    els.notice.classList.remove("busy");
    els.notice.querySelector("span:last-child").textContent = error.message;
    showToast(error.message);
  }
}

async function copyConfig() {
  await navigator.clipboard.writeText(JSON.stringify(state.mcpConfig || {}, null, 2));
  showToast("已复制 MCP 配置");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

document.querySelectorAll(".reveal-button").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.target}`);
    input.type = input.type === "password" ? "text" : "password";
  });
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
  });
});

els.authForm.addEventListener("submit", submitAuth);
els.logoutButton.addEventListener("click", logout);
els.refreshButton.addEventListener("click", loadConfig);
els.saveButton.addEventListener("click", saveConfig);
els.testButton.addEventListener("click", testMcp);
els.copyConfigButton.addEventListener("click", copyConfig);

if (await loadAuthStatus()) {
  await loadConfig();
}
