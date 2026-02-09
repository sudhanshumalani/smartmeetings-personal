import { useNavigate } from 'react-router-dom';
import { Calendar, Users } from 'lucide-react';
import type { Meeting, StakeholderCategory } from '../../../db/database';

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'in-progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

interface MeetingCardProps {
  meeting: Meeting;
  categories: StakeholderCategory[];
}

export default function MeetingCard({ meeting, categories }: MeetingCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/meetings/${meeting.id}`)}
      className="flex w-full flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <h3 className="truncate font-medium text-gray-900 dark:text-gray-100">
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
