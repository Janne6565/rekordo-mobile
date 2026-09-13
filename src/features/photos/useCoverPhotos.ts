import { useStore } from "@/local/StoreProvider";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Each copy's own photo, as a file URI an Image can render.
 *
 * The library grid draws the same preview the detail hero does: the copy's own picture
 * first, and the archive's cover behind it. Cheap here — the bytes are already files, so
 * this is one query and no reading.
 *
 * A photo pulled from another device has a row but no file yet; the URI is handed over
 * anyway and `ReleaseArt` falls through to the catalogue cover, then the placeholder,
 * when it fails to load — the same thing the strip does.
 *
 * Mirrored from rekordo-frontend/src/features/photos/useCoverPhotos.ts, which has
 * to build object URLs from IndexedDB blobs instead.
 */
export function useCoverPhotos(copyIds: readonly string[]): ReadonlyMap<string, string> {
  const { store } = useStore();

  /**
   * The copies on screen as a *set*: sorted and de-duplicated, then joined for the key.
   *
   * Sorting is the whole point, and the joining alone used to be it. The key was the ids
   * in the order the shelf happened to be in, so arranging the shelf by hand made it a
   * different query — one with nothing cached — and every preview went null for as long
   * as the read took. A drag changes the order and never the set, so with the set as the
   * key it does not refetch at all.
   */
  const ids = useMemo(() => [...new Set(copyIds)].sort(), [copyIds]);

  const photos = useQuery({
    queryKey: ["cover-photos", ids.join(",")],
    queryFn: async () => {
      const covers = await store.listCoverPhotos(ids);
      return new Map([...covers].map(([copyId, photo]) => [copyId, store.photoUri(photo.id)]));
    },
  });

  return photos.data ?? EMPTY;
}

const EMPTY: ReadonlyMap<string, string> = new Map();
