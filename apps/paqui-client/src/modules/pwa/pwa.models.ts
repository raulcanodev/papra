// iPadOS asks for the desktop site and says it is a Mac: only its touch screen gives it away
export function isIosDevice({ userAgent, maxTouchPoints }: { userAgent: string; maxTouchPoints: number }) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

// Opened from its icon: in its own window, without the browser around it (Safari on iOS has its own flag for it)
export function isStandaloneDisplay({ matchesStandaloneMedia, navigatorStandalone }: { matchesStandaloneMedia: boolean; navigatorStandalone?: boolean }) {
  return matchesStandaloneMedia || navigatorStandalone === true;
}
