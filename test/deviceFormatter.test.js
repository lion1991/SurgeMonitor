const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractDevices,
  formatDeviceRow,
  formatMonthlyDeviceRows,
} = require("../public/deviceFormatter");

test("extracts devices from Surge devices response", () => {
  assert.deepEqual(extractDevices({ devices: [{ name: "Mac" }] }), [{ name: "Mac" }]);
  assert.deepEqual(extractDevices([{ name: "PC" }]), [{ name: "PC" }]);
  assert.deepEqual(extractDevices({}), []);
});

test("formats source device traffic windows", () => {
  const row = formatDeviceRow({
    name: "Mac",
    displayIPAddress: "192.168.248.22",
    physicalAddress: "EE:42:81:EE:C6:46",
    vendor: "Private Address Enabled",
    activeConnections: 72,
    totalConnections: 25299,
    currentInSpeed: 25854,
    currentOutSpeed: 104,
    inBytes: 2506490145,
    outBytes: 443834970,
    totalBytes: 2950325115,
    topHostBySingleConnectionTraffic: "124.222.87.165",
    inBytesStat: {
      m5: 10953317,
      m15: 136200275,
      m60: 251215719,
      h6: 1209500674,
      h12: 2506490145,
      today: 2506490145,
    },
    outBytesStat: {
      m5: 7307669,
      m15: 44471001,
      m60: 90138929,
      h6: 226064450,
      h12: 443834970,
      today: 443834970,
    },
  });

  assert.equal(row.name, "Mac");
  assert.equal(row.address, "192.168.248.22");
  assert.equal(row.meta, "EE:42:81:EE:C6:46 / Private Address Enabled");
  assert.equal(row.connections, "72 / 25299");
  assert.equal(row.current, "↓ 25.25 KB/s  ↑ 104 B/s");
  assert.equal(row.total, "↓ 2.33 GB  ↑ 423.27 MB");
  assert.equal(row.windows.m5, "↓ 10.45 MB  ↑ 6.97 MB");
  assert.equal(row.windows.m15, "↓ 129.89 MB  ↑ 42.41 MB");
  assert.equal(row.windows.m60, "↓ 239.58 MB  ↑ 85.96 MB");
  assert.equal(row.windows.h6, "↓ 1.13 GB  ↑ 215.59 MB");
  assert.equal(row.windows.h12, "↓ 2.33 GB  ↑ 423.27 MB");
  assert.equal(row.windows.today, "↓ 2.33 GB  ↑ 423.27 MB");
  assert.equal(row.topHost, "124.222.87.165");
});

test("merges monthly summaries into device rows", () => {
  const rows = [
    formatDeviceRow({
      name: "Mac",
      displayIPAddress: "192.168.248.22",
      physicalAddress: "AA:BB:CC",
      inBytes: 100,
      outBytes: 20,
    }),
    formatDeviceRow({
      name: "PC",
      displayIPAddress: "192.168.248.23",
      physicalAddress: "DD:EE:FF",
      inBytes: 10,
      outBytes: 5,
    }),
  ];

  const merged = formatMonthlyDeviceRows(rows, [
    {
      deviceId: "AA:BB:CC",
      inBytes: 3000,
      outBytes: 1000,
      daysSeen: 2,
    },
  ]);

  assert.equal(merged[0].month, "↓ 2.93 KB  ↑ 1000 B");
  assert.equal(merged[0].monthDays, 2);
  assert.equal(merged[1].month, "-");
  assert.equal(merged[1].monthDays, 0);
});
