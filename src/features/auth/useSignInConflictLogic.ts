import { useStore } from "@/local/StoreProvider";
import { firstSyncResolved, syncOutcomeRecorded } from "@/store/authSlice";
import { useAppDispatch } from "@/store/hooks";
import { createSyncEngine } from "@/sync/transport";
import type {
  OneSidedEntry,
  ReviewPlan,
  ShelfComparison,
  ShelfSide,
} from "@janne6565/rekordo-shared";
import {
  decidedCount,
  dropped,
  mergedCopies,
  mergedWishes,
  reviewedCopies,
  reviewedWishes,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Which of the flow's screens is on top.
 *
 * The same seven the web has, and deliberately the same names: the two apps draw this
 * differently — a sheet and two pushed screens here, one growing modal there — but they
 * are answering the identical question, and a phone that called the states something else
 * would be a second description of one design.
 */
export type ConflictView =
  | "COMPARING"
  | "UNREACHABLE"
  | "UPLOADING"
  | "NO_LOSS"
  | "CONFLICT"
  | "DIFFERENCE"
  | "REVIEW"
  | "DROP";

export type ConflictResolution = "MERGED" | "KEPT_LOCAL" | "KEPT_ACCOUNT" | "REVIEWED";

/**
 * Signing in onto a phone that already holds a collection (turn 29).
 *
 * Mirrors `useSignInConflictLogic` in rekordo-frontend. Everything that decides anything
 * is in the shared package; what is here is which screen is up and what has been picked so
 * far — and both of those have to behave the same on the two clients, or the same account
 * would get different offers depending on where somebody signed in.
 */
export function useSignInConflictLogic() {
  const { store, clock } = useStore();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ConflictView | null>(null);
  const [pendingKeep, setPendingKeep] = useState<ShelfSide | null>(null);
  const [plan, setPlan] = useState<ReviewPlan>({ picks: {}, dropped: [] });

  /** Half of what is being compared is already on this phone, so the wait is not empty. */
  const localCount = useQuery({
    queryKey: ["signInConflict", "local"],
    queryFn: async () => (await store.listCopies()).length,
  });

  const comparison = useQuery({
    queryKey: ["signInConflict", "comparison"],
    queryFn: () => createSyncEngine(store, clock).compare(),
    // A comparison is a photograph of a moment; retaking it behind the sheet would change
    // the numbers somebody is reading and the answer they are about to give.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const engine = useCallback(() => createSyncEngine(store, clock), [store, clock]);

  const resolve = useMutation({
    mutationFn: async ({
      resolution,
      run,
    }: {
      readonly resolution: ConflictResolution;
      readonly run: () => Promise<unknown>;
    }) => {
      await run();
      return resolution;
    },
    onSuccess: async (resolution) => {
      dispatch(syncOutcomeRecorded(outcomeOf(resolution, comparison.data, plan)));
      // Every screen reads the local store, and the store underneath all of them has just
      // changed — including the tabs that were mounted before the sheet went up.
      await queryClient.invalidateQueries();
      dispatch(firstSyncResolved());
    },
  });

  const choose = useCallback(
    (resolution: ConflictResolution, run: () => Promise<unknown>) =>
      resolve.mutate({ resolution, run }),
    [resolve],
  );

  const keepBoth = useCallback(
    () => choose("MERGED", () => engine().firstSync("MERGE")),
    [choose, engine],
  );

  const confirmKeep = useCallback(() => {
    if (pendingKeep === null) return;
    const side = pendingKeep;
    choose(side === "LOCAL" ? "KEPT_LOCAL" : "KEPT_ACCOUNT", () =>
      engine().firstSync(side === "LOCAL" ? "KEEP_LOCAL" : "KEEP_ACCOUNT"),
    );
  }, [choose, engine, pendingKeep]);

  const applyReview = useCallback(() => {
    const data = comparison.data;
    if (data === undefined) return;
    choose("REVIEWED", () => engine().firstSyncReviewed(data, plan));
  }, [choose, comparison.data, engine, plan]);

  /** Derived wherever it can be: `view` only ever holds a screen somebody opened. */
  const current: ConflictView = useMemo(() => {
    if (view !== null) return view;
    if (comparison.isPending) return "COMPARING";
    if (comparison.isError) return "UNREACHABLE";
    const outcome = comparison.data?.outcome;
    if (outcome === "EMPTY_ACCOUNT") return "UPLOADING";
    if (outcome === "NO_LOSS") return "NO_LOSS";
    return "CONFLICT";
  }, [comparison.data?.outcome, comparison.isError, comparison.isPending, view]);

  /**
   * An empty account poses no question, so the upload starts without being asked for.
   *
   * Once, from `idle` only. It used to fire whenever the mutation was neither pending nor
   * done, which includes *failed*: a failed upload restarted itself on the next render, so
   * the sheet sat on the progress bar forever and the retry button never stayed up long
   * enough to press. After a failure, starting again is the person's call.
   */
  const idle = resolve.isIdle;
  useEffect(() => {
    if (current === "UPLOADING" && idle) keepBoth();
  }, [current, idle, keepBoth]);

  const data = comparison.data;

  return {
    view: current,
    comparison: data,
    localCount: localCount.data ?? 0,
    working: resolve.isPending,
    failed: resolve.isError,
    plan,
    pendingKeep,

    mergedCopies: data === undefined ? 0 : mergedCopies(data),
    mergedWishes: data === undefined ? 0 : mergedWishes(data),
    reviewedCopies: data === undefined ? 0 : reviewedCopies(data, plan),
    reviewedWishes: data === undefined ? 0 : reviewedWishes(data, plan),
    decided: data === undefined ? 0 : decidedCount(data, plan),
    droppedBy: (side: ShelfSide): readonly OneSidedEntry[] =>
      data === undefined ? [] : dropped(data, side),

    openDifference: () => setView("DIFFERENCE"),
    openReview: () => setView("REVIEW"),
    askKeep: (side: ShelfSide) => {
      setPendingKeep(side);
      setView("DROP");
    },
    back: () => {
      setPendingKeep(null);
      setView(null);
    },
    retry: () => void comparison.refetch(),
    /** The one exit that is not an answer: there was no question, only a failed read. */
    dismissUnreachable: () => dispatch(firstSyncResolved()),

    keepBoth,
    confirmKeep,
    applyReview,
    pick: (key: string, side: ShelfSide) =>
      setPlan((current) => ({ ...current, picks: { ...current.picks, [key]: side } })),
    setDropped: (id: string, drop: boolean) =>
      setPlan((current) => ({
        ...current,
        dropped: drop
          ? [...new Set([...current.dropped, id])]
          : current.dropped.filter((other) => other !== id),
      })),
    keepAll: () => setPlan((current) => ({ ...current, dropped: [] })),
    pickedSide: (key: string): ShelfSide | undefined => plan.picks[key],
    isDropped: (id: string): boolean => plan.dropped.includes(id),

    /**
     * The export beside the two destructive choices, offered and never forced.
     *
     * Written from the difference rather than from the store: half of what is about to go
     * is only in the account, and this phone has no record of it to export.
     */
    exportDropped: async () => {
      if (pendingKeep === null || data === undefined) return;
      await shareDropped(dropped(data, pendingKeep));
    },
  };
}

async function shareDropped(entries: readonly OneSidedEntry[]): Promise<void> {
  const rows = [
    ["title", "artist", "year", "format", "kind", "side"],
    ...entries.map((entry) => [
      entry.title ?? "",
      entry.artistName ?? "",
      entry.year === null ? "" : String(entry.year),
      entry.format,
      entry.kind,
      entry.side,
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const file = `${FileSystem.cacheDirectory}rekordo-dropped-${new Date().toISOString().slice(0, 10)}.csv`;
  await FileSystem.writeAsStringAsync(file, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
    });
  }
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** What the shelf's one line will say, computed while the comparison is still in hand. */
function outcomeOf(
  resolution: ConflictResolution,
  comparison: ShelfComparison | undefined,
  plan: ReviewPlan,
) {
  if (comparison === undefined) return null;
  const arrived =
    resolution === "KEPT_LOCAL"
      ? []
      : comparison.onlyAccount.filter(
          (entry) => resolution !== "REVIEWED" || !plan.dropped.includes(entry.id),
        );
  return {
    resolution,
    arrived: arrived.length,
    edits: resolution === "KEPT_LOCAL" ? 0 : comparison.values.length,
    // Copies only: the shelf is a shelf, and a wishlist entry has no tile there to reveal.
    ids: arrived.filter((entry) => entry.kind === "COPY").map((entry) => entry.id),
  };
}
