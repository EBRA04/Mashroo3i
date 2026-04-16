/**
 * api.js — Centralized HTTP Client
 *
 * Handles two different error shapes the backend can return:
 *
 * Shape 1 — Custom errors from controller actions (our own code):
 *   { message: "Email already in use." }
 *   → Extracted via data.message
 *
 * Shape 2 — ASP.NET ValidationProblemDetails (automatic from [ApiController]):
 *   {
 *     "title": "One or more validation errors occurred.",
 *     "errors": {
 *       "Password": ["Password must be at least 8 characters..."],
 *       "Email":    ["The Email field is not a valid e-mail address."]
 *     }
 *   }
 *   → We extract the first message from data.errors so the user sees the
 *     actual rule that failed, not the useless generic title.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5057";

/**
 * Extracts a human-readable message from any error response the backend sends.
 * Priority: custom message → first validation error → generic title → fallback
 */
function extractErrorMessage(data, status) {
  // Shape 1: our own controllers return { message: "..." }
  if (data?.message) return data.message;

  // Shape 2: ASP.NET model validation returns { errors: { Field: ["msg"] } }
  // Grab the first error message from whichever field failed first
  if (data?.errors) {
    const firstField = Object.values(data.errors)[0];
    if (Array.isArray(firstField) && firstField.length > 0) {
      return firstField[0];
    }
  }

  // Fallback: generic title or HTTP status
  return data?.title ?? `Request failed (${status})`;
}

async function request(
  endpoint,
  { auth = false, body, method = "GET", ...rest } = {},
) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = localStorage.getItem("accessToken");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...rest,
  };

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch {
    // fetch() only throws on a real network failure — server down, wrong port, no internet
    const err = new Error(
      `Cannot reach the server at ${BASE_URL}. ` +
        `Make sure the backend is running: dotnet run --launch-profile http`,
    );
    err.status = 0;
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(extractErrorMessage(data, response.status));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

const api = {
  get: (endpoint, opts = {}) => request(endpoint, { ...opts, method: "GET" }),
  post: (endpoint, opts = {}) => request(endpoint, { ...opts, method: "POST" }),
  put: (endpoint, opts = {}) => request(endpoint, { ...opts, method: "PUT" }),
  patch: (endpoint, opts = {}) =>
    request(endpoint, { ...opts, method: "PATCH" }),
  delete: (endpoint, opts = {}) =>
    request(endpoint, { ...opts, method: "DELETE" }),
};

export default api;
