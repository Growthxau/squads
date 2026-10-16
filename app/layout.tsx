import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'G-Squad — Autonomous Deriv Trading Engine',
  description: 'G-Squad is an institutional-grade autonomous Deriv trading platform with Personal Access Token (PAT) security, synthetic indices 5-tick execution, and server-side risk limits.',
  openGraph: {
    title: 'G-Squad — Autonomous Deriv Trading Engine',
    description: 'G-Squad is an institutional-grade autonomous Deriv trading platform with Personal Access Token (PAT) security, synthetic indices 5-tick execution, and server-side risk limits.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'G-Squad — Autonomous Deriv Trading Engine',
    description: 'G-Squad is an institutional-grade autonomous Deriv trading platform with Personal Access Token (PAT) security, synthetic indices 5-tick execution, and server-side risk limits.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
