import { type CurrencyCode, DEFAULT_CURRENCY, isCurrencyCode } from "@/domain/currency";
import type { LocalStore } from "@/local/LocalStore";
import type { LegalLanguage, LibrarySort, WishSort } from "@janne6565/rekordo-shared";
import { parseLibrarySort, parseWishSort } from "@janne6565/rekordo-shared";

/**
 * The handful of device-local preferences the account screen exposes.
 *
 * They live in the local store rather than in Redux because they have to survive a reload
 * before the session is restored — the sync loop consults `syncEnabled` on the first tick,
 * which happens well before any screen has rendered.
 */

const SYNC_ENABLED = "syncEnabled";
const LAST_SYNCED_AT = "lastSyncedAt";
/** The last few things typed into the add search, newest first. */
const RECENT_SEARCHES = "recentSearches";
const RECENT_SEARCH_LIMIT = 6;
/**
 * How the wishlist is ordered on this device.
 *
 * A preference, not synced data — unlike the hand-built order itself, which is a
 * `sortIndex` on every entry. Which column you happen to be reading a list by is a fact
 * about the screen in front of you; where you dragged a row to is a fact about the list.
 */
const WISHLIST_SORT = "wishlistSort";

/**
 * Which order the shelf is in, this device's own choice.
 *
 * The *order* a hand-arranged shelf is in syncs -- that is `Copy.sortIndex` -- but which
 * of the four orders you are currently looking at does not. Sorting by artist on the phone
 * to find something is not a statement about the collection, and a laptop that rearranged
 * itself because of it would be a laptop doing something nobody asked for.
 */
const LIBRARY_SORT = "librarySort";

/**
 * Which language the legal documents are read in.
 *
 * Separate from the app's UI language on purpose: which version of a document binds you is
 * a legal question, and which language the menus are in is a preference.
 */
const DOCUMENT_LANGUAGE = "documentLanguage";

/**
 * What the last sync was unable to describe.
 *
 * Sync moves copies, not the catalogue behind them, so a device that has just signed in
 * holds records it cannot yet name. Until this was recorded the shelf had no way to say
 * so: thirty untitled placeholders looked exactly like thirty successfully synced records
 * that happened to have no metadata, and the only honest reading — "the catalogue has not
 * arrived yet, and it is still coming" — was the one nothing on screen could express.
 */
const CATALOGUE_GAP = "catalogueGap";

/**
 * Collectors this device has looked at, newest first.
 *
 * The people, not the strings that found them. Handing back "jan" so it can be typed again
 * saves four characters; handing back the person it led to is one tap to their shelf, which
 * is what somebody opening this field is actually after. A search that ended nowhere is not
 * worth remembering either way.
 *
 * Device-local and never synced: which shelves you have been reading is a fact about this
 * phone, and it is nobody's business but its owner's.
 */
const RECENT_COLLECTORS = "recentCollectors";
const RECENT_COLLECTOR_LIMIT = 6;

export interface RecentCollector {
  readonly handle: string;
  readonly displayName: string | null;
  /**
   * When this device last opened their shelf.
   *
   * Optional because rows written before the list showed it have none, and a list that
   * threw those away would empty itself once to gain a subtitle. A row without it simply
   * says less.
   */
  readonly seenAt?: number;
  /** What their shelf held when it was last seen; absent when it is closed to this viewer. */
  readonly copyCount?: number;
  /**
   * Their picture as of the last visit, or absent.
   *
   * Remembered rather than looked up, because this list is drawn from the device and asks
   * the server nothing. It can therefore be a version behind: a picture replaced since the
   * last visit keeps showing the old one here until the shelf is opened again, and a
   * picture removed since falls back to initials on its own, because the URL 404s and the
   * circle underneath is already the right drawing of that person.
   */
  readonly avatarUrl?: string;
}

export async function readRecentCollectors(store: LocalStore): Promise<RecentCollector[]> {
  const raw = await store.readSetting(RECENT_COLLECTORS);
  if (raw === null || raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is RecentCollector =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as RecentCollector).handle === "string",
        )
      : [];
  } catch {
    // Written by a version that shaped it differently, or truncated. One bad row is not
    // worth a broken screen; the list rebuilds itself the next time somebody looks at
    // anybody.
    return [];
  }
}

export async function rememberCollector(store: LocalStore, entry: RecentCollector): Promise<void> {
  if (entry.handle.trim() === "") return;
  const kept = (await readRecentCollectors(store)).filter(
    (existing) => existing.handle.toLowerCase() !== entry.handle.toLowerCase(),
  );
  // Stamped here rather than by the caller: every write is a visit, and a caller that
  // forgot the timestamp would silently cost the row its subtitle.
  const stamped: RecentCollector = { ...entry, seenAt: Date.now() };
  await store.writeSetting(
    RECENT_COLLECTORS,
    JSON.stringify([stamped, ...kept].slice(0, RECENT_COLLECTOR_LIMIT)),
  );
}

