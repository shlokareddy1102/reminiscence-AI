export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token");
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(!isFormData ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });
  } catch (_err) {
    throw new Error(`Cannot reach backend at ${API_BASE_URL}. Check server status and CORS/origin settings.`);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_err) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error || "Request failed";
    throw new Error(message);
  }

  return data;
}
