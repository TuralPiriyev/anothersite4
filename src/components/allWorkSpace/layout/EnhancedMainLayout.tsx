import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Header from './Header';
import AdvancedToolsPanel from '../panels/AdvancedToolsPanel';
import WorkspacePanel from '../panels/WorkspacePanel';
import PortfolioPanel from '../panels/PortfolioPanel';
import CollaborativeCursors from '../workspace/CollaborativeCursors';

const EnhancedMainLayout: React.FC = () => {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [collaborativeCursors,
     //setCollaborativeCursors
    ] = useState([]);

  const toggleLeftPanel = () => {
    setLeftPanelOpen(prev => !prev);
  };

  const toggleRightPanel = () => {
    setRightPanelOpen(prev => !prev);
  };

  const handleCursorMove = (position: { x: number; y: number }) => {
    // In a real implementation, this would broadcast cursor position
    console.log('Cursor moved to:', position);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200 relative">
      <Header />
      
      {/* Collaborative Cursors Overlay */}
      <CollaborativeCursors 
        cursors={collaborativeCursors}
        onCursorMove={handleCursorMove}
      />
      
      <div className="flex-1 flex relative">
        {/* Mobile Menu Buttons */}
        <div className="lg:hidden absolute top-4 left-4 z-50">
          <button
            onClick={toggleLeftPanel}
            className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 hover:scale-105"
            aria-label={leftPanelOpen ? "Close tools panel" : "Open tools panel"}
          >
            {leftPanelOpen ? (
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>

        <div className="lg:hidden absolute top-4 right-4 z-50">
          <button
            onClick={toggleRightPanel}
            className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 hover:scale-105"
            aria-label={rightPanelOpen ? "Close portfolio panel" : "Open portfolio panel"}
          >
            {rightPanelOpen ? (
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>

        {/* Left Panel - Advanced Tools */}
        <div className={`
          fixed inset-y-0 left-0 z-40 w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out shadow-xl
          lg:relative lg:translate-x-0 lg:w-1/5 lg:min-w-80 lg:shadow-none
          ${leftPanelOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="lg:hidden absolute top-4 right-4">
            <button
              onClick={() => setLeftPanelOpen(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
              aria-label="Close tools panel"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <AdvancedToolsPanel />
        </div>

        {/* Center Panel - Workspace */}
        <div className="flex-1 lg:w-3/5">
          <WorkspacePanel />
        </div>

        {/* Right Panel - Portfolio & Chat */}
        <div className={`
          fixed inset-y-0 right-0 z-40 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out shadow-xl
          lg:relative lg:translate-x-0 lg:w-1/5 lg:min-w-80 lg:shadow-none
          ${rightPanelOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          <div className="lg:hidden absolute top-4 left-4">
            <button
              onClick={() => setRightPanelOpen(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
              aria-label="Close portfolio panel"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <PortfolioPanel />
        </div>

        {/* Mobile Overlays */}
        {(leftPanelOpen || rightPanelOpen) && (
          <div 
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30 backdrop-blur-sm"
            onClick={() => {
              setLeftPanelOpen(false);
              setRightPanelOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default EnhancedMainLayout;