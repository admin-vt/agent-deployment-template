import type { ReactNode } from 'react';

export const metadata = {
  title: 'Agent Onboarding',
  description: 'Connect your accounts and set up model access for your agent.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '3rem auto', padding: '0 1rem', lineHeight: 1.6 }}>
        {children}
      </body>
    </html>
  );
}
