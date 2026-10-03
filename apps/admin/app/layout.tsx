import type { Metadata } from 'next';
import { Montserrat, Roboto } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const headline = Montserrat({ subsets: ['latin'], variable: '--font-headline', display: 'swap' });
const body = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'KeeRa Control Plane',
  description: 'Platform administration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${headline.variable} ${body.variable} dark`}>
      <body className="min-h-screen bg-ink-900 font-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
