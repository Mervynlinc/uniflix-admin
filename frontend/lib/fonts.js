// lib/fonts.js
import { Roboto } from 'next/font/google';

export const roboto = Roboto({
  weight: ['400', '700'], // Regular and bold weights
  style: ['normal', 'italic'], // Optional: Include styles
  subsets: ['latin'], // Limit to Latin characters
  variable: '--font-roboto', // For Tailwind integration
  display: 'swap', // Use fallback font while loading
});