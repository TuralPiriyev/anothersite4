// src/utils/api.ts
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:5000';
axios.defaults.withCredentials = true;

// Log API configuration in development
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:');
  console.log(`📡 Base URL: ${axios.defaults.baseURL}`);
  console.log(`🍪 With Credentials: ${axios.defaults.withCredentials}`);
}

// Request interceptor for adding auth token
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

// Response interceptor for handling auth errors
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Clear auth data and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default axios;
