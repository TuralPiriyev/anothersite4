// src/utils/api.ts
import axios from 'axios';

// API base URL konfiqurasiyası
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:5000';
axios.defaults.baseURL = baseURL;
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
// src/utils/api.ts — response interceptor
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Əgər artıq login səhifəsində deyilsə redirect et
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);


export default axios;
