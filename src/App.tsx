import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PortfolioProvider } from './context/PortfolioContext';
// Fix the import path to your SubscriptionContext
import { SubscriptionProvider } from './context/SubscriptionContext';
import UpgradeModal from './components/subscription/UpgradeModal';
import { AuthPage } from './pages/AuthPage';
import { VerificationPage } from './components/auth/VerificationPage';
import { MainPage } from './pages/MainPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import React, { useEffect } from 'react';
import api from './utils/api';
import { Navigate } from 'react-router-dom';

const routerOptions = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
};

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
      <PayPalScriptProvider /*options={{ 'client-id': process.env.PAYPAL_CLIENT_ID}}*/>
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
            <UpgradeModal/>
          </BrowserRouter>
        </PortfolioProvider>
      </SubscriptionProvider>
      </PayPalScriptProvider>
    </AuthProvider>
  );
}

export default App;
