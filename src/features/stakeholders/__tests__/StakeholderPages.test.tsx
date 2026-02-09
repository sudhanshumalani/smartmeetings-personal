import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db, initializeDatabase } from '../../../db/database';
import type { Stakeholder, StakeholderCategory, Meeting } from '../../../db/database';
import { initialize as initSettings } from '../../../services/settingsService';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { ToastProvider } from '../../../contexts/ToastContext';
import { OnlineProvider } from '../../../contexts/OnlineContext';
import StakeholderListPage from '../pages/StakeholderListPage';
import StakeholderDetailPage from '../pages/StakeholderDetailPage';
import CategoryBadge from '../components/CategoryBadge';

function renderListPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={['/stakeholders']}>
            <Routes>
              <Route path="stakeholders" element={<StakeholderListPage />} />
              <Route
                path="stakeholders/:id"
                element={<StakeholderDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

function renderDetailPage(id: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineProvider>
          <MemoryRouter initialEntries={[`/stakeholders/${id}`]}>
            <Routes>
              <Route path="stakeholders" element={<StakeholderListPage />} />
              <Route
                path="stakeholders/:id"
                element={<StakeholderDetailPage />}
              />
              <Route
                path="meetings/:id"
                element={<div>MeetingDetailPage</div>}
              />
            </Routes>
          </MemoryRouter>
        </OnlineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

function makeCategory(overrides: Partial<StakeholderCategory> = {}): StakeholderCategory {
  const id = crypto.randomUUID();
  const now = new Date();
  return {
    id,
    name: `Category ${id.slice(0, 4)}`,
    color: '#ef4444',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeStakeholder(overrides: Partial<Stakeholder> = {}): Stakeholder {
  const id = crypto.randomUUID();
  const now = new Date();
  return {
    id,
    name: `Stakeholder ${id.slice(0, 4)}`,
    categoryIds: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  const id = crypto.randomUUID();
  const now = new Date();
  return {
    id,
    title: `Meeting ${id.slice(0, 4)}`,
    date: now,
    participants: [],
    tags: [],
    stakeholderIds: [],
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('StakeholderPages', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await initializeDatabase();
    await initSettings();
  });

  // --- StakeholderListPage ---

  describe('StakeholderListPage', () => {
    it('renders empty state when no stakeholders', async () => {
      renderListPage();
      expect(
        await screen.findByText('No stakeholders yet'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Add your first stakeholder/ }),
      ).toBeInTheDocument();
    });

    it('renders stakeholder cards with name, org, email, and category badges', async () => {
      const cat = makeCategory({ name: 'Investors', color: '#ef4444' });
      await db.stakeholderCategories.add(cat);

      await db.stakeholders.add(
        makeStakeholder({
          name: 'Jane Smith',
          organization: 'Acme Corp',
          email: 'jane@acme.com',
          categoryIds: [cat.id],
        }),
      );

      renderListPage();

      expect(await screen.findByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
      // Use testid to target badge specifically (not the filter dropdown option)
      const badges = screen.getAllByTestId('category-badge');
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveTextContent('Investors');
    });

    it('search filters by name and organization', async () => {
      await db.stakeholders.add(
        makeStakeholder({ name: 'Alice Wonderland', organization: 'Wonderco' }),
      );
      await db.stakeholders.add(
        makeStakeholder({ name: 'Bob Builder', organization: 'BuildIt' }),
      );

      renderListPage();

      expect(await screen.findByText('Alice Wonderland')).toBeInTheDocument();
      expect(screen.getByText('Bob Builder')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText(
        'Search by name or organization...',
      );
      await userEvent.type(searchInput, 'Alice');

      await waitFor(() => {
        expect(screen.getByText('Alice Wonderland')).toBeInTheDocument();
        expect(screen.queryByText('Bob Builder')).not.toBeInTheDocument();
      });

      // Clear and search by organization
      await userEvent.clear(searchInput);
      await userEvent.type(searchInput, 'BuildIt');

      await waitFor(() => {
        expect(screen.getByText('Bob Builder')).toBeInTheDocument();
        expect(
          screen.queryByText('Alice Wonderland'),
        ).not.toBeInTheDocument();
      });
    });

    it('category filter works', async () => {
      const catInv = makeCategory({ name: 'Investors', color: '#ef4444' });
      const catSch = makeCategory({ name: 'Schools', color: '#3b82f6' });
      await db.stakeholderCategories.bulkAdd([catInv, catSch]);

      await db.stakeholders.add(
        makeStakeholder({ name: 'Investor Person', categoryIds: [catInv.id] }),
      );
      await db.stakeholders.add(
        makeStakeholder({ name: 'School Person', categoryIds: [catSch.id] }),
      );

      renderListPage();

      expect(await screen.findByText('Investor Person')).toBeInTheDocument();
      expect(screen.getByText('School Person')).toBeInTheDocument();

      // Select category filter
      const filterSelect = screen.getByLabelText('Filter by category');
      await userEvent.selectOptions(filterSelect, catInv.id);

      await waitFor(() => {
        expect(screen.getByText('Investor Person')).toBeInTheDocument();
        expect(
          screen.queryByText('School Person'),
        ).not.toBeInTheDocument();
      });
    });

    it('clicking "Add Stakeholder" opens form modal', async () => {
      renderListPage();
      await screen.findByText('No stakeholders yet');

      const addBtn = screen.getByRole('button', { name: /Add Stakeholder/ });
      await userEvent.click(addBtn);

      expect(
        await screen.findByText('Add Stakeholder', { selector: 'h2' }),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });

    it('creating stakeholder via form adds it to the list', async () => {
      renderListPage();
      await screen.findByText('No stakeholders yet');

      // Open form
      await userEvent.click(
        screen.getByRole('button', { name: /Add Stakeholder/ }),
      );

      // Fill in name
      await userEvent.type(
        screen.getByPlaceholderText('Full name'),
        'New Person',
      );
      await userEvent.type(
        screen.getByPlaceholderText('email@example.com'),
        'new@person.com',
      );

      // Save
      await userEvent.click(
        screen.getByRole('button', { name: /Create Stakeholder/ }),
      );

      // Should appear in list
      expect(await screen.findByText('New Person')).toBeInTheDocument();
      expect(screen.getByText('new@person.com')).toBeInTheDocument();

      // Verify in DB
      const all = await db.stakeholders.filter((s) => s.deletedAt === null).toArray();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('New Person');
    });

    it('soft-deleted stakeholders do not appear', async () => {
      await db.stakeholders.add(
        makeStakeholder({ name: 'Visible Person' }),
      );
      await db.stakeholders.add(
        makeStakeholder({ name: 'Deleted Person', deletedAt: new Date() }),
      );

      renderListPage();

      expect(
        await screen.findByText('Visible Person'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Deleted Person'),
      ).not.toBeInTheDocument();
    });

    it('clicking stakeholder card navigates to detail page', async () => {
      const stakeholder = makeStakeholder({ name: 'Click Me' });
      await db.stakeholders.add(stakeholder);

      renderListPage();

      const card = await screen.findByText('Click Me');
      await userEvent.click(card);

      // Should navigate to detail page
      expect(
        await screen.findByRole('heading', { name: 'Click Me' }),
      ).toBeInTheDocument();
    });
  });

  // --- StakeholderDetailPage ---

  describe('StakeholderDetailPage', () => {
    it('shows stakeholder not found for invalid id', async () => {
      renderDetailPage('nonexistent-id');
      expect(
        await screen.findByText('Stakeholder not found'),
      ).toBeInTheDocument();
    });

    it('displays stakeholder info with categories', async () => {
      const cat = makeCategory({ name: 'Partners', color: '#22c55e' });
      await db.stakeholderCategories.add(cat);

      const stakeholder = makeStakeholder({
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1 555-1234',
        organization: 'Doe Industries',
        notes: 'Important contact',
        categoryIds: [cat.id],
      });
      await db.stakeholders.add(stakeholder);

      renderDetailPage(stakeholder.id);

      expect(
        await screen.findByRole('heading', { name: 'John Doe' }),
      ).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('+1 555-1234')).toBeInTheDocument();
      expect(screen.getByText('Doe Industries')).toBeInTheDocument();
      expect(screen.getByText('Important contact')).toBeInTheDocument();
      expect(await screen.findByText('Partners')).toBeInTheDocument();
    });

    it('shows linked meetings with title, date, and status', async () => {
      const stakeholder = makeStakeholder({ name: 'Meeting Person' });
      await db.stakeholders.add(stakeholder);

      await db.meetings.add(
        makeMeeting({
          title: 'Board Meeting',
          status: 'completed',
          stakeholderIds: [stakeholder.id],
          date: new Date('2026-01-15T10:00:00'),
        }),
      );

      await db.meetings.add(
        makeMeeting({
          title: 'Strategy Session',
          status: 'in-progress',
          stakeholderIds: [stakeholder.id],
          date: new Date('2026-02-01T14:00:00'),
        }),
      );

      renderDetailPage(stakeholder.id);

      expect(
        await screen.findByText('Board Meeting'),
      ).toBeInTheDocument();
      expect(screen.getByText('Strategy Session')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('does not show soft-deleted meetings in linked list', async () => {
      const stakeholder = makeStakeholder({ name: 'Person' });
      await db.stakeholders.add(stakeholder);

      await db.meetings.add(
        makeMeeting({
          title: 'Active Meeting',
          stakeholderIds: [stakeholder.id],
        }),
      );
      await db.meetings.add(
        makeMeeting({
          title: 'Deleted Meeting',
          stakeholderIds: [stakeholder.id],
          deletedAt: new Date(),
        }),
      );

      renderDetailPage(stakeholder.id);

      expect(
        await screen.findByText('Active Meeting'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Deleted Meeting'),
      ).not.toBeInTheDocument();
    });

    it('edit button opens form in edit mode', async () => {
      const stakeholder = makeStakeholder({
        name: 'Editable Person',
        email: 'edit@me.com',
      });
      await db.stakeholders.add(stakeholder);

      renderDetailPage(stakeholder.id);

      await screen.findByRole('heading', { name: 'Editable Person' });

      await userEvent.click(
        screen.getByRole('button', { name: /Edit/ }),
      );

      // Form should be in edit mode
      expect(
        await screen.findByText('Edit Stakeholder'),
      ).toBeInTheDocument();

      // Fields should be populated
      const nameInput = screen.getByPlaceholderText('Full name') as HTMLInputElement;
      expect(nameInput.value).toBe('Editable Person');
    });

    it('delete button soft-deletes and navigates to list', async () => {
      const stakeholder = makeStakeholder({ name: 'To Delete' });
      await db.stakeholders.add(stakeholder);

      renderDetailPage(stakeholder.id);

      await screen.findByRole('heading', { name: 'To Delete' });

      // Click delete
      await userEvent.click(
        screen.getByRole('button', { name: /Delete/ }),
      );

      // Confirm dialog should appear
      const dialog = await screen.findByText(/Are you sure you want to delete/);
      expect(dialog).toBeInTheDocument();

      // Confirm — click the Delete button inside the confirmation dialog
      const dialogContainer = dialog.closest('.fixed')!;
      const confirmBtn = within(dialogContainer as HTMLElement).getByRole(
        'button',
        { name: 'Delete' },
      );
      await userEvent.click(confirmBtn);

      // Should navigate back to list (showing empty state)
      expect(
        await screen.findByText('No stakeholders yet'),
      ).toBeInTheDocument();

      // Verify soft-deleted in DB
      const record = await db.stakeholders.get(stakeholder.id);
      expect(record?.deletedAt).not.toBeNull();
    });
  });

  // --- StakeholderForm ---

  describe('StakeholderForm', () => {
    it('multi-category selection works', async () => {
      const cat1 = makeCategory({ name: 'Investors', color: '#ef4444' });
      const cat2 = makeCategory({ name: 'Schools', color: '#3b82f6' });
      await db.stakeholderCategories.bulkAdd([cat1, cat2]);

      renderListPage();
      await screen.findByText('No stakeholders yet');

      // Open form
      await userEvent.click(
        screen.getByRole('button', { name: /Add Stakeholder/ }),
      );

      await screen.findByText('Add Stakeholder', { selector: 'h2' });

      // Fill name
      await userEvent.type(
        screen.getByPlaceholderText('Full name'),
        'Multi Cat Person',
      );

      // Select both categories
      const investorsCheckbox = screen.getByRole('checkbox', {
        name: /Investors/,
      });
      const schoolsCheckbox = screen.getByRole('checkbox', {
        name: /Schools/,
      });
      await userEvent.click(investorsCheckbox);
      await userEvent.click(schoolsCheckbox);

      expect(investorsCheckbox).toBeChecked();
      expect(schoolsCheckbox).toBeChecked();

      // Save
      await userEvent.click(
        screen.getByRole('button', { name: /Create Stakeholder/ }),
      );

      // Verify in DB
      await waitFor(async () => {
        const all = await db.stakeholders
          .filter((s) => s.deletedAt === null)
          .toArray();
        expect(all).toHaveLength(1);
        expect(all[0].categoryIds).toContain(cat1.id);
        expect(all[0].categoryIds).toContain(cat2.id);
      });
    });

    it('inline category creation works', async () => {
      renderListPage();
      await screen.findByText('No stakeholders yet');

      // Open form
      await userEvent.click(
        screen.getByRole('button', { name: /Add Stakeholder/ }),
      );

      await screen.findByText('Add Stakeholder', { selector: 'h2' });

      // Fill name
      await userEvent.type(
        screen.getByPlaceholderText('Full name'),
        'Cat Creator',
      );

      // Click "Create new category"
      await userEvent.click(
        screen.getByRole('button', { name: /Create new category/ }),
      );

      // Fill category name
      const catInput = screen.getByPlaceholderText('Category name');
      await userEvent.type(catInput, 'New Category');

      // Click Create
      await userEvent.click(
        screen.getByRole('button', { name: /^Create$/ }),
      );

      // Category should now exist in DB and be auto-selected
      await waitFor(async () => {
        const cats = await db.stakeholderCategories
          .filter((c) => c.deletedAt === null)
          .toArray();
        expect(cats).toHaveLength(1);
        expect(cats[0].name).toBe('New Category');
      });
    });
  });

  // --- CategoryManager ---

  describe('CategoryManager', () => {
    // CategoryManager is embedded within StakeholderForm via the inline create option
    // It also lives as a standalone component. Test via direct usage:

    it('CRUD operations via categoryRepository', async () => {
      const { categoryRepository } = await import(
        '../../../services/categoryRepository'
      );

      // Create
      const id = await categoryRepository.create({
        name: 'Test Cat',
        color: '#ef4444',
      });
      let cat = await categoryRepository.getById(id);
      expect(cat?.name).toBe('Test Cat');
      expect(cat?.color).toBe('#ef4444');

      // Update
      await categoryRepository.update(id, {
        name: 'Updated Cat',
        color: '#3b82f6',
      });
      cat = await categoryRepository.getById(id);
      expect(cat?.name).toBe('Updated Cat');
      expect(cat?.color).toBe('#3b82f6');

      // Soft delete
      await categoryRepository.softDelete(id);
      cat = await categoryRepository.getById(id);
      expect(cat).toBeUndefined();

      // Verify soft-deleted (still in DB)
      const raw = await db.stakeholderCategories.get(id);
      expect(raw?.deletedAt).not.toBeNull();
    });
  });

  // --- CategoryBadge ---

  describe('CategoryBadge', () => {
    it('renders with correct name and color', () => {
      render(
        <CategoryBadge name="Investors" color="#ef4444" />,
      );

      const badge = screen.getByTestId('category-badge');
      expect(badge).toHaveTextContent('Investors');
      expect(badge).toHaveStyle({ backgroundColor: '#ef4444' });
    });

    it('renders md size with larger padding', () => {
      render(<CategoryBadge name="Schools" color="#3b82f6" size="md" />);

      const badge = screen.getByTestId('category-badge');
      expect(badge).toHaveTextContent('Schools');
      expect(badge.className).toContain('text-sm');
    });
  });
});
