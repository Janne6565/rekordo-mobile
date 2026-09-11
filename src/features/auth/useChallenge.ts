import { fetchChallenge } from "@/api/auth";
import type { ChallengeAction, ChallengeMessage } from "@/features/auth/challengeUrl";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

export interface Challenge {
  readonly action: ChallengeAction;
  readonly siteKey: string | null;
  /** Nothing is drawn when the server has no keys configured. */
  readonly required: boolean;
  /**
   * Whether the submit may go ahead. False while the site key is still being fetched, so a
   * form cannot post before it knows a token is about to be demanded.
   *
   * Always true while the server is only observing: the widget is still drawn and its token
   * still sent, but one that fails to load must not hold a submit the server would accept.
   */
  readonly satisfied: boolean;
  readonly token: string | null;
  /** The widget could not be drawn -- worth saying, because nothing is visible. */
  readonly failed: boolean;
  /**
   * Why, when the page could say. Cloudflare's own code (110200 is a domain the widget does
   * not allow) or one of the page's own names for a failure it can identify itself.
   */
  readonly failureCode: string | null;
  /** Wired to the webview by {@link ChallengeGate}. */
  readonly onMessage: (message: ChallengeMessage) => void;
  /**
   * A number that changes when a fresh challenge is wanted, used as the webview's key.
   *
   * Remounting rather than calling `turnstile.reset` through injected JavaScript: the reset
   * has to happen inside the document, and a remount is one mechanism instead of two. A
   * token is spent by the attempt that used it, so this runs after every submit.
   */
  readonly generation: number;
  readonly reset: () => void;
}

/**
 * The bot check on one form, on the phone.
 *
 * Same contract as the web hook, with the widget living in a webview because Turnstile is a
 * browser widget and there is no native equivalent. The site key is fetched rather than
 * built in: a key compiled into a shipped binary could not be rotated or switched off
 * without a store release.
 */
export function useChallenge(action: ChallengeAction): Challenge {
  const query = useQuery({
    queryKey: ["authChallenge"],
    queryFn: fetchChallenge,
    // It changes when the deployment does, never while the app is open.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const latest = useRef(0);

  const siteKey = query.data?.siteKey ?? null;
  // Told, not inferred: the rollout state is keys present and nothing refused.
  const enforced = query.data?.enforced === true;

  const onMessage = useCallback((message: ChallengeMessage) => {
    switch (message.type) {
      case "token":
        setToken(message.token);
        setFailed(false);
        setFailureCode(null);
        break;
      case "expired":
        // Five minutes is easily long enough for somebody to be interrupted mid-form. A
        // fresh challenge beats a submit the server refuses as expired.
        setToken(null);
        break;
      case "error":
        setToken(null);
        setFailed(true);
        setFailureCode(message.code ?? null);
        break;
    }
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    setFailed(false);
    setFailureCode(null);
    latest.current += 1;
    setGeneration(latest.current);
  }, []);

  return {
    action,
    siteKey,
    required: siteKey !== null,
    /*
     * A failed lookup counts as satisfied. Blocking every sign-in because this one small
     * endpoint answered badly would be the worse failure, and it is not the client's call
     * anyway: the server verifies, and answers 403 if it wanted a token.
     */
    satisfied: query.isPending ? false : siteKey === null || !enforced || token !== null,
    token,
    failed,
    failureCode,
    onMessage,
    generation,
    reset,
  };
}