/** One row off the list, for the X beside it. Clearing all is {@link forgetCollectors}. */
export async function forgetCollector(store: LocalStore, handle: string): Promise<void> {
  const kept = (await readRecentCollectors(store)).filter(
    (existing) => existing.handle.toLowerCase() !== handle.toLowerCase(),
  );
  await store.writeSetting(RECENT_COLLECTORS, JSON.stringify(kept));
}

export async function forgetCollectors(store: LocalStore): Promise<void> {
  await store.writeSetting(RECENT_COLLECTORS, JSON.stringify([]));
}

/**
 * Whether the "a link is on its way" strip (21b) has had its one appearance here.
 *
 * Device-local and never synced: it is a fact about a screen somebody has already read,
 * not about the account. Signing in on a second device earns one strip there too, which is
 * right — that device has not seen it.
 */
const CONFIRM_STRIP_SEEN = "confirmStripSeen";

/**
 * Whether the push priming screen (22b) has had its one showing on this device.
 *
 * Device-local, because the OS permission is: a phone that said no and an iPad that was
 * never asked are different questions, and the account cannot answer either of them.
 * Declined once means never shown again — the switch under Notifications is the only way
 * back, and turning it on there is what re-opens the system prompt.
 */
const PUSH_PRIMING_SEEN = "pushPrimingSeen";

/**
 * Which backend the sync cursor was counted against.
 *
 * A cursor is a position in one server's change log and nothing more — no part of the
 * number says which server. Point the app at a different one and the old number is read as
 * a position in the new log: if it happens to be higher than anything there, the server
 * truthfully answers "nothing new" for ever, and the app sits on a stale collection
 * reporting a successful sync. Which is exactly what a dev build does the first time it is
 * aimed at production.
 *
 * `removeAccount` already knew the shape of this — "the cursor points into a change log
 * that no longer exists" — it just only handled the one case where the log went away.
 */
const SYNC_ORIGIN = "syncOrigin";

/**
 * Resets the cursor when the backend has changed, and says whether it did.
 *
 * Safe to do bluntly: a full re-pull merges into what is already here, and the merge is
 * asserted commutative and idempotent by the shared fixture. The cost of over-resetting is
 * one slow sync; the cost of under-resetting is a device that never catches up again.
 */
export async function alignSyncOrigin(store: LocalStore, origin: string): Promise<boolean> {
  if ((await store.readSetting(SYNC_ORIGIN)) === origin) return false;
  await store.writeSyncCursor(0);
  await store.writeSetting(SYNC_ORIGIN, origin);
  return true;
}

/** True the first time it is asked on this device, false ever after. */
export async function claimPushPriming(store: LocalStore): Promise<boolean> {
  if ((await store.readSetting(PUSH_PRIMING_SEEN)) === "true") return false;
  await store.writeSetting(PUSH_PRIMING_SEEN, "true");
  return true;
}

/** True the first time it is asked on this device, false ever after. */
export async function claimConfirmStrip(store: LocalStore): Promise<boolean> {
  if ((await store.readSetting(CONFIRM_STRIP_SEEN)) === "true") return false;
  await store.writeSetting(CONFIRM_STRIP_SEEN, "true");
  return true;
}

/** Defaults to on: someone who signed in asked for sync, and asked for it silently. */
export async function readSyncEnabled(store: LocalStore): Promise<boolean> {
  return (await store.readSetting(SYNC_ENABLED)) !== "false";
}

export async function writeSyncEnabled(store: LocalStore, enabled: boolean): Promise<void> {
  await store.writeSetting(SYNC_ENABLED, enabled ? "true" : "false");
}

export async function readLastSyncedAt(store: LocalStore): Promise<number | null> {
  const raw = await store.readSetting(LAST_SYNCED_AT);
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function writeLastSyncedAt(store: LocalStore, at: number): Promise<void> {
  await store.writeSetting(LAST_SYNCED_AT, String(at));
}

export async function readRecentSearches(store: LocalStore): Promise<string[]> {
  const raw = await store.readSetting(RECENT_SEARCHES);
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((term): term is string => typeof term === "string")
      : [];
  } catch {
    // A preference that fails to parse is not worth an error path; an empty list is the
    // same thing the person saw before they had ever searched.
    return [];
  }
}

