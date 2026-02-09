import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../../db/database';
import type { Meeting } from '../../../db/database';
import { initialize as initSettings } from '../../../services/settingsService';
import * as settingsService from '../../../services/settingsService';
import {
  exportAllData,
  importData,
  validateImportData,
  exportMeeting,
  type ExportData,
} from '../../../services/exportService';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { OnlineProvider } from '../../../contexts/OnlineContext';
import SettingsPage from '../pages/SettingsPage';

function renderSettingsPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Routes>
              <Route path="settings" element={<SettingsPage />} />
            </Routes>
          </MemoryRouter>
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  const id = crypto.randomUUID();
  const now = new Date();
  return {
    id,
    title: `Meeting ${id.slice(0, 4)}`,
    date: now,
    participants: [],
    tags: [],
    stakeholderIds: [],
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('Settings & Export', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
  });

  // --- SettingsPage rendering ---

  describe('SettingsPage', () => {
    it('renders all sections', async () => {
      renderSettingsPage();

      expect(
        await screen.findByRole('heading', { name: 'Settings' }),
      ).toBeInTheDocument();
      expect(screen.getByText('API Keys')).toBeInTheDocument();
      expect(screen.getByText('Theme')).toBeInTheDocument();
      expect(screen.getByText('Google Drive Backup')).toBeInTheDocument();
      expect(screen.getByText('Data Management')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
      expect(screen.getByText('SmartMeetings v2.0')).toBeInTheDocument();
    });

    it('shows API key status indicators', async () => {
      renderSettingsPage();

      // Both should show "Not set" initially
      const statuses = await screen.findAllByText('Not set');
      expect(statuses.length).toBeGreaterThanOrEqual(2);
    });

    it('Claude API key save and status update', async () => {
      renderSettingsPage();
      await screen.findByRole('heading', { name: 'Settings' });

      // Type a key
      const claudeInput = screen.getByLabelText('Claude API key');
      await userEvent.type(claudeInput, 'sk-ant-test-key-123');

      // Click save (first "Save" button in the API keys section)
      const saveButtons = screen.getAllByRole('button', { name: /Save/ });
      await userEvent.click(saveButtons[0]);

      // Status should change to "Configured"
      await waitFor(() => {
        expect(screen.getByTestId('claude-key-status')).toHaveTextContent(
          'Configured',
        );
      });

      // Verify encrypted in DB (not plaintext)
      const settings = await db.appSettings.get('default');
      expect(settings?.claudeApiKey).not.toBe('sk-ant-test-key-123');
      expect(settings?.claudeApiKey).not.toBe('');
    });

    it('AssemblyAI API key save and status update', async () => {
      renderSettingsPage();
      await screen.findByRole('heading', { name: 'Settings' });

      const assemblyInput = screen.getByLabelText('AssemblyAI API key');
      await userEvent.type(assemblyInput, 'assembly-test-key-456');

      // Second "Save" button
      const saveButtons = screen.getAllByRole('button', { name: /Save/ });
      await userEvent.click(saveButtons[1]);

      await waitFor(() => {
        expect(
          screen.getByTestId('assembly-key-status'),
        ).toHaveTextContent('Configured');
      });
    });

    it('theme toggle buttons work', async () => {
      renderSettingsPage();
      await screen.findByRole('heading', { name: 'Settings' });

      // Click "Dark" theme
      await userEvent.click(
        screen.getByRole('button', { name: /Dark theme/ }),
      );

      // Verify saved in Dexie
      await waitFor(async () => {
        const settings = await settingsService.getSettings();
        expect(settings.theme).toBe('dark');
      });

      // Click "Light" theme
      await userEvent.click(
        screen.getByRole('button', { name: /Light theme/ }),
      );

      await waitFor(async () => {
        const settings = await settingsService.getSettings();
        expect(settings.theme).toBe('light');
      });
    });

    it('Google Client ID input works', async () => {
      renderSettingsPage();
      await screen.findByRole('heading', { name: 'Settings' });

      const clientIdInput = screen.getByLabelText('Google Client ID');
      await userEvent.type(clientIdInput, 'test-id.apps.googleusercontent.com');

      expect(clientIdInput).toHaveValue('test-id.apps.googleusercontent.com');
    });

    it('about section shows privacy note', async () => {
      renderSettingsPage();
      await screen.findByRole('heading', { name: 'Settings' });

      expect(
        screen.getByText(/All data is stored locally/),
      ).toBeInTheDocument();
    });
  });

  // --- API Key round-trip (encrypted) ---

  describe('API Key encryption round-trip', () => {
    it('Claude key: save → retrieve returns same value', async () => {
      await settingsService.saveClaudeApiKey('sk-ant-secret-key');
      const retrieved = await settingsService.getClaudeApiKey();
      expect(retrieved).toBe('sk-ant-secret-key');

      // Verify stored encrypted (not plaintext)
      const settings = await db.appSettings.get('default');
      expect(settings?.claudeApiKey).not.toBe('sk-ant-secret-key');
    });

    it('AssemblyAI key: save → retrieve returns same value', async () => {
      await settingsService.saveAssemblyAiApiKey('aai-secret-key');
      const retrieved = await settingsService.getAssemblyAiApiKey();
      expect(retrieved).toBe('aai-secret-key');
    });
  });

  // --- Export ---

  describe('exportAllData', () => {
    it('generates valid JSON with all tables', async () => {
      // Seed some data
      await db.meetings.add(makeMeeting({ title: 'Test Meeting' }));
      await db.stakeholders.add({
        id: crypto.randomUUID(),
        name: 'John',
        categoryIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      await db.stakeholderCategories.add({
        id: crypto.randomUUID(),
        name: 'Investors',
        color: '#ef4444',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const data = await exportAllData();

      expect(data.version).toBe('1.0');
      expect(data.exportedAt).toBeTruthy();
      expect(data.meetings).toHaveLength(1);
      expect(data.meetings[0].title).toBe('Test Meeting');
      expect(data.stakeholders).toHaveLength(1);
      expect(data.stakeholders[0].name).toBe('John');
      expect(data.stakeholderCategories).toHaveLength(1);
      expect(data.transcripts).toHaveLength(0);
      expect(data.meetingAnalyses).toHaveLength(0);
    });

    it('includes soft-deleted records in export', async () => {
      await db.meetings.add(
        makeMeeting({ title: 'Deleted', deletedAt: new Date() }),
      );

      const data = await exportAllData();
      expect(data.meetings).toHaveLength(1);
    });
  });

  describe('exportMeeting', () => {
    it('exports a single meeting with related data', async () => {
      const meeting = makeMeeting({ title: 'Single Export' });
      await db.meetings.add(meeting);

      await db.transcripts.add({
        id: crypto.randomUUID(),
        meetingId: meeting.id,
        audioRecordingId: 'rec-1',
        assemblyaiTranscriptId: 'asm-1',
        utterances: [{ speaker: 'A', text: 'Hello', start: 0, end: 1000, confidence: 0.9 }],
        fullText: 'Hello',
        speakerMap: { A: 'Alice' },
        audioDuration: 10,
        overallConfidence: 0.9,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const data = await exportMeeting(meeting.id);
      expect(data.meeting.title).toBe('Single Export');
      expect(data.transcripts).toHaveLength(1);
      expect(data.transcripts[0].fullText).toBe('Hello');
    });
  });

  // --- Import ---

  describe('importData', () => {
    it('merges new data correctly', async () => {
      const exportData: ExportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [
          makeMeeting({ title: 'Imported Meeting' }),
        ],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };

      const result = await importData(exportData);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);

      const meetings = await db.meetings.toArray();
      expect(meetings).toHaveLength(1);
      expect(meetings[0].title).toBe('Imported Meeting');
    });

    it('last-write-wins: newer record overwrites older', async () => {
      const id = crypto.randomUUID();
      const oldDate = new Date('2026-01-01T00:00:00Z');
      const newDate = new Date('2026-02-01T00:00:00Z');

      // Add existing record with old date
      await db.meetings.add(
        makeMeeting({ id, title: 'Old Title', updatedAt: oldDate }),
      );

      // Import with newer date
      const exportData: ExportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [
          makeMeeting({ id, title: 'New Title', updatedAt: newDate }),
        ],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };

      const result = await importData(exportData);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);

      const meeting = await db.meetings.get(id);
      expect(meeting?.title).toBe('New Title');
    });

    it('last-write-wins: older record is skipped', async () => {
      const id = crypto.randomUUID();
      const newDate = new Date('2026-02-01T00:00:00Z');
      const oldDate = new Date('2026-01-01T00:00:00Z');

      // Add existing record with newer date
      await db.meetings.add(
        makeMeeting({ id, title: 'Existing Title', updatedAt: newDate }),
      );

      // Import with older date
      const exportData: ExportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        meetings: [
          makeMeeting({ id, title: 'Old Import', updatedAt: oldDate }),
        ],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };

      const result = await importData(exportData);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);

      const meeting = await db.meetings.get(id);
      expect(meeting?.title).toBe('Existing Title');
    });
  });

  // --- Import Validation ---

  describe('validateImportData', () => {
    it('accepts valid export data', () => {
      const valid = {
        exportedAt: '2026-02-06T10:00:00Z',
        version: '1.0',
        meetings: [{ id: '1', title: 'Test' }],
        stakeholders: [],
        stakeholderCategories: [],
        transcripts: [],
        meetingAnalyses: [],
      };
      expect(validateImportData(valid)).toBeNull();
    });

    it('rejects null', () => {
      expect(validateImportData(null)).toBe('Invalid JSON: expected an object');
    });

    it('rejects non-object', () => {
      expect(validateImportData('string')).toBe(
        'Invalid JSON: expected an object',
      );
    });

    it('rejects missing version', () => {
      expect(
        validateImportData({
          exportedAt: '2026-01-01',
          meetings: [],
          stakeholders: [],
          stakeholderCategories: [],
          transcripts: [],
          meetingAnalyses: [],
        }),
      ).toBe('Missing or invalid "version" field');
    });

    it('rejects missing meetings array', () => {
      expect(
        validateImportData({
          exportedAt: '2026-01-01',
          version: '1.0',
          stakeholders: [],
          stakeholderCategories: [],
          transcripts: [],
          meetingAnalyses: [],
        }),
      ).toBe('Missing or invalid "meetings" field: expected an array');
    });

    it('rejects meeting without id', () => {
      expect(
        validateImportData({
          exportedAt: '2026-01-01',
          version: '1.0',
          meetings: [{ title: 'No ID' }],
          stakeholders: [],
          stakeholderCategories: [],
          transcripts: [],
          meetingAnalyses: [],
        }),
      ).toBe('Meeting missing "id" field');
    });

    it('rejects meeting without title', () => {
      expect(
        validateImportData({
          exportedAt: '2026-01-01',
          version: '1.0',
          meetings: [{ id: '1' }],
          stakeholders: [],
          stakeholderCategories: [],
          transcripts: [],
          meetingAnalyses: [],
        }),
      ).toBe('Meeting missing "title" field');
    });
  });

  // --- Print stylesheet ---

  describe('Print stylesheet', () => {
    it('@media print styles exist in index.css', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cssPath = path.resolve(__dirname, '../../../index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('@media print');
      expect(css).toContain('.print-view');
      expect(css).toContain('display: none !important');
      expect(css).toContain('.no-print');
      expect(css).toContain('print-color-adjust');
    });
  });

  // --- Settings persistence ---

  describe('Settings persistence', () => {
    it('theme persists to Dexie', async () => {
      await settingsService.saveTheme('dark');
      const settings = await settingsService.getSettings();
      expect(settings.theme).toBe('dark');
    });

    it('Google Client ID persists to Dexie', async () => {
      await settingsService.saveGoogleClientId('test-id.apps.googleusercontent.com');
      const settings = await settingsService.getSettings();
      expect(settings.googleClientId).toBe('test-id.apps.googleusercontent.com');
    });
  });
});
