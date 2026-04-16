const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeBaseUrl,
  surgeRequest,
  SurgeApiError,
} = require("../src/surgeApi");

test("normalizes base URL with default protocol and no trailing slash", () => {
  assert.equal(normalizeBaseUrl("127.0.0.1:6171/"), "http://127.0.0.1:6171");
  assert.equal(normalizeBaseUrl("https://surge.local:6171///"), "https://surge.local:6171");
});

test("forwards GET requests with X-Key and query parameters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ enabled: true });
  };

  const result = await surgeRequest({
    baseUrl: "127.0.0.1:6171",
    apiKey: "examplekey",
    method: "GET",
    path: "/v1/policies/detail",
    query: { policy_name: "Proxy A" },
    fetchImpl,
  });

  assert.deepEqual(result, { enabled: true });
  assert.equal(calls[0].url, "http://127.0.0.1:6171/v1/policies/detail?policy_name=Proxy+A");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers["X-Key"], "examplekey");
  assert.equal(calls[0].options.body, undefined);
});

test("forwards POST requests as JSON", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ ok: true });
  };

  const result = await surgeRequest({
    baseUrl: "http://127.0.0.1:6171",
    apiKey: "examplekey",
    method: "POST",
    path: "/v1/features/mitm",
    body: { enabled: false },
    fetchImpl,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.body, JSON.stringify({ enabled: false }));
});

test("rejects paths outside the Surge v1 API", async () => {
  await assert.rejects(
    () =>
      surgeRequest({
        baseUrl: "http://127.0.0.1:6171",
        apiKey: "examplekey",
        method: "GET",
        path: "http://evil.test/v1/events",
        fetchImpl: async () => jsonResponse({}),
      }),
    /Only Surge \/v1 API paths can be proxied/
  );
});

test("throws SurgeApiError with response status and message", async () => {
  await assert.rejects(
    () =>
      surgeRequest({
        baseUrl: "http://127.0.0.1:6171",
        apiKey: "badkey",
        method: "GET",
        path: "/v1/events",
        fetchImpl: async () => jsonResponse({ message: "unauthorized" }, 401),
      }),
    (error) => {
      assert.ok(error instanceof SurgeApiError);
      assert.equal(error.status, 401);
      assert.match(error.message, /unauthorized/);
      return true;
    }
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
