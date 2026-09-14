import Constants from "expo-constants";

/**
 * Where the metadata proxy lives.
 *
 * A physical device cannot reach the developer's localhost, so a dev build points at the
 * Metro host's LAN address when one is available and falls back to staging otherwise.
 *
 * That default expects a backend running on that machine. With none, every call fails and
 * the app looks broken in a way that does not say so: no sign-in, no OAuth, and every cover
 * falling back to its format silhouette because the metadata proxy answered nothing. To
 * work against a deployed backend instead, start with `bun run dev:staging` or
 * `bun run dev:prod`, which set the override below. Keep those script names and this
 * comment in step.
 */
const PRODUCTION = "https://rekordo.de";
const STAGING = "https://staging.rekordo.de";

function developmentBase(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri === undefined) return null;
  const host = hostUri.split(":")[0];
  return host === undefined || host === "" ? null : `http://${host}:8080`;
}

/**
 * An explicit build-time override, set per EAS build profile in `eas.json`.
 *
 * It has to be read as a literal `process.env.EXPO_PUBLIC_*` member expression: the Expo
 * bundler substitutes the value by matching the source text, so a computed lookup would
 * survive the build as `undefined`. Absent from the `development` and `production`
 * profiles, where the fallbacks below are already right; `preview` sets it to staging so
 * a QA build cannot write test copies into the real collection.
 */
const OVERRIDE = process.env.EXPO_PUBLIC_API_BASE;

export const API_BASE =
  OVERRIDE !== undefined && OVERRIDE !== ""
    ? OVERRIDE
    : __DEV__
      ? (developmentBase() ?? STAGING)
      : PRODUCTION;

/*
 * Said out loud, once, in development only.
 *
 * Which backend a dev build is talking to is invisible from inside the app, and getting it
 * wrong does not look like a connection problem: the collection is local-first, so it still
 * draws, just without covers, without sign-in and without any of the last sync's changes.
 * That is a long way to walk before suspecting the URL.
 */
if (__DEV__) {
  console.log(`[rekordo] API_BASE ${API_BASE}`);
}

/**
 * Where the *web* app lives — the host a shared link has to name.
 *
 * Not `API_BASE`: in development that is the Metro host's LAN address, which is a real
 * backend but an address nobody outside the flat can open. A link is only worth copying if
 * the person you send it to can follow it, so a development build hands out the production
 * one and only a deployed build's own host wins.
 */
export const WEB_BASE = API_BASE.startsWith("https://") ? API_BASE : PRODUCTION;
