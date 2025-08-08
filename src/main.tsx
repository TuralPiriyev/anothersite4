import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { TeamProvider } from './context/TeamContext';
import { AuthProvider } from './context/AuthContext'; // <-- əlavə etdik

// Suppress React DevTools warning in development
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
    <AuthProvider>           {/* ən üst səviyyədə AuthProvider */}
      <ThemeProvider>
        <TeamProvider>
          <App />
        </TeamProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
