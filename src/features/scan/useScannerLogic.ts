import { lookupByBarcode, lookupPressings } from "@/api/releases";
import { CHOOSABLE_FORMATS } from "@/domain/formats";
import { useStore } from "@/local/StoreProvider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { type KeptScan, type ScanDestination, scanActions } from "@/store/scanSlice";
import type { Copy, Format, Release } from "@janne6565/rekordo-shared";
import { copyFormat, isBarcode, pickPressing } from "@janne6565/rekordo-shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What the card under the camera window is currently asking.
 *
 *   MATCH      one release, or several that agree — the ordinary case
 *   PRESSINGS  several pressings share the barcode and one has to be picked
 *   DUPLICATE  this is already on the shelf, which is a fact rather than an error
 *   MISSING    the read was clean and no catalogue has the number
 *   OFFLINE    the read was clean and nobody could be asked
 */
export type ScanCardKind = "MATCH" | "PRESSINGS" | "DUPLICATE" | "MISSING" | "OFFLINE";

export interface ScanCard {
  readonly kind: ScanCardKind;
  readonly barcode: string;
  /** Every pressing the barcode resolved to, catalogue order. Empty when it resolved to none. */
  readonly candidates: readonly Release[];
  /** The one the card is about, and the one the buttons act on. */
  readonly picked: Release | null;
  readonly format: Format | null;
  /** The copy already on the shelf, for the duplicate card's date and grade. */
  readonly owned: Copy | null;
  /**
   * How the card came to be: read off a sleeve, or picked in the title search after the
   * read came up empty. The question and its answers are the same either way; only the
   * line that says where the pressings came from differs.
   */
  readonly source: "BARCODE" | "TITLE";
}

/**
 * How long a barcode is ignored after being read.
 *
 * The camera reports the same symbol many times a second while it is in frame, and the
 * card would otherwise be rebuilt under the finger about to press it. Long enough to keep
 * a hand steady over one sleeve, short enough that deliberately re-scanning the record you
 * just skipped works on the second try rather than the tenth.
 */
const SAME_CODE_COOLDOWN_MS = 2500;

/**
 * How long the viewfinder waits before offering advice.
 *
 * The advice is about a dim shop or the wrong distance, and both take a moment to become
 * true. Said immediately it would be noise on every scan; said never it would be missing
 * exactly where the scanner stops working.
 */
const ADVICE_AFTER_MS = 6000;

/**
 * How long the two notes stay up: what just landed, and what the next sleeve pushed aside.
 *
 * Both carry an Undo, so they have to outlast the moment of noticing the mistake and
 * reaching for it — and no longer, because the next record is already in the other hand.
 */
const KEPT_NOTE_MS = 5000;
const SKIPPED_NOTE_MS = 4000;

/** The formats a confirm card offers. `OTHER` is a catalogue answer, never a choice. */
export const SCAN_FORMATS = CHOOSABLE_FORMATS;

/** A card as it stood when it left the screen, so an Undo can put it back whole. */
interface ShelvedCard {
  readonly card: ScanCard;
  readonly siblings: readonly Release[] | null;
}

