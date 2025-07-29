// src/App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from './utils/api';

import { AuthProvider } from './context/AuthContext';
import { PortfolioProvider } from './context/PortfolioContext';
import { SubscriptionProvider } from './context/SubscriptionContext';

import UpgradeModal from './components/subscription/UpgradeModal';
import { AuthPage } from './pages/AuthPage';
import { VerificationPage } from './components/auth/VerificationPage';
import { MainPage } from './pages/MainPage';
import { WorkspacePage } from './pages/WorkspacePage';

import { PayPalScriptProvider } from '@paypal/react-paypal-js';

const routerOptions = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
};

function App() {
  // Sessiyanı yoxlayırıq; auth uğursuz olarsa, /login-ə yönləndir
  useEffect(() => {
    (async () => {
      try {
        await api.get('/api/users/me');
      } catch {
        window.location.href = '/login';
      }
    })();
  }, []);

  return (
    <AuthProvider>
      <PayPalScriptProvider /* options={{ 'client-id': process.env.PAYPAL_CLIENT_ID }} */>
        <SubscriptionProvider>
          <PortfolioProvider>
            <BrowserRouter {...routerOptions}>
              <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<AuthPage />} />
                <Route path="/verify" element={<VerificationPage />} />
                <Route path="/main" element={<MainPage />} />
                <Route path="/workspace" element={<WorkspacePage />} />
              </Routes>
              <UpgradeModal />
            </BrowserRouter>
          </PortfolioProvider>
        </SubscriptionProvider>
      </PayPalScriptProvider>
    </AuthProvider>
  );
}

export default App;
