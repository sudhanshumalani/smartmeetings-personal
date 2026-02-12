import { db } from '../db/database';
import type { Meeting, MeetingAnalysis, Transcript, Stakeholder } from '../db/database';
import { claudeService } from './claudeService';

export interface IntelligenceResult {
  meeting: Meeting;
  matchReasons: string[];
  relevanceScore: number;
}

export class MeetingIntelligenceService {
  async executeQuery(query: string): Promise<IntelligenceResult[]> {
    // 1. Parse query into structured filters
    await claudeService.initialize();
    const filters = await claudeService.parseNaturalLanguageQuery(query);

    // 2. Load all non-deleted meetings
    let meetings = await db.meetings.filter(m => m.deletedAt === null).toArray();

    // 3. Filter by date range
    if (filters.dateRange.from) {
      const from = new Date(filters.dateRange.from);
      from.setHours(0, 0, 0, 0);
      meetings = meetings.filter(m => m.date >= from);
    }
    if (filters.dateRange.to) {
      const to = new Date(filters.dateRange.to);
      to.setHours(23, 59, 59, 999);
      meetings = meetings.filter(m => m.date <= to);
    }

    // 4. Filter by status
    if (filters.status) {
      meetings = meetings.filter(m => m.status === filters.status);
    }

    if (meetings.length === 0) return [];

    // 5. Batch load related data
    const meetingIds = meetings.map(m => m.id);
    const analyses = await db.meetingAnalyses
      .where('meetingId')
      .anyOf(meetingIds)
      .filter(a => a.deletedAt === null)
      .toArray();
    const transcripts = await db.transcripts
      .where('meetingId')
      .anyOf(meetingIds)
      .filter(t => t.deletedAt === null)
      .toArray();
    const stakeholders = await db.stakeholders
      .filter(s => s.deletedAt === null)
      .toArray();

    // Build lookup maps
    const analysisMap = new Map<string, MeetingAnalysis[]>();
    for (const a of analyses) {
      const arr = analysisMap.get(a.meetingId) ?? [];
      arr.push(a);
      analysisMap.set(a.meetingId, arr);
    }
    const transcriptMap = new Map<string, Transcript[]>();
    for (const t of transcripts) {
      const arr = transcriptMap.get(t.meetingId) ?? [];
      arr.push(t);
      transcriptMap.set(t.meetingId, arr);
    }
    const stakeholderMap = new Map<string, Stakeholder>();
    for (const s of stakeholders) {
      stakeholderMap.set(s.id, s);
    }

    // 6. Score each meeting
    const results: IntelligenceResult[] = [];

    for (const meeting of meetings) {
      const matchReasons: string[] = [];
      let score = 0;

      const meetingAnalyses = analysisMap.get(meeting.id) ?? [];
      const meetingTranscripts = transcriptMap.get(meeting.id) ?? [];

      // Build searchable text corpus for this meeting
      const corpus = [
        meeting.title,
        meeting.notes,
        ...meeting.participants,
        ...meeting.tags,
        ...meetingTranscripts.map(t => t.fullText),
        ...meetingAnalyses.flatMap(a => [
          a.summary,
          ...a.themes.flatMap(th => [th.topic, ...th.keyPoints]),
          ...a.actionItems.map(ai => ai.task),
          ...a.decisions.map(d => d.decision),
        ]),
      ].join(' ').toLowerCase();

      // Match keywords
      for (const keyword of filters.keywords) {
        if (corpus.includes(keyword.toLowerCase())) {
          matchReasons.push(`Keyword: ${keyword}`);
          score += 2;
        }
      }

      // Match topics
      for (const topic of filters.topics) {
        const lowerTopic = topic.toLowerCase();
        // Check analysis themes specifically (higher value match)
        const themeMatch = meetingAnalyses.some(a =>
          a.themes.some(th =>
            th.topic.toLowerCase().includes(lowerTopic) ||
            th.keyPoints.some(kp => kp.toLowerCase().includes(lowerTopic))
          )
        );
        if (themeMatch) {
          matchReasons.push(`Topic: ${topic}`);
          score += 3;
        } else if (corpus.includes(lowerTopic)) {
          matchReasons.push(`Mentions: ${topic}`);
          score += 1;
        }
      }

      // Match participants
      for (const participant of filters.participants) {
        const lowerParticipant = participant.toLowerCase();
        if (meeting.participants.some(p => p.toLowerCase().includes(lowerParticipant))) {
          matchReasons.push(`Participant: ${participant}`);
          score += 3;
        } else if (corpus.includes(lowerParticipant)) {
          matchReasons.push(`Mentioned: ${participant}`);
          score += 1;
        }
      }

      // Match stakeholders
      for (const name of filters.stakeholders) {
        const lowerName = name.toLowerCase();
        const matchedStakeholder = meeting.stakeholderIds.some(sid => {
          const s = stakeholderMap.get(sid);
          return s?.name.toLowerCase().includes(lowerName);
        });
        if (matchedStakeholder) {
          matchReasons.push(`Stakeholder: ${name}`);
          score += 3;
        }
      }

      // Match tags
      for (const tag of filters.tags) {
        if (meeting.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))) {
          matchReasons.push(`Tag: ${tag}`);
          score += 2;
        }
      }

      // Date range match is implicit (already filtered), but add a reason
      if (filters.dateRange.from || filters.dateRange.to) {
        matchReasons.push(`Date: ${meeting.date.toLocaleDateString()}`);
        score += 1;
      }

      // Only include meetings with at least one match
      if (score > 0) {
        results.push({ meeting, matchReasons, relevanceScore: score });
      }
    }

    // 7. Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
  }
}

export const meetingIntelligenceService = new MeetingIntelligenceService();
