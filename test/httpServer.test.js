const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("../src/httpServer");

test("proxies GET requests under /api/surge to the Surge v1 path", async () => {
  const calls = [];
  const server = createServer({
    publicDir: null,
    surgeRequestImpl: async (request) => {
      calls.push(request);
      return { events: [] };
    },
  });

  const { baseUrl, close } = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/surge/v1/events?limit=20`, {
      headers: {
        "X-Surge-Base": "127.0.0.1:6171",
        "X-Surge-Key": "examplekey",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { events: [] });
    assert.equal(calls[0].baseUrl, "127.0.0.1:6171");
    assert.equal(calls[0].apiKey, "examplekey");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].path, "/v1/events");
    assert.deepEqual(calls[0].query, { limit: "20" });
  } finally {
    await close();
  }
});

test("proxies POST JSON requests under /api/surge", async () => {
  const calls = [];
  const server = createServer({
    publicDir: null,
    surgeRequestImpl: async (request) => {
      calls.push(request);
      return { enabled: false };
    },
  });

  const { baseUrl, close } = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/surge/v1/features/mitm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Surge-Base": "http://127.0.0.1:6171",
        "X-Surge-Key": "examplekey",
      },
      body: JSON.stringify({ enabled: false }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { enabled: false });
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { enabled: false });
  } finally {
    await close();
  }
});

test("returns readable JSON errors from failed Surge calls", async () => {
  const error = new Error("unauthorized");
  error.status = 401;

  const server = createServer({
    publicDir: null,
    surgeRequestImpl: async () => {
      throw error;
    },
  });

  const { baseUrl, close } = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/surge/v1/events`, {
      headers: {
        "X-Surge-Base": "127.0.0.1:6171",
        "X-Surge-Key": "badkey",
      },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "unauthorized",
      status: 401,
    });
  } finally {
    await close();
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
