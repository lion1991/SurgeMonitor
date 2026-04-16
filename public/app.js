const FEATURES = [
  ["mitm", "MITM", "HTTPS 解密"],
  ["capture", "Capture", "请求捕获"],
  ["rewrite", "Rewrite", "URL / Header / Body Rewrite"],
  ["scripting", "Scripting", "脚本执行"],
  ["system_proxy", "System Proxy", "Surge Mac"],
  ["enhanced_mode", "Enhanced Mode", "Surge Mac"],
];

const STORAGE_KEYS = {
  baseUrl: "surge-dashboard.baseUrl",
  apiKey: "surge-dashboard.apiKey",
  rememberKey: "surge-dashboard.rememberKey",
};

const state = {
  features: new Map(),
  policies: [],
  groups: [],
  modules: { available: [], enabled: [] },
  requestsTab: "active",
  trafficTimer: null,
  currentView: "dashboard",
};

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  bindEvents();
  renderEmptyStates();
  setView(viewFromHash(), { replaceHash: false, refresh: false });
  startTrafficPolling();
});

function bindEvents() {
  $("#connectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    saveSettings();
    await connectAndRefresh();
  });

  $("#refreshAll").addEventListener("click", refreshAll);
  $("#clearSettings").addEventListener("click", clearSettings);
  $("#deviceMonth").value = currentMonth();
  $("#deviceMonth").addEventListener("change", () => refreshDevices().catch(() => {}));
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });
  $("#setGlobalPolicy").addEventListener("click", setGlobalPolicy);
  $("#testSelectedPolicies").addEventListener("click", testSelectedPolicies);
  $("#reloadProfile").addEventListener("click", () => runAction("重载配置", "/v1/profiles/reload"));
  $("#flushDns").addEventListener("click", () => runAction("清空 DNS 缓存", "/v1/dns/flush"));
  $("#loadProfile").addEventListener("click", () => loadViewer("当前配置", "/v1/profiles/current", { sensitive: 0 }));
  $("#loadDns").addEventListener("click", () => loadViewer("DNS 缓存", "/v1/dns"));
  $("#loadRules").addEventListener("click", () => loadViewer("规则", "/v1/rules"));
  $("#loadEvents").addEventListener("click", () => loadViewer("事件", "/v1/events"));
  $("#clearViewer").addEventListener("click", () => {
    $("#viewer").textContent = "已清空。";
  });
  $("#setLogLevel").addEventListener("click", async () => {
    await safeRun("设置日志等级", async () => {
      const level = $("#logLevel").value;
      const result = await apiPost("/v1/log/level", { level });
      writeViewer("日志等级", result);
    });
  });
  $("#stopEngine").addEventListener("click", async () => {
    const confirmed = window.confirm("确定要停止 Surge Engine？如果 iOS Always On 开启，Surge 可能会自动重启。");
    if (!confirmed) return;
    await runAction("停止 Surge Engine", "/v1/stop");
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => refreshSection(button.dataset.refresh));
  });

  $("#outboundModes").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    await setOutboundMode(button.dataset.mode);
  });

  $("#policyGroups").addEventListener("click", handleGroupClick);
  $("#modulesList").addEventListener("click", handleModuleClick);
  $("#featuresList").addEventListener("click", handleFeatureClick);
  $("#requestsList").addEventListener("click", handleRequestClick);
  $("#autoPollTraffic").addEventListener("change", startTrafficPolling);

  document.querySelectorAll("[data-request-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.requestsTab = button.dataset.requestTab;
      document.querySelectorAll("[data-request-tab]").forEach((item) => item.classList.toggle("active", item === button));
      await refreshRequests();
    });
  });

  window.addEventListener("hashchange", () => setView(viewFromHash(), { replaceHash: false }));
}

function viewFromHash() {
  const view = window.location.hash.replace("#", "");
  return ["dashboard", "requests", "devices"].includes(view) ? view : "dashboard";
}

function setView(viewName, options = {}) {
  const { replaceHash = true, refresh = true } = options;
  state.currentView = viewName;

  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === viewName);
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === viewName);
  });

  if (replaceHash && window.location.hash !== `#${viewName}`) {
    window.history.replaceState(null, "", `#${viewName}`);
  }

  if (refresh && $("#apiKey").value.trim()) {
    if (viewName === "requests") refreshRequests().catch(() => {});
    if (viewName === "devices") refreshDevices().catch(() => {});
  }
}

