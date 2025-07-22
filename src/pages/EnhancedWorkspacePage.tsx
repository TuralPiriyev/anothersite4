import React from 'react';
import { ThemeProvider } from '../context/ThemeContext';
import { DatabaseProvider } from '../context/DatabaseContext';
import EnhancedMainLayout from '../components/allWorkSpace/layout/EnhancedMainLayout';

export const EnhancedWorkspacePage: React.FC = () => {
  return (
    <div className="min-h-screen font-sans">
      <ThemeProvider>
        <DatabaseProvider>
          <EnhancedMainLayout />
        </DatabaseProvider>
      </ThemeProvider>
    </div>
  );
};