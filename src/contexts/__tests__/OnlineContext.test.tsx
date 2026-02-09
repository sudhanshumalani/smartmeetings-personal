import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OnlineProvider, useOnline } from '../OnlineContext';

function OnlineDisplay() {
  const { isOnline } = useOnline();
  return <span data-testid="online">{isOnline ? 'online' : 'offline'}</span>;
}

describe('OnlineContext', () => {
  it('should reflect initial online state', () => {
    render(
      <OnlineProvider>
        <OnlineDisplay />
      </OnlineProvider>,
    );

    // In test env, navigator.onLine defaults to true
    expect(screen.getByTestId('online').textContent).toBe('online');
  });

  it('should update to offline when offline event fires', () => {
    render(
      <OnlineProvider>
        <OnlineDisplay />
      </OnlineProvider>,
    );

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('online').textContent).toBe('offline');
  });

  it('should update to online when online event fires', () => {
    render(
      <OnlineProvider>
        <OnlineDisplay />
      </OnlineProvider>,
    );

    // Go offline first
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('online').textContent).toBe('offline');

    // Come back online
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('online').textContent).toBe('online');
  });

  it('should throw when useOnline is used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<OnlineDisplay />)).toThrow(
      'useOnline must be used within an OnlineProvider',
    );
    spy.mockRestore();
  });
});
