import { describe, expect, it } from "bun:test";
import { fromCsv, parseCsv, toCsv, wishlistToCsv } from "@/domain/csv";
import type { Copy, Release, WishlistItem } from "@janne6565/rekordo-shared";
const release: Release = {
  id: "r1",
  albumId: "rg1",
  title: 'Bitches Brew, "complete"',
  artistName: "Miles Davis",
  year: 1970,
  format: "VINYL",
  label: "Columbia",
  catalogNumber: "GP 26",
  country: "US",
  barcode: null,
  releaseDate: null,
  trackCount: null,
  discCount: null,
  coverArtUrl: null,
  coverTheme: null,
  cachedAt: 0,
};

const copy: Copy = {
  id: "c1",
  releaseId: "r1",
  albumId: "alb-1",
  pendingBarcode: null,
  manualTitle: null,
  manualArtist: null,
  manualYear: null,
  manualLabel: null,
  manualCatalogNumber: null,
  manualFormat: null,
  condition: "VG_PLUS",
  sleeveCondition: "NM",
  catalogArt: "AUTO",
  pricePaidCents: 3400,
  currency: "EUR",
  purchasedOn: "2026-08-12",
  purchasedAt: "Rush Hour, Amsterdam",
  notes: "Gatefold, faint ring wear.\nPlays clean after a wash.",
  notesConflict: null,
  rating: 4,
  hidden: false,
  sortIndex: null,
  createdAt: 1,
  deletedAt: null,
  fieldClocks: {} as Copy["fieldClocks"],
};

describe("csv", () => {
  it("survives commas, quotes and newlines in a round trip", () => {
    const text = toCsv([copy], new Map([[release.id, release]]));
    const { rows, skipped } = fromCsv(text);

    expect(skipped).toBe(0);
    expect(rows).toEqual([
      {
        releaseId: "r1",
        albumId: "alb-1",
        // Carried through even for a catalogued row: which columns describe the pressing
        // does not depend on where the pressing came from.
        title: 'Bitches Brew, "complete"',
        artist: "Miles Davis",
        year: 1970,
        format: "VINYL",
        label: "Columbia",
        catalogNumber: "GP 26",
        mediaCondition: "VG_PLUS",
        sleeveCondition: "NM",
        pricePaidCents: 3400,
        currency: "EUR",
        purchasedOn: "2026-08-12",
        purchasedAt: "Rush Hour, Amsterdam",
        rating: 4,
        notes: "Gatefold, faint ring wear.\nPlays clean after a wash.",
      },
    ]);
  });

  it("keeps a hand-entered pressing readable, so an export of it can come back", () => {
    // A `local:` row has no archive entry to look up on re-import — these columns are the
    // only record of what the record is.
    const { rows } = fromCsv(
      "releaseId,title,artist,year,format,label,catalogNumber\n" +
        "local:c9,Untitled live tape,Sun Ra Arkestra,1978,CASSETTE,Saturn,ES 9956\n",
    );

    expect(rows[0]).toMatchObject({
      releaseId: "local:c9",
      title: "Untitled live tape",
      artist: "Sun Ra Arkestra",
      year: 1978,
      format: "CASSETTE",
      label: "Saturn",
      catalogNumber: "ES 9956",
    });
  });

  it("locates columns by name, not position", () => {
    const { rows } = fromCsv("notes,releaseId\nA note,r9\n");
    expect(rows[0]?.releaseId).toBe("r9");
    expect(rows[0]?.notes).toBe("A note");
  });

  it("skips a row with no release to attach the copy to", () => {
    const { rows, skipped } = fromCsv("releaseId,notes\n,orphan\nr1,kept\n");
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("accepts the shorthand grades people actually type", () => {
    const { rows } = fromCsv("releaseId,mediaCondition\nr1,vg+\n");
    expect(rows[0]?.mediaCondition).toBe("VG_PLUS");
  });

  it("ignores a trailing newline rather than reading it as a row", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

function wish(over: Partial<WishlistItem>): WishlistItem {
  return {
    id: "w1",
    albumId: "rg1",
    releaseId: null,
    pendingBarcode: null,
    title: "Ege Bamyasi",
    artistName: "Can",
    year: 1972,
    desiredFormat: "VINYL",
    note: null,
    sortIndex: null,
    createdAt: Date.UTC(2026, 7, 20),
    deletedAt: null,
    fieldClocks: {} as WishlistItem["fieldClocks"],
    ...over,
  };
}

describe("wishlist csv", () => {
  it("writes one row per entry, with the columns a person reads", () => {
    const text = wishlistToCsv([wish({})]);

    expect(text).toBe(
      "albumId,title,artist,year,desiredFormat,note,addedAt\r\n" +
        "rg1,Ege Bamyasi,Can,1972,VINYL,,2026-08-20T00:00:00.000Z\r\n",
    );
  });

  it("says ANY rather than leaving the format blank", () => {
    // A wish with no format named is an answer, not a gap: an empty cell would read as one
    // nobody filled in.
    expect(wishlistToCsv([wish({ desiredFormat: null })])).toContain(",ANY,");
  });

  it("quotes a note that carries commas and newlines", () => {
    const text = wishlistToCsv([wish({ note: 'Any press but the "red" one,\nmono if possible.' })]);

    expect(text).toContain('"Any press but the ""red"" one,\nmono if possible."');
  });

  it("exports the order the person built, once they have built one", () => {
    const text = wishlistToCsv([
      wish({ id: "w1", albumId: "a", title: "Added first", sortIndex: 2, createdAt: 1 }),
      wish({ id: "w2", albumId: "b", title: "Added second", sortIndex: 0, createdAt: 2 }),
      wish({ id: "w3", albumId: "c", title: "Added third", sortIndex: 1, createdAt: 3 }),
    ]);

    expect(
      text
        .split("\r\n")
        .slice(1, 4)
        .map((row) => row.split(",")[0]),
    ).toEqual(["b", "c", "a"]);
  });

  it("falls back to the default sort when nothing has been dragged", () => {
    // Newest first, which is what the list itself shows before a drag.
    const text = wishlistToCsv([
      wish({ id: "w1", albumId: "older", createdAt: 1 }),
      wish({ id: "w2", albumId: "newer", createdAt: 2 }),
    ]);

    expect(text.split("\r\n")[1].split(",")[0]).toBe("newer");
  });
});
