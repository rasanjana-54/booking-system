import axios, { AxiosError } from 'axios';
import { auth } from './firebase';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string }>) => {
    const data = error.response?.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) {
          return Promise.reject(new Error(parsed.error));
        }
      } catch {
        // ignore non-JSON blob
      }
    }
    const serverMsg = data && !(data instanceof Blob) ? data.error : undefined;
    if (serverMsg) {
      return Promise.reject(new Error(serverMsg));
    }
    return Promise.reject(
      new Error(error.message || 'Network error while communicating with server.')
    );
  }
);
