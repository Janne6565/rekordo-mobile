import { API_BASE } from "@/api/config";
import { useStore } from "@/local/StoreProvider";
import {
  alignSyncOrigin,
  readSyncEnabled,
  writeCatalogueGap,
  writeLastSyncedAt,
} from "@/local/settings";
import { useAppSelector } from "@/store/hooks";
import { createSyncEngine } from "@/sync/transport";
import { useSyncLoop } from "@janne6565/rekordo-shared";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * A minute between passes: often enough to feel live, rare enough to spare the battery.
 *
 * The fallback, not the path an edit takes: a local write is pushed a moment after it lands
 * (see `useSyncLoop`). This is what brings in changes made on other devices.
 */
const SYNC_INTERVAL_MS = 60_000;

interface SyncControls {
  /**
   * Run a pass now, and resolve when it is done.
   *
   * What a pull-to-refresh calls. Refetching the screen's queries is not the same thing:
   * every screen reads the local store, so re-reading it can only ever show what the last
   * sync already wrote.
   */
  readonly syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncControls | null>(null);

/**
 * The sync loop, above the tabs.
 *
 * It used to live in `useAccountLogic`, which is mounted by the account screen, Your data
 * and the legal index -- and by nothing else. A tab is not mounted until it is opened, so
 * on a cold launch straight into the shelf there was no loop at all: the collection sat
 * there undescribed, and the only way to start a sync was to visit the You tab. Signing in
 * happens on that tab, which is why this only ever showed up on the *second* launch.
 *
 * Mounted beside <RestoreSession /> for the same reason it is: what the whole app depends
 * on cannot hang off whichever screen happens to be on top.
 */
export function SyncProvider({ children }: { readonly children: ReactNode }) {
  const { store, clock, localWrites } = useStore();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);
  const firstSyncPending = useAppSelector((state) => state.auth.firstSyncPending);

  const runSync = useCallback(async () => {
    /*
     * Every one of these is a silent no-op, and between them they are most of the reasons
     * somebody stares at a stale list wondering why pulling it does nothing. Saying which
     * one, in development, turns that into an answer in one pull.
     */
    if (user === null) {
      if (__DEV__) console.log("[rekordo] sync skipped — no account");
      return;
    }
    if (firstSyncPending) {
      if (__DEV__)
        console.log("[rekordo] sync skipped — the sign-in conflict has not been answered yet");
      return;
    }
    // Overlap is the loop's to prevent: a pull-to-refresh landing mid-pass waits for one
    // more pass after it rather than starting a second alongside.
    // Read every time rather than once: the account screen can switch this off while the
    // interval is already running, and it should take effect on the next pass.
    if (!(await readSyncEnabled(store))) {
      if (__DEV__) console.log("[rekordo] sync skipped — switched off on this device");
      return;
    }
    try {
      // Before anything else: a cursor counted against a different server is worse than no
      // cursor, because the server answers "nothing new" and means it.
      if (await alignSyncOrigin(store, API_BASE)) {
        if (__DEV__) console.log(`[rekordo] backend changed — pulling everything from ${API_BASE}`);
      }
      const result = await createSyncEngine(store, clock).sync();
      if (__DEV__) {
        console.log(
          `[rekordo] sync ok — pulled ${result.pulled}, pushed ${result.pushed}, releases ${result.releases}`,
        );
      }
      // Recorded before the screens are told to refetch, so the shelf reads this pass's
      // answer rather than the one before it.
      await writeCatalogueGap(store, {
        missing: result.releasesMissing,
        unreachable: result.releasesUnreachable,
      });
      await writeLastSyncedAt(store, Date.now());
      // Every screen reads the local store through a query, and a sync writes to that
      // store behind their backs. Without this the shelf keeps the empty result it
      // fetched before the first sync landed: the tabs stay mounted, so nothing remounts
      // and React Native has no window focus to refetch on. Signing in on a new device
      // looked like the sync had pulled nothing at all.
      await queryClient.invalidateQueries();
    } catch (error) {
      // Offline or the server is down. Local changes stay recorded as pending, so the
      // next pass picks them up; nothing is lost — but a developer staring at a list that
      // will not move deserves to be told which of those it is.
      if (__DEV__) console.log("[rekordo] sync failed —", error);
    }
  }, [user, firstSyncPending, store, clock, queryClient]);

  // A pass on start, one a moment after every local edit, and the interval as the fallback.
  const active = user !== null && !firstSyncPending;
  const { syncNow, flush } = useSyncLoop({
    active,
    run: runSync,
    localWrites,
    intervalMs: SYNC_INTERVAL_MS,
  });

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    if (!active) return;
    const subscription = AppState.addEventListener("change", (next) => {
      const previous = appState.current;
      appState.current = next;
      // Back from the background: the interval did not tick while the app was away, and
      // whatever changed on other devices meanwhile should be here before anyone looks.
      if (next === "active" && previous !== "active") void syncNow();
      // On the way out: timers stop in the background, so an edit made just before the
      // switch would otherwise wait for the app to come back before it was pushed.
      if (next === "background") void flush();
    });
    return () => subscription.remove();
  }, [active, syncNow, flush]);

  return <SyncContext.Provider value={{ syncNow }}>{children}</SyncContext.Provider>;
}

/** No-ops without a provider, so a screen rendered in isolation still works. */
export function useSync(): SyncControls {
  return useContext(SyncContext) ?? { syncNow: async () => undefined };
}
