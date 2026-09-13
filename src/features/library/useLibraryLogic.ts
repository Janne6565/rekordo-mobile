import { useStore } from "@/local/StoreProvider";
import { arrangedAt } from "@/local/arrangedAt";
import { readCatalogueGap, readLibrarySort, writeLibrarySort } from "@/local/settings";
import { syncOutcomeCleared } from "@/store/authSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useSync } from "@/sync/SyncProvider";
import {
  applyCopyPatch,
  catalogueKeyOf,
  catalogueKeysOf,
  hasArrangedOrder,
  inRollPool,
  libraryOrderWrites,
  moveCopy,
} from "@janne6565/rekordo-shared";
import type { Copy, Format, LibrarySort, Release } from "@janne6565/rekordo-shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

export type FormatFilter = Format | "ALL";

export interface LibraryRow {
  readonly copy: Copy;
  readonly release: Release | undefined;
}

export type LibraryLogic = ReturnType<typeof useLibraryLogic>;

export function useLibraryLogic() {
  const { store, clock } = useStore();
  const { syncNow } = useSync();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<FormatFilter>("ALL");
  /**
   * 26c — the shelf's second axis, and the reason its filters are worth a sheet.
   *
   * Applied here rather than in the query, because the store filters by format and the
   * rating lives on the copy that has already been read. Keeping the query key to the
   * format alone also means moving the star does not go back to disk, and — the reason
   * it matters — leaves `["copies","ALL","ADDED_DESC"]` intact as the key the roll sheet
   * warms itself from.
   */
  const [minRating, setMinRating] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /**
   * 29e-5: the shelf filtered down to what the sign-in brought in.
   *
   * Not a filter chip and not a route — it is the second half of a sentence the strip
   * above the grid is still saying, and it goes away with the strip.
   */
  const [showingArrived, setShowingArrived] = useState(false);
  const dispatch = useAppDispatch();
  const outcome = useAppSelector((state) => state.auth.syncOutcome);

  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: () => store.stats() });
  /**
   * What the last sync could not describe.
   *
   * Read here rather than derived from the rows on screen: a row with no release looks
   * the same whether the catalogue is still on its way or the mirror has answered and
   * has nothing, and only the sync knows which.
   */
  const gapQuery = useQuery({
    queryKey: ["catalogueGap"],
    queryFn: () => readCatalogueGap(store),
  });

  /**
   * Which order the shelf is in, which is this device's own business.
   *
   * The arrangement itself syncs -- it is `Copy.sortIndex` -- but "I am sorting by artist
   * to find something" is not a statement about the collection, and a laptop that
   * rearranged itself because of it would be doing something nobody asked for.
   */
  const sortQuery = useQuery({ queryKey: ["librarySort"], queryFn: () => readLibrarySort(store) });
  const sort: LibrarySort = sortQuery.data ?? "ADDED_DESC";

  const copiesQuery = useQuery({
    queryKey: ["copies", format, sort],
    /**
     * A shelf already on screen stays there while the next one is read.
     *
     * The order is part of the key, and the first drag switches it — so arranging turned
     * the shelf into a query with nothing cached and every record disappeared until the
     * read came back. Keeping the previous rows means the drop's held order stays visible
     * across that swap, which is the whole point of holding it. The same applies to
     * changing the sort from the menu, which used to blank the grid for a beat.
     */
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const copies = await store.listCopies({ format, sort });
      const releases = await store.getReleases(catalogueKeysOf(copies));
      return copies.map((copy) => ({ copy, release: releases.get(catalogueKeyOf(copy) ?? "") }));
    },
  });

  // The pool predicate is the roll's, deliberately: "at least four stars" has to mean the
  // same thing on the shelf as it does in the sheet, unrated copies excluded and all.
  const all = useMemo(() => {
    const rows = copiesQuery.data ?? [];
    if (minRating === null) return rows;
    return rows.filter((row) => inRollPool(row, { format: "ALL", minRating }));
  }, [copiesQuery.data, minRating]);
  const arrived = new Set(outcome?.ids ?? []);

  /**
   * The order a drop just built, held until the store has caught up.
   *
   * Arranging writes a row per record and then re-reads the shelf, which is tens of
   * milliseconds the tile would otherwise spend back where it started -- the one frame
   * that would make the whole gesture feel like it had not been taken.
   */
  const [dropped, setDropped] = useState<readonly string[] | null>(null);
  const shelf = useMemo(() => {
    if (dropped === null) return all;
    const byId = new Map(all.map((row) => [row.copy.id, row]));
    const reordered = dropped
      .map((id) => byId.get(id))
      .filter((row): row is LibraryRow => row !== undefined);
    // Anything the drop did not know about (a sync landed mid-carry) keeps its place at
    // the end rather than disappearing.
    const seen = new Set(dropped);
    return [...reordered, ...all.filter((row) => !seen.has(row.copy.id))];
  }, [all, dropped]);

  /** A shelf is only arrangeable whole: see `arrange`. */
  const filtered = format !== "ALL" || minRating !== null;

  /**
   * A record set down somewhere else.
   *
   * Renumbers the shelf *as it was on screen* and switches the order to `MANUAL` in one
   * go. Switching is the point rather than a side effect: the order you were looking at
   * when you picked a record up is the order you meant to adjust, so dragging on a shelf
   * sorted by artist keeps that arrangement and moves one record within it. Dragging
   * without switching would produce a move the next render undoes.
   *
   * Refused on a narrowed shelf, because a position in a narrowed list means nothing in
   * the whole one -- the drag is disabled there rather than silently moving the wrong
   * record.
   */
  const arrange = useMutation({
    mutationFn: async ({ next }: { readonly next: readonly LibraryRow[] }) => {
      // One batch: the first drag on a shelf that has never been arranged renumbers every
      // record on it, and `putCopy` in a loop is quadratic in the pending list.
      await store.putCopies(
        libraryOrderWrites(next.map((row) => row.copy)).map(({ copy, sortIndex }) =>
          applyCopyPatch(copy, { sortIndex }, arrangedAt(clock)),
        ),
      );
      await writeLibrarySort(store, "MANUAL");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["copies"] }),
        queryClient.invalidateQueries({ queryKey: ["librarySort"] }),
      ]);
      setDropped(null);
    },
  });

  const chooseSort = useMutation({
    mutationFn: (next: LibrarySort) => writeLibrarySort(store, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["librarySort"] }),
  });

  const rows =
    showingArrived && outcome !== null ? shelf.filter((row) => arrived.has(row.copy.id)) : shelf;

  return {
    rows,
    sort,
    setSort: useCallback(
      (next: LibrarySort) => {
        chooseSort.mutate(next);
      },
      [chooseSort],
    ),
    /** Whether "Your order" is a thing a menu can offer yet. */
    arranged: useMemo(() => hasArrangedOrder(all.map((row) => row.copy)), [all]),
    /**
     * The held order is applied *here*, synchronously, and not inside the mutation.
     *
     * This is called while the record is being put down, and the drag clears itself in
     * the same breath — so both land in one React commit and the swap is invisible.
     * Setting it inside `mutationFn` instead makes it a later commit, and the shelf shows
     * the old order in between: the record blinks back to where it came from and the row
     * flashes. The write itself is still asynchronous; only the order is not.
     */
    arrange: useCallback(
      (from: number, to: number) => {
        const next = moveCopy(shelf, from, to);
        setDropped(next.map((row) => row.copy.id));
        arrange.mutate({ next });
      },
      [arrange, shelf],
    ),
    /**
     * Whether a record may be picked up at all -- the whole shelf, or none of it. The
     * sync strip's narrowing counts too: its list is the arrivals, not the shelf.
     */
    arrangeable: !filtered && !(showingArrived && outcome !== null),
    outcome,
    showingArrived,
    showArrived: () => setShowingArrived(true),
    dismissOutcome: () => {
      setShowingArrived(false);
      dispatch(syncOutcomeCleared());
    },
    stats: statsQuery.data,
    catalogueGap: gapQuery.data,
    loading: copiesQuery.isLoading,
    failed: copiesQuery.isError,
    collectionEmpty: statsQuery.data !== undefined && statsQuery.data.copyCount === 0,
    format,
    setFormat: useCallback((next: FormatFilter) => setFormat(next), []),
    minRating,
    setMinRating,
    /** What "Show" would show — the filters alone, not the sync strip's narrowing. */
    matching: all.length,
    filtered,
    clearFilters: useCallback(() => {
      setFormat("ALL");
      setMinRating(null);
    }, []),
    refreshing,
    /**
     * A pull on the shelf runs a sync, not just a re-read.
     *
     * Re-reading the local store was all this used to do, which can only ever redraw what
     * the last sync already wrote -- so the one gesture anybody makes at a shelf full of
     * untitled placeholders was the one gesture guaranteed not to fix it.
     */
    refetch: useCallback(async () => {
      setRefreshing(true);
      try {
        await syncNow();
      } finally {
        setRefreshing(false);
      }
      // The sync invalidates every query when it changes something; these cover the case
      // where it did not, so a pull still ends in fresh reads.
      void copiesQuery.refetch();
      void statsQuery.refetch();
      void gapQuery.refetch();
    }, [syncNow, copiesQuery, statsQuery, gapQuery]),
  };
}
