import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, Trash2, Calendar, Mail, Phone, Building2, FileText } from 'lucide-react';
import { db } from '../../../db/database';
import type { Meeting, StakeholderCategory } from '../../../db/database';
import { stakeholderRepository } from '../../../services/stakeholderRepository';
import { categoryRepository } from '../../../services/categoryRepository';
import { useToast } from '../../../contexts/ToastContext';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import CategoryBadge from '../components/CategoryBadge';
import StakeholderForm from '../components/StakeholderForm';

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

export default function StakeholderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const isMobile = useIsMobile();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Returns undefined while loading, null if not found, or the stakeholder
  const stakeholder = useLiveQuery(
    () =>
      id
        ? db.stakeholders.get(id).then((s) => (s && !s.deletedAt ? s : null))
        : null,
    [id],
  );

  const categories = useLiveQuery(() => categoryRepository.getAll());

  const categoryMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  // Get meetings linked to this stakeholder
  const linkedMeetings = useLiveQuery(
    () =>
      id
        ? db.meetings
            .filter((m) => m.deletedAt === null && m.stakeholderIds.includes(id))
            .sortBy('date')
            .then((meetings) => meetings.reverse())
        : [],
    [id],
  );

  async function handleDelete() {
    if (!id) return;
    try {
      await stakeholderRepository.softDelete(id);
      addToast('Stakeholder deleted', 'success');
      navigate('/stakeholders');
    } catch {
      addToast('Failed to delete stakeholder', 'error');
    }
  }

  // Loading state (useLiveQuery returns undefined while query is pending)
  if (stakeholder === undefined) {
    return (
      <div className="py-16 text-center text-gray-400">Loading...</div>
    );
  }

  // Not found (useLiveQuery returned null)
  if (stakeholder === null) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Stakeholder not found
        </h2>
        <Link
          to="/stakeholders"
          className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Back to Stakeholders
        </Link>
      </div>
    );
  }

  const stakeholderCategories = stakeholder.categoryIds
    .map((cid) => categoryMap.get(cid))
    .filter((c): c is StakeholderCategory => c !== undefined);

  return (
    <div>
      {/* Back + Actions */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate('/stakeholders')}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        {!isMobile && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Stakeholder Info */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {stakeholder.name}
        </h1>

        {/* Category badges */}
        {stakeholderCategories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stakeholderCategories.map((cat) => (
              <CategoryBadge
                key={cat.id}
                name={cat.name}
                color={cat.color}
                size="md"
              />
            ))}
          </div>
        )}

        {/* Contact details */}
        <div className="mt-4 space-y-2">
          {stakeholder.organization && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Building2 size={16} className="shrink-0" />
              <span>{stakeholder.organization}</span>
            </div>
          )}
          {stakeholder.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Mail size={16} className="shrink-0" />
              <span>{stakeholder.email}</span>
            </div>
          )}
          {stakeholder.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Phone size={16} className="shrink-0" />
              <span>{stakeholder.phone}</span>
            </div>
          )}
          {stakeholder.notes && (
            <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
              <FileText size={16} className="mt-0.5 shrink-0" />
              <span>{stakeholder.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Linked Meetings */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Linked Meetings
        </h2>
        {(linkedMeetings ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No meetings linked to this stakeholder yet.
          </p>
        ) : (
          <div className="space-y-2">
            {(linkedMeetings ?? []).map((meeting: Meeting) => (
              <Link
                key={meeting.id}
                to={`/meetings/${meeting.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {meeting.title}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <Calendar size={14} />
                    {meeting.date.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[meeting.status]}`}
                >
                  {statusLabels[meeting.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <StakeholderForm
        open={editOpen}
        stakeholder={stakeholder}
        onClose={() => setEditOpen(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Stakeholder"
        message={`Are you sure you want to delete "${stakeholder.name}"? You can restore it from the Trash.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
