'use client';

export const notificationsSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = (): NotificationPermission | 'unsupported' =>
  notificationsSupported() ? Notification.permission : 'unsupported';

/** Must be called from a user gesture (button click). */
export async function enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows an OS notification (service worker first, which mobile browsers require). Returns false if it could not. */
export async function notify(title: string, body: string, tag?: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const opts: NotificationOptions = { body, tag, icon: '/assets/favicon/android-chrome-192x192.png', badge: '/assets/favicon/favicon-32x32.png' };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, opts); return true; }
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}
