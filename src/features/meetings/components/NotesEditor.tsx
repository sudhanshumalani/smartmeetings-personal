import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, type ReactNode } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Highlighter,
} from 'lucide-react';
import { meetingRepository } from '../../../services/meetingRepository';

export interface NotesEditorHandle {
  saveNow: () => void;
}

interface NotesEditorProps {
  meetingId: string;
  initialContent: string;
}

function parseContent(content: string): string | Record<string, unknown> {
  if (!content) return '';
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

const NotesEditor = forwardRef<NotesEditorHandle, NotesEditorProps>(function NotesEditor({
  meetingId,
  initialContent,
}, ref) {
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved'
  >('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingRef = useRef(false);
  const meetingIdRef = useRef(meetingId);
  meetingIdRef.current = meetingId;

  const save = useCallback(async (json: string) => {
    setSaveStatus('saving');
    pendingRef.current = false;
    try {
      await meetingRepository.update(meetingIdRef.current, {
        notes: json,
      });
      setSaveStatus('saved');
      hideTimerRef.current = setTimeout(
        () => setSaveStatus('idle'),
        2000,
      );
    } catch {
      // DB may be closed if component unmounts during save
      setSaveStatus('idle');
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Start writing your meeting notes...',
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: parseContent(initialContent),
    onUpdate: ({ editor: ed }) => {
      pendingRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = JSON.stringify(ed.getJSON());
        save(json);
      }, 3000);
    },
  });

  // Expose saveNow to parent via ref
  useImperativeHandle(ref, () => ({
    saveNow: () => {
      if (pendingRef.current && editor) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const json = JSON.stringify(editor.getJSON());
        save(json);
      }
    },
  }), [editor, save]);

  // beforeunload: warn and force-save if pending changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingRef.current && editor) {
        e.preventDefault();
        // Trigger immediate save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const json = JSON.stringify(editor.getJSON());
        save(json);
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () =>
      window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editor, save]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div data-testid="notes-editor">
      {/* Toolbar */}
      <div
        className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800"
        role="toolbar"
        aria-label="Editor toolbar"
      >
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={16} />
        </ToolbarButton>
        <Separator />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHighlight().run()
          }
          active={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={16} />
        </ToolbarButton>
        <Separator />
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleBulletList().run()
          }
          active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
          active={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleTaskList().run()
          }
          active={editor.isActive('taskList')}
          title="Task List"
        >
          <CheckSquare size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleCodeBlock().run()
          }
          active={editor.isActive('codeBlock')}
          title="Code Block"
        >
          <Code size={16} />
        </ToolbarButton>

        {/* Save indicator */}
        <div className="ml-auto">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-400" data-testid="save-saving">
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-500" data-testid="save-saved">
              Saved ✓
            </span>
          )}
        </div>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none rounded-lg border border-gray-200 bg-white p-4 focus-within:border-blue-500 dark:prose-invert dark:border-gray-700 dark:bg-gray-800 [&_.tiptap]:min-h-[200px] [&_.tiptap]:outline-none"
      />
    </div>
  );
});

export default NotesEditor;

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
      }`}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function Separator() {
  return (
    <div className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />
  );
}
