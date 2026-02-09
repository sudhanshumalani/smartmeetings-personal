import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { categoryRepository, CATEGORY_COLORS } from '../../../services/categoryRepository';
import type { StakeholderCategory } from '../../../db/database';
import { useToast } from '../../../contexts/ToastContext';

export default function CategoryManager() {
  const { addToast } = useToast();
  const categories = useLiveQuery(() => categoryRepository.getAll());

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(CATEGORY_COLORS[0]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      await categoryRepository.create({ name: trimmed, color: newColor });
      setNewName('');
      setNewColor(CATEGORY_COLORS[0]);
      setCreating(false);
      addToast('Category created', 'success');
    } catch {
      addToast('Failed to create category', 'error');
    }
  }

  function startEdit(cat: StakeholderCategory) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  }

  async function handleUpdate() {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) return;

    try {
      await categoryRepository.update(editingId, {
        name: trimmed,
        color: editColor,
      });
      setEditingId(null);
      addToast('Category updated', 'success');
    } catch {
      addToast('Failed to update category', 'error');
    }
  }

  async function handleDelete(id: string) {
    try {
      await categoryRepository.softDelete(id);
      addToast('Category deleted', 'success');
    } catch {
      addToast('Failed to delete category', 'error');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Categories
        </h3>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <Plus size={14} />
            New
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            autoFocus
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                className={`h-6 w-6 rounded-full border-2 ${
                  newColor === color
                    ? 'border-gray-900 dark:border-white'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Color ${color}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              <Check size={14} />
              Save
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category list */}
      <div className="space-y-1">
        {(categories ?? []).map((cat) =>
          editingId === cat.id ? (
            <div
              key={cat.id}
              className="rounded-lg border border-gray-200 p-3 dark:border-gray-600"
            >
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                autoFocus
              />
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      editColor === color
                        ? 'border-gray-900 dark:border-white'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                >
                  <Check size={14} />
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={cat.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {cat.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(cat)}
                  className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={`Edit ${cat.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="rounded p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label={`Delete ${cat.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {(categories ?? []).length === 0 && !creating && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No categories yet. Create one to organize stakeholders.
        </p>
      )}
    </div>
  );
}
