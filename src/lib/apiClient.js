import axios from "axios";
import { auth } from "./firebase";
import { getApiErrorMessage, getApiHttpErrorMessage } from "./apiError";
function isHtmlErrorPage(value) {
  return /<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(value);
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
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["X-Requested-With"] = "XMLHttpRequest";
  return config;
});
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
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
    if (serverMsg) {
      return Promise.reject(new Error(serverMsg));
    }
    if (error.response) {
      return Promise.reject(
        new Error(getApiHttpErrorMessage(error.response.status, data))
      );
    }
    return Promise.reject(
      new Error(error.message || "Network error while communicating with server.")
    );
  }
);
export {
  apiClient
};
