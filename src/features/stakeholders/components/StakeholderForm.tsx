import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Plus, Check } from 'lucide-react';
import { categoryRepository, CATEGORY_COLORS } from '../../../services/categoryRepository';
import { stakeholderRepository } from '../../../services/stakeholderRepository';
import type { Stakeholder } from '../../../db/database';
import { useToast } from '../../../contexts/ToastContext';
import useFocusTrap from '../../../shared/hooks/useFocusTrap';

interface StakeholderFormProps {
  open: boolean;
  stakeholder?: Stakeholder | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export default function StakeholderForm({
  open,
  stakeholder,
  onClose,
  onSaved,
}: StakeholderFormProps) {
  const { addToast } = useToast();
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const categories = useLiveQuery(() => categoryRepository.getAll());

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const [emailError, setEmailError] = useState('');

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0]);

  const isEdit = !!stakeholder;

  useEffect(() => {
    if (stakeholder) {
      setName(stakeholder.name);
      setEmail(stakeholder.email ?? '');
      setPhone(stakeholder.phone ?? '');
      setSelectedCategoryIds([...stakeholder.categoryIds]);
    } else {
      setName('');
      setEmail('');
      setPhone('');
      setSelectedCategoryIds([]);
    }
    setCreatingCategory(false);
    setNewCatName('');
    setNewCatColor(CATEGORY_COLORS[0]);
  }, [stakeholder, open]);

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function handleCreateCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    try {
      const id = await categoryRepository.create({
        name: trimmed,
        color: newCatColor,
      });
      setSelectedCategoryIds((prev) => [...prev, id]);
      setCreatingCategory(false);
      setNewCatName('');
      setNewCatColor(CATEGORY_COLORS[0]);
    } catch {
      addToast('Failed to create category', 'error');
    }
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      addToast('Name is required', 'warning');
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');

    try {
      if (isEdit && stakeholder) {
        await stakeholderRepository.update(stakeholder.id, {
          name: trimmed,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          categoryIds: selectedCategoryIds,
        });
        addToast('Stakeholder updated', 'success');
        onSaved?.(stakeholder.id);
      } else {
        const id = await stakeholderRepository.create({
          name: trimmed,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          categoryIds: selectedCategoryIds,
        });
        addToast('Stakeholder created', 'success');
        onSaved?.(id);
      }
      onClose();
    } catch {
      addToast('Failed to save stakeholder', 'error');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div ref={trapRef} className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Edit Stakeholder' : 'Add Stakeholder'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-6">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              autoFocus
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
              placeholder="email@example.com"
              className={`w-full rounded-lg border px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 ${emailError ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            />
            {emailError && (
              <p className="mt-1 text-xs text-red-500">{emailError}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Categories multi-select */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Categories
            </label>
            <div className="space-y-1.5">
              {(categories ?? []).map((cat) => (
                <label
                  key={cat.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="rounded"
                  />
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {cat.name}
                  </span>
                </label>
              ))}

              {/* Create new category inline */}
              {creatingCategory ? (
                <div className="mt-2 rounded border border-gray-200 p-2 dark:border-gray-600">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Category name"
                    className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <div className="mb-2 flex flex-wrap gap-1">
                    {CATEGORY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCatColor(color)}
                        className={`h-5 w-5 rounded-full border-2 ${
                          newCatColor === color
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
                      onClick={handleCreateCategory}
                      className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      <Check size={12} />
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setCreatingCategory(false);
                        setNewCatName('');
                      }}
                      className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 dark:border-gray-600 dark:text-gray-300"
                    >
                      <X size={12} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingCategory(true)}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Plus size={14} />
                  Create new category
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {isEdit ? 'Save Changes' : 'Create Stakeholder'}
          </button>
        </div>
      </div>
    </div>
  );
}
