import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Trash2,
  RotateCcw,
  FileText,
  Users,
  Tag,
} from 'lucide-react';
import { meetingRepository } from '../../../services/meetingRepository';
import { stakeholderRepository } from '../../../services/stakeholderRepository';
import { categoryRepository } from '../../../services/categoryRepository';
import { useToast } from '../../../contexts/ToastContext';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import EmptyState from '../../../shared/components/EmptyState';

interface TrashItem {
  id: string;
  name: string;
  entityType: 'meeting' | 'stakeholder' | 'category';
  deletedAt: Date;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  if (diffHours > 0)
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffMins > 0)
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  return 'just now';
}

const entityConfig = {
  meeting: {
    label: 'Meeting',
    icon: FileText,
    badgeClass:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  stakeholder: {
    label: 'Stakeholder',
    icon: Users,
    badgeClass:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  category: {
    label: 'Category',
    icon: Tag,
    badgeClass:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
};

export default function TrashPage() {
  const { addToast } = useToast();
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const deletedMeetings = useLiveQuery(() => meetingRepository.getDeleted());
  const deletedStakeholders = useLiveQuery(() =>
    stakeholderRepository.getDeleted(),
  );
  const deletedCategories = useLiveQuery(() => categoryRepository.getDeleted());

  const allItems: TrashItem[] = [
    ...(deletedMeetings ?? []).map((m) => ({
      id: m.id,
      name: m.title,
      entityType: 'meeting' as const,
      deletedAt: m.deletedAt!,
    })),
    ...(deletedStakeholders ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      entityType: 'stakeholder' as const,
      deletedAt: s.deletedAt!,
    })),
    ...(deletedCategories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      entityType: 'category' as const,
      deletedAt: c.deletedAt!,
    })),
  ];

  const meetingItems = allItems.filter((i) => i.entityType === 'meeting');
  const stakeholderItems = allItems.filter(
    (i) => i.entityType === 'stakeholder',
  );
  const categoryItems = allItems.filter((i) => i.entityType === 'category');

  async function handleRestore(item: TrashItem) {
    try {
      if (item.entityType === 'meeting') {
        await meetingRepository.restore(item.id);
      } else if (item.entityType === 'stakeholder') {
        await stakeholderRepository.restore(item.id);
      } else {
        await categoryRepository.restore(item.id);
      }
      addToast(`Restored "${item.name}"`, 'success');
    } catch {
      addToast('Failed to restore item', 'error');
    }
  }

  function handlePermanentDelete(item: TrashItem) {
    setConfirmAction({
      title: 'Delete Permanently',
      message: `Are you sure you want to permanently delete "${item.name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          if (item.entityType === 'meeting') {
            await meetingRepository.permanentDelete(item.id);
          } else if (item.entityType === 'stakeholder') {
            await stakeholderRepository.permanentDelete(item.id);
          } else {
            await categoryRepository.permanentDelete(item.id);
          }
          addToast(`Permanently deleted "${item.name}"`, 'success');
        } catch {
          addToast('Failed to delete item', 'error');
        }
        setConfirmAction(null);
      },
    });
  }

  function handleRestoreAll() {
    setConfirmAction({
      title: 'Restore All',
      message: `Restore all ${allItems.length} items from trash?`,
      onConfirm: async () => {
        try {
          for (const item of allItems) {
            if (item.entityType === 'meeting') {
              await meetingRepository.restore(item.id);
            } else if (item.entityType === 'stakeholder') {
              await stakeholderRepository.restore(item.id);
            } else {
              await categoryRepository.restore(item.id);
            }
          }
          addToast(`Restored ${allItems.length} items`, 'success');
        } catch {
          addToast('Failed to restore some items', 'error');
        }
        setConfirmAction(null);
      },
    });
  }

  function handleEmptyTrash() {
    setConfirmAction({
      title: 'Empty Trash',
      message: `Permanently delete all ${allItems.length} items? This cannot be undone.`,
      onConfirm: async () => {
        try {
          for (const item of allItems) {
            if (item.entityType === 'meeting') {
              await meetingRepository.permanentDelete(item.id);
            } else if (item.entityType === 'stakeholder') {
              await stakeholderRepository.permanentDelete(item.id);
            } else {
              await categoryRepository.permanentDelete(item.id);
            }
          }
          addToast('Trash emptied', 'success');
        } catch {
          addToast('Failed to empty trash', 'error');
        }
        setConfirmAction(null);
      },
    });
  }

  function renderSection(title: string, items: TrashItem[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title} ({items.length})
        </h2>
        <div className="space-y-2">
          {items.map((item) => {
            const config = entityConfig[item.entityType];
            return (
              <div
                key={`${item.entityType}-${item.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                data-testid="trash-item"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
                  >
                    <config.icon size={12} />
                    {config.label}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {item.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatRelativeDate(item.deletedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(item)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    aria-label={`Restore ${item.name}`}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(item)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    aria-label={`Delete ${item.name} permanently`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Trash
        </h1>
        {allItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestoreAll}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <RotateCcw size={14} />
              Restore All
            </button>
            <button
              onClick={handleEmptyTrash}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <Trash2 size={14} />
              Empty Trash
            </button>
          </div>
        )}
      </div>

      {allItems.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={48} />}
          title="Trash is empty"
          description="Deleted items will appear here. You can restore or permanently delete them."
        />
      ) : (
        <>
          {renderSection('Meetings', meetingItems)}
          {renderSection('Stakeholders', stakeholderItems)}
          {renderSection('Categories', categoryItems)}
        </>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={
          confirmAction?.title === 'Restore All' ? 'Restore All' : 'Delete'
        }
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
