import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Code Security Reviewer',
  description:
    'Catch security bugs on every PR. AI-powered review for indie hackers and small teams.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
