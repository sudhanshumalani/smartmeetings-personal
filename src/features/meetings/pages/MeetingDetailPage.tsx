import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Calendar, FileText, Mic, Brain, Download, Printer } from 'lucide-react';
import type { MeetingStatus } from '../../../db/database';
import { meetingRepository } from '../../../services/meetingRepository';
import { tiptapJsonToPlainText } from '../../../services/tiptapUtils';
import { exportMeeting, downloadJson } from '../../../services/exportService';
import { useToast } from '../../../contexts/ToastContext';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import StakeholderPicker from '../components/StakeholderPicker';
import ChipInput from '../components/ChipInput';
import NotesEditor from '../components/NotesEditor';
import AudioTab from '../../audio/components/AudioTab';
import AnalysisTab from '../../analysis/components/AnalysisTab';
import MeetingPrintView from '../components/MeetingPrintView';

type Tab = 'notes' | 'audio' | 'analysis';

const statusSelectStyles: Record<string, string> = {
  draft:
    'border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'in-progress':
    'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  completed:
    'border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
};

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<Tab>('notes');
  const [title, setTitle] = useState('');
  const [titleLoaded, setTitleLoaded] = useState(false);

  // undefined = loading, null = not found, Meeting = found
  const meeting = useLiveQuery(
    async () => {
      if (!id) return null;
      const m = await meetingRepository.getById(id);
      return m ?? null;
    },
    [id],
  );

  const allTags = useLiveQuery(() => meetingRepository.getDistinctTags());

  // Set title from meeting data on first load only
  useEffect(() => {
    if (meeting && !titleLoaded) {
      setTitle(meeting.title);
      setTitleLoaded(true);
    }
  }, [meeting, titleLoaded]);

  // If on mobile and current tab isn't available, reset
  useEffect(() => {
    if (isMobile && activeTab === 'analysis') {
      setActiveTab('notes');
    }
  }, [isMobile, activeTab]);

  async function handleTitleBlur() {
    if (!id || !meeting) return;
    const trimmed = title.trim();
    if (trimmed && trimmed !== meeting.title) {
      await meetingRepository.update(id, { title: trimmed });
    } else if (!trimmed) {
      setTitle(meeting.title);
    }
  }

  async function handleStatusChange(status: MeetingStatus) {
    if (!id) return;
    await meetingRepository.update(id, { status });
  }

  async function handleStakeholderChange(stakeholderIds: string[]) {
    if (!id) return;
    await meetingRepository.update(id, { stakeholderIds });
  }

  async function handleParticipantsChange(participants: string[]) {
    if (!id) return;
    await meetingRepository.update(id, { participants });
  }

  async function handleTagsChange(tags: string[]) {
    if (!id) return;
    await meetingRepository.update(id, { tags });
  }

  async function handleExportJson() {
    if (!id) return;
    try {
      const data = await exportMeeting(id);
      downloadJson(data, `meeting-${id.slice(0, 8)}.json`);
      addToast('Meeting exported', 'success');
    } catch {
      addToast('Failed to export meeting', 'error');
    }
  }

  function handlePrint() {
    window.print();
  }

  if (!id) return null;

  // Loading
  if (meeting === undefined) {
    return (
      <div className="py-16 text-center text-gray-400">Loading...</div>
    );
  }

  // Not found
  if (meeting === null) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Meeting not found
        </h2>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = isMobile
    ? [
        { key: 'notes', label: 'Notes', icon: FileText },
        { key: 'audio', label: 'Audio', icon: Mic },
      ]
    : [
        { key: 'notes', label: 'Notes', icon: FileText },
        { key: 'audio', label: 'Audio & Transcript', icon: Mic },
        { key: 'analysis', label: 'Analysis', icon: Brain },
      ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 no-print"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={20} />
          </button>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                (e.target as HTMLInputElement).blur();
            }}
            className="flex-1 border-0 bg-transparent text-2xl font-bold text-gray-900 outline-none placeholder-gray-400 focus:ring-0 dark:text-gray-100"
            placeholder="Meeting title"
            aria-label="Meeting title"
          />

          <select
            value={meeting.status}
            onChange={(e) =>
              handleStatusChange(e.target.value as MeetingStatus)
            }
            className={`rounded-full px-3 py-1 text-sm font-medium ${statusSelectStyles[meeting.status]}`}
            aria-label="Meeting status"
          >
            <option value="draft">Draft</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          {!isMobile && (
            <div className="flex items-center gap-1 no-print">
              <button
                onClick={handleExportJson}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Export as JSON"
                title="Export as JSON"
              >
                <Download size={18} />
              </button>
              <button
                onClick={handlePrint}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Print / Export as PDF"
                title="Print / Export as PDF"
              >
                <Printer size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center gap-1 pl-12 text-sm text-gray-500 dark:text-gray-400">
          <Calendar size={14} />
          <span>
            {meeting.date.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>

        <div className="space-y-3 pl-12">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Stakeholders
            </label>
            <StakeholderPicker
              selectedIds={meeting.stakeholderIds}
              onChange={handleStakeholderChange}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Participants
            </label>
            <ChipInput
              values={meeting.participants}
              onChange={handleParticipantsChange}
              placeholder="Add participants..."
              label="Add participant"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tags
            </label>
            <ChipInput
              values={meeting.tags}
              onChange={handleTagsChange}
              placeholder="Add tags..."
              label="Add tag"
              suggestions={allTags ?? []}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'notes' && (
        <NotesEditor meetingId={id} initialContent={meeting.notes} />
      )}
      {activeTab === 'audio' && (
        <AudioTab meetingId={id} />
      )}
      {activeTab === 'analysis' && (
        <AnalysisTab
          meetingId={id}
          notesPlainText={tiptapJsonToPlainText(meeting.notes)}
        />
      )}

      {/* Print View — hidden on screen, shown when printing */}
      <MeetingPrintView meeting={meeting} />
    </div>
  );
}
