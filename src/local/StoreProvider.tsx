import type { NativeLocalStore } from "@/local/LocalStore";
import { openLocalStore } from "@/local/sqliteStore";
import type { ClockSource, LocalWriteSignal } from "@janne6565/rekordo-shared";
import {
  hlcDecode,
  hlcEncode,
  hlcInitial,
  hlcTick,
  observeLocalWrites,
} from "@janne6565/rekordo-shared";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";

interface StoreContextValue {
  readonly store: NativeLocalStore;
  readonly clock: ClockSource;
  /** Every write that leaves something to push, so sync can push it within seconds. */
  readonly localWrites: LocalWriteSignal;
}

const StoreContext = createContext<StoreContextValue | null>(null);

/**
 * Opens the local database and restores the device clock before rendering.
 *
 * The clock is loaded from disk rather than started fresh: an HLC that resets on every
 * launch would hand out stamps behind ones it has already issued, and those edits would
 * silently lose every future merge.
 */
export function StoreProvider({ children }: { readonly children: ReactNode }) {
  const [value, setValue] = useState<StoreContextValue | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Every screen writes through the observed store, which is what lets the sync loop
      // push an edit a moment after it lands instead of on the next minute's tick.
      const { store, localWrites } = observeLocalWrites<NativeLocalStore>(await openLocalStore());
      const node = await store.deviceId();
      const persisted = await store.readClock();
      let current = persisted === undefined ? hlcInitial(node) : hlcDecode(persisted);

      const clock: ClockSource = {
        next() {
          current = hlcTick(current, Date.now());
          void store.writeClock(hlcEncode(current));
          return current;
        },
      };

      if (!cancelled) setValue({ store, clock, localWrites });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (value === null) return null;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (value === null) {
    throw new Error("useStore must be used inside a StoreProvider");
  }
  return value;
}
