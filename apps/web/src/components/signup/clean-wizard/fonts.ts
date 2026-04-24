import { GeistSans } from 'geist/font/sans';
import { JetBrains_Mono } from 'next/font/google';

/** JetBrains Mono — used by `cleanStyles` eyebrow / step numbers / URL preview (see `clean-wizard-styles.ts`). */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export { GeistSans };

export const cleanSignupFontClassName = `${GeistSans.variable} ${jetbrainsMono.variable}`;
