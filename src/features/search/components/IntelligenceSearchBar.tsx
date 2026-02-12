import { useState, useRef } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { meetingIntelligenceService } from '../../../services/meetingIntelligenceService';
import type { IntelligenceResult } from '../../../services/meetingIntelligenceService';

interface IntelligenceSearchBarProps {
  onResults: (results: IntelligenceResult[]) => void;
  onClear: () => void;
  onError: (error: string) => void;
}

export default function IntelligenceSearchBar({ onResults, onClear, onError }: IntelligenceSearchBarProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed || searching) return;

    setSearching(true);
    onError('');

    try {
      const results = await meetingIntelligenceService.executeQuery(trimmed);
      onResults(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      onError(message);
    } finally {
      setSearching(false);
    }
  }

  function handleClear() {
    setQuery('');
    onClear();
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        {searching ? (
          <Loader2 size={16} className="animate-spin text-brand-500" />
        ) : (
          <Sparkles size={16} className="text-brand-500" />
        )}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your meetings..."
        className="w-full rounded-lg border border-brand-200 bg-brand-50/50 py-2 pl-10 pr-10 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-brand-800 dark:bg-brand-900/20 dark:text-gray-300 dark:focus:border-brand-600 dark:focus:ring-brand-900/40"
        data-search-input
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
