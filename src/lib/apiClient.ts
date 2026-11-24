import axios, { AxiosError } from 'axios';
import { auth } from './firebase';
import { getApiErrorMessage } from './apiError';

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
  async (error: AxiosError<unknown>) => {
    let data = error.response?.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        data = JSON.parse(text) as unknown;
      } catch {
        // ignore non-JSON blob
      }
    }
    const serverMsg = getApiErrorMessage(data);
    if (serverMsg) {
      return Promise.reject(new Error(serverMsg));
    }
    return Promise.reject(
      new Error(error.message || 'Network error while communicating with server.')
    );
  }
);
