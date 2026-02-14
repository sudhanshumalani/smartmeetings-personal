import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/database';
import type {
  TranscriptUtterance,
  SpeakerMap,
} from '../db/database';
import { getClaudeApiKey } from './settingsService';

// --- Types ---

export interface IntelligenceQuery {
  dateRange: { from: string | null; to: string | null };
  stakeholders: string[];
  keywords: string[];
  topics: string[];
  participants: string[];
  status: string | null;
  tags: string[];
}

export interface AnalysisResult {
  summary: string;
  themes: { topic: string; keyPoints: string[]; context: string }[];
  decisions: { decision: string; madeBy: string; rationale: string; implications: string }[];
  actionItems: { task: string; owner: string; deadline: string; priority: string; context: string }[];
  openItems: { item: string; type: string; owner: string; urgency: string }[];
  nextSteps: string;
}

// --- Prompt Template (PRD 8.1 verbatim) ---

const ANALYSIS_PROMPT = `You are an expert meeting notes assistant. Create comprehensive, thematically-organized notes capturing ALL important information.

**Meeting Content:**
"""
\${text}
"""

**Instructions:** Return a JSON object with these fields:

{
  "summary": "3-4 sentences: (1) Meeting purpose, (2) Key outcomes, (3) Most important decision/insight, (4) Critical next step",

  "themes": [
    {
      "topic": "Descriptive topic name",
      "keyPoints": [
        "Detailed point - WHO said it, WHAT was discussed, WHY it matters",
        "Include quotes, numbers, dates, percentages when mentioned",
        "Capture concerns and reasoning behind them"
      ],
      "context": "Why this topic was discussed"
    }
  ],

  "decisions": [
    {"decision": "What was decided", "madeBy": "Who decided", "rationale": "Why", "implications": "What it means"}
  ],

  "actionItems": [
    {"task": "Specific task", "owner": "Name or TBD", "deadline": "Date or TBD", "priority": "high/medium/low", "context": "Why it matters"}
  ],

  "openItems": [
    {"item": "Question or concern", "type": "question/blocker/risk", "owner": "Who addresses it", "urgency": "How soon"}
  ],

  "nextSteps": "2-3 sentences on immediate actions and when team reconnects"
}

**Critical rules:**
- Be CONCISE. Each keyPoint should be 1 sentence. Each theme should have 3-5 keyPoints max.
- Limit to 5-8 themes. Merge related topics.
- Include specific names, numbers, dates when mentioned.
- Skip filler, small talk, and off-topic conversation.

Return ONLY valid JSON, no markdown code blocks.`;

// --- Text Preparation (PRD 8.2) ---

function formatUtterancesAsText(
  utterances: TranscriptUtterance[],
  speakerMap: SpeakerMap,
): string {
  return utterances
    .map((u) => {
      const name = speakerMap[u.speaker] || `Speaker ${u.speaker}`;
      return `${name}: ${u.text}`;
    })
    .join('\n');
}

/**
 * Prepare the text input for analysis from transcripts and/or notes.
 * Per PRD 8.2:
 * - Transcripts only: merged utterances with speaker labels
 * - Notes only: plain text from TipTap content
 * - Both: transcripts first, separator, then notes
 */
export async function prepareAnalysisText(
  meetingId: string,
  notesPlainText: string,
): Promise<string> {
  // Load all non-deleted transcripts for this meeting
  const transcripts = await db.transcripts
    .where('meetingId')
    .equals(meetingId)
    .filter((t) => t.deletedAt === null)
    .sortBy('createdAt');

  const hasTranscripts = transcripts.length > 0;
  const hasNotes = notesPlainText.trim().length > 0;

  if (!hasTranscripts && !hasNotes) {
    return '';
  }

  // Merge all transcript utterances chronologically
  let transcriptText = '';
  if (hasTranscripts) {
    const allUtterances: { utterance: TranscriptUtterance; speakerMap: SpeakerMap }[] = [];
    for (const t of transcripts) {
      for (const u of t.utterances) {
        allUtterances.push({ utterance: u, speakerMap: t.speakerMap });
      }
    }
    // Sort by start time
    allUtterances.sort((a, b) => a.utterance.start - b.utterance.start);

    transcriptText = allUtterances
      .map(({ utterance, speakerMap }) => {
        const name = speakerMap[utterance.speaker] || `Speaker ${utterance.speaker}`;
        return `${name}: ${utterance.text}`;
      })
      .join('\n');
  }

  let result: string;
  if (hasTranscripts && hasNotes) {
    result = `[Transcript]\n${transcriptText}\n\n---\n\n[Notes]\n${notesPlainText.trim()}`;
  } else if (hasTranscripts) {
    result = transcriptText;
  } else {
    result = notesPlainText.trim();
  }

  // Cap input at ~400,000 chars (~100,000 tokens) — Claude supports up to 200K tokens
  const MAX_INPUT_CHARS = 400_000;
  if (result.length > MAX_INPUT_CHARS) {
    result = result.slice(0, MAX_INPUT_CHARS) + '\n\n[Content truncated for length]';
  }

  return result;
}

