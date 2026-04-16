(function attachDeviceFormatter(global) {
  const WINDOW_KEYS = [
    ["today", "Today"],
    ["m5", "5 Minutes"],
    ["m15", "15 Minutes"],
    ["m60", "60 Minutes"],
    ["h6", "6 Hours"],
    ["h12", "12 Hours"],
  ];

  function extractDevices(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.devices)) return data.devices;
    return [];
  }

  function formatDeviceRow(device) {
    const inStats = device.inBytesStat || {};
    const outStats = device.outBytesStat || {};
    const windows = {};

    for (const [key] of WINDOW_KEYS) {
      windows[key] = pair(inStats[key], outStats[key], "");
    }

    return {
      deviceId: String(device.physicalAddress || device.identifier || device.sourceIP || device.displayIPAddress || device.name || "unknown"),
      name: String(device.name || device.dnsName || device.dhcpHostname || device.identifier || "Unknown"),
      address: String(device.displayIPAddress || device.sourceIP || device.dhcpLastIP || "-"),
      meta: [device.physicalAddress, device.vendor].filter(Boolean).join(" / "),
      connections: `${numberOrZero(device.activeConnections)} / ${numberOrZero(device.totalConnections)}`,
      current: speedPair(device.currentInSpeed, device.currentOutSpeed),
      total: pair(device.inBytes, device.outBytes, "0 B"),
      windows,
      month: "-",
      monthDays: 0,
      topHost: String(device.topHostBySingleConnectionTraffic || "-"),
      raw: device,
    };
  }

  function formatMonthlyDeviceRows(rows, monthlyRows) {
    const monthlyByDevice = new Map((monthlyRows || []).map((row) => [String(row.deviceId), row]));
    return rows.map((row) => {
      const monthly = monthlyByDevice.get(row.deviceId);
      if (!monthly) {
        return { ...row, month: "-", monthDays: 0 };
      }
      return {
        ...row,
        month: pair(monthly.inBytes, monthly.outBytes, "-"),
        monthDays: Number(monthly.daysSeen || 0),
      };
    });
  }

  function pair(download, upload, fallback) {
    const hasDownload = Number.isFinite(Number(download));
    const hasUpload = Number.isFinite(Number(upload));
    if (!hasDownload && !hasUpload) return fallback;
    return `↓ ${formatBytes(Number(download || 0))}  ↑ ${formatBytes(Number(upload || 0))}`;
  }

  function speedPair(download, upload) {
    return `↓ ${formatBytes(Number(download || 0))}/s  ↑ ${formatBytes(Number(upload || 0))}/s`;
  }

  function formatBytes(value) {
    if (!Number.isFinite(value)) return "0 B";
    if (Math.abs(value) >= 1024 * 1024 * 1024) return `${trim(value / 1024 / 1024 / 1024)} GB`;
    if (Math.abs(value) >= 1024 * 1024) return `${trim(value / 1024 / 1024)} MB`;
    if (Math.abs(value) >= 1024) return `${trim(value / 1024)} KB`;
    return `${value} B`;
  }

  function numberOrZero(value) {
    return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
  }

  function trim(value) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }

  const formatter = {
    WINDOW_KEYS,
    extractDevices,
    formatDeviceRow,
    formatMonthlyDeviceRows,
    formatBytes,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = formatter;
  }

  global.SurgeDeviceFormatter = formatter;
})(typeof window !== "undefined" ? window : globalThis);
