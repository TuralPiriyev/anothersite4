// src/utils/api.ts
import axios from 'axios';

// ✅ .env faylından base URL al və sondakı / ni sil
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:5000';

// Cookie və token göndərmək üçün (CORS varsa mütləqdir)
axios.defaults.withCredentials = true;

// Yalnız development zamanı konfiqurasiyanı logla
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:');
  console.log(`📡 Base URL: ${axios.defaults.baseURL}`);
  console.log(`🍪 With Credentials: ${axios.defaults.withCredentials}`);
}

// Request interceptor – token əlavə et
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

// Response interceptor – auth xətasını idarə et
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
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