// --- Service ---

export class ClaudeService {
  private client: Anthropic | null = null;

  /** Load the API key from encrypted Dexie storage and create the Anthropic client. */
  async initialize(): Promise<void> {
    const key = await getClaudeApiKey();
    if (!key) {
      throw new Error('Claude API key not configured. Set it in Settings.');
    }
    this.client = new Anthropic({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
  }

  isInitialized(): boolean {
    return this.client !== null;
  }

  /** Analyze meeting text via the Claude API. Returns parsed AnalysisResult. */
  async analyze(text: string, promptContent?: string): Promise<AnalysisResult> {
    if (!this.client) {
      throw new Error('Claude API key not configured');
    }

    const template = promptContent || ANALYSIS_PROMPT;
    const prompt = template.replace('${text}', text);

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 12288,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    // Detect truncated response (hit max_tokens limit)
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        'Analysis response was too long and got cut off. Try with a shorter meeting or fewer notes.',
      );
    }

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format');
    }

    // Strip any accidental markdown code fences
    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    return this.parseAndValidate(jsonText);
  }

  /** Parse a natural language query into structured filters for meeting search. */
  async parseNaturalLanguageQuery(query: string): Promise<IntelligenceQuery> {
    if (!this.client) {
      throw new Error('Claude API key not configured');
    }

    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = `You are a query parser for a meeting notes app. Today's date is ${today}.

Extract structured filters from the user's natural language query. Return a JSON object:
{
  "dateRange": { "from": "YYYY-MM-DD" or null, "to": "YYYY-MM-DD" or null },
  "stakeholders": ["name1", ...],
  "keywords": ["keyword1", ...],
  "topics": ["topic1", ...],
  "participants": ["name1", ...],
  "status": "draft" | "in-progress" | "completed" | null,
  "tags": ["tag1", ...]
}

Rules:
- Convert relative dates: "last week" = 7 days ago to today, "last month" = 30 days ago, "yesterday" = yesterday, "this week" = Monday of this week to today
- Put person names in both stakeholders AND participants (the user may not know which field was used)
- Extract topics/subjects as both keywords AND topics for broader matching
- status should only be set if explicitly mentioned (e.g., "completed meetings", "drafts")
- Be generous with keywords — extract any meaningful search terms

Return ONLY valid JSON, no markdown code blocks.`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format');
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Failed to parse query response');
    }

    return {
      dateRange: parsed.dateRange ?? { from: null, to: null },
      stakeholders: Array.isArray(parsed.stakeholders) ? parsed.stakeholders : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      status: parsed.status ?? null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  }

  /** Build the full prompt with meeting text injected — for copy-paste workflow. */
  buildPromptForCopyPaste(text: string, promptContent?: string): string {
    const template = promptContent || ANALYSIS_PROMPT;
    return template.replace('${text}', text);
  }

  /** Parse and validate user-pasted JSON from the copy-paste workflow. */
  parseManualResult(jsonString: string): AnalysisResult {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Invalid JSON: ${message}`);
    }
    return this.validateResult(parsed);
  }

  private parseAndValidate(jsonString: string): AnalysisResult {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to parse API response as JSON: ${message}`);
    }
    return this.validateResult(parsed);
  }

  private validateResult(parsed: any): AnalysisResult {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid analysis format: expected a JSON object');
    }
    if (typeof parsed.summary !== 'string') {
      throw new Error('Invalid analysis format: missing required field "summary"');
    }
    if (!Array.isArray(parsed.themes)) {
      throw new Error('Invalid analysis format: missing required field "themes"');
    }
    if (!Array.isArray(parsed.actionItems)) {
      throw new Error('Invalid analysis format: missing required field "actionItems"');
    }
    if (!Array.isArray(parsed.decisions)) {
      throw new Error('Invalid analysis format: missing required field "decisions"');
    }
    if (!Array.isArray(parsed.openItems)) {
      throw new Error('Invalid analysis format: missing required field "openItems"');
    }
    if (typeof parsed.nextSteps !== 'string') {
      throw new Error('Invalid analysis format: missing required field "nextSteps"');
    }
    return parsed as AnalysisResult;
  }
}

export const claudeService = new ClaudeService();

// Export prompt template for testing
export { ANALYSIS_PROMPT, formatUtterancesAsText };
