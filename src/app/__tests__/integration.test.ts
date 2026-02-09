/**
 * Mission 15: Integration Tests — 6 Critical User Journeys
 *
 * These tests exercise the full data-layer flows end-to-end through Dexie,
 * verifying that repositories, services, and the DB work together correctly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, initializeDatabase } from '../../db/database';
import { initialize as initSettings } from '../../services/settingsService';
import { meetingRepository } from '../../services/meetingRepository';
import { stakeholderRepository } from '../../services/stakeholderRepository';
import { categoryRepository } from '../../services/categoryRepository';
import {
  exportAllData,
  importData,
  validateImportData,
} from '../../services/exportService';
import { prepareAnalysisText, claudeService } from '../../services/claudeService';
import { tiptapJsonToPlainText } from '../../services/tiptapUtils';
import type {
  AudioRecording,
  Transcript,
  MeetingAnalysis,
} from '../../db/database';

// --- Helpers ---

function makeAudioRecording(meetingId: string, overrides?: Partial<AudioRecording>): AudioRecording {
  return {
    id: crypto.randomUUID(),
    meetingId,
    blob: new Blob(['audio-data'], { type: 'audio/webm' }),
    mimeType: 'audio/webm',
    duration: 120,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeTranscript(meetingId: string, audioRecordingId: string, overrides?: Partial<Transcript>): Transcript {
  return {
    id: crypto.randomUUID(),
    meetingId,
    audioRecordingId,
    assemblyaiTranscriptId: 'aai-' + crypto.randomUUID().slice(0, 8),
    utterances: [
      { speaker: 'A', text: 'Hello team, lets get started.', start: 0, end: 3000, confidence: 0.95 },
      { speaker: 'B', text: 'Sure, I have an update on the project.', start: 3500, end: 7000, confidence: 0.92 },
      { speaker: 'A', text: 'Go ahead.', start: 7500, end: 8500, confidence: 0.98 },
    ],
    fullText: 'Hello team, lets get started. Sure, I have an update on the project. Go ahead.',
    speakerMap: {},
    audioDuration: 120,
    overallConfidence: 0.95,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeAnalysis(meetingId: string): MeetingAnalysis {
  return {
    id: crypto.randomUUID(),
    meetingId,
    summary: 'Team discussed project updates and next steps.',
    themes: [{ topic: 'Project Update', keyPoints: ['On track for Q2 launch'], context: 'Regular standup' }],
    decisions: [{ decision: 'Move to Phase 2', madeBy: 'Alice', rationale: 'Phase 1 complete', implications: 'Need more resources' }],
    actionItems: [{ task: 'Prepare demo', owner: 'Bob', deadline: '2026-02-10', priority: 'high' as const, context: 'Client meeting' }],
    openItems: [{ item: 'Budget approval', type: 'blocker' as const, owner: 'Carol', urgency: 'This week' }],
    nextSteps: 'Bob to prepare demo by Friday. Reconvene Monday.',
    sourceType: 'api',
    inputText: 'test input',
    createdAt: new Date(),
    deletedAt: null,
  };
}

const VALID_ANALYSIS_JSON = JSON.stringify({
  summary: 'Meeting covered key topics.',
  themes: [{ topic: 'Budget', keyPoints: ['Approved'], context: 'Finance review' }],
  decisions: [{ decision: 'Proceed', madeBy: 'Alice', rationale: 'All clear', implications: 'None' }],
  actionItems: [{ task: 'Send report', owner: 'Bob', deadline: 'Friday', priority: 'medium', context: 'Followup' }],
  openItems: [{ item: 'Venue', type: 'question', owner: 'Carol', urgency: 'Low' }],
  nextSteps: 'Reconvene next week.',
});

// --- Test Suite ---

beforeEach(async () => {
  await db.delete();
  await db.open();
  await initializeDatabase();
  await initSettings();
});

// ============================================================
// JOURNEY 1: Create → Record → Transcribe → Analyze
// ============================================================

describe('Journey 1: Create → Record → Transcribe → Analyze', () => {
  it('full pipeline from meeting creation through analysis', async () => {
    // 1. Create a new meeting
    const meetingId = await meetingRepository.quickCreate();
    const meeting = await db.meetings.get(meetingId);
    expect(meeting).toBeTruthy();
    expect(meeting!.status).toBe('draft');

    // 2. Edit title and link a stakeholder
    const categoryId = await categoryRepository.create({ name: 'Engineering', color: '#3b82f6' });
    const stakeholderId = await stakeholderRepository.create({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      categoryIds: [categoryId],
    });

    await meetingRepository.update(meetingId, {
      title: 'Sprint Planning',
      stakeholderIds: [stakeholderId],
      status: 'in-progress',
    });

    const updatedMeeting = await meetingRepository.getById(meetingId);
    expect(updatedMeeting!.title).toBe('Sprint Planning');
    expect(updatedMeeting!.stakeholderIds).toContain(stakeholderId);

    // 3. Simulate recording saved (AudioRecording in Dexie)
    const recording = makeAudioRecording(meetingId);
    await db.audioRecordings.add(recording);

    const savedRecording = await db.audioRecordings.get(recording.id);
    expect(savedRecording).toBeTruthy();
    expect(savedRecording!.meetingId).toBe(meetingId);

    // 4. Simulate transcription saved (Transcript in Dexie)
    const transcript = makeTranscript(meetingId, recording.id);
    await db.transcripts.add(transcript);

    const savedTranscript = await db.transcripts.get(transcript.id);
    expect(savedTranscript).toBeTruthy();
    expect(savedTranscript!.utterances).toHaveLength(3);

    // 5. Speaker rename
    await db.transcripts.update(transcript.id, {
      speakerMap: { A: 'Alice Johnson', B: 'Bob Smith' },
      updatedAt: new Date(),
    });

    const renamedTranscript = await db.transcripts.get(transcript.id);
    expect(renamedTranscript!.speakerMap['A']).toBe('Alice Johnson');
    expect(renamedTranscript!.speakerMap['B']).toBe('Bob Smith');

    // 6. Prepare analysis text — should use renamed speakers
    const analysisText = await prepareAnalysisText(meetingId, '');
    expect(analysisText).toContain('Alice Johnson:');
    expect(analysisText).toContain('Bob Smith:');

    // 7. Save analysis (simulate Claude API response)
    const analysis = makeAnalysis(meetingId);
    analysis.inputText = analysisText;
    await db.meetingAnalyses.add(analysis);

    const savedAnalysis = await db.meetingAnalyses.get(analysis.id);
    expect(savedAnalysis).toBeTruthy();
    expect(savedAnalysis!.summary).toBeTruthy();
    expect(savedAnalysis!.themes).toHaveLength(1);
    expect(savedAnalysis!.actionItems).toHaveLength(1);
    expect(savedAnalysis!.decisions).toHaveLength(1);
    expect(savedAnalysis!.openItems).toHaveLength(1);
    expect(savedAnalysis!.nextSteps).toBeTruthy();
    expect(savedAnalysis!.sourceType).toBe('api');

    // 8. Verify meeting status update
    await meetingRepository.update(meetingId, { status: 'completed' });
    const completedMeeting = await meetingRepository.getById(meetingId);
    expect(completedMeeting!.status).toBe('completed');
  });

  it('transcript speaker labels propagate to analysis input text', async () => {
    const meetingId = await meetingRepository.quickCreate();
    const recording = makeAudioRecording(meetingId);
    await db.audioRecordings.add(recording);

    const transcript = makeTranscript(meetingId, recording.id, {
      speakerMap: { A: 'David', B: 'Eve' },
    });
    await db.transcripts.add(transcript);

    const text = await prepareAnalysisText(meetingId, '');
    expect(text).toContain('David:');
    expect(text).toContain('Eve:');
    expect(text).not.toContain('Speaker A');
  });

  it('multiple recordings produce combined transcript text', async () => {
    const meetingId = await meetingRepository.quickCreate();

    const rec1 = makeAudioRecording(meetingId, { order: 1 });
    const rec2 = makeAudioRecording(meetingId, { order: 2 });
    await db.audioRecordings.add(rec1);
    await db.audioRecordings.add(rec2);

    const t1 = makeTranscript(meetingId, rec1.id, {
      utterances: [{ speaker: 'A', text: 'First recording.', start: 0, end: 2000, confidence: 0.9 }],
      speakerMap: { A: 'Alice' },
      createdAt: new Date('2026-02-06T10:00:00'),
    });
    const t2 = makeTranscript(meetingId, rec2.id, {
      utterances: [{ speaker: 'A', text: 'Second recording.', start: 5000, end: 7000, confidence: 0.9 }],
      speakerMap: { A: 'Alice' },
      createdAt: new Date('2026-02-06T11:00:00'),
    });
    await db.transcripts.add(t1);
    await db.transcripts.add(t2);

    const text = await prepareAnalysisText(meetingId, '');
    expect(text).toContain('First recording.');
    expect(text).toContain('Second recording.');
  });
});

// ============================================================
// JOURNEY 2: Manual Notes → Analyze
// ============================================================

describe('Journey 2: Manual Notes → Analyze', () => {
  it('analysis from TipTap notes only (no transcript)', async () => {
    const meetingId = await meetingRepository.quickCreate();

    // Simulate TipTap JSON content saved to meeting notes
    const tiptapContent = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Sprint Review' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Discussed roadmap priorities and Q2 milestones.' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Feature A is on track' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Feature B needs more testing' }] },
              ],
            },
          ],
        },
      ],
    });

    await meetingRepository.update(meetingId, { notes: tiptapContent });

    // Convert TipTap JSON to plain text (as the UI does)
    const plainText = tiptapJsonToPlainText(tiptapContent);
    expect(plainText).toContain('Sprint Review');
    expect(plainText).toContain('Discussed roadmap priorities');
    expect(plainText).toContain('Feature A is on track');
    expect(plainText).toContain('Feature B needs more testing');

    // Prepare analysis text — should use notes only
    const analysisText = await prepareAnalysisText(meetingId, plainText);
    expect(analysisText).toContain('Sprint Review');
    expect(analysisText).not.toContain('[Transcript]');

    // Save analysis from notes
    const analysis = makeAnalysis(meetingId);
    analysis.inputText = analysisText;
    analysis.sourceType = 'api';
    await db.meetingAnalyses.add(analysis);

    const saved = await db.meetingAnalyses.get(analysis.id);
    expect(saved!.inputText).toContain('Sprint Review');
  });

  it('analysis text combines transcript + notes when both exist', async () => {
    const meetingId = await meetingRepository.quickCreate();

    // Add a transcript
    const recording = makeAudioRecording(meetingId);
    await db.audioRecordings.add(recording);
    const transcript = makeTranscript(meetingId, recording.id, {
      speakerMap: { A: 'Alice', B: 'Bob' },
    });
    await db.transcripts.add(transcript);

    // Prepare with notes
    const text = await prepareAnalysisText(meetingId, 'Some meeting notes here.');
    expect(text).toContain('[Transcript]');
    expect(text).toContain('Alice:');
    expect(text).toContain('[Notes]');
    expect(text).toContain('Some meeting notes here.');
  });

  it('empty notes and no transcript returns empty string', async () => {
    const meetingId = await meetingRepository.quickCreate();
    const text = await prepareAnalysisText(meetingId, '');
    expect(text).toBe('');
  });

  it('tiptapJsonToPlainText handles non-JSON string gracefully', () => {
    expect(tiptapJsonToPlainText('plain text notes')).toBe('plain text notes');
    expect(tiptapJsonToPlainText('')).toBe('');
  });
});

// ============================================================
// JOURNEY 3: Copy-Paste Fallback
// ============================================================

describe('Journey 3: Copy-Paste Fallback', () => {
  it('buildPromptForCopyPaste injects meeting text', async () => {
    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, { notes: 'Team discussed budgets.' });

    const prompt = claudeService.buildPromptForCopyPaste('Team discussed budgets.');
    expect(prompt).toContain('Team discussed budgets.');
    expect(prompt).toContain('expert meeting notes assistant');
  });

  it('parseManualResult accepts valid JSON analysis', () => {
    const result = claudeService.parseManualResult(VALID_ANALYSIS_JSON);
    expect(result.summary).toBe('Meeting covered key topics.');
    expect(result.themes).toHaveLength(1);
    expect(result.decisions).toHaveLength(1);
    expect(result.actionItems).toHaveLength(1);
    expect(result.openItems).toHaveLength(1);
    expect(result.nextSteps).toBe('Reconvene next week.');
  });

  it('parseManualResult rejects invalid JSON syntax', () => {
    expect(() => claudeService.parseManualResult('not json at all')).toThrow('Invalid JSON');
  });

  it('parseManualResult rejects valid JSON missing required fields', () => {
    expect(() => claudeService.parseManualResult('{"summary":"hi"}')).toThrow('missing required field');
  });

  it('manual analysis saves with sourceType manual', async () => {
    const meetingId = await meetingRepository.quickCreate();
    const parsed = claudeService.parseManualResult(VALID_ANALYSIS_JSON);

    const analysis: MeetingAnalysis = {
      id: crypto.randomUUID(),
      meetingId,
      summary: parsed.summary,
      themes: parsed.themes,
      decisions: parsed.decisions,
      actionItems: parsed.actionItems.map(a => ({
        ...a,
        priority: a.priority as 'high' | 'medium' | 'low',
      })),
      openItems: parsed.openItems.map(o => ({
        ...o,
        type: o.type as 'question' | 'blocker' | 'risk',
      })),
      nextSteps: parsed.nextSteps,
      sourceType: 'manual',
      inputText: 'Team discussed budgets.',
      createdAt: new Date(),
      deletedAt: null,
    };
    await db.meetingAnalyses.add(analysis);

    const saved = await db.meetingAnalyses.get(analysis.id);
    expect(saved!.sourceType).toBe('manual');
    expect(saved!.summary).toBe('Meeting covered key topics.');
  });

  it('re-analysis soft-deletes previous analysis', async () => {
    const meetingId = await meetingRepository.quickCreate();

    // First analysis
    const first = makeAnalysis(meetingId);
    await db.meetingAnalyses.add(first);

    // Re-analyze: soft-delete old one
    await db.meetingAnalyses.update(first.id, { deletedAt: new Date() });

    // Save new one
    const second = makeAnalysis(meetingId);
    second.summary = 'Updated analysis with more details.';
    await db.meetingAnalyses.add(second);

    // Old should be soft-deleted
    const old = await db.meetingAnalyses.get(first.id);
    expect(old!.deletedAt).not.toBeNull();

    // New should be active
    const active = await db.meetingAnalyses
      .where('meetingId')
      .equals(meetingId)
      .filter(a => a.deletedAt === null)
      .toArray();
    expect(active).toHaveLength(1);
    expect(active[0].summary).toBe('Updated analysis with more details.');
  });
});

// ============================================================
// JOURNEY 4: Stakeholder Lifecycle
// ============================================================

describe('Journey 4: Stakeholder Lifecycle', () => {
  it('full stakeholder lifecycle from category to meeting linkage', async () => {
    // 1. Create category
    const categoryId = await categoryRepository.create({ name: 'Schools', color: '#22c55e' });
    const category = await categoryRepository.getById(categoryId);
    expect(category!.name).toBe('Schools');
    expect(category!.color).toBe('#22c55e');

    // 2. Create stakeholder linked to category
    const stakeholderId = await stakeholderRepository.create({
      name: 'Springfield Elementary',
      email: 'admin@springfield.edu',
      organization: 'Springfield School District',
      categoryIds: [categoryId],
    });

    const stakeholder = await stakeholderRepository.getById(stakeholderId);
    expect(stakeholder!.name).toBe('Springfield Elementary');
    expect(stakeholder!.categoryIds).toContain(categoryId);

    // 3. Create meeting and link stakeholder
    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, {
      title: 'School Board Meeting',
      stakeholderIds: [stakeholderId],
    });

    const meeting = await meetingRepository.getById(meetingId);
    expect(meeting!.stakeholderIds).toContain(stakeholderId);

    // 4. Verify stakeholder linked meetings (reverse lookup)
    const linkedMeetings = await db.meetings
      .filter(m => m.deletedAt === null && m.stakeholderIds.includes(stakeholderId))
      .toArray();
    expect(linkedMeetings).toHaveLength(1);
    expect(linkedMeetings[0].title).toBe('School Board Meeting');

    // 5. Verify stakeholder appears in getByCategory
    const categoryStakeholders = await stakeholderRepository.getByCategory(categoryId);
    expect(categoryStakeholders).toHaveLength(1);
    expect(categoryStakeholders[0].name).toBe('Springfield Elementary');

    // 6. Search stakeholder
    const searchResults = await stakeholderRepository.search('Springfield');
    expect(searchResults).toHaveLength(1);
  });

  it('stakeholder search works by name and organization', async () => {
    await stakeholderRepository.create({
      name: 'John Doe',
      organization: 'Acme Corp',
      categoryIds: [],
    });

    const byName = await stakeholderRepository.search('John');
    expect(byName).toHaveLength(1);

    const byOrg = await stakeholderRepository.search('Acme');
    expect(byOrg).toHaveLength(1);

    const noMatch = await stakeholderRepository.search('xyz123');
    expect(noMatch).toHaveLength(0);
  });

  it('category color validation enforced on create', async () => {
    await expect(
      categoryRepository.create({ name: 'Bad', color: '#000000' }),
    ).rejects.toThrow('Invalid category color');
  });

  it('multiple stakeholders linked to same meeting', async () => {
    const s1 = await stakeholderRepository.create({ name: 'Alice', categoryIds: [] });
    const s2 = await stakeholderRepository.create({ name: 'Bob', categoryIds: [] });

    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, {
      stakeholderIds: [s1, s2],
    });

    const meeting = await meetingRepository.getById(meetingId);
    expect(meeting!.stakeholderIds).toHaveLength(2);
    expect(meeting!.stakeholderIds).toContain(s1);
    expect(meeting!.stakeholderIds).toContain(s2);
  });
});

// ============================================================
// JOURNEY 5: Trash + Recovery
// ============================================================

describe('Journey 5: Trash + Recovery', () => {
  it('soft delete, restore, and permanent delete lifecycle', async () => {
    // Setup: create meeting and stakeholder
    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, { title: 'Trash Test Meeting' });

    const stakeholderId = await stakeholderRepository.create({
      name: 'Trash Test Stakeholder',
      categoryIds: [],
    });

    // 1. Soft-delete both
    await meetingRepository.softDelete(meetingId);
    await stakeholderRepository.softDelete(stakeholderId);

    // 2. Verify disappeared from active lists
    const activeMeetings = await meetingRepository.getAll();
    expect(activeMeetings.find(m => m.id === meetingId)).toBeUndefined();

    const activeStakeholders = await stakeholderRepository.getAll();
    expect(activeStakeholders.find(s => s.id === stakeholderId)).toBeUndefined();

    // getById also returns undefined for soft-deleted
    expect(await meetingRepository.getById(meetingId)).toBeUndefined();
    expect(await stakeholderRepository.getById(stakeholderId)).toBeUndefined();

    // 3. Verify present in deleted lists
    const deletedMeetings = await meetingRepository.getDeleted();
    expect(deletedMeetings.find(m => m.id === meetingId)).toBeTruthy();

    const deletedStakeholders = await stakeholderRepository.getDeleted();
    expect(deletedStakeholders.find(s => s.id === stakeholderId)).toBeTruthy();

    // 4. Restore meeting → back in active list
    await meetingRepository.restore(meetingId);
    const restoredMeeting = await meetingRepository.getById(meetingId);
    expect(restoredMeeting).toBeTruthy();
    expect(restoredMeeting!.title).toBe('Trash Test Meeting');
    expect(restoredMeeting!.deletedAt).toBeNull();

    // 5. Permanently delete stakeholder → completely gone
    await stakeholderRepository.permanentDelete(stakeholderId);
    const rawStakeholder = await db.stakeholders.get(stakeholderId);
    expect(rawStakeholder).toBeUndefined();
  });

  it('permanent delete of meeting cascades to recordings, transcripts, analyses', async () => {
    const meetingId = await meetingRepository.quickCreate();

    // Add related entities
    const recording = makeAudioRecording(meetingId);
    await db.audioRecordings.add(recording);

    const transcript = makeTranscript(meetingId, recording.id);
    await db.transcripts.add(transcript);

    const analysis = makeAnalysis(meetingId);
    await db.meetingAnalyses.add(analysis);

    // Permanent delete
    await meetingRepository.permanentDelete(meetingId);

    // All should be gone
    expect(await db.meetings.get(meetingId)).toBeUndefined();
    expect(await db.audioRecordings.get(recording.id)).toBeUndefined();
    expect(await db.transcripts.get(transcript.id)).toBeUndefined();
    expect(await db.meetingAnalyses.get(analysis.id)).toBeUndefined();
  });

  it('permanent delete of stakeholder removes ID from linked meetings', async () => {
    const stakeholderId = await stakeholderRepository.create({
      name: 'Removable Stakeholder',
      categoryIds: [],
    });

    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, {
      stakeholderIds: [stakeholderId],
    });

    // Verify linked
    let meeting = await meetingRepository.getById(meetingId);
    expect(meeting!.stakeholderIds).toContain(stakeholderId);

    // Permanent delete stakeholder
    await stakeholderRepository.permanentDelete(stakeholderId);

    // Meeting should no longer reference the stakeholder
    meeting = await meetingRepository.getById(meetingId);
    expect(meeting!.stakeholderIds).not.toContain(stakeholderId);
  });

  it('permanent delete of category removes ID from linked stakeholders', async () => {
    const categoryId = await categoryRepository.create({ name: 'Temp Category', color: '#ef4444' });
    const stakeholderId = await stakeholderRepository.create({
      name: 'Test SH',
      categoryIds: [categoryId],
    });

    // Permanent delete category
    await categoryRepository.permanentDelete(categoryId);

    // Stakeholder should no longer reference the category
    const stakeholder = await stakeholderRepository.getById(stakeholderId);
    expect(stakeholder!.categoryIds).not.toContain(categoryId);
  });

  it('search does not return soft-deleted meetings', async () => {
    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, { title: 'Searchable Meeting' });

    // Can find it
    let results = await meetingRepository.search('Searchable');
    expect(results).toHaveLength(1);

    // Soft delete
    await meetingRepository.softDelete(meetingId);

    // Cannot find it
    results = await meetingRepository.search('Searchable');
    expect(results).toHaveLength(0);
  });
});

// ============================================================
// JOURNEY 6: Export + Import
// ============================================================

describe('Journey 6: Export + Import', () => {
  it('full export → clear → import cycle restores all data', async () => {
    // 1. Create several meetings with notes and analyses
    const m1 = await meetingRepository.quickCreate();
    await meetingRepository.update(m1, { title: 'Meeting Alpha', notes: 'Notes for Alpha' });

    const m2 = await meetingRepository.quickCreate();
    await meetingRepository.update(m2, { title: 'Meeting Beta', notes: 'Notes for Beta' });

    const m3 = await meetingRepository.quickCreate();
    await meetingRepository.update(m3, { title: 'Meeting Gamma', tags: ['important'] });

    // Add stakeholders and categories
    const catId = await categoryRepository.create({ name: 'Clients', color: '#3b82f6' });
    await stakeholderRepository.create({
      name: 'Jane Smith',
      email: 'jane@example.com',
      categoryIds: [catId],
    });

    // Add transcripts and analyses
    const recording = makeAudioRecording(m1);
    await db.audioRecordings.add(recording);
    const transcript = makeTranscript(m1, recording.id);
    await db.transcripts.add(transcript);
    const analysis = makeAnalysis(m1);
    await db.meetingAnalyses.add(analysis);

    // 2. Export all data
    const exported = await exportAllData();
    expect(exported.meetings).toHaveLength(3);
    expect(exported.stakeholders).toHaveLength(1);
    expect(exported.stakeholderCategories).toHaveLength(1);
    expect(exported.transcripts).toHaveLength(1);
    expect(exported.meetingAnalyses).toHaveLength(1);
    expect(exported.version).toBe('1.0');
    expect(exported.exportedAt).toBeTruthy();

    // 3. Validate export format
    const validationError = validateImportData(exported);
    expect(validationError).toBeNull();

    // 4. Clear all data
    await db.meetings.clear();
    await db.stakeholders.clear();
    await db.stakeholderCategories.clear();
    await db.transcripts.clear();
    await db.meetingAnalyses.clear();

    // Verify cleared
    expect(await db.meetings.count()).toBe(0);
    expect(await db.stakeholders.count()).toBe(0);

    // 5. Import the backup
    const result = await importData(exported);
    expect(result.imported).toBe(7); // 3 meetings + 1 stakeholder + 1 category + 1 transcript + 1 analysis
    expect(result.skipped).toBe(0);

    // 6. Verify everything restored
    const restoredMeetings = await db.meetings.toArray();
    expect(restoredMeetings).toHaveLength(3);
    expect(restoredMeetings.find(m => m.title === 'Meeting Alpha')).toBeTruthy();
    expect(restoredMeetings.find(m => m.title === 'Meeting Beta')).toBeTruthy();
    expect(restoredMeetings.find(m => m.title === 'Meeting Gamma')).toBeTruthy();

    const restoredStakeholders = await db.stakeholders.toArray();
    expect(restoredStakeholders).toHaveLength(1);
    expect(restoredStakeholders[0].name).toBe('Jane Smith');

    const restoredCategories = await db.stakeholderCategories.toArray();
    expect(restoredCategories).toHaveLength(1);
    expect(restoredCategories[0].name).toBe('Clients');

    const restoredTranscripts = await db.transcripts.toArray();
    expect(restoredTranscripts).toHaveLength(1);

    const restoredAnalyses = await db.meetingAnalyses.toArray();
    expect(restoredAnalyses).toHaveLength(1);
    expect(restoredAnalyses[0].summary).toBe(analysis.summary);
  });

  it('import uses last-write-wins: newer records overwrite, older are skipped', async () => {
    const meetingId = crypto.randomUUID();
    const oldDate = new Date('2026-01-01');
    const newDate = new Date('2026-02-06');

    // Add existing meeting with newer date
    await db.meetings.add({
      id: meetingId,
      title: 'Local Version (newer)',
      date: new Date(),
      participants: [],
      tags: [],
      stakeholderIds: [],
      status: 'draft',
      notes: '',
      createdAt: oldDate,
      updatedAt: newDate,
      deletedAt: null,
    });

    // Import with older version
    const importDataPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      meetings: [{
        id: meetingId,
        title: 'Imported Version (older)',
        date: new Date().toISOString(),
        participants: [],
        tags: [],
        stakeholderIds: [],
        status: 'draft' as const,
        notes: '',
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(), // Older
        deletedAt: null,
      }],
      stakeholders: [],
      stakeholderCategories: [],
      transcripts: [],
      meetingAnalyses: [],
    };

    const result = await importData(importDataPayload as any);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);

    // Title should still be local version
    const meeting = await db.meetings.get(meetingId);
    expect(meeting!.title).toBe('Local Version (newer)');
  });

  it('validateImportData rejects invalid structures', () => {
    expect(validateImportData(null)).toContain('Invalid JSON');
    expect(validateImportData({})).toContain('version');
    expect(validateImportData({ version: '1.0', exportedAt: '2026-01-01' })).toContain('meetings');
    expect(validateImportData({
      version: '1.0',
      exportedAt: '2026-01-01',
      meetings: [{ id: 123 }], // id not a string
      stakeholders: [],
      stakeholderCategories: [],
      transcripts: [],
      meetingAnalyses: [],
    })).toContain('Meeting missing "id"');
  });

  it('export excludes audio blobs (per PRD 13.3)', async () => {
    const meetingId = await meetingRepository.quickCreate();
    const recording = makeAudioRecording(meetingId);
    await db.audioRecordings.add(recording);

    const exported = await exportAllData();
    // audioRecordings table is not in the export
    expect(exported).not.toHaveProperty('audioRecordings');
  });
});

// ============================================================
// CROSS-JOURNEY: Sync Queue Integrity
// ============================================================

describe('Cross-Journey: Sync Queue Integrity', () => {
  it('all CRUD operations enqueue sync entries', async () => {
    // Meeting CRUD
    const meetingId = await meetingRepository.quickCreate();
    await meetingRepository.update(meetingId, { title: 'Sync Test' });
    await meetingRepository.softDelete(meetingId);
    await meetingRepository.restore(meetingId);

    // Stakeholder CRUD
    const shId = await stakeholderRepository.create({ name: 'Sync SH', categoryIds: [] });
    await stakeholderRepository.update(shId, { name: 'Updated SH' });

    // Category CRUD
    const catId = await categoryRepository.create({ name: 'Sync Cat', color: '#ef4444' });
    await categoryRepository.update(catId, { name: 'Updated Cat' });

    // Count sync entries
    const queue = await db.syncQueue.toArray();
    // 4 meeting ops + 2 stakeholder ops + 2 category ops = 8
    expect(queue.length).toBeGreaterThanOrEqual(8);

    // All should be unsynced
    const unsynced = queue.filter(q => q.syncedAt === null);
    expect(unsynced.length).toBe(queue.length);
  });

  it('sync queue items have correct entity types', async () => {
    await meetingRepository.quickCreate();
    await stakeholderRepository.create({ name: 'SH', categoryIds: [] });
    await categoryRepository.create({ name: 'Cat', color: '#f97316' });

    const queue = await db.syncQueue.toArray();
    const entities = new Set(queue.map(q => q.entity));
    expect(entities.has('meeting')).toBe(true);
    expect(entities.has('stakeholder')).toBe(true);
    expect(entities.has('stakeholderCategory')).toBe(true);
  });
});

// ============================================================
// CROSS-JOURNEY: Data Consistency
// ============================================================

describe('Cross-Journey: Data Consistency', () => {
  it('date fields are proper Date objects after DB round-trip', async () => {
    const meetingId = await meetingRepository.quickCreate();
    const meeting = await db.meetings.get(meetingId);
    expect(meeting!.createdAt).toBeInstanceOf(Date);
    expect(meeting!.updatedAt).toBeInstanceOf(Date);
    expect(meeting!.date).toBeInstanceOf(Date);
  });

  it('concurrent operations on same meeting do not corrupt data', async () => {
    const meetingId = await meetingRepository.quickCreate();

    // Run multiple updates concurrently
    await Promise.all([
      meetingRepository.update(meetingId, { title: 'Final Title' }),
      meetingRepository.update(meetingId, { tags: ['tag1', 'tag2'] }),
      meetingRepository.update(meetingId, { participants: ['Alice'] }),
    ]);

    const meeting = await db.meetings.get(meetingId);
    // At least one of the updates should have persisted
    expect(meeting).toBeTruthy();
    // The last-write-wins means the final state includes the last update
    // Just verify no corruption
    expect(meeting!.id).toBe(meetingId);
    expect(Array.isArray(meeting!.tags)).toBe(true);
    expect(Array.isArray(meeting!.participants)).toBe(true);
  });

  it('getAll returns only non-deleted items across all repos', async () => {
    const m1 = await meetingRepository.quickCreate();
    const m2 = await meetingRepository.quickCreate();
    await meetingRepository.softDelete(m1);

    const s1 = await stakeholderRepository.create({ name: 'Active', categoryIds: [] });
    const s2 = await stakeholderRepository.create({ name: 'Deleted', categoryIds: [] });
    await stakeholderRepository.softDelete(s2);

    const c1 = await categoryRepository.create({ name: 'Active', color: '#ef4444' });
    const c2 = await categoryRepository.create({ name: 'Deleted', color: '#3b82f6' });
    await categoryRepository.softDelete(c2);

    const meetings = await meetingRepository.getAll();
    expect(meetings).toHaveLength(1);
    expect(meetings[0].id).toBe(m2);

    const stakeholders = await stakeholderRepository.getAll();
    expect(stakeholders).toHaveLength(1);
    expect(stakeholders[0].id).toBe(s1);

    const categories = await categoryRepository.getAll();
    expect(categories).toHaveLength(1);
    expect(categories[0].id).toBe(c1);
  });
});
