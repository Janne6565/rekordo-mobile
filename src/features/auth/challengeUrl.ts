import { API_BASE } from "@/api/config";

/**
 * Where the webview loads the bot check from.
 *
 * A real hosted page rather than an HTML string, and that is the whole point. React Native
 * renders a string with `loadHTMLString(baseURL:)`, and a document loaded that way has no
 * genuine origin however respectable the baseURL looks -- Turnstile refused to run in it and
 * the sheet showed "the check could not be loaded". The same site key on the same domain had
 * always worked in an ordinary browser tab, which is what narrowed it down.
 *
 * Built from {@link API_BASE} rather than a constant, so the hostname the challenge is solved
 * on is the environment the app is actually talking to. The backend's approved-hostname list
 * carries both, and a staging build no longer has to borrow production's name to be believed.
 *
 * The page is `turnstile.html` in the frontend's `public/`, which nginx serves as a real file
 * before it falls through to the SPA.
 */
export function challengeUrl(action: ChallengeAction, language: string): string {
  const query = new URLSearchParams({ action, lang: language });
  return `${API_BASE}/turnstile.html?${query.toString()}`;
}

/**
 * How tall to make the webview.
 *
 * The normal widget is 300x65, with a few pixels of slack rather than a measurement: measuring
 * means a round trip through postMessage and a layout that jumps once the answer arrives, for
 * a size Cloudflare documents and does not vary.
 */
export const CHALLENGE_HEIGHT = 72;

/** Kept in step with the backend's {@code ChallengeAction} wire names. */
export type ChallengeAction =
  | "register"
  | "login"
  | "forgot-password"
  | "request-email-confirmation";

/**
 * What the page posts back. A tagged union rather than a bare token string, because an
 * expired challenge and one that could not be drawn both have to be distinguishable from a
 * solved one -- silence is what a form cannot act on.
 */
export type ChallengeMessage =
  | { readonly type: "token"; readonly token: string }
  | { readonly type: "expired" }
  /**
   * The code is Cloudflare's, or one of the page's own for the failures it can name itself.
   * Carried rather than swallowed: "the check could not be loaded" with nothing behind it
   * reads the same for a blocked domain (110200) and a dead network, and the person who can
   * see the screen is never the person who can read the logs.
   */
  | { readonly type: "error"; readonly code?: string };