export function useScannerLogic() {
  const { store } = useStore();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const kept = useAppSelector((state) => state.scan.kept);
  const justKeptKey = useAppSelector((state) => state.scan.justKept);
  const found = useAppSelector((state) => state.scan.found);
  const dismissals = useAppSelector((state) => state.scan.dismissals);
  /**
   * Whether the camera is the screen being looked at.
   *
   * The feed stays mounted under the review sheet, the search and the manual form, and a
   * sleeve lying face-down on the counter would otherwise raise a card behind them.
   */
  const focused = useIsFocused();

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [card, setCard] = useState<ScanCard | null>(null);
  const [looking, setLooking] = useState(false);
  const [advising, setAdvising] = useState(false);
  /** Pressings of the matched release's album, for "1 pressing of 4" and "3 others". */
  const [siblings, setSiblings] = useState<readonly Release[] | null>(null);
  const [picking, setPicking] = useState(false);
  /**
   * Whether "Add as a second copy" is asking where the copy goes.
   *
   * The camera keeps reading while a card is up, and a sleeve still in frame would replace
   * the card behind the sheet, so the question would land on a record no longer shown.
   */
  const [choosingCopy, setChoosingCopy] = useState(false);
  /** The card the next sleeve replaced, while its "Skipped · Undo" is still in the feed. */
  const [skipped, setSkipped] = useState<ShelvedCard | null>(null);

  /** Barcodes read recently, so one sleeve in frame is one question. */
  const recent = useRef(new Map<string, number>());
  /**
   * What is on screen, readable from a lookup that started before it was.
   *
   * A read is resolved over the network, and the card it will replace may have been
   * answered in the meantime — so what gets replaced is decided when the answer lands,
   * not when the question was asked.
   */
  const shown = useRef<ShelvedCard | null>(null);
  shown.current = card === null ? null : { card, siblings };
  /** Which lookup the card belongs to, so a slow answer for an old card lands nowhere. */
  const turn = useRef(0);
  /** The card the last keep answered, so its Undo reopens the question rather than losing it. */
  const lastKept = useRef<(ShelvedCard & { readonly key: string }) | null>(null);

  /**
   * The advice timer, restarted whenever the scanner starts looking again.
   *
   * Keyed on whether a card is open rather than on every render: while the card is up the
   * camera is not being pointed at anything, and counting that as a failed scan would
   * greet every dismissal with advice about the light.
   */
  useEffect(() => {
    if (card !== null) {
      setAdvising(false);
      return;
    }
    setAdvising(false);
    const timer = setTimeout(() => setAdvising(true), ADVICE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [card]);

  useEffect(() => {
    if (skipped === null) return;
    const timer = setTimeout(() => setSkipped(null), SKIPPED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [skipped]);

  const dismiss = useCallback(() => {
    setCard(null);
    setSiblings(null);
    setPicking(false);
    setChoosingCopy(false);
  }, []);

  /**
   * The note under the tray, and the card behind a keep made somewhere else.
   *
   * The manual form and the copy opened from a duplicate both file into the tray from
   * their own screens. Either one is an answer to whatever card was open when they were
   * reached, so the card goes — coming back to a question already answered would read as
   * the keep having failed.
   */
  useEffect(() => {
    if (justKeptKey === null) return;
    if (lastKept.current?.key !== justKeptKey) dismiss();
    const timer = setTimeout(() => dispatch(scanActions.noteExpired()), KEPT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [justKeptKey, dismiss, dispatch]);

  /** "Back to camera" on the copy a duplicate opened: the question was answered with no. */
  const seenDismissals = useRef(dismissals);
  useEffect(() => {
    if (dismissals === seenDismissals.current) return;
    seenDismissals.current = dismissals;
    dismiss();
  }, [dismissals, dismiss]);

  /**
   * An album picked in the title search, raised as the card a scan would have raised.
   *
   * No duplicate check here: the pressings are every edition of the album, and owning one
   * of them says nothing about the one in hand until a pressing has been picked.
   */
  useEffect(() => {
    if (found === null) return;
    dispatch(scanActions.foundRaised());
    const picked = pickPressing(found.pressings, null) ?? found.pressings[0];
    if (picked === undefined) return;
    turn.current += 1;
    setSiblings(null);
    setPicking(false);
    setCard({
      kind: found.pressings.length > 1 ? "PRESSINGS" : "MATCH",
      barcode: found.barcode,
      candidates: found.pressings,
      picked,
      format: picked.format === "OTHER" ? null : picked.format,
      owned: null,
      source: "TITLE",
    });
  }, [found, dispatch]);

  const resolve = useCallback(
    async (barcode: string) => {
      setLooking(true);
      const mine = ++turn.current;
      /**
       * Puts the answer on screen, over whatever is there by now.
       *
       * A card still open at this point was not answered, and the sleeve now in frame is
       * the answer to why: it was skipped. Said in the feed with an Undo, because pointing
       * the phone at the next record is not always a decision about the last one.
       */
      const show = (next: ScanCard) => {
        if (mine !== turn.current) return;
        if (shown.current !== null) setSkipped(shown.current);
        setSiblings(null);
        setPicking(false);
        setCard(next);
      };
      try {
        const candidates = await lookupByBarcode(barcode);
        if (candidates.length === 0) {
          show({
            kind: "MISSING",
            barcode,
            candidates,
            picked: null,
            format: null,
            owned: null,
            source: "BARCODE",
          });
          return;
        }

        // The catalogue may hold the same barcode for four reissues. Which one the person
        // means is a question only they can answer, so several is its own card — but the
        // one it proposes is the one an offline scan would settle on, so the two paths
        // cannot name different pressings for the same read.
        const picked = pickPressing(candidates, null) ?? candidates[0];
        const owned = await ownedCopy(store, candidates);
        show({
          kind: owned !== null ? "DUPLICATE" : candidates.length > 1 ? "PRESSINGS" : "MATCH",
          barcode,
          candidates,
          picked,
          format: picked.format === "OTHER" ? null : picked.format,
          owned,
          source: "BARCODE",
        });
        void warmSiblings(picked, (pressings) => {
          if (mine === turn.current) setSiblings(pressings);
        });
      } catch {
        // Not an error to report: the camera worked, nobody could be asked. The scan keeps
        // its digits and names itself when a connection returns.
        show({
          kind: "OFFLINE",
          barcode,
          candidates: [],
          picked: null,
          format: null,
          owned: null,
          source: "BARCODE",
        });
      } finally {
        setLooking(false);
      }
    },
    [store],
  );

  const handleScan = useCallback(
    (raw: string) => {
      if (!focused || choosingCopy) return;
      const barcode = raw.trim();
      if (!isBarcode(barcode)) return;
      if (looking) return;

      const now = Date.now();
      // The sleeve the card is about, still in frame. Not a new question — and its clock
      // is kept running, so answering the card does not re-raise it a moment later from
      // a read that never stopped.
      if (card !== null && card.barcode === barcode) {
        recent.current.set(barcode, now);
        return;
      }
      const last = recent.current.get(barcode);
      if (last !== undefined && now - last < SAME_CODE_COOLDOWN_MS) return;
      recent.current.set(barcode, now);

      // A different sleeve while a card is up is the other way to skip: the card it
      // raises replaces the open one.
      void resolve(barcode);
    },
    [focused, choosingCopy, card, looking, resolve],
  );

  const keep = useCallback(
    (destination: ScanDestination) => {
      if (card === null) return;
      const scan: KeptScan = {
        key: Crypto.randomUUID(),
        barcode: card.barcode,
        release: card.picked,
        format: card.format,
        destination,
        secondCopy: card.kind === "DUPLICATE",
        keptAt: Date.now(),
      };
      lastKept.current = { key: scan.key, card, siblings };
      recent.current.set(card.barcode, Date.now());
      dispatch(scanActions.kept(scan));
      dismiss();
    },
    [card, siblings, dispatch, dismiss],
  );

  /** Puts a card back as it was, pressings and all. */
  const reopen = useCallback((shelved: ShelvedCard) => {
    turn.current += 1;
    setPicking(false);
    setCard(shelved.card);
    setSiblings(shelved.siblings);
  }, []);

  return {
    permission,
    requestPermission,
    torch,
    toggleTorch: useCallback(() => setTorch((on) => !on), []),
    /** True once the viewfinder has been pointed at something for a while with no read. */
    advising: advising && card === null,
    looking,
    card,
    handleScan,
    dismiss,
    keep,
    /** The scan the note under the tray is about, or null once it has said its piece. */
    justKept: kept.find((scan) => scan.key === justKeptKey) ?? null,
    /**
     * Takes the last keep back, and reopens the card it answered.
     *
     * A mis-tap is usually the right record sent to the wrong list, so Undo returns to
     * the question rather than only emptying the row. A keep made on another screen has
     * no card to return to and is simply dropped.
     */
    undoKeep: useCallback(() => {
      if (justKeptKey === null) return;
      dispatch(scanActions.dropped(justKeptKey));
      const answered = lastKept.current;
      if (answered !== null && answered.key === justKeptKey && shown.current === null) {
        reopen(answered);
      }
      lastKept.current = null;
    }, [justKeptKey, dispatch, reopen]),
    /** The card the next sleeve replaced, while its note is still in the feed. */
    skipped: skipped?.card ?? null,
    undoSkip: useCallback(() => {
      if (skipped === null) return;
      // The sleeve that replaced it may still be in frame; without this it would take
      // the card straight back.
      if (shown.current !== null) recent.current.set(shown.current.card.barcode, Date.now());
      reopen(skipped);
      setSkipped(null);
    }, [skipped, reopen]),
    /** The pressing picker, on both the several-pressings card and the "3 others" line. */
    picking,
    openPicker: useCallback(() => setPicking(true), []),
    closePicker: useCallback(() => setPicking(false), []),
    choosingCopy,
    askWhereCopyGoes: useCallback(() => setChoosingCopy(true), []),
    closeCopyChoice: useCallback(() => setChoosingCopy(false), []),
    /**
     * What the picker offers: the pressings that share the barcode when several do,
     * otherwise every pressing of the album the match belongs to.
     */
    pressings: card === null ? [] : card.candidates.length > 1 ? card.candidates : (siblings ?? []),
    /** How many pressings the album has in total, or null while nobody knows yet. */
    pressingCount:
      card === null
        ? null
        : card.candidates.length > 1
          ? card.candidates.length
          : (siblings?.length ?? null),
    pick: useCallback((release: Release) => {
      setCard((open) =>
        open === null
          ? null
          : {
              ...open,
              picked: release,
              format: release.format === "OTHER" ? open.format : release.format,
            },
      );
      setPicking(false);
    }, []),
    setFormat: useCallback((format: Format) => {
      setCard((open) => (open === null ? null : { ...open, format }));
    }, []),
    kept,
    openReview: useCallback(() => router.push("/scan/review"), [router]),
    /**
     * Manual entry, carrying whatever the scanner did read. The digits are the one thing
     * the failed lookup genuinely established, and throwing them away would ask the person
     * to read them off the sleeve themselves.
     *
     * Opened in scan context: the form ends in the same Wishlist and Shelf as every card
     * and the record joins the tray, so typing one in does not end the session.
     */
    enterManually: useCallback(
      (barcode?: string) =>
        router.push(barcode === undefined ? "/manual?scan=1" : `/manual?scan=1&barcode=${barcode}`),
      [router],
    ),
    /** The not-found card's second way out: a title search that keeps the tray. */
    searchByTitle: useCallback(
      (barcode: string) => router.push(`/scan/search?barcode=${barcode}`),
      [router],
    ),
    /**
     * The duplicate card's second button: the copy they already have.
     *
     * The card stays open underneath. Looking at the grade is how the question gets
     * answered, not a way of abandoning it, and the copy's own bar answers it from there.
     */
    openOwned: useCallback(
      (copyId: string, barcode: string) => router.push(`/copies/${copyId}?scanned=${barcode}`),
      [router],
    ),
    close: useCallback(() => {
      if (kept.length === 0) dispatch(scanActions.cleared());
      void queryClient.invalidateQueries({ queryKey: ["copies"] });
      router.back();
    }, [kept.length, dispatch, queryClient, router]),
  };
}

/**
 * The copy already on the shelf for one of these pressings, if there is one.
 *
 * Matched on the release rather than the album: owning the CD is not owning the LP, and
 * telling somebody holding a different pressing that they already have it is how a
 * collection ends up missing the record they were standing in the shop with.
 */
async function ownedCopy(
  store: { listCopies: () => Promise<Copy[]> },
  candidates: readonly Release[],
): Promise<Copy | null> {
  const ids = new Set(candidates.map((release) => release.id));
  const copies = await store.listCopies();
  return copies.find((copy) => copy.releaseId !== null && ids.has(copy.releaseId)) ?? null;
}

/**
 * The other pressings of the matched album, fetched behind the card.
 *
 * Nobody waits for it: the card is already answerable without it, and all it adds is the
 * count in the header and what the "others" line opens. Failing is a non-event — the line
 * simply does not appear.
 */
async function warmSiblings(
  picked: Release,
  onLoaded: (releases: readonly Release[]) => void,
): Promise<void> {
  try {
    const pressings = await lookupPressings(picked.albumId);
    if (pressings.length > 0) onLoaded(pressings);
  } catch {
    // No count, no others line. The card stands on its own.
  }
}

/** What a kept scan is called in the tray, whether or not it has a name yet. */
export function scanFormat(scan: KeptScan): Format {
  return copyFormat({ manualFormat: scan.format }, scan.release ?? undefined);
}
