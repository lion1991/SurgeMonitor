const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatRequestRow,
  extractRequestRows,
} = require("../public/requestFormatter");

test("formats Surge request rows around remote address, speeds, and rule", () => {
  const row = formatRequestRow(
    {
      id: 19615,
      protocol: "UDP",
      remoteAddress: "42.103.52.33",
      inMaxSpeed: 285,
      outMaxSpeed: 1024,
      rule: "GEOIP CN",
      process: "QQ",
    },
    "active"
  );

  assert.deepEqual(row, {
    id: "19615",
    type: "UDP",
    target: "42.103.52.33",
    detail: "remoteAddress: 42.103.52.33",
    process: "QQ",
    source: "QQ",
    speed: "inMaxSpeed: 285, outMaxSpeed: 1 KB",
    rule: "GEOIP CN",
    status: "",
    canKill: true,
  });
});

test("formats actual Surge Mac request fields with URL and source details", () => {
  const row = formatRequestRow(
    {
      id: 120378,
      method: "HTTPS",
      URL: "api.telegram.org:443",
      remoteHost: "api.telegram.org:443",
      remoteAddress: "104.194.82.59 (Proxy)",
      policyName: "[trojan]美国2-CN2GIA",
      rule: "DOMAIN-SUFFIX telegram.org",
      status: "Active",
      sourceAddress: "127.0.0.1",
      sourcePort: 53244,
      deviceName: "Matt的Mac mini",
      processPath: "/usr/bin/curl",
      inCurrentSpeed: 0,
      outBytes: 326,
    },
    "active"
  );

  assert.equal(row.type, "HTTPS");
  assert.equal(row.target, "104.194.82.59 (Proxy)");
  assert.match(row.detail, /URL: api.telegram.org:443/);
  assert.match(row.detail, /source: 127.0.0.1:53244/);
  assert.equal(row.source, "Matt的Mac mini / /usr/bin/curl");
  assert.equal(row.status, "Active");
  assert.equal(row.rule, "[trojan]美国2-CN2GIA / DOMAIN-SUFFIX telegram.org");
});

test("does not mark recent request rows as killable", () => {
  const row = formatRequestRow(
    {
      id: 119056,
      type: "HTTPS",
      remoteAddress: "220.181.52.19",
      inMaxSpeed: 4415,
      policyName: "DIRECT",
    },
    "recent"
  );

  assert.equal(row.canKill, false);
  assert.equal(row.rule, "DIRECT");
  assert.equal(row.target, "220.181.52.19");
});

test("extracts request rows from common response wrappers", () => {
  assert.deepEqual(extractRequestRows({ requests: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(extractRequestRows({ active: [{ id: 2 }] }), [{ id: 2 }]);
  assert.deepEqual(extractRequestRows([{ id: 3 }]), [{ id: 3 }]);
});
