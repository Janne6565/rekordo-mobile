import { request, setAccessToken, writeRefreshToken } from "@/api/client";

export interface AccountUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  /**
   * Where the profile picture is (a path on the API host), or absent when there is none —
   * which is the ordinary case. Optional for the same reason as the two fields below: this
   * client is hand-written, and a build talking to a server that predates turn 27 must
   * read "no picture" rather than break.
   */
  readonly avatarUrl?: string;
  readonly createdAt: string;
  /**
   * Whether the address has been confirmed. Optional because this client is hand-written
   * against the server rather than generated from it: a build talking to a server that
   * predates the field would otherwise read `false` and nag about a confirmation that
   * server cannot send. Absent means "not asked", and every reader treats it as confirmed.
   */
  readonly emailVerified?: boolean;
  /**
   * Whether there is a password to ask for. An account made through a provider has none,
   * and the change-address screen has to know rather than showing a field nothing could
   * ever be typed into. Optional for the same reason as {@link AccountUser#emailVerified}.
   */
  readonly hasPassword?: boolean;
}

/** What the confirmation row draws (21c), and the waiting row of a pending change (21g). */
export interface EmailConfirmation {
  readonly confirmed: boolean;
  /** When the outstanding link went out, or null if none is. */
  readonly sentAt: string | null;
  readonly expiresAt: string | null;
  /** Seconds until another link may be asked for; zero while the button is pressable. */
  readonly retryAfter: number;
  /** The address a change is waiting on, or null when none is. */
  readonly pendingEmail: string | null;
}

export interface AuthProvider {
  readonly id: string;
  readonly displayName: string;
}

/**
 * Whether a bot check stands in front of sign-in, and with which site key.
 *
 * Asked for rather than shipped in the binary, which is the whole reason it is an endpoint:
 * a key baked into a build could never be rotated or switched off without a store release.
 * Optional, so a build talking to a server that predates it reads "no check" and goes on
 * working -- the server would not be asking for a token either.
 */
export interface Challenge {
  readonly siteKey?: string | null;
}

interface SessionPayload {
  accessToken?: string;
  refreshToken?: string;
  user?: AccountUser;
}

async function adopt(session: SessionPayload): Promise<AccountUser> {
  if (session.accessToken === undefined || session.user === undefined) {
    throw new Error("The server did not return a session");
  }
  setAccessToken(session.accessToken);
  if (session.refreshToken !== undefined) await writeRefreshToken(session.refreshToken);
  return session.user;
}

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean,
  turnstileToken: string | null,
): Promise<AccountUser> {
  return adopt(
    await request<SessionPayload>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password, rememberMe, turnstileToken },
      noRetry: true,
    }),
  );
}

/** Null site key, or an absent one, means no check and no token to send. */
export async function fetchChallenge(): Promise<Challenge> {
  return request<Challenge>("/api/v1/auth/challenge");
}

/**
 * The two consent ticks travel with the registration (design turn 17).
 *
 * The server refuses without them and stamps its own record of which documents, in which
 * version, were accepted -- so what is sent here is only *that* the boxes were ticked.
 */
export async function createAccount(
  email: string,
  password: string,
  displayName: string,
  acceptedTerms: boolean,
  confirmedAge: boolean,
  turnstileToken: string | null,
): Promise<AccountUser> {
  return adopt(
    await request<SessionPayload>("/api/v1/auth/register", {
      method: "POST",
      body: { email, password, displayName, acceptedTerms, confirmedAge, turnstileToken },
      noRetry: true,
    }),
  );
}

export interface ConsentRecord {
  readonly document: "TERMS" | "PRIVACY" | "AGE";
  readonly version: string;
  readonly acceptedAt: string;
}

/** The account as the server currently reads it. */
export async function fetchAccount(): Promise<AccountUser> {
  return request<AccountUser>("/api/v1/auth/me");
}

/**
 * Redeems a confirmation link.
 *
 * Open on the server, because the link is followed in whichever browser opened the mail —
 * so this works whether or not the phone happens to be signed in.
 */
export async function confirmEmailAddress(token: string): Promise<AccountUser> {
  return request<AccountUser>("/api/v1/auth/confirm-email", {
    method: "POST",
    body: { token },
    noRetry: true,
  });
}

