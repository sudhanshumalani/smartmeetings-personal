import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Pencil, Trash2, Star, X, Check, RotateCcw } from 'lucide-react';
import { promptTemplateRepository } from '../../../services/promptTemplateRepository';
import { db, DEFAULT_PROMPT_TEMPLATES } from '../../../db/database';
import { useToast } from '../../../contexts/ToastContext';

export default function PromptTemplateManager() {
  const { addToast } = useToast();
  const templates = useLiveQuery(() => promptTemplateRepository.getAll());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [creating, setCreating] = useState(false);

  function startEdit(id: string, name: string, content: string) {
    setEditingId(id);
    setEditName(name);
    setEditContent(content);
    setCreating(false);
  }

  function startCreate() {
    setEditingId(null);
    setEditName('');
    setEditContent('');
    setCreating(true);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
    setEditName('');
    setEditContent('');
  }

  async function handleSave() {
    const name = editName.trim();
    if (!name) {
      addToast('Name is required', 'warning');
      return;
    }
    if (!editContent.trim()) {
      addToast('Prompt content is required', 'warning');
      return;
    }

    try {
      if (creating) {
        await promptTemplateRepository.create({ name, content: editContent });
        addToast('Prompt template created', 'success');
      } else if (editingId) {
        await promptTemplateRepository.update(editingId, { name, content: editContent });
        addToast('Prompt template updated', 'success');
      }
      cancelEdit();
    } catch {
      addToast('Failed to save prompt template', 'error');
    }
  }

  async function handleDelete(id: string) {
    try {
      await promptTemplateRepository.softDelete(id);
      addToast('Prompt template deleted', 'success');
      if (editingId === id) cancelEdit();
    } catch {
      addToast('Failed to delete prompt template', 'error');
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await promptTemplateRepository.setDefault(id);
      addToast('Default prompt template updated', 'success');
    } catch {
      addToast('Failed to set default', 'error');
    }
  }

  async function handleResetToBuiltIn() {
    try {
      // Soft delete all existing
      const all = await promptTemplateRepository.getAll();
      for (const t of all) {
        await db.promptTemplates.update(t.id, { deletedAt: new Date() });
      }
      // Re-seed
      const now = new Date();
      await db.promptTemplates.bulkAdd(
        DEFAULT_PROMPT_TEMPLATES.map((t, i) => ({
          ...t,
          id: crypto.randomUUID(),
          isDefault: i === 0,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })),
      );
      addToast('Prompt templates reset to defaults', 'success');
      cancelEdit();
    } catch {
      addToast('Failed to reset templates', 'error');
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
              {t.isDefault && (
                <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />
              )}
              <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                {t.name}
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {t.content.length > 200 ? `${t.content.slice(0, 200)}...` : t.content.slice(0, 60) + '...'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1 ml-2">
              {!t.isDefault && (
                <button
                  onClick={() => handleSetDefault(t.id)}
                  className="rounded p-1 text-gray-400 hover:text-amber-500"
                  title="Set as default"
                >
                  <Star size={14} />
                </button>
              )}
              <button
                onClick={() => startEdit(t.id, t.name, t.content)}
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
      </div>

      {/* Edit/Create form */}
      {(creating || editingId) && (
        <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-900/10">
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Template name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            placeholder="Prompt template content. Use ${text} where the meeting content should be injected."
            rows={10}
            className="w-full rounded-lg border border-gray-300 p-3 font-mono text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
          />
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

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={startCreate}
          disabled={creating || !!editingId}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
        >
          <Plus size={14} />
          New Template
        </button>
        <button
          onClick={handleResetToBuiltIn}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <RotateCcw size={14} />
          Reset to Built-in
        </button>
      </div>
    </div>
  );
}
