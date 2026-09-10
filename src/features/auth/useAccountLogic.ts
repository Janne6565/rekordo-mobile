import {
  type AuthProvider,
  accountExport,
  authProviders,
  cancelEmailChange,
  changeEmailAddress,
  createAccount,
  deleteAccount,
  emailConfirmation,
  fetchAccount,
  requestPasswordReset,
  resendEmailConfirmation,
  signIn,
  signOut,
  signOutEverywhere,
  updateDisplayName,
} from "@/api/auth";
import { lookupAlbumCovers, lookupPressingCovers } from "@/api/releases";
import { toCsv, wishlistToCsv } from "@/domain/csv";
import { signInWithProvider } from "@/features/auth/externalSignIn";
import { useChallenge } from "@/features/auth/useChallenge";
import { useStore } from "@/local/StoreProvider";
import { readPhotoBytes } from "@/local/photoBytes";
import { readSyncEnabled, writeSyncEnabled } from "@/local/settings";
import { encodeBase64 } from "@/local/sqliteStore";
import { accountChanged, signedIn, signedOut } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useSync } from "@/sync/SyncProvider";
import {
  MC_MIME_TYPE,
  catalogueKeysOf,
  exportMcArchive,
  mcFileName,
  passwordLongEnough,
} from "@janne6565/rekordo-shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";

export type AuthMode = "SIGN_IN" | "REGISTER";
export type AuthError =
  | "badCredentials"
  | "emailTaken"
  | "invalidEmail"
  | "passwordTooShort"
  | "consentRequired"
  | "challengeFailed"
  | "generic";

/**
 * Which input a field the server refused belongs to.
 *
 * The server answers a rejected body with the field names it would not take, and the
 * sentence for each is looked up here so it arrives in the reader's language. A field this
 * form does not have falls back to the generic line rather than being invented a message.
 */
const FIELD_ERRORS: Readonly<Record<string, AuthError>> = {
  email: "invalidEmail",
  password: "passwordTooShort",
  acceptedTerms: "consentRequired",
  confirmedAge: "consentRequired",
};

function errorsFrom(error: unknown): AuthError[] {
  const { status, invalidFields } = error as { status?: number; invalidFields?: readonly string[] };
  if (status === 409) return ["emailTaken"];
  if (status === 401) return ["badCredentials"];
  // The bot check, kept distinct from a wrong password and from a rate limit: the only
  // useful response to it is to solve the fresh challenge the widget has already drawn.
  if (status === 403) return ["challengeFailed"];
  // One line per distinct complaint: both consent ticks map to the same sentence, and
  // printing it twice would read as two different problems.
  const named = [
    ...new Set(
      (invalidFields ?? [])
        .map((field) => FIELD_ERRORS[field])
        .filter((mapped): mapped is AuthError => mapped !== undefined),
    ),
  ];
  return named.length > 0 ? named : ["generic"];
}

/** Reconcile with the server this often while the app is open and signed in. */