/** Most recent first, de-duplicated case-insensitively, capped. */
export async function rememberSearch(store: LocalStore, term: string): Promise<void> {
  const trimmed = term.trim();
  if (trimmed === "") return;
  const existing = await readRecentSearches(store);
  const kept = existing.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  await store.writeSetting(
    RECENT_SEARCHES,
    JSON.stringify([trimmed, ...kept].slice(0, RECENT_SEARCH_LIMIT)),
  );
}

export async function clearRecentSearches(store: LocalStore): Promise<void> {
  await store.writeSetting(RECENT_SEARCHES, "[]");
}

export async function readWishlistSort(store: LocalStore): Promise<WishSort> {
  return parseWishSort(await store.readSetting(WISHLIST_SORT));
}

export async function writeWishlistSort(store: LocalStore, sort: WishSort): Promise<void> {
  await store.writeSetting(WISHLIST_SORT, sort);
}

/**
 * Defaults to the language the app itself is in, and to German when that is neither.
 *
 * German rather than English as the fallback: it is the binding original, so a reader who
 * has expressed no preference is better served by the text that actually applies to them.
 */
export async function readLibrarySort(store: LocalStore): Promise<LibrarySort> {
  return parseLibrarySort(await store.readSetting(LIBRARY_SORT));
}

export async function writeLibrarySort(store: LocalStore, sort: LibrarySort): Promise<void> {
  await store.writeSetting(LIBRARY_SORT, sort);
}

export async function readDocumentLanguage(
  store: LocalStore,
  uiLanguage: string,
): Promise<LegalLanguage> {
  const stored = await store.readSetting(DOCUMENT_LANGUAGE);
  if (stored === "de" || stored === "en") return stored;
  return uiLanguage.startsWith("en") ? "en" : "de";
}

export async function writeDocumentLanguage(
  store: LocalStore,
  language: LegalLanguage,
): Promise<void> {
  await store.writeSetting(DOCUMENT_LANGUAGE, language);
}

/** How many records the last sync left undescribed, and whether the mirror answered at all. */
export interface CatalogueGap {
  readonly missing: number;
  /**
   * True when the request itself failed rather than coming back without those entries.
   *
   * Worth telling apart on screen: an unreachable mirror is a wait, and a mirror that
   * answered and simply does not hold these pressings is not going to start.
   */
  readonly unreachable: boolean;
}

const NO_GAP: CatalogueGap = { missing: 0, unreachable: false };

export async function readCatalogueGap(store: LocalStore): Promise<CatalogueGap> {
  const raw = await store.readSetting(CATALOGUE_GAP);
  if (raw === undefined) return NO_GAP;
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogueGap>;
    return typeof parsed.missing === "number"
      ? { missing: parsed.missing, unreachable: parsed.unreachable === true }
      : NO_GAP;
  } catch {
    // The same call this makes everywhere else in this file: a preference that will not
    // parse is not worth an error path, and "nothing is missing" is the quiet answer.
    return NO_GAP;
  }
}

export async function writeCatalogueGap(store: LocalStore, gap: CatalogueGap): Promise<void> {
  await store.writeSetting(CATALOGUE_GAP, JSON.stringify(gap));
}

const APP_LANGUAGE = "appLanguage";
const DEFAULT_CURRENCY_KEY = "defaultCurrency";

/**
 * The interface language, or "system" for the phone's own answer.
 *
 * "system" is a real third value rather than the absence of a stored one: somebody who has
 * chosen English on a German phone and then changes their mind needs a way back to
 * following the system, and deleting the setting is not something a picker can express.
 */
export type AppLanguage = "system" | "en" | "de";

export async function readAppLanguage(store: LocalStore): Promise<AppLanguage> {
  const stored = await store.readSetting(APP_LANGUAGE);
  return stored === "en" || stored === "de" ? stored : "system";
}

export async function writeAppLanguage(store: LocalStore, language: AppLanguage): Promise<void> {
  await store.writeSetting(APP_LANGUAGE, language);
}

/**
 * The currency new copies start in.
 *
 * Per device and never synced, like everything else here — and, unlike everything else
 * here, it is only ever a *starting* value. Once a copy is saved its currency is part of
 * that purchase, and changing this setting must not rewrite history.
 */
export async function readDefaultCurrency(store: LocalStore): Promise<CurrencyCode> {
  const stored = await store.readSetting(DEFAULT_CURRENCY_KEY);
  return stored !== undefined && isCurrencyCode(stored) ? stored : DEFAULT_CURRENCY;
}

export async function writeDefaultCurrency(
  store: LocalStore,
  currency: CurrencyCode,
): Promise<void> {
  await store.writeSetting(DEFAULT_CURRENCY_KEY, currency);
}
