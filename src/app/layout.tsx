import './globals.css';
import { Header } from '../components/Header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Allowance - AI that can shop but cannot overspend',
  description:
    'Autonomous shopping agent with deterministic policy guardrails, adversarial injection shield, and PayPal Sandbox integration.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col antialiased selection:bg-blue-600 selection:text-white">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-900 bg-gray-950 py-6 text-center text-xs text-gray-500">
          <p>Allowance • Built for PayPal & AI Hackathon • PayPal Sandbox Orders v2 • Deterministic Code Safety Layer</p>
        </footer>
      </body>
    </html>
  );
}