/** What the confirmation row draws. Read from the server, so it survives a restart. */
export async function emailConfirmation(): Promise<EmailConfirmation> {
  return request<EmailConfirmation>("/api/v1/auth/confirm-email");
}

/**
 * A fresh link. Answers the same whether or not there was anything to send, and inside the
 * first minute sends nothing at all — the answer carries the seconds left instead.
 */
export async function resendEmailConfirmation(): Promise<EmailConfirmation> {
  return request<EmailConfirmation>("/api/v1/auth/confirm-email/resend", { method: "POST" });
}

/**
 * Starts a move to a different address (21g).
 *
 * Nothing about the account changes here: the old address goes on signing you in until the
 * new one answers its own link.
 */
export async function changeEmailAddress(
  email: string,
  password: string | null,
): Promise<EmailConfirmation> {
  return request<EmailConfirmation>("/api/v1/auth/email-change", {
    method: "POST",
    body: { email, password },
    noRetry: true,
  });
}

/** Calls off a change that has not landed yet. */
export async function cancelEmailChange(): Promise<EmailConfirmation> {
  return request<EmailConfirmation>("/api/v1/auth/email-change", { method: "DELETE" });
}

/** What the Legal & privacy screen prints under a document: "accepted 4 Mar 2026". */
export async function accountConsents(): Promise<ConsentRecord[]> {
  return request<ConsentRecord[]>("/api/v1/account/consents");
}

/** The Art. 15 / Art. 20 answer for what the server holds. Only meaningful with an account. */
export async function accountExport(): Promise<unknown> {
  return request<unknown>("/api/v1/account/export");
}

/** Only providers the server can actually complete a flow with. */
export async function authProviders(): Promise<AuthProvider[]> {
  return request<AuthProvider[]>("/api/v1/auth/providers", { noRetry: true }).catch(() => []);
}

/**
 * Finishes an external sign-in by redeeming the one-time code the callback deep-linked
 * back with.
 *
 * The code is not a credential on its own — it only becomes a session here, over the app's
 * own connection, which is why it is safe for it to have travelled through a URL.
 */
export async function completeExternalSignIn(code: string): Promise<AccountUser> {
  return adopt(
    await request<SessionPayload>("/api/v1/auth/oauth/exchange", {
      method: "POST",
      body: { code },
      noRetry: true,
    }),
  );
}

/** Always resolves: a different answer for a registered address would leak who has one. */
export async function requestPasswordReset(
  email: string,
  turnstileToken: string | null,
): Promise<void> {
  await request("/api/v1/auth/forgot-password", {
    method: "POST",
    body: { email, turnstileToken },
    noRetry: true,
  }).catch(() => undefined);
}

/**
 * Renames the account.
 *
 * Returns the account as the server now reads it rather than echoing what was sent: the
 * server trims the name and turns a blank one back into "no name", and the screen should
 * show what was actually stored.
 */
export async function updateDisplayName(displayName: string): Promise<AccountUser> {
  return request<AccountUser>("/api/v1/auth/me", { method: "PATCH", body: { displayName } });
}

export async function signOut(): Promise<void> {
  // Best effort: the local session is cleared either way, so a failed call cannot strand
  // someone in a half-signed-out state.
  await request("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
  setAccessToken(null);
  await writeRefreshToken(null);
}

/**
 * Ends every session on the account, this phone's included.
 *
 * Not best effort, unlike the one above: somebody asking for this wants the other devices
 * gone, and clearing only this one while telling them it worked would be a lie about a
 * thing they may have asked for because a device was lost.
 */
export async function signOutEverywhere(): Promise<void> {
  await request("/api/v1/auth/logout-all", { method: "POST" });
  setAccessToken(null);
  await writeRefreshToken(null);
}

/**
 * Deletes the account and everything synced to it.
 *
 * The local collection is deliberately untouched — it belongs to the device, not the
 * account, and the app goes on working without one.
 */
export async function deleteAccount(): Promise<void> {
  await request("/api/v1/auth/me", { method: "DELETE" });
  setAccessToken(null);
  await writeRefreshToken(null);
}
