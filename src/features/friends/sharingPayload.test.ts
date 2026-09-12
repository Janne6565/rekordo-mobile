import { describe, expect, it } from "bun:test";
import { sharingPayload } from "@/features/friends/sharingPayload";

describe("sharingPayload", () => {
  it("sends every switch, so flipping one does not reset another", () => {
    expect(
      sharingPayload({
        handle: "janne",
        collectionVisibility: "PUBLIC",
        wishlistVisibility: "FRIENDS",
        pricesPublic: true,
        ratingsShared: true,
        findable: false,
      }),
    ).toEqual({
      collectionVisibility: "PUBLIC",
      wishlistVisibility: "FRIENDS",
      pricesPublic: true,
      ratingsShared: true,
      findable: false,
    });
  });

  it("carries the ratings switch through when it is the one that changed", () => {
    const current = { collectionVisibility: "FRIENDS", ratingsShared: false } as const;

    expect(sharingPayload({ ...current, ratingsShared: true }).ratingsShared).toBe(true);
    expect(sharingPayload({ ...current, ratingsShared: false }).ratingsShared).toBe(false);
  });

  /**
   * A settings object that has not been read yet must not be sent as "share everything" --
   * but it must not quietly close something either. Each fallback is the server's own
   * default, which is cautious for the lists and the prices and open for the ratings.
   */
  it("falls back to the server's own defaults for anything it did not say", () => {
    expect(sharingPayload({})).toEqual({
      collectionVisibility: "FRIENDS",
      wishlistVisibility: "FRIENDS",
      pricesPublic: false,
      ratingsShared: true,
      findable: true,
    });
  });
});
