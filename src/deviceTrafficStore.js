const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

class DeviceTrafficStore {
  constructor({ dbPath = path.join(process.cwd(), "data", "surge-dashboard.sqlite") } = {}) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_daily_traffic (
        day TEXT NOT NULL,
        device_id TEXT NOT NULL,
        name TEXT,
        address TEXT,
        physical_address TEXT,
        vendor TEXT,
        in_bytes INTEGER NOT NULL DEFAULT 0,
        out_bytes INTEGER NOT NULL DEFAULT 0,
        active_connections INTEGER NOT NULL DEFAULT 0,
        total_connections INTEGER NOT NULL DEFAULT 0,
        top_host TEXT,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (day, device_id)
      )
    `);
  }

  upsertDailyDevices({ day = localDay(), lastSeen = new Date().toISOString(), devices = [] } = {}) {
    const insert = this.db.prepare(`
      INSERT INTO device_daily_traffic (
        day,
        device_id,
        name,
        address,
        physical_address,
        vendor,
        in_bytes,
        out_bytes,
        active_connections,
        total_connections,
        top_host,
        last_seen
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, device_id) DO UPDATE SET
        name = excluded.name,
        address = excluded.address,
        physical_address = excluded.physical_address,
        vendor = excluded.vendor,
        in_bytes = MAX(device_daily_traffic.in_bytes, excluded.in_bytes),
        out_bytes = MAX(device_daily_traffic.out_bytes, excluded.out_bytes),
        active_connections = excluded.active_connections,
        total_connections = excluded.total_connections,
        top_host = excluded.top_host,
        last_seen = excluded.last_seen
    `);

    const transaction = this.db.prepare("BEGIN");
    const commit = this.db.prepare("COMMIT");
    const rollback = this.db.prepare("ROLLBACK");

    transaction.run();
    try {
      for (const device of devices) {
        const deviceId = deviceIdFor(device);
        insert.run(
          day,
          deviceId,
          stringOrNull(device.name || device.dnsName || device.dhcpHostname || device.identifier),
          stringOrNull(device.displayIPAddress || device.sourceIP || device.dhcpLastIP),
          stringOrNull(device.physicalAddress),
          stringOrNull(device.vendor),
          numberOrZero(device.inBytesStat && device.inBytesStat.today),
          numberOrZero(device.outBytesStat && device.outBytesStat.today),
          numberOrZero(device.activeConnections),
          numberOrZero(device.totalConnections),
          stringOrNull(device.topHostBySingleConnectionTraffic),
          lastSeen
        );
      }
      commit.run();
    } catch (error) {
      rollback.run();
      throw error;
    }
  }

  getMonthlySummary({ month = currentMonth() } = {}) {
    const { start, end } = monthRange(month);
    return this.db
      .prepare(
        `
        SELECT
          device_id AS deviceId,
          COALESCE(
            (SELECT name FROM device_daily_traffic latest
             WHERE latest.device_id = device_daily_traffic.device_id
             ORDER BY latest.last_seen DESC LIMIT 1),
            device_id
          ) AS name,
          (SELECT address FROM device_daily_traffic latest
           WHERE latest.device_id = device_daily_traffic.device_id
           ORDER BY latest.last_seen DESC LIMIT 1) AS address,
          (SELECT physical_address FROM device_daily_traffic latest
           WHERE latest.device_id = device_daily_traffic.device_id
           ORDER BY latest.last_seen DESC LIMIT 1) AS physicalAddress,
          SUM(in_bytes) AS inBytes,
          SUM(out_bytes) AS outBytes,
          MAX(active_connections) AS activeConnections,
          MAX(total_connections) AS totalConnections,
          MAX(top_host) AS topHost,
          COUNT(*) AS daysSeen,
          MAX(last_seen) AS lastSeen
        FROM device_daily_traffic
        WHERE day >= ? AND day < ?
        GROUP BY device_id
        ORDER BY SUM(in_bytes + out_bytes) DESC
      `
      )
      .all(start, end)
      .map((row) => ({
        ...row,
        inBytes: Number(row.inBytes || 0),
        outBytes: Number(row.outBytes || 0),
        activeConnections: Number(row.activeConnections || 0),
        totalConnections: Number(row.totalConnections || 0),
        daysSeen: Number(row.daysSeen || 0),
      }));
  }

  close() {
    this.db.close();
  }
}

function deviceIdFor(device) {
  return String(device.physicalAddress || device.identifier || device.sourceIP || device.displayIPAddress || device.name || "unknown");
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error("Month must use YYYY-MM format"), { status: 400 });
  }
  const [year, rawMonth] = month.split("-").map(Number);
  const start = `${year}-${String(rawMonth).padStart(2, "0")}-01`;
  const next = rawMonth === 12 ? { year: year + 1, month: 1 } : { year, month: rawMonth + 1 };
  const end = `${next.year}-${String(next.month).padStart(2, "0")}-01`;
  return { start, end };
}

function localDay(date = new Date()) {
  return localDateParts(date).day;
}

function currentMonth(date = new Date()) {
  return localDateParts(date).month;
}

function localDateParts(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    day: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
  };
}

function stringOrNull(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

module.exports = {
  DeviceTrafficStore,
  monthRange,
  localDay,
  currentMonth,
};
