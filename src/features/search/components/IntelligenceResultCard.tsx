import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import type { IntelligenceResult } from '../../../services/meetingIntelligenceService';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  'in-progress': 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

const REASON_STYLES: Record<string, string> = {
  Participant: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Stakeholder: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Mentioned: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  Topic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Mentions: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  Keyword: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Tag: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Date: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

function getReasonStyle(reason: string): string {
  const prefix = reason.split(':')[0];
  return REASON_STYLES[prefix] || REASON_STYLES.Keyword;
}

interface IntelligenceResultCardProps {
  result: IntelligenceResult;
}

export default function IntelligenceResultCard({ result }: IntelligenceResultCardProps) {
  const { meeting, matchReasons, relevanceScore } = result;

  return (
    <Link
      to={`/meetings/${meeting.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {meeting.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar size={12} />
            <span>{meeting.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[meeting.status] ?? STATUS_STYLES.draft}`}>
              {meeting.status}
            </span>
          </div>
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          {relevanceScore}
        </div>
      </div>

      {/* Match reason pills */}
      <div className="mt-2 flex flex-wrap gap-1">
        {matchReasons.map((reason, i) => (
          <span
            key={i}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getReasonStyle(reason)}`}
          >
            {reason}
          </span>
        ))}
      </div>
    </Link>
  );
}
