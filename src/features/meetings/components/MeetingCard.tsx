import { useNavigate } from 'react-router-dom';
import { Calendar, Users, Check } from 'lucide-react';
import type { Meeting, StakeholderCategory } from '../../../db/database';

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'in-progress': 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

const statusBorderColor: Record<string, string> = {
  draft: 'border-l-gray-300 dark:border-l-gray-600',
  'in-progress': 'border-l-brand-500 dark:border-l-brand-400',
  completed: 'border-l-green-500 dark:border-l-green-400',
};

interface MeetingCardProps {
  meeting: Meeting;
  categories: StakeholderCategory[];
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  index?: number;
}

export default function MeetingCard({
  meeting,
  categories,
  selectionMode = false,
  selected = false,
  onSelect,
  index = 0,
}: MeetingCardProps) {
  const navigate = useNavigate();

  function handleClick() {
    if (selectionMode && onSelect) {
      onSelect(meeting.id);
    } else {
      navigate(`/meetings/${meeting.id}`);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`animate-card-entrance relative flex w-full flex-col gap-2 rounded-xl border-l-4 border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 ${
        statusBorderColor[meeting.status]
      } ${
        selected
          ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900'
          : ''
      }`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute right-3 top-3">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
              selected
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {selected && <Check size={12} strokeWidth={3} />}
          </div>
        </div>
      )}

      <h3 className="truncate pr-6 font-medium text-gray-900 dark:text-gray-100">
        {meeting.title}
      </h3>

      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <Calendar size={14} />
        <span>
          {meeting.date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[meeting.status]}`}
        >
          {statusLabels[meeting.status]}
        </span>

        {categories.map((cat) => (
          <span
            key={cat.id}
            className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: cat.color }}
          >
            {cat.name}
          </span>
        ))}

        {meeting.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            {tag}
          </span>
        ))}
      </div>

      {meeting.participants.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <Users size={14} />
          <span>
            {meeting.participants.length} participant
            {meeting.participants.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </button>
  );
}
