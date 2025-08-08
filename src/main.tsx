import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { TeamProvider } from './context/TeamContext';
import { AuthProvider } from './context/AuthContext'; // YENİDƏN ƏLAVƏ EDİLDİ

// React DevTools xəbərdarlıqlarını gizlət
if (import.meta.env.DEV) {
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('React DevTools')) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider> {/* BURADA DAXİL OLUB */}
      <ThemeProvider>
        <TeamProvider>
          <App />
        </TeamProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
