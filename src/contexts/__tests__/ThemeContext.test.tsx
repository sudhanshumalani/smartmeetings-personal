import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, initializeDatabase } from '../../db/database';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { initialize as initSettings } from '../../services/settingsService';

// Helper component that exposes theme context
function ThemeDisplay() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="set-light" onClick={() => setTheme('light')}>
        Light
      </button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>
        Dark
      </button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>
        System
      </button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
    // Clean up any dark class from previous tests
    document.documentElement.classList.remove('dark');
  });

  it('should default to system theme', async () => {
    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>,
      );
    });

    // Starts as system, resolves based on prefers-color-scheme
    expect(screen.getByTestId('theme').textContent).toBe('system');
  });

  it('should switch to light theme', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>,
      );
    });

    await user.click(screen.getByTestId('set-light'));

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should switch to dark theme and apply dark class', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>,
      );
    });

    await user.click(screen.getByTestId('set-dark'));

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should persist theme to Dexie', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>,
      );
    });

    await user.click(screen.getByTestId('set-dark'));

    // Wait for async persist
    await vi.waitFor(async () => {
      const settings = await db.appSettings.get('default');
      expect(settings!.theme).toBe('dark');
    });
  });

  it('should load persisted theme from Dexie on mount', async () => {
    // Pre-set theme in DB
    await db.appSettings.update('default', { theme: 'dark' });

    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>,
      );
    });

    // Wait for async load from Dexie
    await vi.waitFor(() => {
      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });
  });

  it('should throw when useTheme is used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThemeDisplay />)).toThrow(
      'useTheme must be used within a ThemeProvider',
    );
    spy.mockRestore();
  });

  it('should toggle through light → dark → system', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <ThemeProvider>
          <ThemeDisplay />
        </ThemeProvider>,
      );
    });

    await user.click(screen.getByTestId('set-light'));
    expect(screen.getByTestId('theme').textContent).toBe('light');

    await user.click(screen.getByTestId('set-dark'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    await user.click(screen.getByTestId('set-system'));
    expect(screen.getByTestId('theme').textContent).toBe('system');
  });
});
