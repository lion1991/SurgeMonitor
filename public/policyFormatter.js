(function attachPolicyFormatter(global) {
  function normalizePolicyNames(data) {
    const names = [];
    if (Array.isArray(data)) {
      data.forEach((item) => addName(names, item));
      return unique(names);
    }

    if (!data || typeof data !== "object") return [];

    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        value.forEach((item) => addName(names, item));
      } else {
        addName(names, value);
      }
    }

    return unique(names);
  }

  function normalizeGroups(data) {
    const source = data && (data.groups || data.policy_groups || data);
    if (Array.isArray(source)) {
      return source.map((item, index) => normalizeGroup(item, item.name || item.group_name || `Group ${index + 1}`));
    }
    if (source && typeof source === "object") {
      return Object.entries(source).map(([name, value]) => normalizeGroup(value, name));
    }
    return [];
  }

  function normalizeGroup(value, fallbackName) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const options = item.options || item.policies || item.policy_names || item.available || (Array.isArray(value) ? value : []);
    return {
      name: item.name || item.group_name || fallbackName,
      type: item.type || item.group_type || item.kind || "policy group",
      selected: item.selected || item.policy || item.now || "",
      options: Array.isArray(options) ? unique(options.map(optionName).filter(Boolean)) : [],
      raw: value,
    };
  }

  function addName(names, item) {
    const name = optionName(item);
    if (name) names.push(name);
  }

  function optionName(item) {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    return item.name || item.policy || item.policyName || item.group_name || "";
  }

  function unique(values) {
    return [...new Set(values.map(String))];
  }

  const formatter = {
    normalizePolicyNames,
    normalizeGroups,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = formatter;
  }

  global.SurgePolicyFormatter = formatter;
})(typeof window !== "undefined" ? window : globalThis);
