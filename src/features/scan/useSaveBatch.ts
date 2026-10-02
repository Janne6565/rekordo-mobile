import { storePhotoBytes } from "@/features/photos/pickImage";
import { useSatisfyWishes } from "@/features/wishlist/useSatisfyWishes";
import { useStore } from "@/local/StoreProvider";
import { readDefaultCurrency } from "@/local/settings";
import { useAppDispatch } from "@/store/hooks";
import type { KeptScan } from "@/store/scanSlice";
import { scanActions } from "@/store/scanSlice";
import type { Copy, WishlistItem } from "@janne6565/rekordo-shared";
import {
  asWishFormat,
  createCopy,
  createManualCopy,
  createPhoto,
  createScannedCopy,
  createWishlistItem,
  manualReleaseId,
  tombstoneCopy,
  tombstoneWishlistItem,
} from "@janne6565/rekordo-shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useCallback } from "react";

export interface SavedBatch {
  readonly copyIds: string[];
  readonly wishIds: string[];
}

/**
 * Writing a whole crate at once.
 *
 * One press for the batch rather than a write per scan, because the tray is a decision
 * about the visit, not about each record: a row can still be dropped or redirected while
 * you are standing at the counter, and a scan that had already written itself would have
 * to be un-written instead.
 *
 * Everything is local, so this works with no connection at all. The scans that could not
 * be identified are written as the digits they are and name themselves later — see
 * `resolvePendingScans` in the shared package.
 */
export function useSaveBatch() {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const satisfyWishes = useSatisfyWishes();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["copies"] });
    await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    await queryClient.invalidateQueries({ queryKey: ["wish-photos"] });
    await queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  const save = useMutation({
    mutationFn: async (kept: readonly KeptScan[]): Promise<SavedBatch> => {
      const currency = await readDefaultCurrency(store);
      const now = Date.now();
      const copyIds: string[] = [];
      const wishIds: string[] = [];

      // Every release the tray knows about, cached in one write: the library and the
      // detail screens read metadata locally and have to keep working with no network.
      const releases = kept
        .map((scan) => scan.release)
        .filter((release): release is NonNullable<typeof release> => release !== null);
      if (releases.length > 0) await store.cacheReleases(releases);

      /**
       * The cover picked on the manual form, as the first photo of what it became.
       *
       * Bytes first: a photo record with no bytes renders as a permanent placeholder.
       */
      const attachCover = async (
        scan: KeptScan,
        owner: { copyId: string } | { wishId: string },
      ) => {
        const cover = scan.manual?.cover ?? null;
        if (cover === null) return;
        const photoId = Crypto.randomUUID();
        await storePhotoBytes(store, photoId, cover.uri);
        await store.putPhoto(
          createPhoto(
            { ...owner, contentType: cover.contentType, byteSize: cover.byteSize, sortIndex: 0 },
            clock,
            now,
            photoId,
          ),
        );
      };

      for (const scan of kept) {
        if (scan.destination === "SHELF") {
          const copy = shelfCopy(scan, currency, clock, now);
          await store.putCopy(copy);
          copyIds.push(copy.id);
          // One record, added by a person: the only origin that reaches anybody's feed.
          await store.rememberOrigins([copy.id], "MANUAL");
          await attachCover(scan, { copyId: copy.id });
          // The entry leaves the wishlist when the record arrives, whichever way in was
          // used. A scan that could not be identified settles nothing yet — there is no
          // release to compare against — and settles it when the resolver names it.
          if (scan.release !== null) await satisfyWishes(copy, scan.release);
        } else {
          const wish = wishEntry(scan, clock, now);
          await store.putWishlistItem(wish);
          wishIds.push(wish.id);
          await attachCover(scan, { wishId: wish.id });
        }
      }

      return { copyIds, wishIds };
    },
    onSuccess: async (batch) => {
      dispatch(scanActions.saved(batch));
      await refresh();
    },
  });

  /**
   * Taking the whole batch back.
   *
   * Tombstones rather than a local delete, for the same reason every other delete here is
   * one: an unstamped removal loses the next merge and the records come back. The tray is
   * restored as it was, so undoing is a step backwards in the flow rather than a discard.
   */
  const undo = useMutation({
    mutationFn: async ({ batch, kept }: { batch: SavedBatch; kept: readonly KeptScan[] }) => {
      const now = Date.now();
      for (const id of batch.copyIds) {
        const copy = await store.getCopyIncludingDeleted(id);
        if (copy !== undefined) await store.putCopy(tombstoneCopy(copy, clock, now));
      }
      for (const id of batch.wishIds) {
        const wish = await store.getWishlistItemIncludingDeleted(id);
        if (wish !== undefined)
          await store.putWishlistItem(tombstoneWishlistItem(wish, clock, now));
      }
      return kept;
    },
    onSuccess: async (kept) => {
      dispatch(scanActions.unsaved([...kept]));
      await refresh();
    },
  });

  return {
    save: (kept: readonly KeptScan[]) => save.mutateAsync(kept),
    saving: save.isPending,
    undo: (batch: SavedBatch, kept: readonly KeptScan[]) => undo.mutateAsync({ batch, kept }),
    undoing: undo.isPending,
  };
}

