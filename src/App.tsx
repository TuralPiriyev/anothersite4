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
import { EnhancedWorkspacePage } from './pages/EnhancedWorkspacePage';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';


function App() {
  return (
    
    <AuthProvider>
      <PayPalScriptProvider /*options={{ 'client-id': process.env.PAYPAL_CLIENT_ID}}*/>
      <SubscriptionProvider>
        <PortfolioProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AuthPage />} />
              <Route path="/verify" element={<VerificationPage />} />
              <Route path="/main" element={<MainPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/enhanced-workspace" element={<EnhancedWorkspacePage />} />
              
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
