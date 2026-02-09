import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastContext';

function ToastTestHarness() {
  const { toasts, addToast, removeToast } = useToast();
  return (
    <div>
      <button
        data-testid="add-success"
        onClick={() => addToast('Success!', 'success')}
      >
        Add Success
      </button>
      <button
        data-testid="add-error"
        onClick={() => addToast('Error!', 'error')}
      >
        Add Error
      </button>
      <button
        data-testid="add-long"
        onClick={() => addToast('Long toast', 'info', 10000)}
      >
        Add Long
      </button>
      <button
        data-testid="add-no-dismiss"
        onClick={() => addToast('Permanent', 'warning', 0)}
      >
        Add No Dismiss
      </button>
      <div data-testid="toast-count">{toasts.length}</div>
      <div data-testid="toast-list">
        {toasts.map((t) => (
          <div key={t.id} data-testid={`toast-${t.id}`}>
            <span data-testid={`msg-${t.id}`}>{t.message}</span>
            <span data-testid={`type-${t.id}`}>{t.type}</span>
            <button
              data-testid={`remove-${t.id}`}
              onClick={() => removeToast(t.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add a toast', () => {
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('add-success'));

    expect(screen.getByTestId('toast-count').textContent).toBe('1');
    expect(screen.getByTestId('msg-toast-1').textContent).toBe('Success!');
    expect(screen.getByTestId('type-toast-1').textContent).toBe('success');
  });

  it('should add multiple toasts', () => {
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('add-success'));
    fireEvent.click(screen.getByTestId('add-error'));

    expect(screen.getByTestId('toast-count').textContent).toBe('2');
  });

  it('should auto-dismiss after default duration (3000ms)', () => {
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('add-success'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('should not auto-dismiss when duration is 0', () => {
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('add-no-dismiss'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // Still there
    expect(screen.getByTestId('toast-count').textContent).toBe('1');
  });

  it('should manually remove a toast', () => {
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('add-no-dismiss'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('remove-toast-1'));
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('should respect custom duration', () => {
    render(
      <ToastProvider>
        <ToastTestHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId('add-long'));
    expect(screen.getByTestId('toast-count').textContent).toBe('1');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Still there at 5s (duration is 10s)
    expect(screen.getByTestId('toast-count').textContent).toBe('1');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Gone at 10s
    expect(screen.getByTestId('toast-count').textContent).toBe('0');
  });

  it('should throw when useToast is used outside provider', () => {
    vi.useRealTimers(); // Avoid timer interference
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastTestHarness />)).toThrow(
      'useToast must be used within a ToastProvider',
    );
    spy.mockRestore();
  });
});
