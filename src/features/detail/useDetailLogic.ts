import { lookupRelease } from "@/api/releases";
import type { RemovedCopySummary } from "@/features/detail/RemoveCopySheet";
import { neighboursOf } from "@/features/library/copyOrder";
import { useUndo } from "@/features/wishlist/UndoBar";
import { useStore } from "@/local/StoreProvider";
import type { Copy, CopyPatch, Release } from "@janne6565/rekordo-shared";
import {
  albumIdOf,
  applyCopyPatch,
  catalogueKeyOf,
  catalogueKeysOf,
  restoreCopy,
  tombstoneCopy,
} from "@janne6565/rekordo-shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";

export interface DetailData {
  readonly copy: Copy;
  readonly release: Release | undefined;
  readonly otherCopies: readonly { copy: Copy; release: Release | undefined }[];
}

export function useDetailLogic(copyId: string) {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  /**
   * Everything the screen draws, read from the local store alone.
   *
   * Nothing in here touches the network. The app is local-first: a copy that exists on this
   * device has all of its metadata on this device too, so opening it must be as fast as a
   * SQLite read — which is what it was not while the cover theme was fetched inline.
   */
  const detailQuery = useQuery<DetailData | null>({
    queryKey: ["copy", copyId],
    /*
     * Swiping to the next copy changes this key, and without this the whole body unmounted
     * for a spinner and mounted again -- a flash between every record, on a read that takes
     * a frame from SQLite. Keeping the previous copy on screen until the next one is there
     * is what makes the swipe a movement rather than a blink.
     */
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return null;

      const key = catalogueKeyOf(copy);
      const release = key === null ? undefined : await store.getRelease(key);
      // The copy knows its own album, so a shelf grouping no longer depends on the
      // mirror having cached the pressing.
      const album = albumIdOf(copy, release);
      const siblings = album === null ? [] : await store.listCopiesInReleaseGroup(album);
      const releases = await store.getReleases(catalogueKeysOf(siblings));

      return {
        copy,
        release,
        otherCopies: siblings
          .filter((sibling) => sibling.id !== copy.id)
          .map((sibling) => ({
            copy: sibling,
            release: releases.get(catalogueKeyOf(sibling) ?? ""),
          })),
      };
    },
  });

  useCoverThemeEnrichment(detailQuery.data?.release);
  // Warm the records either side, so leafing usually has nothing left to wait for.
  useNeighbourPalettes(copyId);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["copy", copyId] });
    await queryClient.invalidateQueries({ queryKey: ["copies"] });
    await queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const save = useMutation({
    mutationFn: async (patch: CopyPatch) => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return;
      await store.putCopy(applyCopyPatch(copy, patch, clock));
    },
    onSuccess: invalidate,
  });

  const { offerRemoval } = useUndo();
  const remove = useMutation({
    mutationFn: async (_summary: RemovedCopySummary) => {
      const copy = await store.getCopy(copyId);
      if (copy === undefined) return;
      await store.putCopy(tombstoneCopy(copy, clock, Date.now()));
    },
    onSuccess: async (_result, summary) => {
      await invalidate();
      router.replace("/");
      // 3a-x-e: the write is local, so Undo is a plain restore of the same record.
      offerRemoval({
        kind: "COPY",
        title: summary.title,
        line: summary.line,
        undo: async () => {
          const gone = await store.getCopyIncludingDeleted(copyId);
          if (gone === undefined) return;
          await store.putCopy(restoreCopy(gone, clock));
          await invalidate();
        },
      });
    },
  });

  return {
    data: detailQuery.data ?? null,
    loading: detailQuery.isLoading,
    save: (patch: CopyPatch) => save.mutate(patch),
    saving: save.isPending,
    remove: (summary: RemovedCopySummary) => remove.mutate(summary),
    removing: remove.isPending,
  };
}

/**
 * Fills in a release's cover theme in the background, once.
 *
 * The palette is only sampled server-side on the detail lookup, so a release cached from a
 * search arrives without one. Fetching it costs a round trip and, on a cover the server has
 * never sampled, several seconds of image fetch and decode — which is why it happens beside
 * the screen rather than in front of it. The screen renders in its neutral paper chrome and
 * takes on the sleeve's colour when the answer lands.
 *
 * `staleTime: Infinity` is what keeps it to once: a release whose cover genuinely has no
 * palette still comes back with a null theme, and without this every reopen would ask again.
 */
export function useCoverThemeEnrichment(release: Release | undefined): void {
  const { store } = useStore();
  const queryClient = useQueryClient();

  useQuery({
    queryKey: ["coverTheme", release?.id],
    enabled: release !== undefined && release.coverTheme === null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => {
      if (release === undefined) return null;
      const enriched = await lookupRelease(release.id).catch(() => null);
      if (enriched === null || enriched.coverTheme === null) return null;
      await store.cacheReleases([enriched]);
      // Only now, and only when something actually changed, does the screen re-read.
      await queryClient.invalidateQueries({ queryKey: ["copy"] });
      return enriched;
    },
  });
}

/**
 * Fetches the palettes of the copies either side of this one, before they are asked for.
 *
 * The palette is sampled server-side on the single-release lookup and nowhere else, so a
 * record whose detail has never been opened arrives without one. That is fine when a screen
 * is opened -- it holds paper for a moment and washes -- and it is not fine when the record
 * next door is a swipe away, because then it is a wash on every single swipe.
 *
 * Best effort and deliberately quiet: a neighbour that cannot be reached simply gets its
 * palette the old way, when it is opened.
 */
function useNeighbourPalettes(copyId: string): void {
  const { store } = useStore();

  useEffect(() => {
    let alive = true;
    const { previous, next } = neighboursOf(copyId);

    void (async () => {
      for (const neighbour of [next, previous]) {
        if (neighbour === null || !alive) continue;
        const copy = await store.getCopy(neighbour);
        if (copy === undefined || !alive) continue;
        const neighbourKey = catalogueKeyOf(copy);
        const release = neighbourKey === null ? undefined : await store.getRelease(neighbourKey);
        // Already sampled, or nothing to sample: either way there is nothing to fetch.
        if (release === undefined || release.coverTheme !== null || !alive) continue;
        const enriched = await lookupRelease(release.id).catch(() => null);
        if (enriched === null || !alive) continue;
        await store.cacheReleases([enriched]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [copyId, store]);
}
