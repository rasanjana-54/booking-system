import axios from "axios";
import { auth } from "./firebase";
import { getApiErrorMessage, getApiHttpErrorMessage } from "./apiError";
function isHtmlErrorPage(value) {
  return /<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(value);
}
const authErrorListeners = /* @__PURE__ */ new Set();
function subscribeAuthErrors(listener) {
  authErrorListeners.add(listener);
  return () => {
    authErrorListeners.delete(listener);
  };
}
function notifyAuthError(status, message) {
  authErrorListeners.forEach((fn) => {
    try {
      fn({ status, message });
    } catch {
    }
  });
}
const apiClient = axios.create({
  baseURL: "/api",
  timeout: 3e4,
  headers: {
    "X-Requested-With": "XMLHttpRequest"
  }
});
apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(Boolean(config._forceTokenRefresh));
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["X-Requested-With"] = "XMLHttpRequest";
  return config;
});
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalConfig = error.config;
    const status = error.response?.status;
    if (status === 401 && originalConfig && !originalConfig._retried && auth.currentUser) {
      originalConfig._retried = true;
      originalConfig._forceTokenRefresh = true;
      try {
        return await apiClient.request(originalConfig);
      } catch (retryError) {
        error = retryError;
      }
    }
    let data = error.response?.data;
    if (data instanceof Blob) {
      const text = await data.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (typeof data === "string" && isHtmlErrorPage(data)) data = void 0;
    const serverMsg = getApiErrorMessage(data);
    const resolvedStatus = error.response?.status;
    const message = serverMsg || (error.response ? getApiHttpErrorMessage(resolvedStatus, data) : error.message || "Network error while communicating with server.");
    if (resolvedStatus === 401 || (resolvedStatus === 403 && (message.includes("Access Denied:") || message.includes("Account Deactivated:") || message.includes("verified Google email")))) {
      notifyAuthError(resolvedStatus, message);
    }
    const rejection = new Error(message);
    if (resolvedStatus) {
      rejection.status = resolvedStatus;
    }
    return Promise.reject(rejection);
  }
);
export {
  apiClient,
  subscribeAuthErrors
};
