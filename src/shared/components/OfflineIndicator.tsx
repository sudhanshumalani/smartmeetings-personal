import { useOnline } from '../../contexts/OnlineContext';
import { WifiOff } from 'lucide-react';

export default function OfflineIndicator() {
  const { isOnline } = useOnline();

  if (isOnline) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-yellow-500 px-4 py-1.5 text-sm font-medium text-white">
      <WifiOff size={14} />
      <span>You are offline. Some features are unavailable.</span>
    </div>
  );
}
