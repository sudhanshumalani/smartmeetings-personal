import { useToast, type ToastType } from '../../contexts/ToastContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const typeConfig: Record<ToastType, { icon: typeof CheckCircle; borderClass: string; iconClass: string; bgClass: string }> = {
  success: {
    icon: CheckCircle,
    borderClass: 'border-l-green-500',
    iconClass: 'text-green-500',
    bgClass: 'bg-white dark:bg-gray-800',
  },
  error: {
    icon: AlertCircle,
    borderClass: 'border-l-red-500',
    iconClass: 'text-red-500',
    bgClass: 'bg-white dark:bg-gray-800',
  },
  warning: {
    icon: AlertTriangle,
    borderClass: 'border-l-amber-500',
    iconClass: 'text-amber-500',
    bgClass: 'bg-white dark:bg-gray-800',
  },
  info: {
    icon: Info,
    borderClass: 'border-l-brand-500',
    iconClass: 'text-brand-500',
    bgClass: 'bg-white dark:bg-gray-800',
  },
};

const countdownColors: Record<ToastType, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-brand-500',
};

export default function Toast() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="no-print fixed bottom-4 left-4 right-4 z-50 flex flex-col items-end gap-2 overflow-hidden">
      {toasts.map((toast) => {
        const config = typeConfig[toast.type];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            role="alert"
            className={`animate-slide-in-right flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-gray-200 shadow-lg dark:border-gray-700 ${config.bgClass} border-l-4 ${config.borderClass}`}
          >
            <div className="flex items-center gap-2.5 px-4 py-3">
              <Icon size={18} className={`shrink-0 ${config.iconClass}`} />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {toast.message}
              </span>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-2 shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
            <div className="h-0.5 w-full bg-gray-100 dark:bg-gray-700">
              <div
                className={`h-full ${countdownColors[toast.type]}`}
                style={{ animation: 'shrinkBar 3s linear forwards' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
