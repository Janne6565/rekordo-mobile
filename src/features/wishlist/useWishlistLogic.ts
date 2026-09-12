import { lookupAlbumCovers, lookupReleases } from "@/api/releases";
import { cacheWishAlbums, cachedCoverOf } from "@/features/wishlist/cacheWishReleases";
import { useWishPhotos } from "@/features/wishlist/useWishPhotos";
import { useStore } from "@/local/StoreProvider";
import { readWishlistSort, writeWishlistSort } from "@/local/settings";
import { useSync } from "@/sync/SyncProvider";
import type { WishPatch, WishSort, WishlistItem } from "@janne6565/rekordo-shared";
import {
  applyWishPatch,
  catalogueKeyOf,
  catalogueKeysOf,
  filterWishlist,
  hasManualOrder,
  isManualReleaseId,
  manualOrderWrites,
  moveWish,
  sortWishlist,
  tombstonePhoto,
  tombstoneWishlistItem,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

/**
 * Screens 16a and 16b — the list, and what an entry can be told to do.
 *
 * Deliberately the same shape as the web hook of this name, down to the field names: the
 * two screens are drawn differently but they are one feature, and a phone that decides
 * "found it" means something else is a phone that empties the list wrongly.
 */
export function useWishlistLogic() {
  const { syncNow } = useSync();
  const { store, clock } = useStore();
  const queryClient = useQueryClient();

  const wishlist = useQuery({ queryKey: ["wishlist"], queryFn: () => store.listWishlist() });
  const sortQuery = useQuery({
    queryKey: ["wishlistSort"],
    queryFn: () => readWishlistSort(store),
  });

  const sort: WishSort = sortQuery.data ?? "NEWEST";
  const items = wishlist.data ?? [];
  const ordered = useMemo(() => sortWishlist(items, sort), [items, sort]);

  /**
   * What is typed in the box over the list.
   *
   * Not debounced: this is a `filter` over a list already in memory that is two dozen rows
   * at its longest, and a field that lags behind the keyboard on a phone is the one thing
   * worse than results that churn.
   */
  const [search, setSearch] = useState("");

  /**
   * The order a drop just built, held until the store has caught up.
   *
   * Writing a row per entry and re-reading the list is tens of milliseconds the row would
   * otherwise spend back where it started — the one frame that makes a gesture feel like
   * it was not taken. The shelf holds its drop the same way.
   */
  const [dropped, setDropped] = useState<readonly string[] | null>(null);
  const held = useMemo(() => {
    if (dropped === null) return ordered;
    const byId = new Map(ordered.map((item) => [item.id, item]));
    const seen = new Set(dropped);
    return [
      ...dropped
        .map((id) => byId.get(id))
        .filter((item): item is WishlistItem => item !== undefined),
      ...ordered.filter((item) => !seen.has(item.id)),
    ];
  }, [ordered, dropped]);

  const shown = useMemo(() => filterWishlist(held, search), [held, search]);

  /**
   * The albums on the list, sorted and de-duplicated so the query key is the *set* rather
   * than the order it happens to be shown in — reordering a list must not refetch it.
   */
  const albumIds = useMemo(
    () =>
      [...new Set(items.map((item) => item.albumId))]
        .filter((albumId) => !isManualReleaseId(albumId))
        .sort(),
    [items],
  );

  /**
   * The artwork, which an entry does not carry.
   *
   * A wish is for an album, and an album is an id and a title — the cover belongs to a
   * pressing of it, so the server resolves one. Kept out of the local store deliberately:
   * it is a fact about a catalogue that any client may re-ask for, not part of the
   * collection, and a phone offline simply draws the format silhouette instead.
   */
  /**
   * The pictures people uploaded, which any entry may now have.
   *
   * It used to be the hand-entered half of the list only, on the grounds that everything
   * else has a catalogue to ask. It still does — but its answer is one pressing's sleeve
   * among several, and a wish is a note to yourself, so an uploaded picture outranks it.
   */
  const ownPhotos = useWishPhotos(useMemo(() => items.map((item) => item.id), [items]));

  /**
   * The pressings entries were made from, sorted and de-duplicated for the same reason the
   * albums are: the query key is the set, not the order the list happens to be in.
   */
  const releaseIds = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.releaseId)
            .filter((releaseId): releaseId is string => releaseId !== null),
        ),
      ]
        .filter((releaseId) => !isManualReleaseId(releaseId))
        .sort(),
    [items],
  );

  /*
   * The pressings themselves, not just their sleeves.
   *
   * `lookupPressingCovers` threw the rows away and kept the URLs, which is why a wish had
   * nothing on this device to fall back on. The same request now lands in the `releases`
   * table on the way past, so the next open answers from the cache when the mirror cannot
   * be reached — and a copy of the same pressing finds the row already there.
   */
  const pressingCovers = useQuery({
    queryKey: ["pressingCovers", releaseIds],
    enabled: releaseIds.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const releases = await lookupReleases(releaseIds);
      await store.cacheReleases(releases);
      await queryClient.invalidateQueries({ queryKey: ["wishlistReleases"] });
      return new Map(releases.map((release) => [release.id, release.coverArtUrl]));
    },
  });

  const covers = useQuery({
    queryKey: ["albumCovers", albumIds],
    enabled: albumIds.length > 0,
    // The mirror's answer for an album does not move while a list is open.
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const found = await lookupAlbumCovers(albumIds, store);
      await cacheWishAlbums(store, items, found, Date.now());
      await queryClient.invalidateQueries({ queryKey: ["wishlistReleases"] });
      return found;
    },
  });

  /*
   * What this device already holds for these entries, which is the whole point of writing
   * the two lookups into the cache above. Read unconditionally rather than only on
   * failure: a query that has not answered yet is the same picture as one that cannot,
   * and the list should not go blank for the length of a request either.
   */
  const cachedReleases = useQuery({
    queryKey: ["wishlistReleases", catalogueKeysOf(items)],
    enabled: items.length > 0,
    queryFn: () => store.getReleases(catalogueKeysOf(items)),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["wishlist"] });

  /**
   * Pull-to-refresh, and it runs a real sync.
   *
   * Re-reading the local store would only ever redraw what the last sync already wrote --
   * so on a list that is out of date, the one gesture anybody makes would be the one
   * gesture guaranteed not to fix it. The shelf learned this already; this list had no
   * refresh at all, which is worse: a stale wishlist with nothing to do about it.
   */
  const [refreshing, setRefreshing] = useState(false);
  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } finally {
      setRefreshing(false);
    }
    // The sync invalidates everything when it changed something; this covers the case
    // where it did not, so a pull still ends in a fresh read.
    void wishlist.refetch();
  }, [syncNow, wishlist]);

  const chooseSort = useMutation({
    mutationFn: (next: WishSort) => writeWishlistSort(store, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wishlistSort"] }),
  });

  /**
   * Dropping a row renumbers the list and switches the sort to "Your order".
   *
   * Switching is the point, not a side effect: dragging while the list is ordered by title
   * would otherwise produce a move the next render undoes.
   */
  const reorder = useMutation({
    mutationFn: async ({ from, to }: { readonly from: number; readonly to: number }) => {
      const next = moveWish(held, from, to);
      setDropped(next.map((item) => item.id));
      for (const { item, sortIndex } of manualOrderWrites(next)) {
        await store.putWishlistItem(applyWishPatch(item, { sortIndex }, clock));
      }
      await writeWishlistSort(store, "MANUAL");
    },
    // `onSettled` rather than `onSuccess`: a write that failed still has to let the held
    // order go, or the list would show a move that never happened until the app restarts.
    onSettled: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["wishlistSort"] });
      setDropped(null);
    },
  });

  const edit = useMutation({
    mutationFn: ({ item, patch }: { readonly item: WishlistItem; readonly patch: WishPatch }) =>
      store.putWishlistItem(applyWishPatch(item, patch, clock)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (item: WishlistItem) => {
      const now = Date.now();
      await store.putWishlistItem(tombstoneWishlistItem(item, clock, now));
      // The picture goes with it. A wish id is never reused, so a photo left behind is one
      // nothing can ever reference again — and the server only deletes the object in
      // storage when the record it belongs to is put down.
      const picture = (await store.listWishPhotos([item.id])).get(item.id);
      if (picture !== undefined) await store.putPhoto(tombstonePhoto(picture, clock, now));
    },
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["wish-photos"] });
    },
  });

  return {
    items: shown,
    /** The whole list, which is what the header counts and what "empty" means. */
    count: items.length,
    search,
    handleSearch: useCallback((next: string) => setSearch(next), []),
    /** True while a term is narrowing the list, which several things below hang on. */
    filtering: search.trim() !== "",
    /** A term that names nothing — a different state from a wishlist with nothing on it. */
    noMatches: items.length > 0 && shown.length === 0,
    loading: wishlist.isLoading,
    refreshing,
    refetch,
    sort,
    manual: hasManualOrder(items),
    /**
     * The catalogue's artwork: the sleeve of the pressing this entry was made from, and the
     * album's only when there is no pressing or the mirror has never seen it.
     */
    coverOf: (item: WishlistItem): string | null => {
      const pressing =
        item.releaseId === null ? undefined : pressingCovers.data?.get(catalogueKeyOf(item) ?? "");
      return (
        pressing ??
        covers.data?.get(item.albumId) ??
        // Offline, or simply not answered yet. The sleeve this device last saw for the
        // record is a better answer than an empty sleeve, and it is the same one the
        // shelf is drawing for a copy of it two tabs away.
        cachedCoverOf(item, cachedReleases.data)
      );
    },
    /**
     * The picture somebody uploaded for this entry.
     *
     * Kept apart from the catalogue's cover rather than folded into it: this one is a file
     * on the device, so it paints on the frame it is asked for, and the sweep that says
     * "on its way" belongs to artwork that genuinely is.
     */
    pictureOf: (item: WishlistItem): string | null => ownPhotos.get(item.id) ?? null,
    setSort: (next: WishSort) => chooseSort.mutate(next),
    reorder: (from: number, to: number) => reorder.mutate({ from, to }),
    edit: (item: WishlistItem, patch: WishPatch) => edit.mutate({ item, patch }),
    remove: (item: WishlistItem) => remove.mutate(item),
    removing: remove.isPending ? remove.variables?.id : undefined,
  };
}