export function useAccountLogic() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { syncNow } = useSync();
  const dispatch = useAppDispatch();
  /*
   * The session is read from the store rather than held here, because this hook is mounted
   * three times (the account screen, Your data, the legal index) and the Friends tab needs
   * the same answer without mounting it at all. Restoring it is <RestoreSession />'s job.
   */
  const user = useAppSelector((state) => state.auth.user);
  const restoring = useAppSelector((state) => state.auth.status === "unknown");
  const firstSyncPending = useAppSelector((state) => state.auth.firstSyncPending);
  const [mode, setMode] = useState<AuthMode>("SIGN_IN");
  /**
   * Whether the sheet is asking for a reset rather than a sign-in.
   *
   * It exists because the bot check does. A token carries the action it was solved for, and
   * the server refuses a sign-in token presented at the reset endpoint -- so "Forgot?" can
   * no longer fire straight off a press. It puts the one widget on screen into asking for
   * the other action instead, and the send waits for it.
   */
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  /**
   * Two ticks, neither pre-checked (screen 17a).
   *
   * Separate booleans because they are two statements: agreeing to the terms is a contract,
   * confirming an age is a declaration of fact, and one box covering both would let somebody
   * agree to one by accepting the other.
   */
  const [agreed, setAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [resetSent, setResetSent] = useState(false);
  /*
   * One widget for all three actions this sheet can take. Re-created when the action
   * changes, because a token solved for one endpoint is refused at the others.
   */
  const challenge = useChallenge(
    resetting ? "forgot-password" : mode === "REGISTER" ? "register" : "login",
  );
  const [failed, setFailed] = useState<readonly AuthError[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * The name in the field, or null while it is still just showing the account's own.
   *
   * Null rather than a copy of the current name, because the session is restored from the
   * keychain after this screen has mounted: a draft seeded up front would sit there empty
   * until the person touched it.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameFailed, setRenameFailed] = useState(false);
  const [syncEnabled, setSyncEnabledState] = useState(true);

  const decideFirstSync = useCallback(async () => {
    const hasLocalCollection = (await store.listCopies()).length > 0;
    const hasSyncedBefore = (await store.readSyncCursor()) > 0;
    return hasLocalCollection && !hasSyncedBefore;
  }, [store]);

  // Only the things this screen owns. The session itself is restored once at the root.
  useEffect(() => {
    void (async () => {
      setProviders(await authProviders());
      setSyncEnabledState(await readSyncEnabled(store));
    })();
  }, [store]);

  const submit = useCallback(async () => {
    // The one rule worth checking before the round trip, because the server can only
    // answer it with the same sentence the field already carries as a hint.
    if (mode === "REGISTER" && !passwordLongEnough(password)) {
      setFailed(["passwordTooShort"]);
      return;
    }
    setBusy(true);
    setFailed([]);
    try {
      const account =
        mode === "REGISTER"
          ? await createAccount(
              email.trim(),
              password,
              displayName.trim(),
              agreed,
              ageConfirmed,
              challenge.token,
            )
          : await signIn(email.trim(), password, rememberMe, challenge.token);
      dispatch(signedIn({ user: account, firstSyncPending: await decideFirstSync() }));
      setPassword("");
    } catch (error) {
      setFailed(errorsFrom(error));
    } finally {
      // Spent either way: a token is redeemed exactly once, so leaving it in place would
      // make the next attempt fail for a reason nothing on screen could explain.
      challenge.reset();
      setBusy(false);
    }
  }, [
    mode,
    email,
    password,
    displayName,
    rememberMe,
    // Read straight into `createAccount`, and they were missing here: the closure only
    // refreshed when one of the fields above changed, so ticking the two boxes *last* —
    // which is the order the form is laid out in — submitted the false they held before.
    agreed,
    ageConfirmed,
    challenge.token,
    challenge.reset,
    decideFirstSync,
    dispatch,
  ]);

  /**
   * Google or Apple. Ends in the same place a password sign-in does — the round trip
   * through the browser is an implementation detail of proving who somebody is.
   */
  const signInWith = useCallback(
    async (providerId: string) => {
      setBusy(true);
      setFailed([]);
      try {
        const result = await signInWithProvider(providerId);
        // Closing the browser is a decision, not a failure; saying "something went wrong"
        // about it would be telling somebody their own choice was a mistake.
        if (result.outcome === "CANCELLED") return;
        if (result.outcome === "FAILED") {
          setFailed(["generic"]);
          return;
        }
        dispatch(signedIn({ user: result.user, firstSyncPending: await decideFirstSync() }));
      } finally {
        setBusy(false);
      }
    },
    [decideFirstSync, dispatch],
  );

  /** Puts the widget into asking for the reset action. Nothing is sent yet. */
  const beginReset = useCallback(() => {
    setFailed([]);
    setResetSent(false);
    setResetting(true);
  }, []);

  const cancelReset = useCallback(() => setResetting(false), []);

  const forgotPassword = useCallback(async () => {
    setBusy(true);
    await requestPasswordReset(email.trim(), challenge.token);
    // Silent whether or not that address has an account, as it has always been: a different
    // answer here would turn the sheet into a way to find out who is registered.
    setResetSent(true);
    setResetting(false);
    challenge.reset();
    setBusy(false);
  }, [email, challenge.token, challenge.reset]);

  const leave = useCallback(async () => {
    setBusy(true);
    await signOut();
    dispatch(signedOut());
    setBusy(false);
    // The local collection deliberately stays: signing out returns the app to how it
    // behaves with no account, and wiping someone's records would be a way to lose data.
  }, [dispatch]);

  /**
   * The deliberate version: every device, including this one.
   *
   * The session ends here whatever the server said, because a phone that stayed signed in
   * after somebody pressed this would be the one outcome nobody wants. A failure is
   * reported, though -- the other devices are the point, and this cannot promise them.
   */
  const leaveEverywhere = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      await signOutEverywhere();
      return true;
    } catch {
      // The account keeps its other sessions, but this device must not keep one either.
      await signOut();
      return false;
    } finally {
      dispatch(signedOut());
      setBusy(false);
    }
  }, [dispatch]);

  /**
   * Hands a finished CSV to the share sheet, which is the only way to get a file off a
   * phone: there is no download folder to write to and no browser to hand it to.
   */
  const shareCsv = useCallback(async (name: string, text: string) => {
    const file = `${FileSystem.cacheDirectory}${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    await FileSystem.writeAsStringAsync(file, text);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
      });
    }
  }, []);

  /**
   * The collection as a file. Built on the device from the local store, so it works
   * offline and works identically with no account at all.
   */
  const exportCsv = useCallback(async () => {
    const copies = await store.listCopies();
    const releases = await store.getReleases(catalogueKeysOf(copies));
    await shareCsv("rekordo", toCsv(copies, releases));
  }, [store, shareCsv]);

  /**
   * The wishlist as its own file, for the same reason it is its own screen: it is a list of
   * records you do not have, and folding it into the collection export would put a row in
   * the spreadsheet for something that is not on the shelf.
   */
  const exportWishlistCsv = useCallback(async () => {
    await shareCsv("rekordo-wishlist", wishlistToCsv(await store.listWishlist()));
  }, [store, shareCsv]);

  /**
   * The whole shelf in one file, photographs included.
   *
   * The two CSVs above are for reading; this one is for keeping. A spreadsheet has no
   * column that can hold a photograph, and none that can hold the clocks that make a copy
   * recognisable as *the same copy* when it comes back. The archive carries both, and the
   * two CSVs with them, so the file is still readable by anything years from now.
   *
   * Written as base64 because that is the only way to put bytes into a file from
   * JavaScript here — expo-file-system takes a string either way.
   */
  const exportArchive = useCallback(async () => {
    const exportedAt = new Date();
    const copies = await store.listCopies();
    const wishlist = await store.listWishlist();
    const releases = await store.getReleases(catalogueKeysOf(copies));
    const archive = await exportMcArchive(
      store,
      { collection: toCsv(copies, releases), wishlist: wishlistToCsv(wishlist) },
      (photoId) => readPhotoBytes(store, photoId),
      exportedAt,
      // The one request an export makes: a wish's cover lives in this deployment's release
      // mirror rather than in the collection, and an archive that did not ask would lose
      // the wishlist's pictures the moment it was imported against a different mirror.
      (albumIds) => lookupAlbumCovers(albumIds),
      // And the sleeves of the pressings those entries were made from: the covers endpoint
      // is asked about albums, and an album cannot say which of its pressings was picked.
      (releaseIds) => lookupPressingCovers(releaseIds),
    );
    const file = `${FileSystem.cacheDirectory}${mcFileName(exportedAt)}`;
    await FileSystem.writeAsStringAsync(
      file,
      encodeBase64(archive.bytes.slice().buffer as ArrayBuffer),
      {
        encoding: FileSystem.EncodingType.Base64,
      },
    );
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file, { mimeType: MC_MIME_TYPE, UTI: "public.zip-archive" });
    }
    return archive;
  }, [store]);

  /**
   * The whole record as JSON: the server's copy when there is an account, the device's own
   * store when there is not. A "download my data" that quietly returned an empty file to
   * somebody with no account would be the wrong kind of correct.
   */
  // `store` is reached through `localExport` below, a plain function the rule does not
  // follow into — so it is a real dependency that does not appear in this body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: store, see above.
  const exportJson = useCallback(async () => {
    const body = user === null ? await localExport() : await accountExport();
    const file = `${FileSystem.cacheDirectory}rekordo-export-${new Date().toISOString().slice(0, 10)}.json`;
    await FileSystem.writeAsStringAsync(file, JSON.stringify(body, null, 2));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file, { mimeType: "application/json", UTI: "public.json" });
    }
  }, [store, user]);

  /** What a device with no account has to hand over: its own store, and nothing else. */
  async function localExport() {
    const copies = await store.listCopies();
    const releases = await store.getReleases(catalogueKeysOf(copies));
    return {
      exportedAt: new Date().toISOString(),
      account: null,
      copies,
      releases: [...releases.values()],
      wishes: await store.listWishlist(),
    };
  }

  const removeAccount = useCallback(async () => {
    setBusy(true);
    try {
      await deleteAccount();
      dispatch(signedOut());
      // The cursor points into a change log that no longer exists; leaving it would make a
      // later sign-in believe it had already pulled everything.
      await store.writeSyncCursor(0);
    } finally {
      setBusy(false);
    }
  }, [store, dispatch]);

  /**
   * The confirmation row's state (21c), read from the server rather than remembered.
   *
   * "Link sent, good for 24 hours" and the resend countdown are facts about the server; a
   * client that only learned them from its own last button press would forget them the
   * moment the app was restarted.
   */
  const confirmation = useQuery({
    queryKey: ["emailConfirmation"],
    queryFn: emailConfirmation,
    enabled: user !== null,
  });

  /**
   * A fresh link.
   *
   * Says nothing about whether there was anything to send: the server answers the same
   * either way, and an address that is already confirmed is the state the person wanted
   * rather than an error to report at them. Inside the first minute nothing is sent and the
   * answer carries the seconds left instead -- pressing twice is impatience, not a mistake.
   */
  const [sendingConfirmation, setSendingConfirmation] = useState(false);
  const resendConfirmation = useCallback(async () => {
    setSendingConfirmation(true);
    try {
      queryClient.setQueryData(["emailConfirmation"], await resendEmailConfirmation());
    } catch {
      // Nothing to say. The row stays as it was and the button stays pressable rather than
      // claiming a link is on its way that is not.
    } finally {
      setSendingConfirmation(false);
    }
  }, [queryClient]);

  const cancelChange = useCallback(async () => {
    try {
      queryClient.setQueryData(["emailConfirmation"], await cancelEmailChange());
    } catch {
      // Same reasoning: a failed cancel leaves the row saying what is still true.
    }
  }, [queryClient]);

  const [changingEmail, setChangingEmail] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const changeEmail = useCallback(
    async (nextEmail: string, password: string | null): Promise<boolean> => {
      setChangingEmail(true);
      setChangeFailed(false);
      try {
        queryClient.setQueryData(
          ["emailConfirmation"],
          await changeEmailAddress(nextEmail.trim(), password),
        );
        return true;
      } catch {
        setChangeFailed(true);
        return false;
      } finally {
        setChangingEmail(false);
      }
    },
    [queryClient],
  );

  /**
   * The countdown on the resend button, ticked here rather than by the server.
   *
   * The server says how many seconds are left when asked; turning that into a number that
   * moves is the screen's job, and re-asking once a second would be a request per tick to
   * learn something arithmetic already knows.
   */
  const [now, setNow] = useState(() => Date.now());
  const sentAt = confirmation.data?.sentAt ?? null;
  const retryAfter = confirmation.data?.retryAfter ?? 0;
  useEffect(() => {
    if (sentAt === null || retryAfter === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentAt, retryAfter]);
  const confirmationCooldown =
    sentAt === null
      ? 0
      : Math.max(0, Math.ceil((Date.parse(sentAt) + retryAfter * 1000 - now) / 1000));

  /**
   * Re-reads the account, for the case the link was followed somewhere else.
   *
   * The confirmation link is an https URL, so on a phone it opens the browser rather than
   * this app. Coming back to a screen still nagging about an address that was confirmed a
   * moment ago is the app being wrong about the person, so the screen asks again on focus.
   */
  const refreshAccount = useCallback(async () => {
    try {
      dispatch(accountChanged(await fetchAccount()));
    } catch {
      // Offline, or the session is gone. Neither is this screen's problem to report.
    }
  }, [dispatch]);

  /**
   * Pull-to-refresh on the You tab, which is the one screen that needs both halves.
   *
   * The counts and the spend are read out of the local store, so they can only change once
   * a sync has run -- the same trap the Library's pull fell into. Everything else here is
   * the server's answer about the account itself: the name and mail address it holds, and
   * how much room the pictures are using, which a picture taken on another device changes
   * without this one hearing about it.
   */
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
      await Promise.all([
        refreshAccount(),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
        queryClient.invalidateQueries({ queryKey: ["collectionSpend"] }),
        queryClient.invalidateQueries({ queryKey: ["accountStorage"] }),
        queryClient.invalidateQueries({ queryKey: ["emailConfirmation"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [syncNow, refreshAccount, queryClient]);

  const accountName = user?.displayName ?? "";
  const saveName = useCallback(async () => {
    const next = nameDraft;
    if (next === null || next.trim() === accountName) return;
    setRenaming(true);
    setRenameFailed(false);
    try {
      dispatch(accountChanged(await updateDisplayName(next.trim())));
      // Back to following the account, which now says what was just typed.
      setNameDraft(null);
    } catch {
      setRenameFailed(true);
    } finally {
      setRenaming(false);
    }
  }, [nameDraft, accountName, dispatch]);

  return {
    user,
    restoring,
    /** Told the account's new picture so the You header follows without a round trip. */
    avatarChanged: useCallback(
      (url: string | null) => {
        if (user === null) return;
        dispatch(accountChanged({ ...user, avatarUrl: url ?? undefined }));
      },
      [user, dispatch],
    ),
    /** What the name field shows, which is the account's own name until it is edited. */
    nameDraft: nameDraft ?? accountName,
    editName: useCallback((next: string) => {
      setNameDraft(next);
      setRenameFailed(false);
    }, []),
    /** A rename is only offered once it would actually change something. */
    nameChanged: nameDraft !== null && nameDraft.trim() !== accountName,
    saveName,
    renaming,
    renameFailed,
    syncEnabled,
    setSyncEnabled: useCallback(
      async (enabled: boolean) => {
        setSyncEnabledState(enabled);
        await writeSyncEnabled(store, enabled);
      },
      [store],
    ),
    exportCsv,
    exportWishlistCsv,
    exportArchive,
    exportJson,
    deleteAccount: removeAccount,
    firstSyncPending,
    mode,
    setMode: useCallback((next: AuthMode) => {
      setMode(next);
      setFailed([]);
    }, []),
    email,
    setEmail,
    password,
    setPassword,
    displayName,
    setDisplayName,
    rememberMe,
    setRememberMe,
    agreed,
    ageConfirmed,
    setAgeConfirmed,
    setAgreed,
    providers,
    signInWith,
    resetSent,
    resetting,
    beginReset,
    cancelReset,
    forgotPassword,
    challenge,
    canSendReset: email.trim().length > 0 && challenge.satisfied,
    /** Undefined on a server that predates the field; treated as confirmed. */
    emailConfirmed: user?.emailVerified !== false,
    /** Set once a link is outstanding, which is what turns the row into its "sent" state. */
    confirmationSentAt: sentAt,
    /** Seconds until the button comes back, or 0 while it is pressable. */
    confirmationCooldown,
    resendConfirmation,
    sendingConfirmation,
    /** The address a change is waiting on, or null when none is. */
    pendingEmail: confirmation.data?.pendingEmail ?? null,
    cancelChange,
    changeEmail,
    changingEmail,
    changeFailed,
    refreshAccount,
    refreshing,
    refresh,
    // Completeness only, except the terms box: that is a required acknowledgement rather
    // than a format rule, so it does gate the button.
    canSubmit:
      email.trim().length > 0 &&
      password.length > 0 &&
      (mode === "SIGN_IN" || (agreed && ageConfirmed)) &&
      // Unsolved, or the site key not yet known. The second half matters: without it the
      // first attempt after a cold launch would post before this build learned a token was
      // required, and be refused with a 403 nothing on screen could account for.
      !resetting &&
      challenge.satisfied,
    submit,
    busy,
    failed,
    signOut: leave,
    signOutEverywhere: leaveEverywhere,
  };
}
