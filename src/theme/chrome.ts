import { isDark } from "@/theme/colors";
import { type CoverTheme, type DetailChrome, chromeFor } from "@janne6565/rekordo-shared";

/**
 * The detail chrome for a cover, in whichever palette the app is in.
 *
 * In light, the cover decides (turn 3): a dark sleeve gets the dark chrome, a light one the
 * light chrome. In the hidden dark mode a light chrome would be the one bright page in a dark
 * app, so every cover gets the dark chrome -- still with the cover's own accent wherever it
 * reads against it, which is what the cover keeps of its say.
 */
export function appChromeFor(theme: CoverTheme | null): DetailChrome {
  if (!isDark) return chromeFor(theme);
  return chromeFor({ ...(theme ?? NO_COVER), dark: true });
}

/** No cover to read: the accent check finds nothing in it and keeps the design accent. */
const NO_COVER: CoverTheme = { dominantColor: "", accentColor: "", lightness: 0, dark: true };
