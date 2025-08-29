import { Inter } from 'next/font/google';
import './globals.css';

// Configure Inter font
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'Uniflix Admin',
  description: 'Uniflix Admin Dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} antialiased bg-gradient-to-r from-slate-500 via-teal-950 to-gray-700 min-h-screen text-white`}
      >
        {children}
      </body>
    </html>
  );
}
