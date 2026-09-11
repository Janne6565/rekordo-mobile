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
export function challengeUrl(
  action: ChallengeAction,
  language: string,
  generation: number,
): string {
  /*
   * The generation is in the URL, not just the webview's key, and it earns its place twice.
   *
   * Remounting a webview at an unchanged URL is exactly the case a cache is designed to
   * serve from, so a reset could hand back the same spent document. Worse, the page carried
   * no Cache-Control for a while: anyone who opened the app before it was deployed had a
   * cached 200 of index.html under this URL, and went on being served the SPA -- rendering
   * its own "Not Found" inside a 72-pixel box -- long after the real page existed.
   *
   * A URL that changes cannot be answered from a stale entry. The server sends no-store now
   * as well; this is the half that does not wait for a deploy to take effect.
   */
  const query = new URLSearchParams({ action, lang: language, n: String(generation) });
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

/**
 * Development only: forwards the page's console, and a snapshot of what its environment
 * actually looks like, out to Metro.
 *
 * Runs before the document's own scripts, so it catches what the Turnstile script says while
 * loading rather than only what survives to the end. The environment lines are the ones that
 * settle arguments: whether the user-agent override took effect, whether cookies and storage
 * are writable, and whether the frame thinks it is secure -- each of which has been guessed at
 * rather than known at some point today.
 *
 * Stripped in production by the `__DEV__` guard at the call site.
 */
export const CHALLENGE_DEBUG_JS = `
(function () {
  function send(line) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "log", line: String(line) }));
    }
  }
  ["log", "warn", "error"].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try {
        send("[" + level + "] " + Array.prototype.map.call(arguments, function (a) {
          try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
          catch (e) { return String(a); }
        }).join(" "));
      } catch (e) {}
      original.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    send("[uncaught] " + (e && e.message) + " @ " + (e && e.filename) + ":" + (e && e.lineno));
  });
  window.addEventListener("unhandledrejection", function (e) {
    send("[rejection] " + (e && e.reason));
  });
  var cookieWorks = false;
  try {
    document.cookie = "rk_probe=1; SameSite=None; Secure";
    cookieWorks = document.cookie.indexOf("rk_probe") !== -1;
  } catch (e) {}
  var storageWorks = false;
  try {
    window.localStorage.setItem("rk_probe", "1");
    storageWorks = window.localStorage.getItem("rk_probe") === "1";
  } catch (e) {}
  send("[env] ua=" + navigator.userAgent);
  send("[env] origin=" + window.location.origin + " secure=" + window.isSecureContext +
       " cookieEnabled=" + navigator.cookieEnabled + " cookieWritable=" + cookieWorks +
       " localStorage=" + storageWorks);
  true;
})();
true;
`;

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
   * Development only: whatever the page logged, and what its environment looks like.
   *
   * A webview has no console anybody can see, which is why three separate guesses were needed
   * to learn what one error code would have said outright. This forwards it to Metro.
   */
  | { readonly type: "log"; readonly line: string }
  /**
   * The code is Cloudflare's, or one of the page's own for the failures it can name itself.
   * Carried rather than swallowed: "the check could not be loaded" with nothing behind it
   * reads the same for a blocked domain (110200) and a dead network, and the person who can
   * see the screen is never the person who can read the logs.
   */
  | { readonly type: "error"; readonly code?: string };
