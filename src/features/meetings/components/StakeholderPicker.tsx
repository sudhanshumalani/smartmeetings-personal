import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, Search, Check } from 'lucide-react';
import { db } from '../../../db/database';
import type { Stakeholder, StakeholderCategory } from '../../../db/database';
import { stakeholderRepository } from '../../../services/stakeholderRepository';

interface StakeholderPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function StakeholderPicker({
  selectedIds,
  onChange,
}: StakeholderPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const stakeholders = useLiveQuery(() =>
    db.stakeholders.filter((s) => s.deletedAt === null).toArray(),
  );
  const categories = useLiveQuery(() =>
    db.stakeholderCategories.filter((c) => c.deletedAt === null).toArray(),
  );

  const categoryMap = new Map(
    (categories ?? []).map((c) => [c.id, c]),
  );

  const filtered = (stakeholders ?? []).filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.organization?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  const selected = (stakeholders ?? []).filter((s) =>
    selectedIds.includes(s.id),
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  function toggleStakeholder(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function removeStakeholder(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const id = await stakeholderRepository.create({
      name: newName.trim(),
      categoryIds: [],
    });
    onChange([...selectedIds, id]);
    setNewName('');
    setCreating(false);
  }

  function getCategoryBadges(
    stakeholder: Stakeholder,
  ): StakeholderCategory[] {
    return stakeholder.categoryIds
      .map((cid) => categoryMap.get(cid))
      .filter((c): c is StakeholderCategory => c !== undefined);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected chips + Add button */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2 pr-1 text-sm dark:bg-gray-700"
          >
            {getCategoryBadges(s).map((cat) => (
              <span
                key={cat.id}
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: cat.color }}
                title={cat.name}
              />
            ))}
            <span className="text-gray-800 dark:text-gray-200">
              {s.name}
            </span>
            <button
              onClick={() => removeStakeholder(s.id)}
              className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600"
              aria-label={`Remove ${s.name}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400"
          aria-label="Add stakeholder"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {/* Search */}
          <div className="border-b border-gray-100 p-2 dark:border-gray-700">
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                size={14}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stakeholders..."
                className="w-full rounded border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                aria-label="Search stakeholders"
              />
            </div>
          </div>

          {/* Stakeholder list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                No stakeholders found
              </div>
            ) : (
              filtered.map((s) => {
                const isSelected = selectedIds.includes(s.id);
                const cats = getCategoryBadges(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleStakeholder(s.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {isSelected && <Check size={12} />}
                    </span>
                    <span className="flex-1 text-left text-gray-800 dark:text-gray-200">
                      {s.name}
                    </span>
                    {cats.map((cat) => (
                      <span
                        key={cat.id}
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: cat.color }}
                      >
                        {cat.name}
                      </span>
                    ))}
                  </button>
                );
              })
            )}
          </div>

          {/* Create new */}
          <div className="border-t border-gray-100 p-2 dark:border-gray-700">
            {creating ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Name..."
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  aria-label="New stakeholder name"
                />
                <button
                  onClick={handleCreate}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName('');
                  }}
                  className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
              >
                <Plus size={14} />
                Create new stakeholder
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
