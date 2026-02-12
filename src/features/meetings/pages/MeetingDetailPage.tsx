import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Calendar, FileText, Mic, Brain, Download, Printer, Trash2, Save } from 'lucide-react';
import type { MeetingStatus } from '../../../db/database';
import { meetingRepository } from '../../../services/meetingRepository';
import { tiptapJsonToPlainText } from '../../../services/tiptapUtils';
import { exportMeeting, downloadJson } from '../../../services/exportService';
import { useToast } from '../../../contexts/ToastContext';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import StakeholderPicker from '../components/StakeholderPicker';
import ChipInput from '../components/ChipInput';
import NotesEditor from '../components/NotesEditor';
import type { NotesEditorHandle } from '../components/NotesEditor';
import AudioTab from '../../audio/components/AudioTab';
import AnalysisTab from '../../analysis/components/AnalysisTab';
import MeetingPrintView from '../components/MeetingPrintView';

type Tab = 'notes' | 'audio' | 'analysis';

const statusSelectStyles: Record<string, string> = {
  draft:
    'border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'in-progress':
    'border border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300',
  completed:
    'border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
};

function DetailSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="skeleton h-8 w-64" />
        <div className="skeleton ml-auto h-8 w-24 rounded-full" />
      </div>
      <div className="skeleton ml-12 h-4 w-48" />
      <div className="ml-12 space-y-3">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700">
        <div className="skeleton h-10 w-20" />
        <div className="skeleton h-10 w-32" />
        <div className="skeleton h-10 w-20" />
      </div>
      <div className="skeleton h-48 w-full" />
    </div>
  );
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<Tab>('notes');
  const [title, setTitle] = useState('');
  const [titleLoaded, setTitleLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const notesEditorRef = useRef<NotesEditorHandle>(null);

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

  async function handleDelete() {
    if (!id) return;
    await meetingRepository.softDelete(id);
    addToast('Meeting moved to Trash', 'success');
    navigate('/');
  }

  if (!id) return null;

  // Loading
  if (meeting === undefined) {
    return <DetailSkeleton />;
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
          className="mt-4 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm text-white shadow-sm hover:shadow-md"
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
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 no-print"
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
                onClick={() => notesEditorRef.current?.saveNow()}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Save now"
                title="Save now (flushes pending changes)"
              >
                <Save size={18} />
              </button>
              <button
                onClick={handleExportJson}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Export as JSON"
                title="Export as JSON"
              >
                <Download size={18} />
              </button>
              <button
                onClick={handlePrint}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Print / Export as PDF"
                title="Print / Export as PDF"
              >
                <Printer size={18} />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Delete meeting"
                title="Move to Trash"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center gap-1 pl-12 text-sm text-gray-500 dark:text-gray-400">
          <Calendar size={14} />
          <input
            type="date"
            value={
              meeting.date instanceof Date && !isNaN(meeting.date.getTime())
                ? `${meeting.date.getFullYear()}-${String(meeting.date.getMonth() + 1).padStart(2, '0')}-${String(meeting.date.getDate()).padStart(2, '0')}`
                : ''
            }
            onChange={async (e) => {
              if (!id || !e.target.value) return;
              const newDate = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(newDate.getTime())) {
                await meetingRepository.update(id, { date: newDate });
              }
            }}
            className="border-0 bg-transparent text-sm text-gray-500 outline-none hover:text-gray-700 focus:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 dark:focus:text-gray-100"
            aria-label="Meeting date"
          />
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
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
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
        <NotesEditor ref={notesEditorRef} meetingId={id} initialContent={meeting.notes} />
      )}
      {activeTab === 'audio' && (
        <AudioTab meetingId={id} />
      )}
      {activeTab === 'analysis' && (
        <AnalysisTab
          meetingId={id}
          notesPlainText={tiptapJsonToPlainText(meeting.notes)}
          meetingTitle={meeting.title}
        />
      )}

      {/* Print View — hidden on screen, shown when printing */}
      <MeetingPrintView meeting={meeting} />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Move to Trash"
        message="Move this meeting to Trash? You can restore it later from the Trash page."
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
