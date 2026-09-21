import { lookupPressings } from "@/api/releases";
import { useSatisfyWishes } from "@/features/wishlist/useSatisfyWishes";
import { useStore } from "@/local/StoreProvider";
import { readDefaultCurrency } from "@/local/settings";
import type { Format, Release } from "@janne6565/rekordo-shared";
import {
  type CopyDraft,
  asWishFormat,
  createAlbumCopy,
  createCopy,
  createWishlistItem,
  pickPressing,
  pressingList,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";

export type AddDestination = "SHELF" | "WISHLIST";

/**
 * The one sheet between a search result and a saved copy.
 *
 * A search hit names a *release*, but a shelf holds a *pressing*, and the two are not the
 * same claim: "Bitches Brew" came back as one row and exists as forty-seven objects. The
 * sheet is where that gap is closed — the catalogue's first answer to accept in one tap, the other
 * pressings a tap further, and the format still editable because the catalogue is
 * describing a record while you are holding one.
 *
 * It serves both destinations. They are the same question with the same answer sheet, and
 * the quiet line at the bottom flips it, so a mis-tap costs a tap rather than a delete.
 *
 * Turn 28 of the deck, screen 6c.
 */
export function useAddSheetLogic(
  release: Release,
  initial: AddDestination,
  onDone: () => void,
  /**
   * Whether `release` is a pressing somebody chose, or only the record they tapped.
   *
   * False when the sheet was opened on an album -- an artist row, an example tile -- where
   * there is no pressing yet and picking one for them would record a guess as an answer.
   */
  pressingChosen = true,
  /**
   * A format to open on, and to land the pressing on, where the tap said nothing.
   *
   * The example plate only. Those tiles exist to show a newcomer what adding a record
   * looks like, and a sheet that opens on "no format, no pressing, two questions to answer"
   * shows them a form instead. Set to `VINYL` there because that is what this app is mostly
   * for; everywhere else the tap named a pressing and this stays undefined.
   *
   * A preference, not an override: it decides the opening chip and which pressing is landed
   * on, and the moment the album has no pressing in that format the sheet follows the
   * catalogue rather than keeping a chip nothing behind it agrees with.
   */
  prefer?: Format,
) {
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const satisfyWishes = useSatisfyWishes();

  const [destination, setDestination] = useState<AddDestination>(initial);
  // Null means nobody has chosen a pressing. The sheet still draws from `release`, which
  // for an album-first open is the album shaped as the release a copy of it would have had.
  const [picked, setPicked] = useState<Release | null>(pressingChosen ? release : null);
  const shown = picked ?? release;
  const [format, setFormat] = useState<Format>(prefer ?? release.format);
  const [picking, setPicking] = useState(false);

  /**
   * The other pressings of the same album.
   *
   * Fetched behind the sheet, which is answerable without it: the catalogue's first answer
   * is already on screen and the line that opens this only appears once there is something
   * behind it.
   */
  const pressings = useQuery({
    queryKey: ["pressings", release.albumId],
    queryFn: () => lookupPressings(release.albumId),
  });

  /**
   * Landing an opened-on-an-album sheet on a real pressing.
   *
   * Runs once, only where `prefer` asked for it, and only while nothing has been chosen --
   * so a person who opens the picker before the list has loaded is never overruled by it.
   * Note what this gives up: everywhere else, an album-first sheet deliberately records no
   * pressing at all, because writing down whichever one the catalogue ranked first is a
   * guess stored as an answer. On the example tiles that trade is worth making, and the
   * format then follows the pressing actually landed on rather than the preference.
   */
  const landed = useRef(prefer === undefined);
  useEffect(() => {
    if (landed.current || picked !== null) return;
    const candidates = pressings.data;
    if (candidates === undefined || candidates.length === 0) return;
    landed.current = true;
    const first = pickPressing(candidates, prefer ?? null);
    if (first === undefined) return;
    setPicked(first);
    if (first.format !== "OTHER") setFormat(first.format);
  }, [pressings.data, prefer, picked]);

  const save = useMutation({
    mutationFn: async () => {
      // Cached under `shown.id` either way -- for an album-first add that id is the album's,
      // which is the key the shelf will look its facts up by. Without this the new row has
      // no title until the next sync fills the mirror in.
      await store.cacheReleases([shown]);
      if (destination === "WISHLIST") {
        const wish = createWishlistItem(
          {
            albumId: shown.albumId,
            releaseId: picked?.id ?? null,
            title: shown.title,
            artistName: shown.artistName,
            year: shown.year,
            desiredFormat: asWishFormat(format),
            note: null,
          },
          clock,
          Date.now(),
          Crypto.randomUUID(),
        );
        await store.putWishlistItem(wish);
        return null;
      }

      const draft: CopyDraft = {
        condition: null,
        sleeveCondition: null,
        catalogArt: "AUTO",
        pricePaidCents: null,
        currency: await readDefaultCurrency(store),
        purchasedOn: null,
        purchasedAt: null,
        notes: null,
        rating: null,
      };
      const now = Date.now();
      const id = Crypto.randomUUID();
      const copy =
        picked === null
          ? createAlbumCopy({ albumId: shown.albumId }, draft, clock, now, id)
          : createCopy(picked, draft, clock, now, id);
      // The format on the chips is an answer about the object, so it overrides the
      // catalogue — and only when it disagrees, or every copy would carry a redundant one.
      const stated = format === shown.format ? copy : { ...copy, manualFormat: format };
      await store.putCopy(stated);
      // One record, added by a person: the only origin that reaches anybody's feed.
      await store.rememberOrigins([stated.id], "MANUAL");
      await satisfyWishes(stated, shown);
      return stated;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["copies"] });
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["ownedReleases"] });
      onDone();
    },
  });

  /**
   * The pressings worth offering, in the order somebody holding the record reads them.
   *
   * Discogs answers in its own relevance order, which opened this chooser on CD 2005,
   * Cassette 1991, CD 1995. Narrowed to the format the chips have named, because that is
   * the same question this list answers, and oldest first because the first pressing is
   * the one people most often mean. Shared with the web, so the two cannot drift.
   */
  const candidates = pressingList(pressings.data ?? [], format === "OTHER" ? null : format);

  return {
    destination,
    /** The quiet line under the button: the same record, the other list. */
    flip: useCallback(
      () => setDestination((current) => (current === "SHELF" ? "WISHLIST" : "SHELF")),
      [],
    ),
    /** What the sheet draws: the chosen pressing, or the record itself when there is none. */
    picked: shown,
    /** Whether a pressing has actually been chosen, as opposed to one being shown. */
    hasPressing: picked !== null,
    format,
    setFormat,
    picking,
    openPicker: useCallback(() => setPicking(true), []),
    closePicker: useCallback(() => setPicking(false), []),
    pressings: candidates,
    /** How many pressings are not the one on screen, for the "3 others" line. */
    others: Math.max(0, candidates.length - 1),
    /**
     * Whether there is a choice to make at all.
     *
     * An album the archive knows one pressing of is not a decision, and a box that opens a
     * list of one would be a promise of a choice that is not there. Everything else is
     * pickable, and says so on the box rather than in a link beside it.
     *
     * With no pressing chosen even a list of one is a decision, because the choice on offer
     * is not "which of these" but "this one, or none".
     */
    canPick: picked === null ? candidates.length > 0 : candidates.length > 1,
    /** True while the album's pressings are still on their way; the line waits for them. */
    loadingPressings: pressings.isPending,
    pick: useCallback((next: Release) => {
      setPicked(next);
      if (next.format !== "OTHER") setFormat(next.format);
      setPicking(false);
    }, []),
    /**
     * Whether the pressing on screen is the one the catalogue answered with first.
     *
     * Only that one is labelled, and the label says exactly that. It used to read "best
     * guess", which claimed a judgement nothing here makes: with no format to go on
     * `pickPressing` returns `releases[0]`. Once somebody has picked from the list the
     * badge goes, because then it is their choice rather than the catalogue's order.
     */
    isGuess: picked !== null && picked.id === release.id && pressingChosen,
    save: () => save.mutate(),
    saving: save.isPending,
  };
}
