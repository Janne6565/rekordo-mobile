import { lookupPressings, searchAlbums } from "@/api/releases";
import { useAppDispatch } from "@/store/hooks";
import { scanActions } from "@/store/scanSlice";
import type { Album, RecordGroup } from "@janne6565/rekordo-shared";
import { albumResults } from "@janne6565/rekordo-shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

/** Kept in step with the add screen's search, which follows the field the same way. */
const DEBOUNCE_MS = 350;
/** Below this, a title search matches most of the archive and tells you nothing. */
const MIN_TERM_LENGTH = 2;

/**
 * The title search inside a scan session (scan deck, screen 3c).
 *
 * Reached from a barcode no catalogue has. It answers with records, the way the add screen
 * does, but what it does with the one picked is different: nothing is written and no sheet
 * is raised. The record's pressings go back to the camera, which raises the card a scan
 * would have raised, so the detour ends in the same question as every other read.
 */
export function useScanSearchLogic(barcode: string) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");

  useEffect(() => {
    const query = term.trim();
    if (query.length < MIN_TERM_LENGTH) {
      setSubmitted("");
      return;
    }
    const timer = setTimeout(() => setSubmitted(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const albums = useQuery({
    // The add screen's key, so a title already searched there is answered from memory.
    queryKey: ["albumSearch", submitted],
    enabled: submitted !== "",
    queryFn: () => searchAlbums(submitted),
  });

  /** Records first, then singles and EPs, as one list: a 7" is a thing people scan too. */
  const results = useMemo((): readonly RecordGroup[] => {
    const { records, singles } = albumResults(albums.data ?? []);
    return [...records, ...singles.map((album) => ({ album, editions: [] }))];
  }, [albums.data]);

  const pick = useMutation({
    mutationFn: async (album: Album) => {
      const pressings = await lookupPressings(album.albumId);
      // A record with no pressings listed cannot be put on the card: every answer the
      // card offers is a pressing. Said on the row, and manual entry is one line below.
      if (pressings.length === 0) return false;
      dispatch(scanActions.foundByTitle({ barcode, pressings }));
      router.back();
      return true;
    },
  });

  return {
    term,
    setTerm,
    clear: () => setTerm(""),
    /** True while the field holds something worth searching for. */
    searching: submitted !== "",
    loading: albums.isFetching,
    failed: albums.isError,
    results,
    pick: (album: Album) => pick.mutate(album),
    /** The record whose pressings are on their way, so its row can say so. */
    pickingId: pick.isPending ? (pick.variables?.albumId ?? null) : null,
    /** The record that turned out to have nothing to pick from, or could not be asked. */
    unavailableId: pick.isError || pick.data === false ? (pick.variables?.albumId ?? null) : null,
    back: () => router.back(),
    /**
     * The search came up empty too. Replaces this screen rather than stacking on it, so
     * the form's way out is the camera and not a list of results that did not help.
     */
    enterManually: () =>
      router.replace(barcode === "" ? "/manual?scan=1" : `/manual?scan=1&barcode=${barcode}`),
  };
}
