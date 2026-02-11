import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../db/database';
import type { MeetingAnalysis } from '../../db/database';
import {
  ClaudeService,
  ANALYSIS_PROMPT,
  prepareAnalysisText,
  formatUtterancesAsText,
} from '../claudeService';
import { tiptapJsonToPlainText } from '../tiptapUtils';

// --- Mock settingsService ---
vi.mock('../settingsService', () => ({
  getClaudeApiKey: vi.fn().mockResolvedValue('test-claude-key'),
  getAssemblyAiApiKey: vi.fn().mockResolvedValue(''),
}));

// --- Mock Anthropic SDK ---
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  // Must use function() constructor, not arrow, so `new Anthropic()` works
  function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }
  return { default: MockAnthropic };
});

// --- Valid analysis result fixture ---
const VALID_RESULT = {
  summary: 'Meeting discussed product launch timeline and budget allocation.',
  themes: [
    {
      topic: 'Product Launch',
      keyPoints: ['Launch date set for March 15', 'Marketing budget approved'],
      context: 'Q1 planning discussion',
    },
  ],
  decisions: [
    {
      decision: 'Launch on March 15',
      madeBy: 'Product team',
      rationale: 'Aligns with Q1 goals',
      implications: 'Need to freeze features by Feb 28',
    },
  ],
  actionItems: [
    {
      task: 'Prepare marketing materials',
      owner: 'Sarah',
      deadline: 'Feb 20',
      priority: 'high',
      context: 'Needed for pre-launch campaign',
    },
  ],
  openItems: [
    {
      item: 'Budget for paid ads?',
      type: 'question',
      owner: 'Finance',
      urgency: 'This week',
    },
  ],
  nextSteps: 'Sarah to deliver marketing materials by Feb 20. Team reconvenes Friday.',
};

