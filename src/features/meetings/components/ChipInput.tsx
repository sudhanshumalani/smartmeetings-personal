import { useState, useRef } from 'react';
import { X } from 'lucide-react';

interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  label: string;
}

export default function ChipInput({
  values,
  onChange,
  placeholder,
  suggestions,
  label,
}: ChipInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = (suggestions ?? []).filter(
    (s) =>
      s.toLowerCase().includes(input.toLowerCase()) &&
      !values.includes(s),
  );

  function addChip(value: string) {
    const trimmed = value.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
    setShowSuggestions(false);
  }

  function removeChip(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      addChip(input);
    } else if (
      e.key === 'Backspace' &&
      !input &&
      values.length > 0
    ) {
      removeChip(values[values.length - 1]);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 focus-within:border-blue-500 dark:border-gray-600 dark:bg-gray-800"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 py-0.5 pl-2 pr-1 text-sm dark:bg-gray-700"
          >
            <span className="text-gray-800 dark:text-gray-200">{v}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeChip(v);
              }}
              className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600"
              aria-label={`Remove ${v}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() =>
            setTimeout(() => setShowSuggestions(false), 150)
          }
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 outline-none placeholder-gray-400 dark:text-gray-100"
          aria-label={label}
        />
      </div>

      {/* Autocomplete suggestions */}
      {showSuggestions &&
        input &&
        filteredSuggestions.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addChip(s);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
