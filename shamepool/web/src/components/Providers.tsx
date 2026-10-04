'use client';
import { useEffect } from 'react';
import { startBackend } from '@/data';
import { DemoPanel } from './DemoPanel';
import { FlakeWatcher } from './FlakeWatcher';
import { UpgradeBannerReset } from './UpgradeBanner';
import { ToastProvider } from './ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => startBackend(), []);
  return (
    <ToastProvider>
      {children}
      <FlakeWatcher />
      <UpgradeBannerReset />
      <DemoPanel />
    </ToastProvider>
  );
}
