import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: 'ShamePool',
  description: 'Flake on your goals. Pay your friends.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#faf7ee' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
