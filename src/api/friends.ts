import { request } from "@/api/client";

/**
 * The social half of the API.
 *
 * Hand-written like the rest of this app's client — the phone has no Orval — and typed
 * against what the server actually promises. Every field is optional on the wire because
 * springdoc says so, so nothing here assumes one is present.
 */

export type Relationship =
  | "ANONYMOUS"
  | "SELF"
  | "NONE"
  | "REQUEST_SENT"
  | "REQUEST_RECEIVED"
  | "FRIENDS";

export type Visibility = "ONLY_ME" | "FRIENDS" | "PUBLIC";

export type ActivityType = "COPY_ADDED" | "WISH_ADDED" | "WISH_FULFILLED" | "FRIENDSHIP_ACCEPTED";

export interface ProfileSummary {
  id?: string;
  handle?: string;
  displayName?: string;
  /** Their picture, or absent. Never withheld the way the count is: it is public. */
  avatarUrl?: string;
  /** Absent when the shelf is closed to the viewer — the count is itself about a collection. */
  copyCount?: number;
  relationship?: Relationship;
  collectionPrivate?: boolean;
}

export interface Profile {
  id?: string;
  handle?: string;
  displayName?: string;
  /** Present even on a locked shelf: the picture is account data, not shelf data (27f). */
  avatarUrl?: string;
  relationship?: Relationship;
  /**
   * The request waiting for an answer, present only on REQUEST_RECEIVED. Accepting and
   * declining name the request, while this screen was opened by handle.
   */
  pendingRequestId?: string;
  canSeeCollection?: boolean;
  canSeeWishlist?: boolean;
  pricesVisible?: boolean;
  copyCount?: number;
  wishlistCount?: number;
  collectingSince?: string;
}

export interface FriendRequest {
  id?: string;
  from?: ProfileSummary;
  createdAt?: string;
  mutualFriends?: number;
}

export interface FriendsOverview {
  friends?: ProfileSummary[];
  incoming?: FriendRequest[];
  outgoing?: ProfileSummary[];
}

export interface ActivityEntry {
  id?: string;
  type?: ActivityType;
  actor?: { id?: string; handle?: string; displayName?: string; avatarUrl?: string };
  title?: string;
  artistName?: string;
  releaseId?: string;
  format?: string;
  year?: number;
  coverArtUrl?: string;
  occurredAt?: string;
  copyCount?: number;
  collapsedCovers?: string[];
  /**
   * True when the viewer is the one who did it, which only an accepted request can be.
   * Both people in that line read the same row and `actor` is always the *other* one, so
   * this is what picks the sentence.
   */
  byViewer?: boolean;
}

export interface SharedCopy {
  id?: string;
  releaseId?: string;
  title?: string;
  artistName?: string;
  year?: number;
  format?: string;
  coverArtUrl?: string;
  /**
   * The copy's own first photo, as an id the client turns into a content URL.
   *
   * The server resolves it with the same rule the owner's own screens use, so a starred
   * photo stands for the copy on somebody else's shelf too — and it is the only picture a
   * hand-entered copy can ever have, pointing at no catalogue as it does. Null when the
   * copy has no photos or has starred the catalogue's artwork instead.
   *
   * The web has always read this; the phone never declared it, so a shared shelf there
   * could show nothing but catalogue covers.
   */
  previewPhotoId?: string;
  /** Media grade. Friends and up; absent on a public page. */
  condition?: string;
  /** Sleeve grade — graded separately from the media since design 8d. */
  sleeveCondition?: string;
  /**
   * One to five stars, or null.
   *
   * Null both when the copy is unrated and when the owner has not turned ratings on, and
   * the server will not say which. Drawing nothing in either case is what keeps the two
   * indistinguishable, so nothing here may explain the difference to the viewer.
   */
  rating?: number | null;
  pricePaidCents?: number;
  currency?: string;
  /** When they filed it. Shown as a footnote on the detail sheet, never as a fact. */
  createdAt?: number;
}

export interface SharedWish {
  id?: string;
  /**
   * The album, and the pressing its owner picked when they picked one.
   *
   * The server has always sent both; this hand-written client simply did not declare them,
   * so a friend's wishlist had nothing to resolve a sleeve from and drew bare text. They
   * are pointers into the catalogue, not anything about the person — their own uploaded
   * pictures stay private, as they always have.
   */
  albumId?: string;
  releaseId?: string;
  title?: string;
  artistName?: string;
  year?: number;
  desiredFormat?: string;
}

export interface SharingSettings {
  handle?: string;
  findable?: boolean;
  collectionVisibility?: Visibility;
  wishlistVisibility?: Visibility;
  pricesPublic?: boolean;
  /** Whether the stars travel with the copies a viewer may already see. Off until asked. */
  ratingsShared?: boolean;
  handleChangesRemaining?: number;
}

export interface HandleAvailability {
  handle?: string;
  available?: boolean;
  reason?: "OK" | "MALFORMED" | "TAKEN" | "RESERVED";
}

export const friendsApi = {
  overview: () => request<FriendsOverview>("/api/v1/friends"),

  activity: () => request<{ entries?: ActivityEntry[] }>("/api/v1/friends/activity"),

  ask: (handle: string) =>
    request<void>("/api/v1/friends/requests", { method: "POST", body: { handle } }),

  accept: (id: string) =>
    request<void>(`/api/v1/friends/requests/${id}/accept`, { method: "POST" }),

  decline: (id: string) =>
    request<void>(`/api/v1/friends/requests/${id}/decline`, { method: "POST" }),

  unfriend: (userId: string) => request<void>(`/api/v1/friends/${userId}`, { method: "DELETE" }),

  /** Prefix search over handles. Three characters minimum, twenty results, per-IP quota. */
  search: (query: string) =>
    request<ProfileSummary[]>(`/api/v1/profiles?q=${encodeURIComponent(query)}`),

  profile: (handle: string) => request<Profile>(`/api/v1/profiles/${encodeURIComponent(handle)}`),

  collection: (handle: string) =>
    request<{ copies?: SharedCopy[]; truncated?: boolean }>(
      `/api/v1/profiles/${encodeURIComponent(handle)}/collection`,
    ),

  wishlist: (handle: string) =>
    request<{ wishes?: SharedWish[] }>(`/api/v1/profiles/${encodeURIComponent(handle)}/wishlist`),

  sharing: () => request<SharingSettings>("/api/v1/sharing"),

  /**
   * Every switch on the screen, every time. The server takes `ratingsShared` as optional so
   * that a phone from before ratings existed does not silently turn them off; this one knows
   * about it, so it always says what it means rather than leaving the field to a default.
   */
  updateSharing: (
    settings: Required<
      Pick<
        SharingSettings,
        | "collectionVisibility"
        | "wishlistVisibility"
        | "pricesPublic"
        | "ratingsShared"
        | "findable"
      >
    >,
  ) => request<SharingSettings>("/api/v1/sharing", { method: "PUT", body: settings }),

  handleAvailability: (handle: string) =>
    request<HandleAvailability>(
      `/api/v1/handles/availability?handle=${encodeURIComponent(handle)}`,
    ),

  claimHandle: (handle: string) =>
    request<SharingSettings>("/api/v1/handles", { method: "POST", body: { handle } }),
};
