import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Pencil, Trash2, X, Check, Tag } from 'lucide-react';
import { meetingTemplateRepository } from '../../../services/meetingTemplateRepository';
import { promptTemplateRepository } from '../../../services/promptTemplateRepository';
import { useToast } from '../../../contexts/ToastContext';

export default function MeetingTemplateManager() {
  const { addToast } = useToast();
  const templates = useLiveQuery(() => meetingTemplateRepository.getAll());
  const promptTemplates = useLiveQuery(() => promptTemplateRepository.getAll());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPromptTemplateId, setEditPromptTemplateId] = useState<string | null>(null);

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setEditName('');
    setEditTags('');
    setEditNotes('');
    setEditPromptTemplateId(null);
  }

  function startEdit(t: { id: string; name: string; defaultTags: string[]; defaultNotes: string; promptTemplateId: string | null }) {
    setEditingId(t.id);
    setCreating(false);
    setEditName(t.name);
    setEditTags(t.defaultTags.join(', '));
    setEditNotes(t.defaultNotes);
    setEditPromptTemplateId(t.promptTemplateId);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  async function handleSave() {
    const name = editName.trim();
    if (!name) {
      addToast('Name is required', 'warning');
      return;
    }

    const defaultTags = editTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    try {
      if (creating) {
        await meetingTemplateRepository.create({
          name,
          defaultTags,
          defaultStakeholderIds: [],
          defaultNotes: editNotes,
          promptTemplateId: editPromptTemplateId,
        });
        addToast('Meeting template created', 'success');
      } else if (editingId) {
        await meetingTemplateRepository.update(editingId, {
          name,
          defaultTags,
          defaultNotes: editNotes,
          promptTemplateId: editPromptTemplateId,
        });
        addToast('Meeting template updated', 'success');
      }
      cancelEdit();
    } catch {
      addToast('Failed to save meeting template', 'error');
    }
  }

  async function handleDelete(id: string) {
    try {
      await meetingTemplateRepository.softDelete(id);
      addToast('Meeting template deleted', 'success');
      if (editingId === id) cancelEdit();
    } catch {
      addToast('Failed to delete meeting template', 'error');
    }
  }

  return (
    <div className="space-y-3">
      {/* Template list */}
      <div className="space-y-2">
        {(templates ?? []).map(t => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-600 dark:bg-gray-700/50"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                {t.name}
              </span>
              {t.defaultTags.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Tag size={12} />
                  {t.defaultTags.length}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 ml-2">
              <button
                onClick={() => startEdit(t)}
                className="rounded p-1 text-gray-400 hover:text-blue-500"
                title="Edit"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                className="rounded p-1 text-gray-400 hover:text-red-500"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {(templates ?? []).length === 0 && (
          <p className="text-sm text-gray-400">No meeting templates yet.</p>
        )}
      </div>

      {/* Edit/Create form */}
      {(creating || editingId) && (
        <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-900/10">
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Template name (e.g., Weekly Standup)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Default Tags (comma-separated)
            </label>
            <input
              type="text"
              value={editTags}
              onChange={e => setEditTags(e.target.value)}
              placeholder="standup, engineering, weekly"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Default Notes Skeleton
            </label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Pre-filled notes template..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Linked AI Prompt Template
            </label>
            <select
              value={editPromptTemplateId ?? ''}
              onChange={e => setEditPromptTemplateId(e.target.value || null)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Default prompt</option>
              {(promptTemplates ?? []).map(pt => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Check size={14} />
              {creating ? 'Create' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      <button
        onClick={startCreate}
        disabled={creating || !!editingId}
        className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
      >
        <Plus size={14} />
        New Template
      </button>
    </div>
  );
}
