const rawApiBase = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").trim();
const normalizedApiBase = rawApiBase.replace(/\/$/, "");
const API_BASE = /\/api\/v1$/i.test(normalizedApiBase)
  ? normalizedApiBase
  : /\/api$/i.test(normalizedApiBase)
    ? `${normalizedApiBase}/v1`
    : normalizedApiBase;

async function request(path, options = {}) {
  const token = localStorage.getItem("golah_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fieldErrors = data.errors || data;
    const firstFieldError = Object.values(fieldErrors || {}).find((value) =>
      Array.isArray(value) ? value[0] : typeof value === "string",
    );

    throw new Error(
      (Array.isArray(firstFieldError) ? firstFieldError[0] : firstFieldError) ||
        data.detail ||
        data.non_field_errors?.[0] ||
        "Request failed",
    );

  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" })
};
