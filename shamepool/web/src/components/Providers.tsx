'use client';
import { useEffect } from 'react';
import { startBackend } from '@/data';
import { DemoPanel } from './DemoPanel';
import { FlakeWatcher } from './FlakeWatcher';
import { ToastProvider } from './ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => startBackend(), []);
  return (
    <ToastProvider>
      {children}
      <FlakeWatcher />
      <DemoPanel />
    </ToastProvider>
  );
}
