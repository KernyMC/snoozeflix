'use client';
import { useEffect } from 'react';
import { startBackend } from '@/data';
import { DemoPanel } from './DemoPanel';
import { FlakeWatcher } from './FlakeWatcher';
import { UpgradeBannerReset } from './UpgradeBanner';
import { ToastProvider } from './ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => startBackend(), []);
  // iOS Safari only shows pressed (:active) styles once the page listens for touches, so listen for them and do nothing.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);
  return (
    <ToastProvider>
      {children}
      <FlakeWatcher />
      <UpgradeBannerReset />
      <DemoPanel />
    </ToastProvider>
  );
}
