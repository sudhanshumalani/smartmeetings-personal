import { useEffect, useState } from 'react';

interface ShortcutActions {
  onNewMeeting?: () => void;
  onFocusSearch?: () => void;
  onGoToTasks?: () => void;
}

export default function useKeyboardShortcuts(actions: ShortcutActions) {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Ctrl/Cmd shortcuts work even in inputs
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'n') {
        e.preventDefault();
        actions.onNewMeeting?.();
        return;
      }

      if (mod && e.key === 'k') {
        e.preventDefault();
        actions.onFocusSearch?.();
        return;
      }

      if (mod && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        actions.onGoToTasks?.();
        return;
      }

      // These only work outside of inputs
      if (isInput) return;

      if (e.key === '/' && !mod) {
        e.preventDefault();
        actions.onFocusSearch?.();
        return;
      }

      if (e.key === '?' && !mod) {
        e.preventDefault();
        setShowHelp(prev => !prev);
        return;
      }

      if (e.key === 'Escape') {
        setShowHelp(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions]);

  return { showHelp, setShowHelp };
}
