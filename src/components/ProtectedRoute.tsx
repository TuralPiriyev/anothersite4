// src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';

export const ProtectedRoute: React.FC = () => {
  const { loading } = useSubscription(); // loading state-i əlavə edin kontekstdə
  const token = localStorage.getItem('token');

  if (loading) {
    return <div>Loading...</div>;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};
