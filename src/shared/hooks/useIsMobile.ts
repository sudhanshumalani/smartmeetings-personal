function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;

  // iPhone / iPod
  if (/iPhone|iPod/.test(ua)) return true;

  // iPad on iOS < 13 reports as iPad in UA
  if (/iPad/.test(ua)) return true;

  // iPad on iOS 13+ reports as Mac but has touch support
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;

  return false;
}

// User-agent is static per session — no need for useState/useEffect
const isIOS = detectIOS();

export default function useIsMobile(): boolean {
  return isIOS;
}
