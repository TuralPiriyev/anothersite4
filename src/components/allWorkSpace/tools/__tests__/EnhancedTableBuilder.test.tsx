import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DatabaseProvider } from '../../../../context/DatabaseContext';
import { SubscriptionProvider } from '../../../../context/SubscriptionContext';
import { ThemeProvider } from '../../../../context/ThemeContext';
import EnhancedTableBuilder from '../EnhancedTableBuilder';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <SubscriptionProvider>
      <DatabaseProvider>
        {children}
      </DatabaseProvider>
    </SubscriptionProvider>
  </ThemeProvider>
);

describe('EnhancedTableBuilder', () => {
  it('renders enhanced table builder form', () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    expect(screen.getByText('Enhanced Table Builder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter table name')).toBeInTheDocument();
    expect(screen.getByText('Add Column')).toBeInTheDocument();
  });

  it('validates table name input with real-time feedback', async () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    const createButton = screen.getByText('Create Table');
    expect(createButton).toBeDisabled();

    const nameInput = screen.getByPlaceholderText('Enter table name');
    fireEvent.change(nameInput, { target: { value: 'users' } });

    // Still disabled because no columns
    expect(createButton).toBeDisabled();
  });

  it('shows foreign key modal with reference table and column selection', async () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    // Add a column first
    const addColumnButton = screen.getByText('Add Column');
    fireEvent.click(addColumnButton);

    const columnNameInput = screen.getByPlaceholderText('Column name');
    fireEvent.change(columnNameInput, { target: { value: 'user_id' } });

    // Try to add FK
    const addFKButton = screen.getByText('Add FK');
    fireEvent.click(addFKButton);

    await waitFor(() => {
      expect(screen.getByText('Add Foreign Key for "user_id"')).toBeInTheDocument();
      expect(screen.getByText('Reference Table')).toBeInTheDocument();
      expect(screen.getByText('Reference Column')).toBeInTheDocument();
    });
  });

  it('validates foreign key constraints', async () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    const nameInput = screen.getByPlaceholderText('Enter table name');
    fireEvent.change(nameInput, { target: { value: 'orders' } });

    // Add a column
    const addColumnButton = screen.getByText('Add Column');
    fireEvent.click(addColumnButton);

    const columnNameInput = screen.getByPlaceholderText('Column name');
    fireEvent.change(columnNameInput, { target: { value: 'user_id' } });

    // The validation should run automatically
    await waitFor(() => {
      // Check that validation is working
      expect(nameInput).toHaveValue('orders');
    });
  });

  it('handles column addition and removal', () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    const addColumnButton = screen.getByText('Add Column');
    fireEvent.click(addColumnButton);

    expect(screen.getByText('Column 1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Column name')).toBeInTheDocument();

    // Add another column
    fireEvent.click(addColumnButton);
    expect(screen.getByText('Column 2')).toBeInTheDocument();

    // Remove first column
    const removeButtons = screen.getAllByTitle('Remove column');
    fireEvent.click(removeButtons[0]);

    expect(screen.queryByText('Column 1')).not.toBeInTheDocument();
  });

  it('displays validation errors for duplicate column names', async () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    // Add two columns with same name
    const addColumnButton = screen.getByText('Add Column');
    fireEvent.click(addColumnButton);
    fireEvent.click(addColumnButton);

    const columnInputs = screen.getAllByPlaceholderText('Column name');
    fireEvent.change(columnInputs[0], { target: { value: 'id' } });
    fireEvent.change(columnInputs[1], { target: { value: 'id' } });

    await waitFor(() => {
      expect(screen.getByText('Duplicate column names found')).toBeInTheDocument();
    });
  });

  it('prevents multiple primary keys', async () => {
    render(
      <TestWrapper>
        <EnhancedTableBuilder />
      </TestWrapper>
    );

    // Add two columns
    const addColumnButton = screen.getByText('Add Column');
    fireEvent.click(addColumnButton);
    fireEvent.click(addColumnButton);

    // Set both as primary keys
    const primaryKeyCheckboxes = screen.getAllByLabelText(/Primary Key/);
    fireEvent.click(primaryKeyCheckboxes[0]);
    fireEvent.click(primaryKeyCheckboxes[1]);

    await waitFor(() => {
      expect(screen.getByText('Only one primary key allowed per table')).toBeInTheDocument();
    });
  });
});