const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DeviceTrafficStore,
  monthRange,
} = require("../src/deviceTrafficStore");

test("stores one daily row per device and keeps the largest daily counters", () => {
  const store = makeStore();
  try {
    store.upsertDailyDevices({
      day: "2026-04-16",
      lastSeen: "2026-04-16T10:00:00.000Z",
      devices: [
        {
          name: "Mac",
          displayIPAddress: "192.168.248.22",
          physicalAddress: "AA:BB:CC",
          vendor: "Private Address Enabled",
          activeConnections: 10,
          totalConnections: 100,
          inBytesStat: { today: 2000 },
          outBytesStat: { today: 500 },
          topHostBySingleConnectionTraffic: "example.com",
        },
      ],
    });

    store.upsertDailyDevices({
      day: "2026-04-16",
      lastSeen: "2026-04-16T11:00:00.000Z",
      devices: [
        {
          name: "MacBook",
          displayIPAddress: "192.168.248.23",
          physicalAddress: "AA:BB:CC",
          activeConnections: 12,
          totalConnections: 120,
          inBytesStat: { today: 1500 },
          outBytesStat: { today: 800 },
          topHostBySingleConnectionTraffic: "later.example",
        },
      ],
    });

    const rows = store.getMonthlySummary({ month: "2026-04" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deviceId, "AA:BB:CC");
    assert.equal(rows[0].name, "MacBook");
    assert.equal(rows[0].address, "192.168.248.23");
    assert.equal(rows[0].inBytes, 2000);
    assert.equal(rows[0].outBytes, 800);
    assert.equal(rows[0].activeConnections, 12);
    assert.equal(rows[0].totalConnections, 120);
    assert.equal(rows[0].daysSeen, 1);
  } finally {
    store.close();
  }
});

test("sums daily device rows for a natural month", () => {
  const store = makeStore();
  try {
    store.upsertDailyDevices({
      day: "2026-04-01",
      devices: [
        {
          name: "Mac",
          sourceIP: "192.168.1.2",
          physicalAddress: "AA:BB:CC",
          inBytesStat: { today: 1000 },
          outBytesStat: { today: 200 },
        },
      ],
    });
    store.upsertDailyDevices({
      day: "2026-04-02",
      devices: [
        {
          name: "Mac",
          sourceIP: "192.168.1.2",
          physicalAddress: "AA:BB:CC",
          inBytesStat: { today: 3000 },
          outBytesStat: { today: 400 },
        },
      ],
    });
    store.upsertDailyDevices({
      day: "2026-05-01",
      devices: [
        {
          name: "Mac",
          sourceIP: "192.168.1.2",
          physicalAddress: "AA:BB:CC",
          inBytesStat: { today: 9000 },
          outBytesStat: { today: 900 },
        },
      ],
    });

    const rows = store.getMonthlySummary({ month: "2026-04" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].inBytes, 4000);
    assert.equal(rows[0].outBytes, 600);
    assert.equal(rows[0].daysSeen, 2);
  } finally {
    store.close();
  }
});

test("monthRange returns natural month bounds", () => {
  assert.deepEqual(monthRange("2026-04"), {
    start: "2026-04-01",
    end: "2026-05-01",
  });
  assert.deepEqual(monthRange("2026-12"), {
    start: "2026-12-01",
    end: "2027-01-01",
  });
});

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "surge-store-"));
  return new DeviceTrafficStore({ dbPath: path.join(dir, "traffic.sqlite") });
}
