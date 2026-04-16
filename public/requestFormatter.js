(function attachRequestFormatter(global) {
  function extractRequestRows(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    for (const key of ["requests", "active", "recent", "items", "data"]) {
      if (Array.isArray(data[key])) return data[key];
    }
    return Object.values(data).filter((item) => item && typeof item === "object");
  }

  function formatRequestRow(raw, tab) {
    const id = value(raw, ["id", "requestId", "identifier"]);
    const type = value(raw, ["protocol", "type", "method", "scheme"]);
    const target = value(raw, [
      "remoteAddress",
      "remoteHost",
      "host",
      "hostname",
      "domain",
      "URL",
      "url",
      "path",
      "remote",
    ]);
    const process = value(raw, ["process", "processName", "processPath", "sourceApp", "app", "bundleName", "pid"]);
    const source = sourceText(raw, process);
    const rule = value(raw, ["policy", "policyName", "rule", "ruleName", "matchedRule", "finalPolicy"]);
    const speed = speedText(raw);

    return {
      id,
      type,
      target: target || summarize(raw),
      detail: detailText(raw, target),
      process,
      source,
      speed,
      rule: ruleText(raw, rule),
      status: value(raw, ["status"]),
      canKill: tab === "active" && Boolean(id),
    };
  }

  function value(raw, keys) {
    for (const key of keys) {
      if (raw && raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
        return String(raw[key]);
      }
    }
    return "";
  }

  function detailText(raw, target) {
    const parts = [];
    if (raw.remoteAddress && String(raw.remoteAddress) === String(target)) {
      parts.push(`remoteAddress: ${raw.remoteAddress}`);
    }
    if (raw.URL && String(raw.URL) !== String(target)) parts.push(`URL: ${raw.URL}`);
    if (raw.url && String(raw.url) !== String(target)) parts.push(`url: ${raw.url}`);
    if (raw.remoteHost && String(raw.remoteHost) !== String(target)) parts.push(`remoteHost: ${raw.remoteHost}`);
    if (raw.host && String(raw.host) !== String(target)) parts.push(`host: ${raw.host}`);
    if (raw.remotePort !== undefined) parts.push(`remotePort: ${raw.remotePort}`);
    if (raw.sourceAddress) parts.push(`source: ${raw.sourceAddress}${raw.sourcePort !== undefined ? `:${raw.sourcePort}` : ""}`);
    if (raw.localAddress) parts.push(`localAddress: ${raw.localAddress}`);
    if (raw.localPort !== undefined) parts.push(`localPort: ${raw.localPort}`);
    return parts.join(", ");
  }

  function sourceText(raw, process) {
    const parts = [];
    if (raw.deviceName) parts.push(raw.deviceName);
    if (process && process !== "0") parts.push(process);
    if (!parts.length && raw.sourceAddress) parts.push(raw.sourceAddress);
    return parts.join(" / ");
  }

  function ruleText(raw, fallback) {
    const parts = [];
    if (raw.policyName) parts.push(raw.policyName);
    if (raw.rule) parts.push(raw.rule);
    if (!parts.length && fallback) parts.push(fallback);
    return [...new Set(parts.map(String))].join(" / ");
  }

  function speedText(raw) {
    const keys = [
      "inMaxSpeed",
      "outMaxSpeed",
      "inCurrentSpeed",
      "outCurrentSpeed",
      "downloadSpeed",
      "uploadSpeed",
      "download",
      "upload",
    ];
    return keys
      .filter((key) => raw && raw[key] !== undefined && raw[key] !== null && raw[key] !== "")
      .map((key) => `${key}: ${formatBytes(Number(raw[key]))}`)
      .join(", ");
  }

  function formatBytes(value) {
    if (!Number.isFinite(value)) return "";
    if (Math.abs(value) >= 1024 * 1024 * 1024) return `${trim(value / 1024 / 1024 / 1024)} GB`;
    if (Math.abs(value) >= 1024 * 1024) return `${trim(value / 1024 / 1024)} MB`;
    if (Math.abs(value) >= 1024) return `${trim(value / 1024)} KB`;
    return String(value);
  }

  function trim(value) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }

  function summarize(raw) {
    if (typeof raw === "string") return raw;
    if (!raw || typeof raw !== "object") return String(raw || "");
    return Object.entries(raw)
      .filter(([, item]) => item !== undefined && item !== null && item !== "")
      .slice(0, 3)
      .map(([key, item]) => `${key}: ${typeof item === "object" ? "[object]" : item}`)
      .join(", ");
  }

  const formatter = {
    extractRequestRows,
    formatRequestRow,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = formatter;
  }

  global.SurgeRequestFormatter = formatter;
})(typeof window !== "undefined" ? window : globalThis);
