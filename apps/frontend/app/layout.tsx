import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: 'AdPilot',
  description: 'Ad performance dashboard with an AI analyst',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>{children}</body>
    </html>
  );
}