function loadSettings() {
  $("#baseUrl").value = localStorage.getItem(STORAGE_KEYS.baseUrl) || "http://127.0.0.1:6171";
  $("#rememberKey").checked = localStorage.getItem(STORAGE_KEYS.rememberKey) === "true";
  if ($("#rememberKey").checked) {
    $("#apiKey").value = localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.baseUrl, $("#baseUrl").value.trim());
  localStorage.setItem(STORAGE_KEYS.rememberKey, String($("#rememberKey").checked));
  if ($("#rememberKey").checked) {
    localStorage.setItem(STORAGE_KEYS.apiKey, $("#apiKey").value);
  } else {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
  }
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEYS.baseUrl);
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  localStorage.removeItem(STORAGE_KEYS.rememberKey);
  $("#baseUrl").value = "http://127.0.0.1:6171";
  $("#apiKey").value = "";
  $("#rememberKey").checked = false;
  setConnection("未连接", "warn");
  toast("已清除本地连接信息");
}

async function connectAndRefresh() {
  await safeRun("连接", async () => {
    setConnection("连接中", "warn");
    await apiGet("/v1/events");
    setConnection("已连接", "ok");
    await refreshAll();
  });
}

async function refreshAll() {
  saveSettings();
  ensureConfig();
  const tasks = [
    refreshFeatures(),
    refreshOutbound(),
    refreshPolicies(),
    refreshGroups(),
    refreshModules(),
    refreshDevices(),
    refreshTraffic(),
    refreshRequests(),
  ];
  const results = await Promise.allSettled(tasks);
  const rejected = results.filter((result) => result.status === "rejected");
  if (rejected.length) {
    setConnection("部分接口失败", "warn");
    toast(`${rejected.length} 个接口刷新失败，详情见对应面板`);
  } else {
    setConnection("已连接", "ok");
    toast("已刷新全部");
  }
}

async function refreshSection(section) {
  const map = {
    features: refreshFeatures,
    outbound: refreshOutbound,
    policies: refreshPolicies,
    groups: refreshGroups,
    modules: refreshModules,
    devices: refreshDevices,
    requests: refreshRequests,
  };
  const fn = map[section];
  if (!fn) return;
  await safeRun("刷新", fn);
}

async function refreshFeatures() {
  const next = new Map();
  await Promise.all(
    FEATURES.map(async ([key, label, note]) => {
      try {
        const data = await apiGet(`/v1/features/${key}`);
        next.set(key, { key, label, note, available: true, enabled: Boolean(data.enabled), data });
      } catch (error) {
        next.set(key, { key, label, note, available: false, enabled: false, error: error.message });
      }
    })
  );
  state.features = next;
  renderFeatures();
}

function renderFeatures() {
  const host = $("#featuresList");
  host.innerHTML = "";
  for (const feature of state.features.values()) {
    const item = document.createElement("div");
    item.className = "switch-item";
    item.innerHTML = `
      <div class="switch-meta">
        <strong>${escapeHtml(feature.label)}</strong>
        <span>${escapeHtml(feature.available ? feature.note : feature.error)}</span>
      </div>
      <button type="button" class="toggle ${feature.enabled ? "is-on" : ""}" data-feature="${escapeAttr(feature.key)}" ${
        feature.available ? "" : "disabled"
      } aria-label="切换 ${escapeAttr(feature.label)}"></button>
    `;
    host.append(item);
  }
}

async function handleFeatureClick(event) {
  const button = event.target.closest("[data-feature]");
  if (!button) return;
  const key = button.dataset.feature;
  const feature = state.features.get(key);
  if (!feature || !feature.available) return;

  await safeRun(`切换 ${feature.label}`, async () => {
    const enabled = !feature.enabled;
    const data = await apiPost(`/v1/features/${key}`, { enabled });
    state.features.set(key, { ...feature, enabled, data });
    renderFeatures();
    writeViewer(`${feature.label} 已${enabled ? "开启" : "关闭"}`, data);
  });
}