/** One entry, for screen 16b. Reads the same store rather than being handed down a list. */
export function useWishEntryLogic(wishId: string) {
  const { store } = useStore();
  const logic = useWishlistLogic();

  const entry = useQuery({
    queryKey: ["wishlist", wishId],
    queryFn: async () => (await store.listWishlist()).find((item) => item.id === wishId) ?? null,
  });

  /**
   * The other records by this artist you already own (16b's footer).
   *
   * Matched on the artist name rather than an artist id: a wish carries the name it was
   * created with and nothing else, and a footnote is not worth a lookup that can fail.
   */
  const alsoOwned = useQuery({
    queryKey: ["wishlistAlsoOwned", wishId],
    enabled: entry.data != null,
    queryFn: async () => {
      const artist = entry.data?.artistName.toLowerCase();
      if (artist === undefined) return [];
      const copies = await store.listCopies();
      const releases = await store.getReleases(catalogueKeysOf(copies));
      return copies
        .map((copy) => releases.get(catalogueKeyOf(copy) ?? ""))
        .filter((release) => release !== undefined)
        .filter((release) => release.artistName.toLowerCase() === artist)
        .map((release) => release.title);
    },
  });

  return {
    ...logic,
    entry: entry.data ?? null,
    loading: entry.isLoading,
    alsoOwned: [...new Set(alsoOwned.data ?? [])],
  };
}
