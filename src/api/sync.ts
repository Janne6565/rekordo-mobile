import { request } from "@/api/client";
import type { Copy, Photo, Release, SyncPage, WishlistItem } from "@janne6565/rekordo-shared";

interface SyncPayload {
  copies?: unknown[];
  wishes?: unknown[];
  photos?: unknown[];
  cursor?: number;
  hasMore?: boolean;
}

/** Validates at the boundary: a malformed record is dropped, never written to the store. */
function toCopy(raw: unknown): Copy | null {
  const dto = raw as Partial<Copy> | null;
  if (
    dto === null ||
    dto.id === undefined ||
    dto.releaseId === undefined ||
    dto.currency === undefined ||
    dto.createdAt === undefined ||
    dto.fieldClocks === undefined
  ) {
    return null;
  }
  return {
    id: dto.id,
    releaseId: dto.releaseId,
    // Absent means a server older than the field, which reads as an album nobody named.
    albumId: dto.albumId ?? null,
    // Absent means a server older than the field, which reads as nothing pending.
    pendingBarcode: dto.pendingBarcode ?? null,
    // The pressing a hand-entered copy describes itself. Null throughout on a matched one,
    // and on anything a server older than the fields sends back.
    manualTitle: dto.manualTitle ?? null,
    manualArtist: dto.manualArtist ?? null,
    manualYear: dto.manualYear ?? null,
    manualLabel: dto.manualLabel ?? null,
    manualCatalogNumber: dto.manualCatalogNumber ?? null,
    manualFormat: dto.manualFormat ?? null,
    condition: dto.condition ?? null,
    sleeveCondition: dto.sleeveCondition ?? null,
    // Absent means a server older than the field, which is the same as not preferring it.
    catalogArt: dto.catalogArt ?? "AUTO",
    pricePaidCents: dto.pricePaidCents ?? null,
    currency: dto.currency,
    purchasedOn: dto.purchasedOn ?? null,
    purchasedAt: dto.purchasedAt ?? null,
    notes: dto.notes ?? null,
    notesConflict: dto.notesConflict ?? null,
    rating: dto.rating ?? null,
    // Absent means a server older than the field, which reads as not hidden.
    hidden: dto.hidden ?? false,
    // Absent means a server older than the field, which reads as never placed by hand.
    sortIndex: dto.sortIndex ?? null,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt ?? null,
    fieldClocks: dto.fieldClocks,
  };
}

function toWish(raw: unknown): WishlistItem | null {
  const dto = raw as Partial<WishlistItem> | null;
  if (
    dto === null ||
    dto.id === undefined ||
    dto.albumId === undefined ||
    dto.title === undefined ||
    dto.artistName === undefined ||
    dto.createdAt === undefined ||
    dto.fieldClocks === undefined
  ) {
    return null;
  }
  return {
    id: dto.id,
    albumId: dto.albumId,
    // Absent means a server older than the field, which reads as no pressing picked.
    releaseId: dto.releaseId ?? null,
    pendingBarcode: dto.pendingBarcode ?? null,
    title: dto.title,
    artistName: dto.artistName,
    year: dto.year ?? null,
    desiredFormat: dto.desiredFormat ?? null,
    note: dto.note ?? null,
    // Absent means a server older than the field, which reads as never hand-placed.
    sortIndex: dto.sortIndex ?? null,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt ?? null,
    fieldClocks: dto.fieldClocks,
  };
}

function toPhoto(raw: unknown): Photo | null {
  const dto = raw as Partial<Photo> | null;
  // An owner is required, but which one is not: a photo pictures a copy or a wishlist
  // entry. A row naming neither is unreachable and is dropped rather than stored.
  if (
    dto === null ||
    dto.id === undefined ||
    (dto.copyId == null && dto.wishId == null) ||
    dto.createdAt === undefined ||
    dto.fieldClocks === undefined
  ) {
    return null;
  }
  return {
    id: dto.id,
    copyId: dto.copyId ?? null,
    wishId: dto.wishId ?? null,
    storageKey: dto.storageKey ?? null,
    contentType: dto.contentType ?? "image/jpeg",
    byteSize: dto.byteSize ?? 0,
    sortIndex: dto.sortIndex ?? 0,
    createdAt: dto.createdAt,
    deletedAt: dto.deletedAt ?? null,
    fieldClocks: dto.fieldClocks,
  };
}

function toPage(payload: SyncPayload): SyncPage {
  return {
    copies: (payload.copies ?? []).map(toCopy).filter((copy): copy is Copy => copy !== null),
    wishes: (payload.wishes ?? [])
      .map(toWish)
      .filter((wish): wish is WishlistItem => wish !== null),
    photos: (payload.photos ?? []).map(toPhoto).filter((photo): photo is Photo => photo !== null),
    cursor: payload.cursor ?? 0,
    hasMore: payload.hasMore === true,
  };
}

export async function pullChanges(since: number): Promise<SyncPage> {
  return toPage(await request<SyncPayload>(`/api/v1/sync?since=${since}`));
}

export async function pushChanges(
  copies: readonly Copy[],
  wishes: readonly WishlistItem[],
  photos: readonly Photo[],
  /**
   * The catalogue behind these copies, as this device holds it.
   *
   * The mirror only learns of a release when somebody looks one up through the metadata
   * proxy, so a collection that reached the server any other way names releases it cannot
   * resolve -- and a Discogs id it is missing can never be fetched by id at all. The
   * device that made the copy is the only party still holding the answer.
   */
  releases: readonly Release[],
  /**
   * Why each copy in this batch exists, keyed by copy id.
   *
   * Beside the records rather than on them: it is the reason for this push, not a property
   * of the copy that has to survive or merge, and it matters exactly once — when the server
   * first sees the row. A copy this map does not mention says nothing to anybody's feed.
   */
  origins: Record<string, string> = {},
): Promise<SyncPage> {
  return toPage(
    await request<SyncPayload>("/api/v1/sync", {
      method: "POST",
      body: { copies, wishes, photos, releases, origins },
    }),
  );
}
