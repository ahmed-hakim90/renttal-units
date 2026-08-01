import {
  mergeSeenNotificationKinds,
  SESSION_NOTIFICATIONS_COOKIE,
  type ActionableNotificationKind,
} from '@/lib/notifications/guards';

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/** Session cookie: no Max-Age so it clears when the browser session ends. */
export function markSessionNotificationsSeen(kinds: ActionableNotificationKind[]) {
  if (typeof document === 'undefined' || kinds.length === 0) return;

  const nextValue = mergeSeenNotificationKinds(
    readCookieValue(SESSION_NOTIFICATIONS_COOKIE),
    kinds,
  );

  const parts = [
    `${SESSION_NOTIFICATIONS_COOKIE}=${encodeURIComponent(nextValue)}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (window.location.protocol === 'https:') parts.push('Secure');

  document.cookie = parts.join('; ');
}
