import { X } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

const shortcuts = [
  { keys: `${modKey} + N`, description: 'Create new meeting' },
  { keys: `${modKey} + K`, description: 'Focus search bar' },
  { keys: `${modKey} + Shift + T`, description: 'Go to Tasks' },
  { keys: '/', description: 'Focus search bar (when not typing)' },
  { keys: '?', description: 'Show this help' },
  { keys: 'Esc', description: 'Close modal / dialog' },
];

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

export default function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={trapRef}
        className="animate-scale-in mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map(s => (
            <div key={s.keys} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">{s.description}</span>
              <kbd className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