function emptyDraft(currency: string) {
  return {
    condition: null,
    sleeveCondition: null,
    catalogArt: "AUTO" as const,
    pricePaidCents: null,
    currency,
    purchasedOn: null,
    purchasedAt: null,
    notes: null,
    rating: null,
  };
}

function shelfCopy(
  scan: KeptScan,
  currency: string,
  clock: Parameters<typeof createCopy>[2],
  now: number,
): Copy {
  const id = Crypto.randomUUID();
  const draft = emptyDraft(currency);
  const manual = scan.manual ?? null;
  if (manual !== null) {
    // The format chips in Review stay live for a typed record too, so the tray's format
    // is the one that is written rather than the one the form was left on.
    return createManualCopy(
      { ...manual.fields, manualFormat: scan.format ?? manual.fields.manualFormat },
      draft,
      clock,
      now,
      id,
    );
  }
  if (scan.release === null) {
    return createScannedCopy(scan.barcode, scan.format, draft, clock, now, id);
  }
  const copy = createCopy(scan.release, draft, clock, now, id);
  // The format the person confirmed on the card overrides the catalogue's, and only when
  // it disagrees: `manualFormat` set to the same answer would be noise on every copy.
  return scan.format === null || scan.format === scan.release.format
    ? copy
    : { ...copy, manualFormat: scan.format };
}

function wishEntry(
  scan: KeptScan,
  clock: Parameters<typeof createWishlistItem>[1],
  now: number,
): WishlistItem {
  const id = Crypto.randomUUID();
  const manual = scan.manual ?? null;
  if (manual !== null) {
    // A wish for a record no catalogue has: its own album, the way a hand-typed copy is
    // its own release, and no pressing to point at.
    return createWishlistItem(
      {
        albumId: manualReleaseId(id),
        releaseId: null,
        title: manual.fields.manualTitle ?? "",
        artistName: manual.fields.manualArtist ?? "",
        year: manual.fields.manualYear,
        desiredFormat: asWishFormat(scan.format ?? manual.fields.manualFormat),
        note: null,
      },
      clock,
      now,
      id,
    );
  }
  if (scan.release === null) {
    // Nothing to name it with yet. Empty strings rather than a placeholder title: the row
    // draws itself from the barcode, and "Unknown" would be a claim nobody made.
    return createWishlistItem(
      {
        albumId: "",
        releaseId: null,
        pendingBarcode: scan.barcode,
        title: "",
        artistName: "",
        year: null,
        desiredFormat: asWishFormat(scan.format),
        note: null,
      },
      clock,
      now,
      id,
    );
  }
  return createWishlistItem(
    {
      albumId: scan.release.albumId,
      releaseId: scan.release.id,
      title: scan.release.title,
      artistName: scan.release.artistName,
      year: scan.release.year,
      desiredFormat: asWishFormat(scan.format ?? scan.release.format),
      note: null,
    },
    clock,
    now,
    id,
  );
}
