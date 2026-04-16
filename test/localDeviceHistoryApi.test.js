const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createServer } = require("../src/httpServer");
const { DeviceTrafficStore } = require("../src/deviceTrafficStore");

test("captures device snapshots through local API and returns monthly summaries", async () => {
  const store = makeStore();
  const calls = [];
  const server = createServer({
    publicDir: null,
    deviceTrafficStore: store,
    now: () => new Date("2026-04-16T10:00:00.000Z"),
    surgeRequestImpl: async (request) => {
      calls.push(request);
      return {
        devices: [
          {
            name: "Mac",
            displayIPAddress: "192.168.248.22",
            physicalAddress: "AA:BB:CC",
            inBytesStat: { today: 2000 },
            outBytesStat: { today: 500 },
          },
        ],
      };
    },
  });

  const { baseUrl, close } = await listen(server);
  try {
    const capture = await fetch(`${baseUrl}/api/local/devices/snapshot`, {
      method: "POST",
      headers: {
        "X-Surge-Base": "127.0.0.1:6171",
        "X-Surge-Key": "examplekey",
      },
    });
    assert.equal(capture.status, 200);
    assert.deepEqual(await capture.json(), {
      devices: [
        {
          name: "Mac",
          displayIPAddress: "192.168.248.22",
          physicalAddress: "AA:BB:CC",
          inBytesStat: { today: 2000 },
          outBytesStat: { today: 500 },
        },
      ],
      captured: true,
      day: "2026-04-16",
      month: "2026-04",
    });
    assert.equal(calls[0].path, "/v1/devices");

    const monthly = await fetch(`${baseUrl}/api/local/devices/monthly?month=2026-04`);
    assert.equal(monthly.status, 200);
    assert.deepEqual(await monthly.json(), {
      month: "2026-04",
      devices: [
        {
          deviceId: "AA:BB:CC",
          name: "Mac",
          address: "192.168.248.22",
          physicalAddress: "AA:BB:CC",
          inBytes: 2000,
          outBytes: 500,
          activeConnections: 0,
          totalConnections: 0,
          topHost: null,
          daysSeen: 1,
          lastSeen: "2026-04-16T10:00:00.000Z",
        },
      ],
    });
  } finally {
    await close();
    store.close();
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "surge-local-api-"));
  return new DeviceTrafficStore({ dbPath: path.join(dir, "traffic.sqlite") });
}
