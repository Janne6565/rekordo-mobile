import { describe, expect, it } from "bun:test";
import type { NativeLocalStore } from "@/local/LocalStore";
import {
  type Copy,
  LOCAL_WRITE_SYNC_DELAY_MS,
  type SchedulerTimers,
  SyncScheduler,
  observeLocalWrites,
} from "@janne6565/rekordo-shared";

/**
 * Stands in for the SQLite store: a class with truly private state and the phone's native
 * extras, which is exactly what a proxy that forgot to bind `this` would break.
 */
class FakeNativeStore {
  #pending: string[] = [];
  #copies = new Map<string, Copy>();

  async putCopy(copy: Copy): Promise<void> {
    this.#copies.set(copy.id, copy);
    this.#pending = [...new Set([...this.#pending, copy.id])];
  }
  async adoptCopy(copy: Copy): Promise<void> {
    this.#copies.set(copy.id, copy);
  }
  async readPendingIds(): Promise<string[]> {
    return this.#pending;
  }
  photoUri(id: string): string {
    return `file:///photos/${id}.jpg`;
  }
}

/** Timers the test fires by hand, since the delay is the thing under test. */
function manualTimers() {
  const due: Array<{ at: number; callback: () => void }> = [];
  let now = 0;
  const timers: SchedulerTimers = {
    setTimeout(callback, ms) {
      const entry = { at: now + ms, callback };
      due.push(entry);
      return entry;
    },
    clearTimeout(handle) {
      const index = due.indexOf(handle as (typeof due)[number]);
      if (index >= 0) due.splice(index, 1);
    },
  };
  return {
    timers,
    now: () => now,
    advance(ms: number) {
      now += ms;
      for (const entry of [...due]) {
        if (entry.at <= now) {
          due.splice(due.indexOf(entry), 1);
          entry.callback();
        }
      }
    },
  };
}

describe("the observed phone store", () => {
  it("schedules one sync pass shortly after local writes, and none for sync's own adopts", async () => {
    const raw = new FakeNativeStore();
    const { store, localWrites } = observeLocalWrites(raw as unknown as NativeLocalStore);
    const clock = manualTimers();
    const passes: string[][] = [];
    const scheduler = new SyncScheduler(
      async () => {
        passes.push(await store.readPendingIds());
      },
      { timers: clock.timers, now: clock.now },
    );
    localWrites.subscribe(() => scheduler.schedule());

    await store.adoptCopy({ id: "pulled" } as Copy);
    await store.putCopy({ id: "copy-1" } as Copy);
    await store.putCopy({ id: "copy-2" } as Copy);
    clock.advance(LOCAL_WRITE_SYNC_DELAY_MS - 1);
    expect(passes).toHaveLength(0);

    clock.advance(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(passes).toEqual([["copy-1", "copy-2"]]);
    // The native extras still answer, bound to the real store.
    expect(store.photoUri("p")).toBe("file:///photos/p.jpg");
  });
});
