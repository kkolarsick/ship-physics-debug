import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SubLedger — know your workers’ compensation audit exposure',
  description:
    'Upload your subcontractor ledger. SubLedger applies the audit treatment for your state, estimates the premium exposure, and ranks the actions that may reduce it.',
};

/**
 * The document shell only. The public pages and the product carry their own layouts, so a
 * visitor who has never signed in never sees the application chrome.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
