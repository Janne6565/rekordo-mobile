import type { Format, ManualRelease, Release } from "@janne6565/rekordo-shared";
import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

/** Where a kept scan is headed. Both are equal answers, which is the whole point. */
export type ScanDestination = "SHELF" | "WISHLIST";

/**
 * A record typed in by hand during the session, waiting in the tray like any other.
 *
 * The cover is the picked file rather than a stored photo: nothing is on disk until the
 * batch is written, for the same reason nothing else in the tray is.
 */
export interface ManualEntry {
  readonly fields: ManualRelease;
  readonly cover: {
    readonly uri: string;
    readonly contentType: string;
    readonly byteSize: number;
  } | null;
}

/** An album picked in the title search, with the pressings the card will offer. */
export interface FoundByTitle {
  /** The digits the scan did read, or empty when the search was opened without any. */
  readonly barcode: string;
  readonly pressings: Release[];
}

/**
 * One record kept during a scanning session, before any of it is written.
 *
 * A scan is `pending` when the phone had no way to find out what it was — the digits are
 * genuine, the name is not known yet. Everything else about the two cases is the same, so
 * they are one type with a nullable release rather than two the tray would have to branch
 * on in every row.
 *
 * A `manual` record is the third kind: no catalogue has it, so it carries what was typed
 * instead of a release, and it is never pending — there is nothing left to look up.
 */
export interface KeptScan {
  /** Local to the session; the copy's real id is generated when the batch is written. */
  readonly key: string;
  readonly barcode: string;
  readonly release: Release | null;
  /** What was typed on the manual form, for a record no catalogue could name. */
  readonly manual?: ManualEntry | null;
  /**
   * The format the person confirmed on the card, which may disagree with the catalogue —
   * a tape of a record catalogued as vinyl is an ordinary thing to hold. Null only when
   * nobody was asked, which cannot happen for a pending scan.
   */
  readonly format: Format | null;
  readonly destination: ScanDestination;
  /** They already own one of these, and said so deliberately on the duplicate card. */
  readonly secondCopy: boolean;
  readonly keptAt: number;
}

interface ScanState {
  readonly kept: KeptScan[];
  /**
   * What the last save wrote, so the saved screen can name it and Undo can take it back.
   *
   * Kept beside the tray rather than replacing it: Undo has to put the tray back exactly
   * as it was, and a tray already emptied cannot be restored from the copies, since a
   * pending scan's copy id was invented during the write.
   */
  readonly saved: { readonly copyIds: string[]; readonly wishIds: string[] } | null;
  /**
   * The key of the scan that just landed, while the camera is still saying so.
   *
   * Here rather than in the camera screen because a keep can happen a screen away — the
   * manual form and the copy opened from a duplicate both file into the tray — and the
   * note with its Undo is owed wherever the record came from.
   */
  readonly justKept: string | null;
  /**
   * What the title search found, on its way back to the camera.
   *
   * The search hands over pressings and the camera raises the card a scan would have
   * raised, so a detour through search ends in the same question as everything else.
   */
  readonly found: FoundByTitle | null;
  /**
   * How many times a card has been closed from another screen.
   *
   * The open card is the camera screen's own state, and the copy a duplicate opens answers
   * it from a sheet above. A count rather than a flag, so the camera reacts to each once.
   */
  readonly dismissals: number;
}

const initialState: ScanState = {
  kept: [],
  saved: null,
  justKept: null,
  found: null,
  dismissals: 0,
};

/**
 * The tray, in Redux rather than in the scanner's own state.
 *
 * Scanning a crate is four screens — the camera, the review sheet, the saved list, the
 * details run — and the tray is the one thing all four are about. Held in the camera
 * screen it would be lost the moment somebody opened the review sheet, which is the very
 * next thing they do.
 */
const scanSlice = createSlice({
  name: "scan",
  initialState,
  reducers: {
    kept(state, action: PayloadAction<KeptScan>) {
      state.kept.push(action.payload);
      state.justKept = action.payload.key;
    },
    dropped(state, action: PayloadAction<string>) {
      state.kept = state.kept.filter((scan) => scan.key !== action.payload);
      if (state.justKept === action.payload) state.justKept = null;
    },
    /** The note has been on screen long enough. */
    noteExpired(state) {
      state.justKept = null;
    },
    foundByTitle(state, action: PayloadAction<FoundByTitle>) {
      state.found = action.payload;
    },
    /** The open card was answered with "not now" from a screen above the camera. */
    cardDismissed(state) {
      state.dismissals += 1;
    },
    /** The camera has raised the card, so the hand-over is spent. */
    foundRaised(state) {
      state.found = null;
    },
    /** The heart chip on a review row: a mis-tap in the shop is fixed here. */
    redirected(state, action: PayloadAction<{ key: string; destination: ScanDestination }>) {
      const scan = state.kept.find((kept) => kept.key === action.payload.key);
      if (scan !== undefined) scan.destination = action.payload.destination;
    },
    reformatted(state, action: PayloadAction<{ key: string; format: Format }>) {
      const scan = state.kept.find((kept) => kept.key === action.payload.key);
      if (scan !== undefined) scan.format = action.payload.format;
    },
    /** The pressing picker, on the card and on a review row. */
    repressed(state, action: PayloadAction<{ key: string; release: Release }>) {
      const scan = state.kept.find((kept) => kept.key === action.payload.key);
      if (scan !== undefined) scan.release = action.payload.release;
    },
    saved(state, action: PayloadAction<{ copyIds: string[]; wishIds: string[] }>) {
      state.saved = action.payload;
      state.kept = [];
      state.justKept = null;
    },
    /** Undo: the records are gone again and the tray is back the way it was. */
    unsaved(state, action: PayloadAction<KeptScan[]>) {
      state.kept = action.payload;
      state.saved = null;
    },
    /** Leaving the flow for good — Done, or closing the camera with an empty tray. */
    cleared() {
      return initialState;
    },
  },
});

export const scanActions = scanSlice.actions;
export const scanReducer = scanSlice.reducer;

/** Kept before anybody could be asked what it was: digits now, a name later. */
export function isPendingScan(scan: KeptScan): boolean {
  return scan.release === null && (scan.manual ?? null) === null;
}

/** What the tray, the review sheet and the notes call a kept record, or null for digits. */
export function scanNaming(
  scan: KeptScan,
): { readonly title: string; readonly artistName: string; readonly year: number | null } | null {
  if (scan.release !== null) {
    return {
      title: scan.release.title,
      artistName: scan.release.artistName,
      year: scan.release.year,
    };
  }
  const manual = scan.manual ?? null;
  if (manual === null) return null;
  return {
    title: manual.fields.manualTitle ?? "",
    artistName: manual.fields.manualArtist ?? "",
    year: manual.fields.manualYear,
  };
}

/** How the tray counts itself: "3 shelf · 1 wishlist". */
export function countByDestination(kept: readonly KeptScan[]): {
  shelf: number;
  wishlist: number;
} {
  return {
    shelf: kept.filter((scan) => scan.destination === "SHELF").length,
    wishlist: kept.filter((scan) => scan.destination === "WISHLIST").length,
  };
}
