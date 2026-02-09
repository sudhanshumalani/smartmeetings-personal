import { describe, it, expect, beforeEach } from 'vitest';
import { db, initializeDatabase } from '../../db/database';
import { initialize as initSettings } from '../../services/settingsService';
import { meetingRepository } from '../../services/meetingRepository';

describe('PWA & Offline', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
  });

  // --- PWA Manifest validation ---

  describe('PWA Manifest', () => {
    it('vite.config.ts has correct PWA config', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const configPath = path.resolve(__dirname, '../../../vite.config.ts');
      const config = fs.readFileSync(configPath, 'utf-8');

      // registerType must be 'prompt' (NOT autoUpdate)
      expect(config).toContain("registerType: 'prompt'");
      expect(config).not.toContain("registerType: 'autoUpdate'");

      // Required manifest fields
      expect(config).toContain("name: 'SmartMeetings'");
      expect(config).toContain("short_name: 'SmartMeetings'");
      expect(config).toContain("theme_color: '#3b82f6'");
      expect(config).toContain("display: 'standalone'");
      expect(config).toContain("start_url: '/'");

      // Icons
      expect(config).toContain('pwa-192x192.png');
      expect(config).toContain('pwa-512x512.png');
      expect(config).toContain("purpose: 'any maskable'");

      // Workbox config
      expect(config).toContain('globPatterns');
      expect(config).toContain('runtimeCaching');

      // NetworkOnly for API calls (regex-escaped dots in urlPattern)
      expect(config).toContain('assemblyai');
      expect(config).toContain('anthropic');
      expect(config).toContain("handler: 'NetworkOnly'");
    });

    it('PWA icons exist in public directory', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const publicDir = path.resolve(__dirname, '../../../public');

      expect(fs.existsSync(path.join(publicDir, 'pwa-192x192.png'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(publicDir, 'pwa-512x512.png'))).toBe(
        true,
      );
      expect(
        fs.existsSync(path.join(publicDir, 'apple-touch-icon.png')),
      ).toBe(true);
      expect(fs.existsSync(path.join(publicDir, 'favicon.ico'))).toBe(true);
    });

    it('icons are valid PNG files', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const publicDir = path.resolve(__dirname, '../../../public');

      // PNG signature: 89 50 4E 47
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      for (const file of [
        'pwa-192x192.png',
        'pwa-512x512.png',
        'apple-touch-icon.png',
      ]) {
        const data = fs.readFileSync(path.join(publicDir, file));
        expect(data.subarray(0, 4).equals(pngSignature)).toBe(true);
      }
    });
  });

  // --- index.html meta tags ---

  describe('index.html meta tags', () => {
    it('has required iOS PWA meta tags', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const htmlPath = path.resolve(__dirname, '../../../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).toContain('viewport-fit=cover');
      expect(html).toContain('apple-mobile-web-app-capable');
      expect(html).toContain('apple-mobile-web-app-status-bar-style');
      expect(html).toContain('apple-mobile-web-app-title');
      expect(html).toContain('apple-touch-icon');
      expect(html).toContain('theme-color');
      expect(html).toContain('meta name="description"');
    });
  });

  // --- CSS checks ---

  describe('Mobile CSS', () => {
    it('has safe area insets for iOS notch', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cssPath = path.resolve(__dirname, '../../index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('env(safe-area-inset-top)');
      expect(css).toContain('env(safe-area-inset-bottom)');
      expect(css).toContain('env(safe-area-inset-left)');
      expect(css).toContain('env(safe-area-inset-right)');
    });

    it('has mobile touch target styles', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cssPath = path.resolve(__dirname, '../../index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('min-height: 44px');
      expect(css).toContain('min-width: 44px');
      expect(css).toContain('.audio-record-btn');
    });
  });

  // --- Offline CRUD ---

  describe('Offline CRUD', () => {
    it('create meeting works offline (Dexie is local)', async () => {
      const id = await meetingRepository.quickCreate();
      const meeting = await db.meetings.get(id);

      expect(meeting).toBeTruthy();
      expect(meeting?.title).toBeTruthy();
      expect(meeting?.status).toBe('draft');
    });

    it('edit meeting works offline', async () => {
      const id = await meetingRepository.quickCreate();
      await meetingRepository.update(id, {
        title: 'Offline Edit',
        notes: 'Some offline notes',
      });

      const meeting = await db.meetings.get(id);
      expect(meeting?.title).toBe('Offline Edit');
      expect(meeting?.notes).toBe('Some offline notes');
    });

    it('search works offline', async () => {
      const id = await meetingRepository.quickCreate();
      await meetingRepository.update(id, { title: 'Offline Search Target' });

      const results = await meetingRepository.search('Search Target');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Offline Search Target');
    });

    it('soft delete and restore work offline', async () => {
      const id = await meetingRepository.quickCreate();
      await meetingRepository.softDelete(id);

      // Should not appear in active list
      const active = await meetingRepository.getAll();
      expect(active.find((m) => m.id === id)).toBeUndefined();

      // Should appear in deleted list
      const deleted = await meetingRepository.getDeleted();
      expect(deleted.find((m) => m.id === id)).toBeTruthy();

      // Restore
      await meetingRepository.restore(id);
      const afterRestore = await meetingRepository.getById(id);
      expect(afterRestore?.deletedAt).toBeNull();
    });

    it('changes queue in syncQueue when offline', async () => {
      const id = await meetingRepository.quickCreate();
      await meetingRepository.update(id, { title: 'Queued Change' });

      const queue = await db.syncQueue
        .filter((i) => i.syncedAt === null)
        .toArray();
      expect(queue.length).toBeGreaterThanOrEqual(2); // create + update
    });
  });

  // --- Service Worker registration ---

  describe('Service Worker', () => {
    it('main.tsx registers service worker on load', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const mainPath = path.resolve(__dirname, '../../main.tsx');
      const main = fs.readFileSync(mainPath, 'utf-8');

      expect(main).toContain("'serviceWorker' in navigator");
      expect(main).toContain("register('/sw.js'");
      expect(main).toContain('sw-update');
    });
  });

  // --- PWA Update Prompt ---

  describe('PWA Update Prompt', () => {
    it('component file exists with correct structure', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const componentPath = path.resolve(
        __dirname,
        '../../shared/components/PWAUpdatePrompt.tsx',
      );
      const code = fs.readFileSync(componentPath, 'utf-8');

      expect(code).toContain('PWAUpdatePrompt');
      expect(code).toContain('needRefresh');
      expect(code).toContain('New version available');
      expect(code).toContain('Refresh');
      expect(code).toContain('SKIP_WAITING');
    });
  });

  // --- useIsMobile hook ---

  describe('useIsMobile hook', () => {
    it('hook file exists with correct structure', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const hookPath = path.resolve(
        __dirname,
        '../../shared/hooks/useIsMobile.ts',
      );
      const code = fs.readFileSync(hookPath, 'utf-8');

      expect(code).toContain('useIsMobile');
      expect(code).toContain("matchMedia('(max-width: 768px)')");
      expect(code).toContain('addEventListener');
      expect(code).toContain('removeEventListener');
    });
  });
});
