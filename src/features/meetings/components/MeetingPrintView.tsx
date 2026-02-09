import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/database';
import type {
  Meeting,
  Stakeholder,
  StakeholderCategory,
  Transcript,
} from '../../../db/database';
import { tiptapJsonToPlainText } from '../../../services/tiptapUtils';

interface MeetingPrintViewProps {
  meeting: Meeting;
}

export default function MeetingPrintView({ meeting }: MeetingPrintViewProps) {
  const stakeholders = useLiveQuery(
    () =>
      db.stakeholders
        .filter(
          (s) =>
            s.deletedAt === null &&
            meeting.stakeholderIds.includes(s.id),
        )
        .toArray(),
    [meeting.stakeholderIds],
  );

  const categories = useLiveQuery(() =>
    db.stakeholderCategories.filter((c) => c.deletedAt === null).toArray(),
  );

  const transcripts = useLiveQuery(
    () =>
      db.transcripts
        .filter(
          (t) => t.meetingId === meeting.id && t.deletedAt === null,
        )
        .sortBy('createdAt'),
    [meeting.id],
  );

  const analyses = useLiveQuery(
    () =>
      db.meetingAnalyses
        .filter(
          (a) => a.meetingId === meeting.id && a.deletedAt === null,
        )
        .sortBy('createdAt')
        .then((arr) => arr.reverse()),
    [meeting.id],
  );

  const categoryMap = new Map(
    (categories ?? []).map((c) => [c.id, c]),
  );

  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    'in-progress': 'In Progress',
    completed: 'Completed',
  };

  const notesText = tiptapJsonToPlainText(meeting.notes);
  const latestAnalysis = analyses?.[0];

  return (
    <div className="print-view hidden">
      {/* Title & Meta */}
      <h1>{meeting.title}</h1>
      <p className="print-meta">
        Date:{' '}
        {meeting.date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
      <p className="print-meta">Status: {statusLabels[meeting.status]}</p>

      {/* Stakeholders */}
      {(stakeholders ?? []).length > 0 && (
        <div className="print-section">
          <p className="print-meta">
            Stakeholders:{' '}
            {(stakeholders ?? []).map((s: Stakeholder) => {
              const cats = s.categoryIds
                .map((id) => categoryMap.get(id))
                .filter((c): c is StakeholderCategory => !!c);
              return `${s.name}${cats.length ? ` (${cats.map((c) => c.name).join(', ')})` : ''}`;
            }).join('; ')}
          </p>
        </div>
      )}

      {/* Participants */}
      {meeting.participants.length > 0 && (
        <p className="print-meta">
          Participants: {meeting.participants.join(', ')}
        </p>
      )}

      {/* Tags */}
      {meeting.tags.length > 0 && (
        <p className="print-meta">Tags: {meeting.tags.join(', ')}</p>
      )}

      {/* Notes */}
      {notesText && (
        <div className="print-section">
          <h2>Notes</h2>
          <div style={{ whiteSpace: 'pre-wrap' }}>{notesText}</div>
        </div>
      )}

      {/* Transcripts */}
      {(transcripts ?? []).length > 0 && (
        <div className="print-section print-page-break">
          <h2>Transcript</h2>
          {(transcripts ?? []).map((t: Transcript, idx: number) => (
            <div key={t.id}>
              {(transcripts ?? []).length > 1 && (
                <h3>Recording {idx + 1}</h3>
              )}
              {t.utterances.map((u, ui) => (
                <p key={ui} className="print-utterance">
                  <span className="print-speaker">
                    {t.speakerMap[u.speaker] || `Speaker ${u.speaker}`}:
                  </span>{' '}
                  {u.text}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Analysis */}
      {latestAnalysis && (
        <div className="print-section print-page-break">
          <h2>AI Analysis</h2>

          <div className="print-section">
            <h3>Summary</h3>
            <p>{latestAnalysis.summary}</p>
          </div>

          {latestAnalysis.themes.length > 0 && (
            <div className="print-section">
              <h3>Themes</h3>
              {latestAnalysis.themes.map((theme, i) => (
                <div key={i} className="print-list-item">
                  <strong>{theme.topic}</strong>
                  <br />
                  {theme.keyPoints.map((kp, ki) => (
                    <span key={ki}>
                      - {kp}
                      <br />
                    </span>
                  ))}
                  {theme.context && (
                    <em>Context: {theme.context}</em>
                  )}
                </div>
              ))}
            </div>
          )}

          {latestAnalysis.decisions.length > 0 && (
            <div className="print-section">
              <h3>Decisions</h3>
              {latestAnalysis.decisions.map((d, i) => (
                <div key={i} className="print-list-item">
                  <strong>{d.decision}</strong>
                  {d.madeBy && <> (by {d.madeBy})</>}
                  <br />
                  {d.rationale && <>Rationale: {d.rationale}<br /></>}
                  {d.implications && <>Implications: {d.implications}</>}
                </div>
              ))}
            </div>
          )}

          {latestAnalysis.actionItems.length > 0 && (
            <div className="print-section">
              <h3>Action Items</h3>
              {latestAnalysis.actionItems.map((ai, i) => (
                <div key={i} className="print-list-item">
                  <strong>{ai.task}</strong> [{ai.priority}]
                  <br />
                  Owner: {ai.owner}
                  {ai.deadline && <> | Deadline: {ai.deadline}</>}
                  {ai.context && <><br />Context: {ai.context}</>}
                </div>
              ))}
            </div>
          )}

          {latestAnalysis.openItems.length > 0 && (
            <div className="print-section">
              <h3>Open Items</h3>
              {latestAnalysis.openItems.map((oi, i) => (
                <div key={i} className="print-list-item">
                  <strong>[{oi.type}]</strong> {oi.item}
                  <br />
                  Owner: {oi.owner}
                  {oi.urgency && <> | Urgency: {oi.urgency}</>}
                </div>
              ))}
            </div>
          )}

          {latestAnalysis.nextSteps && (
            <div className="print-section">
              <h3>Next Steps</h3>
              <p>{latestAnalysis.nextSteps}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
