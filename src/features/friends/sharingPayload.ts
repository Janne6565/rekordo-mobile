import type { SharingSettings } from "@/api/friends";

/**
 * What the Sharing screen sends when one control changes.
 *
 * The PUT is the whole screen rather than a patch, so every field has to be named on every
 * save — a switch left out of this object is a switch that quietly resets itself the next
 * time somebody touches a different one. Its own function, and tested, because that failure
 * is entirely silent: the screen goes on drawing the answer it last read.
 *
 * The defaults are the server's own: a shelf and a wishlist open to friends, prices to
 * nobody, and ratings to whoever may already see the shelf. They have to match the server's,
 * or saving one switch quietly moves another -- which is why `ratingsShared` falls back to
 * true rather than to the cautious-looking false.
 */
export function sharingPayload(next: SharingSettings) {
  return {
    collectionVisibility: next.collectionVisibility ?? "FRIENDS",
    wishlistVisibility: next.wishlistVisibility ?? "FRIENDS",
    pricesPublic: next.pricesPublic ?? false,
    ratingsShared: next.ratingsShared ?? true,
    findable: next.findable ?? true,
  } as const;
}