async function refreshOutbound() {
  const outbound = await apiGet("/v1/outbound");
  let global = null;
  try {
    global = await apiGet("/v1/outbound/global");
  } catch {
    global = null;
  }

  $("#modeMetric").textContent = outbound.mode || "-";
  $("#globalPolicyInput").value = global && global.policy ? global.policy : "";
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === outbound.mode);
  });
  $("#outboundRaw").textContent = formatJson({ outbound, global });
}

async function setOutboundMode(mode) {
  await safeRun("切换出站模式", async () => {
    const result = await apiPost("/v1/outbound", { mode });
    writeViewer("出站模式", result);
    await refreshOutbound();
  });
}

async function setGlobalPolicy() {
  await safeRun("设置 Global 策略", async () => {
    const policy = $("#globalPolicyInput").value.trim();
    if (!policy) throw new Error("请填写策略名称");
    const result = await apiPost("/v1/outbound/global", { policy });
    writeViewer("Global 默认策略", result);
    await refreshOutbound();
  });
}

async function refreshPolicies() {
  const data = await apiGet("/v1/policies");
  state.policies = window.SurgePolicyFormatter.normalizePolicyNames(data);
  $("#policyMetric").textContent = String(state.policies.length);
  renderPolicies();
}

function renderPolicies() {
  const host = $("#policiesList");
  host.innerHTML = "";
  if (!state.policies.length) {
    host.innerHTML = `<div class="empty">没有读取到策略。</div>`;
    return;
  }

  state.policies.forEach((policy) => {
    const label = document.createElement("label");
    label.className = "policy-pill";
    label.innerHTML = `
      <input type="checkbox" value="${escapeAttr(policy)}" />
      <span>${escapeHtml(policy)}</span>
    `;
    host.append(label);
  });
}

async function testSelectedPolicies() {
  await safeRun("测试策略", async () => {
    const policyNames = [...document.querySelectorAll("#policiesList input:checked")].map((input) => input.value);
    if (!policyNames.length) throw new Error("请至少选择一个策略");
    const url = $("#testUrl").value.trim();
    if (!url) throw new Error("请填写测试 URL");
    const result = await apiPost("/v1/policies/test", { policy_names: policyNames, url });
    $("#policyTestResult").textContent = formatJson(result);
    writeViewer("策略测试", result);
  });
}

async function refreshGroups() {
  const data = await apiGet("/v1/policy_groups");
  const groups = window.SurgePolicyFormatter.normalizeGroups(data);

  await Promise.all(
    groups.map(async (group) => {
      try {
        const result = await apiGet("/v1/policy_groups/select", { group_name: group.name });
        group.selected = result.policy || result.selected || group.selected || "";
      } catch {
        group.selectable = group.options.length > 0;
      }
    })
  );

  state.groups = groups;
  renderGroups();
}

function renderGroups() {
  const host = $("#policyGroups");
  host.innerHTML = "";
  if (!state.groups.length) {
    host.innerHTML = `<div class="empty">没有读取到策略组。</div>`;
    return;
  }

  state.groups.forEach((group) => {
    const item = document.createElement("div");
    item.className = "group-item";
    const options = group.options.map((option) => `<option value="${escapeAttr(option)}" ${option === group.selected ? "selected" : ""}>${escapeHtml(option)}</option>`);
    const optionsControl = group.options.length
      ? `<select data-group-policy name="group-policy-${escapeAttr(group.name)}">${options.join("")}</select>`
      : `<input data-group-policy name="group-policy-${escapeAttr(group.name)}" placeholder="策略名称" value="${escapeAttr(group.selected || "")}" />`;

    item.innerHTML = `
      <div class="group-top">
        <div>
          <h3>${escapeHtml(group.name)}</h3>
          <div class="group-options">${escapeHtml(group.type || "policy group")}</div>
        </div>
        ${optionsControl}
        <div class="button-row">
          <button type="button" data-group-select="${escapeAttr(group.name)}">选择</button>
          <button type="button" data-group-test="${escapeAttr(group.name)}">测试</button>
        </div>
      </div>
      <div class="group-options">${escapeHtml(group.options.slice(0, 12).join(" / ") || "可手动填写策略名称")}</div>
    `;
    host.append(item);
  });
}

