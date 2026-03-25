export function getCurrentUser() {
  try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      if (parsedUser?.role) return parsedUser;
    }

    // Backward compatibility: older builds stored auth as { token, user }.
    const rawAuth = localStorage.getItem("auth");
    if (rawAuth) {
      const parsedAuth = JSON.parse(rawAuth);
      if (parsedAuth?.user?.role) return parsedAuth.user;
    }

    return null;
  } catch (_err) {
    return null;
  }
}

export function getToken() {
  const directToken = localStorage.getItem("token");
  if (directToken) return directToken;

  try {
    const rawAuth = localStorage.getItem("auth");
    if (!rawAuth) return null;
    const parsedAuth = JSON.parse(rawAuth);
    return parsedAuth?.token || null;
  } catch (_err) {
    return null;
  }
}

function isTokenValid(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;

    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!decoded?.exp) return true;

    const nowSeconds = Math.floor(Date.now() / 1000);
    return decoded.exp > nowSeconds;
  } catch (_err) {
    return false;
  }
}

export function isAuthenticated() {
  const token = getToken();
  const user = getCurrentUser();
  return Boolean(token && isTokenValid(token) && user?.role);
}

export function hasRole(role) {
  const user = getCurrentUser();
  return user?.role === role;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("auth");
}
