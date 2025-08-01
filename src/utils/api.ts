// src/utils/api.ts
import axios from 'axios';

// Əvvəlcə .env-dən gələn URL-i alır, sondakı slash-i silir
const envUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
// Fallback: cari səhifənin origin-i + /api
const originUrl =
  typeof window !== 'undefined'
    ? window.location.origin.replace(/\/$/, '')
    : '';

// Axios baza URL-i
axios.defaults.baseURL = envUrl || `${originUrl}/api`;
axios.defaults.withCredentials = true;

// Development zamanı konfiqurasiyanı logla
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:');
  console.log(`📡 Base URL: ${axios.defaults.baseURL}`);
  console.log(`🍪 With Credentials: ${axios.defaults.withCredentials}`);
}

// Request interceptor – Authorization header əlavə et
axios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response interceptor – 401 xətasını idarə et
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const url = error.config?.url || '';

    // Yalnız auth əməliyyatlarında redirect et
    if (status === 401 && (url.includes('/auth/') || url.includes('/login') || url.includes('/register'))) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default axios;