async function handleGroupClick(event) {
  const selectButton = event.target.closest("[data-group-select]");
  const testButton = event.target.closest("[data-group-test]");

  if (selectButton) {
    const item = selectButton.closest(".group-item");
    const policy = item.querySelector("[data-group-policy]").value.trim();
    const groupName = selectButton.dataset.groupSelect;
    await safeRun("选择策略组", async () => {
      if (!policy) throw new Error("请填写策略名称");
      const result = await apiPost("/v1/policy_groups/select", { group_name: groupName, policy });
      writeViewer(`${groupName} 已选择 ${policy}`, result);
      await refreshGroups();
    });
  }

  if (testButton) {
    const groupName = testButton.dataset.groupTest;
    await safeRun("测试策略组", async () => {
      const result = await apiPost("/v1/policy_groups/test", { group_name: groupName });
      writeViewer(`${groupName} 测试结果`, result);
    });
  }
}

async function refreshModules() {
  const data = await apiGet("/v1/modules");
  state.modules = {
    available: Array.isArray(data.available) ? data.available : [],
    enabled: Array.isArray(data.enabled) ? data.enabled : [],
    raw: data,
  };
  $("#moduleMetric").textContent = `${state.modules.enabled.length}/${state.modules.available.length}`;
  renderModules();
}

function renderModules() {
  const host = $("#modulesList");
  host.innerHTML = "";
  if (!state.modules.available.length) {
    host.innerHTML = `<div class="empty">没有读取到模块。</div>`;
    return;
  }

  state.modules.available.forEach((name) => {
    const enabled = state.modules.enabled.includes(name);
    const item = document.createElement("div");
    item.className = "switch-item";
    item.innerHTML = `
      <div class="switch-meta">
        <strong>${escapeHtml(name)}</strong>
        <span>${enabled ? "已启用" : "未启用"}</span>
      </div>
      <button type="button" class="toggle ${enabled ? "is-on" : ""}" data-module="${escapeAttr(name)}" aria-label="切换 ${escapeAttr(name)}"></button>
    `;
    host.append(item);
  });
}

async function handleModuleClick(event) {
  const button = event.target.closest("[data-module]");
  if (!button) return;
  const name = button.dataset.module;
  const enabled = !state.modules.enabled.includes(name);
  await safeRun("切换模块", async () => {
    const result = await apiPost("/v1/modules", { [name]: enabled });
    writeViewer(`${name} 已${enabled ? "启用" : "停用"}`, result);
    await refreshModules();
  });
}

async function refreshRequests() {
  const path = state.requestsTab === "active" ? "/v1/requests/active" : "/v1/requests/recent";
  const data = await apiGet(path);
  const rows = window.SurgeRequestFormatter.extractRequestRows(data);
  $("#activeMetric").textContent = state.requestsTab === "active" ? String(rows.length) : $("#activeMetric").textContent;
  renderRequests(rows);
}

