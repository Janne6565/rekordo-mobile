import {
  type PhotoSource,
  type PickedImage,
  pickImage,
  storePhotoBytes,
} from "@/features/photos/pickImage";
import { useStore } from "@/local/StoreProvider";
import { readDefaultCurrency } from "@/local/settings";
import { useAppDispatch } from "@/store/hooks";
import { type ScanDestination, scanActions } from "@/store/scanSlice";
import type { Format, ManualRelease } from "@janne6565/rekordo-shared";
import {
  catalogueKeyOf,
  catalogueKeysOf,
  createManualCopy,
  createPhoto,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

/**
 * Preselected, because the shelf has to draw something.
 *
 * Format is the one field with no honest blank: the library filters by it and a copy with
 * no picture is drawn as its format's silhouette. Vinyl is what screen 14a starts on.
 */
const DEFAULT_FORMAT: Format = "VINYL";

export interface ManualFields {
  artist: string;
  title: string;
  year: string;
  label: string;
  catalogNumber: string;
  format: Format;
}

const EMPTY: ManualFields = {
  artist: "",
  title: "",
  year: "",
  label: "",
  catalogNumber: "",
  format: DEFAULT_FORMAT,
};

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/** The form as the pressing it describes: blanks are null, never empty strings. */
function asManualRelease(fields: ManualFields): ManualRelease {
  const year = Number.parseInt(fields.year.trim(), 10);
  return {
    manualTitle: blankToNull(fields.title),
    manualArtist: blankToNull(fields.artist),
    manualYear: Number.isNaN(year) ? null : year,
    manualLabel: blankToNull(fields.label),
    manualCatalogNumber: blankToNull(fields.catalogNumber),
    manualFormat: fields.format,
  };
}

/**
 * Screen 14a — the copy nobody has a record of.
 *
 * One column and five fields, of which two are required. Everything the copy itself can
 * say — condition, price, where it came from, a rating — is deliberately not here: it is
 * the editor's job on the copy that this creates, which is where the deck sends you next
 * ("Condition, price, shop, rating · Later").
 */
export function useManualEntryLogic() {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [fields, setFields] = useState<ManualFields>(EMPTY);
  /**
   * The picture for the well, held rather than written.
   *
   * Nothing is on disk until the form is saved: a photo attached to a copy somebody then
   * abandoned would be bytes nothing ever references. Closing the screen is the undo,
   * which is also how the web dialog behaves.
   */
  const [cover, setCover] = useState<PickedImage | null>(null);

  const set = useCallback(<K extends keyof ManualFields>(key: K, value: ManualFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
  }, []);

  /**
   * Artists already on the shelf, so a second tape by the same band does not become a
   * second artist through a different spelling.
   */
  const shelf = useQuery({
    queryKey: ["manualArtists"],
    queryFn: async () => {
      const copies = await store.listCopies();
      const releases = await store.getReleases(catalogueKeysOf(copies));
      const counts = new Map<string, number>();
      for (const copy of copies) {
        const name = releases.get(catalogueKeyOf(copy) ?? "")?.artistName;
        if (name === undefined || name.trim() === "") continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return counts;
    },
  });

  const typed = fields.artist.trim().toLowerCase();
  /**
   * The one name worth offering under the field, with how many of them you already own.
   *
   * One rather than a list: the deck draws a single line there, and on a phone a dropdown
   * over a form the keyboard is already covering half of is not an improvement.
   */
  const artistHint = useMemo(() => {
    if (typed === "" || shelf.data === undefined) return null;
    for (const [name, count] of shelf.data) {
      if (name.toLowerCase().startsWith(typed) && name.toLowerCase() !== typed) {
        return { name, count };
      }
    }
    return null;
  }, [shelf.data, typed]);

  /**
   * The camera or the library, straight into the well.
   *
   * Two buttons rather than one that asks which — the phone already has a photo strip on
   * the copy detail, and this is the same pair of tap targets in a smaller frame.
   */
  const chooseCover = useMutation({
    mutationFn: (source: PhotoSource) => pickImage(source),
    onSuccess: (picked) => {
      if (picked !== null) setCover(picked);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const copy = createManualCopy(
        asManualRelease(fields),
        {
          condition: null,
          sleeveCondition: null,
          catalogArt: "AUTO",
          pricePaidCents: null,
          currency: await readDefaultCurrency(store),
          purchasedOn: null,
          purchasedAt: null,
          notes: null,
          rating: null,
        },
        clock,
        Date.now(),
        Crypto.randomUUID(),
      );
      await store.putCopy(copy);
      // One record, added by a person: the only origin that reaches anybody's feed.
      await store.rememberOrigins([copy.id], "MANUAL");

      // The cover is an ordinary photo of the copy — a manual pressing has no catalogue
      // artwork to prefer, so the photo order alone decides the preview. Bytes first: a
      // photo record with no bytes renders as a permanent placeholder.
      if (cover !== null) {
        const photoId = Crypto.randomUUID();
        await storePhotoBytes(store, photoId, cover.uri);
        await store.putPhoto(
          createPhoto(
            {
              copyId: copy.id,
              contentType: cover.contentType,
              byteSize: cover.byteSize,
              sortIndex: 0,
            },
            clock,
            Date.now(),
            photoId,
          ),
        );
      }
      return copy;
    },
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries();
      // Replace rather than push, and open the editor unfolded — the same landing every
      // other add uses. "Later" is a promise that the rest of the form is one screen away,
      // and this is that screen.
      router.replace(`/copies/${copy.id}?fresh=1`);
    },
  });

  return {
    fields,
    set,
    artistHint,
    /** The picture the well is showing, or null while it is still an empty frame. */
    coverUri: cover?.uri ?? null,
    chooseCover: (source: PhotoSource) => chooseCover.mutate(source),
    dropCover: () => setCover(null),
    choosingCover: chooseCover.isPending,
    /** The two things that name a record on a shelf. */
    canSave: fields.artist.trim() !== "" && fields.title.trim() !== "",
    save: () => save.mutate(),
    saving: save.isPending,
    /**
     * The scan session's way of finishing the form: into the tray, and back to the camera.
     *
     * Nothing is written. The record waits with everything else kept this visit, where it
     * can still be redirected or dropped, and is saved with the batch — which is also when
     * its condition and price are asked for, alongside everybody else's. The camera says
     * what landed and offers the Undo, as it does for a card.
     */
    keep: (destination: ScanDestination, barcode: string) => {
      dispatch(
        scanActions.kept({
          key: Crypto.randomUUID(),
          barcode,
          release: null,
          manual: { fields: asManualRelease(fields), cover },
          format: fields.format,
          destination,
          secondCopy: false,
          keptAt: Date.now(),
        }),
      );
      router.back();
    },
  };
}
