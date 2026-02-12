import { useState } from 'react';
import { X, Copy, Check, AlertCircle } from 'lucide-react';
import { claudeService } from '../../../services/claudeService';
import type { AnalysisResult } from '../../../services/claudeService';
import useFocusTrap from '../../../shared/hooks/useFocusTrap';

interface CopyPasteModalProps {
  prompt: string;
  onResult: (result: AnalysisResult) => void;
  onClose: () => void;
}

export default function CopyPasteModal({ prompt, onResult, onClose }: CopyPasteModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const [copied, setCopied] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text area content
    }
  }

  function handleParseAndSave() {
    setParseError(null);
    try {
      const result = claudeService.parseManualResult(pastedJson);
      onResult(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse JSON');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div ref={trapRef} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-gray-800" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Manual Analysis (Copy-Paste)
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Step 1: Copy Prompt */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Step 1: Copy the prompt below and paste it into Claude
            </h3>
            <div className="relative">
              <textarea
                readOnly
                value={prompt}
                className="h-40 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"
              />
              <button
                onClick={handleCopy}
                className="absolute right-2 top-2 flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                {copied ? (
                  <>
                    <Check size={12} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Copy Prompt
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Paste Result */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Step 2: Paste the JSON response from Claude
            </h3>
            <textarea
              value={pastedJson}
              onChange={(e) => {
                setPastedJson(e.target.value);
                setParseError(null);
              }}
              placeholder='Paste the JSON response here (starts with { "summary": ... })'
              className="h-40 w-full rounded-lg border border-gray-300 p-3 font-mono text-xs text-gray-700 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            />
          </div>

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20" data-testid="parse-error">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
              <span className="text-sm text-red-600 dark:text-red-400">{parseError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleParseAndSave}
              disabled={!pastedJson.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Parse & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
