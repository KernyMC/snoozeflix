import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: 'ShamePool',
  description: 'Skip the task. Lose the cash.',
  manifest: '/assets/favicon/site.webmanifest',
  icons: {
    icon: [
      { url: '/assets/favicon/favicon.ico' },
      { url: '/assets/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/assets/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/assets/favicon/apple-touch-icon.png',
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#faf7ee' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (Grammarly, device simulators) add attributes to <html> and <body>
    // before React loads; suppressHydrationWarning ignores those on these two tags only.
    <html lang="en" className={nunito.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
