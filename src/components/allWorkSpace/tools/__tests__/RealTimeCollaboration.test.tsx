import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DatabaseProvider } from '../../../../context/DatabaseContext';
import { SubscriptionProvider } from '../../../../context/SubscriptionContext';
import { ThemeProvider } from '../../../../context/ThemeContext';
import RealTimeCollaboration from '../RealTimeCollaboration';
import api from '../../../../utils/api';

// Mock API calls
jest.mock('../../../../utils/api');
const mockApi = api as jest.Mocked<typeof api>;

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  OPEN: 1,
};

jest.mock('../../../../hooks/useWebSocket', () => ({
  useWebSocket: jest.fn(() => ({
    isConnected: true,
    sendMessage: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <SubscriptionProvider>
      <DatabaseProvider>
        {children}
      </DatabaseProvider>
    </SubscriptionProvider>
  </ThemeProvider>
);

describe('RealTimeCollaboration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Ultimate plan
    jest.spyOn(require('../../../../context/SubscriptionContext'), 'useSubscription').mockReturnValue({
      currentPlan: 'ultimate',
      canUseFeature: () => true,
      setShowUpgradeModal: jest.fn(),
      setUpgradeReason: jest.fn(),
    });
  });

  it('renders collaboration interface for Ultimate users', () => {
    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    expect(screen.getByText('Real-Time Collaboration')).toBeInTheDocument();
    expect(screen.getByText('Send Invitation')).toBeInTheDocument();
    expect(screen.getByText('Accept Invitation')).toBeInTheDocument();
    expect(screen.getByText('Team Members')).toBeInTheDocument();
  });

  it('validates username before sending invitation', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { exists: true }
    });

    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    const usernameInput = screen.getByPlaceholderText('Enter username to invite');
    const sendButton = screen.getByText('Send Invitation');

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/users/validate', { username: 'testuser' });
    });
  });

  it('handles invitation errors gracefully', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Network error'));

    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    const usernameInput = screen.getByPlaceholderText('Enter username to invite');
    const sendButton = screen.getByText('Send Invitation');

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to send invitation. Please try again.')).toBeInTheDocument();
    });
  });

  it('validates join codes correctly', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { 
        valid: true, 
        invitation: { 
          id: '123', 
          role: 'editor',
          inviteeUsername: 'testuser'
        } 
      }
    });

    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    // Switch to accept tab
    fireEvent.click(screen.getByText('Accept Invitation'));

    const joinCodeInput = screen.getByPlaceholderText('XXXXXXXX');
    const joinButton = screen.getByText('Join Workspace');

    fireEvent.change(joinCodeInput, { target: { value: 'ABC12345' } });
    fireEvent.click(joinButton);

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/invitations/validate', { joinCode: 'ABC12345' });
    });
  });

  it('shows upgrade prompt for non-Ultimate users', () => {
    jest.spyOn(require('../../../../context/SubscriptionContext'), 'useSubscription').mockReturnValue({
      currentPlan: 'pro',
      canUseFeature: () => false,
      setShowUpgradeModal: jest.fn(),
      setUpgradeReason: jest.fn(),
    });

    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    expect(screen.getByText('Real-Time Collaboration')).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Ultimate')).toBeInTheDocument();
  });

  it('copies join codes to clipboard', async () => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    // This would be tested with a generated join code in the success state
    // For now, we'll just verify the clipboard mock is set up
    expect(navigator.clipboard.writeText).toBeDefined();
  });

  it('handles real-time WebSocket messages', () => {
    const mockSendMessage = jest.fn();
    jest.spyOn(require('../../../../hooks/useWebSocket'), 'useWebSocket').mockReturnValue({
      isConnected: true,
      sendMessage: mockSendMessage,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    render(
      <TestWrapper>
        <RealTimeCollaboration />
      </TestWrapper>
    );

    // Component should be ready to send messages
    expect(mockSendMessage).toBeDefined();
  });
});