// --- Tests ---

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    service = new ClaudeService();
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('loads the API key from settings and creates client', async () => {
      await service.initialize();
      expect(service.isInitialized()).toBe(true);
    });

    it('throws if API key is not configured', async () => {
      const { getClaudeApiKey } = await import('../settingsService');
      (getClaudeApiKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce('');

      await expect(service.initialize()).rejects.toThrow('API key not configured');
    });
  });

  describe('prompt construction', () => {
    it('contains the ${text} placeholder in the template', () => {
      expect(ANALYSIS_PROMPT).toContain('${text}');
    });

    it('buildPromptForCopyPaste injects text into template', () => {
      const text = 'Speaker A: Hello everyone.\nSpeaker B: Thanks for coming.';
      const prompt = service.buildPromptForCopyPaste(text);

      expect(prompt).toContain('Speaker A: Hello everyone.');
      expect(prompt).toContain('Speaker B: Thanks for coming.');
      expect(prompt).not.toContain('${text}');
      expect(prompt).toContain('Return ONLY valid JSON');
    });

    it('text is injected correctly between the triple-quote delimiters', () => {
      const text = 'Test meeting content here';
      const prompt = service.buildPromptForCopyPaste(text);

      // Verify text appears between """ delimiters
      const parts = prompt.split('"""');
      expect(parts.length).toBe(3); // before, content, after
      expect(parts[1]).toContain('Test meeting content here');
    });
  });

  describe('analyze (API call)', () => {
    it('throws if client not initialized', async () => {
      await expect(service.analyze('test text')).rejects.toThrow('API key not configured');
    });

    it('parses valid JSON response from API', async () => {
      await service.initialize();

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_RESULT) }],
      });

      const result = await service.analyze('Meeting content here');

      expect(result.summary).toBe(VALID_RESULT.summary);
      expect(result.themes).toHaveLength(1);
      expect(result.decisions).toHaveLength(1);
      expect(result.actionItems).toHaveLength(1);
      expect(result.openItems).toHaveLength(1);
      expect(result.nextSteps).toBe(VALID_RESULT.nextSteps);
    });

    it('strips markdown code fences from response', async () => {
      await service.initialize();

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n' + JSON.stringify(VALID_RESULT) + '\n```' }],
      });

      const result = await service.analyze('Meeting content');
      expect(result.summary).toBe(VALID_RESULT.summary);
    });

    it('throws on malformed JSON from API', async () => {
      await service.initialize();

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This is not JSON at all' }],
      });

      await expect(service.analyze('test')).rejects.toThrow('Failed to parse API response as JSON');
    });

    it('throws on non-text response type', async () => {
      await service.initialize();

      mockCreate.mockResolvedValue({
        content: [{ type: 'image', source: {} }],
      });

      await expect(service.analyze('test')).rejects.toThrow('Unexpected response format');
    });

    it('calls Anthropic SDK with correct model and parameters', async () => {
      await service.initialize();

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(VALID_RESULT) }],
      });

      await service.analyze('Meeting content');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{ role: 'user', content: expect.stringContaining('Meeting content') }],
        }),
      );
    });
  });

  describe('parseManualResult', () => {
    it('parses valid JSON string', () => {
      const result = service.parseManualResult(JSON.stringify(VALID_RESULT));
      expect(result.summary).toBe(VALID_RESULT.summary);
      expect(result.themes).toHaveLength(1);
    });

    it('throws descriptive error for invalid JSON syntax', () => {
      expect(() => service.parseManualResult('not json')).toThrow('Invalid JSON');
    });

    it('throws for missing summary field', () => {
      const incomplete = { ...VALID_RESULT, summary: undefined };
      expect(() => service.parseManualResult(JSON.stringify(incomplete))).toThrow(
        'missing required field "summary"',
      );
    });

    it('throws for missing themes field', () => {
      const incomplete = { ...VALID_RESULT, themes: undefined };
      expect(() => service.parseManualResult(JSON.stringify(incomplete))).toThrow(
        'missing required field "themes"',
      );
    });

    it('throws for missing actionItems field', () => {
      const incomplete = { ...VALID_RESULT, actionItems: undefined };
      expect(() => service.parseManualResult(JSON.stringify(incomplete))).toThrow(
        'missing required field "actionItems"',
      );
    });

    it('throws for missing decisions field', () => {
      const incomplete = { ...VALID_RESULT, decisions: undefined };
      expect(() => service.parseManualResult(JSON.stringify(incomplete))).toThrow(
        'missing required field "decisions"',
      );
    });

    it('throws for missing openItems field', () => {
      const incomplete = { ...VALID_RESULT, openItems: undefined };
      expect(() => service.parseManualResult(JSON.stringify(incomplete))).toThrow(
        'missing required field "openItems"',
      );
    });

    it('throws for missing nextSteps field', () => {
      const incomplete = { ...VALID_RESULT, nextSteps: undefined };
      expect(() => service.parseManualResult(JSON.stringify(incomplete))).toThrow(
        'missing required field "nextSteps"',
      );
    });

    it('rejects non-object JSON (string)', () => {
      expect(() => service.parseManualResult('"just a string"')).toThrow(
        'expected a JSON object',
      );
    });

    it('rejects null JSON', () => {
      expect(() => service.parseManualResult('null')).toThrow('expected a JSON object');
    });
  });

  describe('formatUtterancesAsText', () => {
    it('formats utterances with speaker labels', () => {
      const utterances = [
        { speaker: 'A', text: 'Hello everyone.', start: 0, end: 2000, confidence: 0.95 },
        { speaker: 'B', text: 'Thanks for joining.', start: 2500, end: 4000, confidence: 0.92 },
      ];
      const result = formatUtterancesAsText(utterances, {});

      expect(result).toBe('Speaker A: Hello everyone.\nSpeaker B: Thanks for joining.');
    });

    it('uses speakerMap names when available', () => {
      const utterances = [
        { speaker: 'A', text: 'Hello.', start: 0, end: 1000, confidence: 0.95 },
        { speaker: 'B', text: 'Hi.', start: 1500, end: 2000, confidence: 0.92 },
      ];
      const speakerMap = { A: 'Sudhanshu', B: 'John' };
      const result = formatUtterancesAsText(utterances, speakerMap);

      expect(result).toBe('Sudhanshu: Hello.\nJohn: Hi.');
    });

    it('falls back to Speaker X for unmapped speakers', () => {
      const utterances = [
        { speaker: 'C', text: 'Hello.', start: 0, end: 1000, confidence: 0.95 },
      ];
      const speakerMap = { A: 'Alice' }; // C not mapped
      const result = formatUtterancesAsText(utterances, speakerMap);

      expect(result).toBe('Speaker C: Hello.');
    });
  });

  describe('prepareAnalysisText', () => {
    it('returns empty string when no transcripts and no notes', async () => {
      const result = await prepareAnalysisText('meeting-1', '');
      expect(result).toBe('');
    });

    it('returns notes only when no transcripts exist', async () => {
      const result = await prepareAnalysisText('meeting-1', 'These are my meeting notes.');
      expect(result).toBe('These are my meeting notes.');
    });

    it('returns transcript text when transcripts exist and no notes', async () => {
      // Create a transcript
      await db.transcripts.add({
        id: 'transcript-1',
        meetingId: 'meeting-1',
        audioRecordingId: 'rec-1',
        assemblyaiTranscriptId: 'aai-1',
        utterances: [
          { speaker: 'A', text: 'Hello.', start: 0, end: 1000, confidence: 0.95 },
          { speaker: 'B', text: 'Hi there.', start: 1500, end: 3000, confidence: 0.92 },
        ],
        fullText: 'Hello. Hi there.',
        speakerMap: { A: 'Alice', B: 'Bob' },
        audioDuration: 3,
        overallConfidence: 0.935,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await prepareAnalysisText('meeting-1', '');

      expect(result).toBe('Alice: Hello.\nBob: Hi there.');
    });

    it('merges transcripts first, separator, then notes when both exist', async () => {
      await db.transcripts.add({
        id: 'transcript-1',
        meetingId: 'meeting-2',
        audioRecordingId: 'rec-1',
        assemblyaiTranscriptId: 'aai-1',
        utterances: [
          { speaker: 'A', text: 'Welcome.', start: 0, end: 1000, confidence: 0.95 },
        ],
        fullText: 'Welcome.',
        speakerMap: {},
        audioDuration: 1,
        overallConfidence: 0.95,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await prepareAnalysisText('meeting-2', 'Additional notes here.');

      expect(result).toContain('[Transcript]');
      expect(result).toContain('Speaker A: Welcome.');
      expect(result).toContain('---');
      expect(result).toContain('[Notes]');
      expect(result).toContain('Additional notes here.');

      // Verify order: transcript before notes
      const transcriptIdx = result.indexOf('[Transcript]');
      const notesIdx = result.indexOf('[Notes]');
      expect(transcriptIdx).toBeLessThan(notesIdx);
    });

    it('excludes soft-deleted transcripts', async () => {
      await db.transcripts.add({
        id: 'transcript-deleted',
        meetingId: 'meeting-3',
        audioRecordingId: 'rec-1',
        assemblyaiTranscriptId: 'aai-1',
        utterances: [
          { speaker: 'A', text: 'This should not appear.', start: 0, end: 1000, confidence: 0.95 },
        ],
        fullText: 'This should not appear.',
        speakerMap: {},
        audioDuration: 1,
        overallConfidence: 0.95,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(), // Soft-deleted!
      });

      const result = await prepareAnalysisText('meeting-3', '');
      expect(result).toBe('');
    });

    it('merges multiple transcripts chronologically by utterance start time', async () => {
      // First transcript (recorded later, but utterances at start=5000)
      await db.transcripts.add({
        id: 'transcript-2',
        meetingId: 'meeting-4',
        audioRecordingId: 'rec-2',
        assemblyaiTranscriptId: 'aai-2',
        utterances: [
          { speaker: 'B', text: 'Second part.', start: 5000, end: 7000, confidence: 0.9 },
        ],
        fullText: 'Second part.',
        speakerMap: { B: 'Bob' },
        audioDuration: 2,
        overallConfidence: 0.9,
        createdAt: new Date(2026, 0, 2),
        updatedAt: new Date(2026, 0, 2),
        deletedAt: null,
      });

      // Second transcript (recorded first, but utterances at start=0)
      await db.transcripts.add({
        id: 'transcript-1',
        meetingId: 'meeting-4',
        audioRecordingId: 'rec-1',
        assemblyaiTranscriptId: 'aai-1',
        utterances: [
          { speaker: 'A', text: 'First part.', start: 0, end: 2000, confidence: 0.95 },
        ],
        fullText: 'First part.',
        speakerMap: { A: 'Alice' },
        audioDuration: 2,
        overallConfidence: 0.95,
        createdAt: new Date(2026, 0, 1),
        updatedAt: new Date(2026, 0, 1),
        deletedAt: null,
      });

      const result = await prepareAnalysisText('meeting-4', '');

      // Should be sorted by start time, not by creation order
      const lines = result.split('\n');
      expect(lines[0]).toBe('Alice: First part.');
      expect(lines[1]).toBe('Bob: Second part.');
    });
  });

  describe('tiptapJsonToPlainText', () => {
    it('converts TipTap JSON to plain text', () => {
      const tiptapJson = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph' }],
          },
        ],
      });

      const result = tiptapJsonToPlainText(tiptapJson);
      expect(result).toContain('Hello world');
      expect(result).toContain('Second paragraph');
    });

    it('returns empty string for empty notes', () => {
      expect(tiptapJsonToPlainText('')).toBe('');
    });

    it('returns the string as-is if not valid JSON', () => {
      expect(tiptapJsonToPlainText('plain text notes')).toBe('plain text notes');
    });

    it('handles headings and lists', () => {
      const tiptapJson = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Meeting Title' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Item one' }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const result = tiptapJsonToPlainText(tiptapJson);
      expect(result).toContain('Meeting Title');
      expect(result).toContain('Item one');
    });
  });

  describe('re-analysis (Dexie integration)', () => {
    it('old analysis is soft-deleted when new one is created', async () => {
      // Create an initial analysis
      const oldAnalysis: MeetingAnalysis = {
        id: 'analysis-old',
        meetingId: 'meeting-reanalysis',
        summary: 'Old summary',
        themes: [],
        decisions: [],
        actionItems: [],
        openItems: [],
        nextSteps: 'Old next steps',
        sourceType: 'api',
        inputText: 'Old input',
        createdAt: new Date(2026, 0, 1),
        deletedAt: null,
      };
      await db.meetingAnalyses.add(oldAnalysis);

      // Verify it exists
      const before = await db.meetingAnalyses.get('analysis-old');
      expect(before!.deletedAt).toBeNull();

      // Soft-delete old and create new (simulating what AnalysisTab.saveAnalysis does)
      const existing = await db.meetingAnalyses
        .where('meetingId')
        .equals('meeting-reanalysis')
        .filter((a) => a.deletedAt === null)
        .toArray();

      for (const old of existing) {
        await db.meetingAnalyses.update(old.id, { deletedAt: new Date() });
      }

      const newAnalysis: MeetingAnalysis = {
        id: 'analysis-new',
        meetingId: 'meeting-reanalysis',
        summary: 'New summary',
        themes: [{ topic: 'New topic', keyPoints: ['Point 1'], context: 'Context' }],
        decisions: [],
        actionItems: [],
        openItems: [],
        nextSteps: 'New next steps',
        sourceType: 'manual',
        inputText: 'New input',
        createdAt: new Date(2026, 0, 2),
        deletedAt: null,
      };
      await db.meetingAnalyses.add(newAnalysis);

      // Verify old is soft-deleted
      const afterOld = await db.meetingAnalyses.get('analysis-old');
      expect(afterOld!.deletedAt).not.toBeNull();

      // Verify new exists and is active
      const afterNew = await db.meetingAnalyses.get('analysis-new');
      expect(afterNew!.deletedAt).toBeNull();
      expect(afterNew!.summary).toBe('New summary');

      // Verify only one active analysis
      const active = await db.meetingAnalyses
        .where('meetingId')
        .equals('meeting-reanalysis')
        .filter((a) => a.deletedAt === null)
        .toArray();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('analysis-new');
    });
  });
});