function renderRequests(rows) {
  const host = $("#requestsList");
  if (!rows.length) {
    host.innerHTML = `<div class="empty">没有请求记录。</div>`;
    return;
  }

  const body = rows
    .slice(0, 80)
    .map((row) => {
      const request = window.SurgeRequestFormatter.formatRequestRow(row, state.requestsTab);
      const action = request.canKill ? `<button type="button" data-kill-request="${escapeAttr(request.id)}">终止</button>` : "";
      return `
        <tr>
          <td>${escapeHtml(request.id)}</td>
          <td>${escapeHtml(request.type)}</td>
          <td>
            <strong>${escapeHtml(request.target)}</strong>
            ${request.detail ? `<span class="cell-detail">${escapeHtml(request.detail)}</span>` : ""}
          </td>
          <td>
            <strong>${escapeHtml(request.source)}</strong>
            ${request.status ? `<span class="cell-detail">${escapeHtml(request.status)}</span>` : ""}
          </td>
          <td>${escapeHtml(request.speed)}</td>
          <td>${escapeHtml(request.rule)}</td>
          <td>${action}</td>
        </tr>
      `;
    })
    .join("");

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>类型</th>
          <th>目标</th>
          <th>来源</th>
          <th>速度</th>
          <th>策略 / 规则</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

async function handleRequestClick(event) {
  const button = event.target.closest("[data-kill-request]");
  if (!button) return;
  const id = Number(button.dataset.killRequest) || button.dataset.killRequest;
  await safeRun("终止请求", async () => {
    const result = await apiPost("/v1/requests/kill", { id });
    writeViewer(`请求 ${id} 已终止`, result);
    await refreshRequests();
  });
}

async function refreshTraffic() {
  const data = await apiGet("/v1/traffic");
  renderTraffic(data);
}

async function refreshDevices() {
  const data = await localPost("/api/local/devices/snapshot", {});
  const month = $("#deviceMonth").value || currentMonth();
  const monthly = await localGet("/api/local/devices/monthly", { month });
  const rows = window.SurgeDeviceFormatter.formatMonthlyDeviceRows(
    window.SurgeDeviceFormatter.extractDevices(data).map(window.SurgeDeviceFormatter.formatDeviceRow),
    monthly.devices || []
  );
  renderDevices(rows);
}

function renderDevices(rows) {
  const host = $("#devicesList");
  if (!rows.length) {
    host.innerHTML = `<div class="empty">没有来源设备统计。Surge Mac 的 /v1/devices 才会返回这类数据。</div>`;
    return;
  }

  const monthLabel = ($("#deviceMonth").value || currentMonth()).replace("-", ".");
  const windowHeaders = window.SurgeDeviceFormatter.WINDOW_KEYS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const body = rows
    .slice()
    .sort((a, b) => bytesFromDisplay(b.total) - bytesFromDisplay(a.total))
    .map((row) => {
      const windows = window.SurgeDeviceFormatter.WINDOW_KEYS.map(([key]) => `<td>${escapeHtml(row.windows[key])}</td>`).join("");
      return `
        <tr>
          <td>
            <strong>${escapeHtml(row.name)}</strong>
            <span class="cell-detail">${escapeHtml(row.meta || "无设备厂商信息")}</span>
          </td>
          <td>${escapeHtml(row.address)}</td>
          <td>${escapeHtml(row.connections)}</td>
          <td>${escapeHtml(row.current)}</td>
          <td>${escapeHtml(row.total)}</td>
          <td>
            <strong>${escapeHtml(row.month)}</strong>
            <span class="cell-detail">${row.monthDays ? `${escapeHtml(row.monthDays)} 天记录` : "没有历史记录"}</span>
          </td>
          ${windows}
          <td>${escapeHtml(row.topHost)}</td>
        </tr>
      `;
    })
    .join("");

  host.innerHTML = `
    <table class="device-table">
      <thead>
        <tr>
          <th>设备</th>
          <th>地址</th>
          <th>连接</th>
          <th>当前</th>
          <th>总计</th>
          <th>${escapeHtml(monthLabel)} 自然月</th>
          ${windowHeaders}
          <th>最高流量 Host</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderTraffic(data) {
  const metrics = pickTrafficMetrics(data);
  $("#trafficSummary").innerHTML = metrics
    .map(
      ([label, value]) => `
        <div class="traffic-box">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatTrafficValue(value))}</strong>
        </div>
      `
    )
    .join("");
  $("#trafficRaw").textContent = formatJson(data);
}

function startTrafficPolling() {
  if (state.trafficTimer) {
    clearInterval(state.trafficTimer);
    state.trafficTimer = null;
  }
  if (!$("#autoPollTraffic").checked) return;
  state.trafficTimer = setInterval(() => {
    if ($("#apiKey").value.trim()) {
      refreshTraffic().catch(() => {});
      refreshDevices().catch(() => {});
    }
  }, 3000);
}

async function runAction(label, path) {
  await safeRun(label, async () => {
    const result = await apiPost(path, {});
    writeViewer(label, result);
  });
}

async function loadViewer(label, path, query) {
  await safeRun(label, async () => {
    const result = await apiGet(path, query);
    writeViewer(label, result);
  });
}

async function apiGet(path, query) {
  return apiRequest(path, { method: "GET", query });
}

async function apiPost(path, body) {
  return apiRequest(path, { method: "POST", body });
}

async function apiRequest(path, { method, query, body } = {}) {
  const config = ensureConfig();
  const url = new URL(`/api/surge${path}`, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    method: method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Surge-Base": config.baseUrl,
      "X-Surge-Key": config.apiKey,
    },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });

  const text = await response.text();
  const payload = text ? parsePayload(text) : null;
  if (!response.ok) {
    throw new Error((payload && payload.error) || `HTTP ${response.status}`);
  }
  return payload;
}

async function localGet(path, query) {
  return localRequest(path, { method: "GET", query });
}

async function localPost(path, body) {
  return localRequest(path, { method: "POST", body });
}

async function localRequest(path, { method, query, body } = {}) {
  const config = ensureConfig();
  const url = new URL(path, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    method: method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Surge-Base": config.baseUrl,
      "X-Surge-Key": config.apiKey,
    },
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
  });

  const text = await response.text();
  const payload = text ? parsePayload(text) : null;
  if (!response.ok) {
    throw new Error((payload && payload.error) || `HTTP ${response.status}`);
  }
  return payload;
}

function ensureConfig() {
  const baseUrl = $("#baseUrl").value.trim();
  const apiKey = $("#apiKey").value.trim();
  if (!baseUrl) throw new Error("请填写 API 地址");
  if (!apiKey) throw new Error("请填写 API Key");
  return { baseUrl, apiKey };
}

async function safeRun(label, fn) {
  try {
    const result = await fn();
    if (label) toast(`${label}完成`);
    return result;
  } catch (error) {
    setConnection("请求失败", "bad");
    toast(`${label || "操作"}失败：${error.message}`);
    return null;
  }
}

function setConnection(text, tone) {
  const status = $("#connectionStatus");
  const dotClass = tone === "ok" ? "dot-ok" : tone === "bad" ? "dot-bad" : "dot-warn";
  status.innerHTML = `<span class="dot ${dotClass}"></span>${escapeHtml(text)}`;
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 2600);
}

function writeViewer(label, value) {
  $("#viewer").textContent = `${label}\n\n${typeof value === "string" ? value : formatJson(value)}`;
}

function renderEmptyStates() {
  $("#featuresList").innerHTML = `<div class="empty">连接后显示功能开关。</div>`;
  $("#policyGroups").innerHTML = `<div class="empty">连接后显示策略组。</div>`;
  $("#modulesList").innerHTML = `<div class="empty">连接后显示模块。</div>`;
  $("#policiesList").innerHTML = `<div class="empty">连接后显示策略。</div>`;
  $("#requestsList").innerHTML = `<div class="empty">连接后显示请求。</div>`;
  $("#devicesList").innerHTML = `<div class="empty">连接后显示按来源设备/地址汇总的流量统计。</div>`;
  $("#trafficSummary").innerHTML = `
    <div class="traffic-box"><span>上传</span><strong>-</strong></div>
    <div class="traffic-box"><span>下载</span><strong>-</strong></div>
  `;
  $("#trafficRaw").textContent = "";
}

function bytesFromDisplay(text) {
  const value = Number.parseFloat(text.replace(/^.*?↓\s*/, ""));
  if (!Number.isFinite(value)) return 0;
  if (text.includes("GB")) return value * 1024 * 1024 * 1024;
  if (text.includes("MB")) return value * 1024 * 1024;
  if (text.includes("KB")) return value * 1024;
  return value;
}

function currentMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function pickTrafficMetrics(data) {
  const flat = [];
  collectNumbers(data, "", flat);
  const preferred = flat.filter(([key]) => /(upload|download|in|out|sent|received|tx|rx)/i.test(key));
  const selected = (preferred.length ? preferred : flat).slice(0, 4);
  if (!selected.length) return [["状态", "无数值"]];
  return selected.map(([key, value]) => [key.replace(/[._]/g, " "), value]);
}

function collectNumbers(value, prefix, output) {
  if (typeof value === "number" && Number.isFinite(value)) {
    output.push([prefix || "value", value]);
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    collectNumbers(child, prefix ? `${prefix}.${key}` : key, output);
  });
}

function formatTrafficValue(value) {
  if (typeof value !== "number") return String(value);
  if (Math.abs(value) >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (Math.abs(value) >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (Math.abs(value) >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
}

function summarize(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value || "");
  return Object.entries(value)
    .slice(0, 3)
    .map(([key, val]) => `${key}: ${typeof val === "object" ? "[object]" : val}`)
    .join(", ");
}

function parsePayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
