const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePolicyNames,
  normalizeGroups,
} = require("../public/policyFormatter");

test("flattens Surge policies response into selectable names", () => {
  assert.deepEqual(
    normalizePolicyNames({
      proxies: ["DIRECT", "Proxy A"],
      "policy-groups": ["Proxy"],
    }),
    ["DIRECT", "Proxy A", "Proxy"]
  );
});

test("normalizes policy group object options using option names", () => {
  const groups = normalizeGroups({
    Proxy: [
      { name: "DIRECT", typeDescription: "Built-in", enabled: true },
      { name: "Proxy A", typeDescription: "Trojan", enabled: true },
    ],
  });

  assert.deepEqual(groups, [
    {
      name: "Proxy",
      type: "policy group",
      selected: "",
      options: ["DIRECT", "Proxy A"],
      raw: [
        { name: "DIRECT", typeDescription: "Built-in", enabled: true },
        { name: "Proxy A", typeDescription: "Trojan", enabled: true },
      ],
    },
  ]);
});
