class SurgeApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "SurgeApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizeBaseUrl(rawBaseUrl) {
  const value = String(rawBaseUrl || "http://127.0.0.1:6171").trim();
  const withProtocol = /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

async function surgeRequest({
  baseUrl,
  apiKey,
  method = "GET",
  path,
  query,
  body,
  fetchImpl = fetch,
  timeoutMs = 12000,
}) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new SurgeApiError("Surge API key is required", 400);
  }

  const cleanPath = validatePath(path);
  const url = new URL(cleanPath, `${normalizeBaseUrl(baseUrl)}/`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const upperMethod = String(method).toUpperCase();
  const headers = {
    Accept: "application/json, text/plain, */*",
    "X-Key": String(apiKey).trim(),
  };

  const options = {
    method: upperMethod,
    headers,
    signal: controller.signal,
  };

  if (upperMethod === "POST") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body || {});
  }

  try {
    const response = await fetchImpl(url, options);
    const payload = await readResponse(response);

    if (!response.ok) {
      const message =
        (payload && (payload.message || payload.error)) ||
        `Surge API request failed with HTTP ${response.status}`;
      throw new SurgeApiError(message, response.status, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof SurgeApiError) {
      throw error;
    }
    if (error && error.name === "AbortError") {
      throw new SurgeApiError("Surge API request timed out", 0);
    }
    throw new SurgeApiError(error.message || "Unable to reach Surge API", 0);
  } finally {
    clearTimeout(timeout);
  }
}

function validatePath(path) {
  const value = String(path || "");
  if (!value.startsWith("/v1/") || value.includes("://")) {
    throw new SurgeApiError("Only Surge /v1 API paths can be proxied", 400);
  }
  return value;
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = {
  normalizeBaseUrl,
  surgeRequest,
  SurgeApiError,
};
