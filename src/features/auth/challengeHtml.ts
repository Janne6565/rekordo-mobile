import { colors } from "@/theme/colors";

/**
 * The document the webview renders the Turnstile widget in.
 *
 * A webview rather than a native SDK because there is no native SDK -- Turnstile is a
 * browser widget, and a browser is what has to run it. The awkward part is the origin: the
 * widget refuses to render on a hostname that is not on its domain list, and a document
 * loaded from a string has no hostname at all. {@link CHALLENGE_BASE_URL} is what supplies
 * one, and it has to stay on that list.
 *
 * Everything is inlined -- no bundled asset file -- because the only variable parts are the
 * site key, the action and the language, all three of which are known at render time.
 */
export const CHALLENGE_BASE_URL = "https://rekordo.jannekeipert.de";

/**
 * How tall to make the webview.
 *
 * The compact widget is 130x120 and the normal one 300x65. Normal is used and the box is
 * given a few pixels of slack rather than measured: measuring means a round trip through
 * postMessage and a layout that jumps once the answer arrives, for a widget whose size
 * Cloudflare documents and does not vary.
 */
export const CHALLENGE_HEIGHT = 72;

/** Kept in step with the backend's {@code ChallengeAction} wire names. */
export type ChallengeAction =
  | "register"
  | "login"
  | "forgot-password"
  | "request-email-confirmation";

/**
 * Messages the document posts back. A tagged union rather than a bare token string, because
 * an expired challenge and a widget that could not load both have to be distinguishable
 * from a solved one -- silence is what a form cannot act on.
 */
export type ChallengeMessage =
  | { readonly type: "token"; readonly token: string }
  | { readonly type: "expired" }
  | { readonly type: "error" };

export function challengeHtml(siteKey: string, action: ChallengeAction, language: string): string {
  // JSON.stringify rather than quoting by hand: all three values end up inside a script,
  // and a stray quote in any of them would otherwise break the document silently.
  const config = JSON.stringify({ sitekey: siteKey, action, language });
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: ${colors.paper};
        /* The webview is exactly the widget's size, so anything that overflows is a
           scrollbar over a checkbox rather than something worth reaching. */
        overflow: hidden;
      }
    </style>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback" async defer></script>
  </head>
  <body>
    <div id="widget"></div>
    <script>
      (function () {
        var config = ${config};
        function post(message) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
        function draw() {
          try {
            window.turnstile.render(document.getElementById("widget"), {
              sitekey: config.sitekey,
              action: config.action,
              language: config.language,
              theme: "light",
              size: "normal",
              callback: function (token) { post({ type: "token", token: token }); },
              "expired-callback": function () { post({ type: "expired" }); },
              "error-callback": function () { post({ type: "error" }); }
            });
          } catch (error) {
            post({ type: "error" });
          }
        }
        /*
         * The script is async, so it may not have defined turnstile yet. onloadTurnstileCallback
         * is the hook it calls when it has -- and the check before it covers the race the
         * other way, where it was already there before this ran.
         */
        if (window.turnstile !== undefined) draw();
        else window.onloadTurnstileCallback = draw;
        /*
         * A widget that never appears is the failure worth reporting: the phone may be on a
         * network that cannot reach Cloudflare at all, and without this the form would sit
         * disabled with nothing said.
         */
        window.setTimeout(function () {
          if (window.turnstile === undefined) post({ type: "error" });
        }, 15000);
      })();
    </script>
  </body>
</html>`;
}
