import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL, // Mühit dəyişkənindən istifadə
  withCredentials: true, // Sessiya məlumatlarını ötürmək üçün
});

export const checkAuth = async () => {
  try {
    const response = await api.get('/users/me');
    return response.data;
  } catch (error) {
    console.error('Authentication failed:', error);
    window.location.href = '/'; // Login səhifəsinə yönləndir
  }
};