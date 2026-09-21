import { API_BASE } from "@/api/config";
import type {
  Album,
  Artist,
  CoverTheme,
  Format,
  LocalStore,
  Release,
} from "@janne6565/rekordo-shared";
import { FORMATS, readArchivedAlbumCovers, withArchivedCovers } from "@janne6565/rekordo-shared";
import { PixelRatio } from "react-native";
/**
 * Thin client over the metadata proxy.
 *
 * Mirrors the boundary in rekordo-frontend/src/api/releases.ts: the server types
 * every field optional, so payloads are validated here and unusable rows dropped rather
 * than letting the optionality leak into the screens.
 */

interface ReleasePayload {
  id?: string;
  albumId?: string;
  title?: string;
  artistName?: string;
  year?: number;
  format?: string;
  label?: string;
  catalogNumber?: string;
  country?: string;
  barcode?: string;
  releaseDate?: string;
  trackCount?: number;
  discCount?: number;
  coverArtUrl?: string;
  coverTheme?: {
    dominantColor?: string;
    accentColor?: string;
    lightness?: number;
    dark?: boolean;
  };
}

function toCoverTheme(payload: ReleasePayload["coverTheme"]): CoverTheme | null {
  if (
    payload?.dominantColor === undefined ||
    payload.accentColor === undefined ||
    payload.lightness === undefined ||
    payload.dark === undefined
  ) {
    return null;
  }
  return {
    dominantColor: payload.dominantColor,
    accentColor: payload.accentColor,
    lightness: payload.lightness,
    dark: payload.dark,
  };
}

export function toRelease(payload: ReleasePayload, now: number): Release | null {
  if (
    payload.id === undefined ||
    payload.albumId === undefined ||
    payload.title === undefined ||
    payload.artistName === undefined
  ) {
    return null;
  }
  return {
    id: payload.id,
    albumId: payload.albumId,
    title: payload.title,
    artistName: payload.artistName,
    year: payload.year ?? null,
    format: (FORMATS as readonly string[]).includes(payload.format ?? "")
      ? (payload.format as Format)
      : "OTHER",
    label: payload.label ?? null,
    catalogNumber: payload.catalogNumber ?? null,
    country: payload.country ?? null,
    barcode: payload.barcode ?? null,
    releaseDate: payload.releaseDate ?? null,
    trackCount: payload.trackCount ?? null,
    discCount: payload.discCount ?? null,
    coverArtUrl: payload.coverArtUrl ?? null,
    coverTheme: toCoverTheme(payload.coverTheme),
    cachedAt: now,
  };
}

export function releaseDisambiguation(release: Release): string {
  return [release.label, release.catalogNumber, release.country]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" · ");
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} from ${path}`);
  }
  return (await response.json()) as T;
}

export async function searchReleases(query: string, limit = 25): Promise<Release[]> {
  const payloads = await getJson<ReleasePayload[]>(
    `/api/v1/metadata/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  const now = Date.now();
  return payloads.map((p) => toRelease(p, now)).filter((r): r is Release => r !== null);
}

export async function lookupByBarcode(barcode: string): Promise<Release[]> {
  const payloads = await getJson<ReleasePayload[]>(`/api/v1/metadata/barcode/${barcode}`);
  const now = Date.now();
  return payloads.map((p) => toRelease(p, now)).filter((r): r is Release => r !== null);
}

export async function lookupRelease(mbid: string): Promise<Release | null> {
  return toRelease(await getJson<ReleasePayload>(`/api/v1/metadata/releases/${mbid}`), Date.now());
}

interface ArtistPayload {
  mbid?: string;
  name?: string;
  disambiguation?: string;
  type?: string;
  country?: string;
  beganIn?: string;
  endedIn?: string;
  score?: number;
}

interface AlbumPayload {
  albumId?: string;
  title?: string;
  artistName?: string;
  year?: number;
  primaryType?: string;
  coverArtUrl?: string;
  /** Apple's resizable artwork, carrying literal {w}x{h} placeholders. */
  coverArtTemplate?: string | null;
}

function toArtist(payload: ArtistPayload): Artist | null {
  // Without these two there is nothing to show and nothing to open a discography with.
  if (payload.mbid === undefined || payload.name === undefined) return null;
  return {
    mbid: payload.mbid,
    name: payload.name,
    disambiguation: payload.disambiguation ?? "",
    type: payload.type ?? null,
    country: payload.country ?? null,
    beganIn: payload.beganIn ?? null,
    endedIn: payload.endedIn ?? null,
    score: payload.score ?? null,
  };
}

function toAlbum(payload: AlbumPayload): Album | null {
  if (payload.albumId === undefined || payload.title === undefined) return null;
  return {
    albumId: payload.albumId,
    title: payload.title,
    artistName: payload.artistName ?? "",
    year: payload.year ?? null,
    primaryType: payload.primaryType ?? null,
    coverArtUrl: payload.coverArtUrl ?? null,
    coverArtTemplate: payload.coverArtTemplate ?? null,
  };
}

/**
 * Records matching a query, one row per record rather than per pressing.
 *
 * What the add sheet lists. /search answers with pressings, and a record with ten of them
 * fills the sheet ten times over with rows nobody can tell apart until they have already
 * chosen one.
 *
 * The rows arrive flat and in relevance order; `albumResults` in shared is what turns them
 * into the two blocks the screen draws, so the phone and the web fold them identically.
 */
export async function searchAlbums(query: string, limit = 25): Promise<Album[]> {
  const payloads = await getJson<AlbumPayload[]>(
    `/api/v1/metadata/albums/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return payloads.map(toAlbum).filter((album): album is Album => album !== null);
}

/**
 * One album cover at the size it is actually drawn.
 *
 * Apple serves a single artwork asset at any dimension through a {w}x{h} placeholder, so a
 * row asks for the 112px it draws instead of pulling 600 and scaling it on the phone. A
 * Discogs answer has no template and one fixed image, returned as it is; null means neither
 * and the caller keeps its placeholder.
 *
 * Multiplied by the screen's pixel ratio, because a 112pt row on a 3x phone needs 336 real
 * pixels and asking for 112 renders it soft.
 */
export function albumCoverUrl(album: Album, points: number): string | null {
  const template = album.coverArtTemplate;
  if (template == null || template === "") return album.coverArtUrl;
  const size = String(Math.round(points * PixelRatio.get()));
  return template.replace("{w}", size).replace("{h}", size);
}

export async function findArtists(query: string, limit = 5): Promise<Artist[]> {
  const payloads = await getJson<ArtistPayload[]>(
    `/api/v1/metadata/artists?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return payloads.map(toArtist).filter((artist): artist is Artist => artist !== null);
}

/**
 * One artist's portrait, or null when they have none.
 *
 * Null is a real answer here rather than a failure — plenty of artists have no picture in
 * Discogs at all — so the caller draws the initial and does not retry.
 */
export async function findArtistImage(mbid: string): Promise<string | null> {
  const payload = await getJson<{ imageUrl?: string | null }>(
    `/api/v1/metadata/artists/${mbid}/image`,
  );
  return payload.imageUrl ?? null;
}

export interface Discography {
  readonly albums: Album[];
  /**
   * How many the query matched upstream, not how many arrived. A chip reading "Albums 51"
   * is telling the truth on a page of 25.
   */
  readonly total: number;
}

export async function lookupDiscography(
  artistMbid: string,
  primaryType: string | null,
  limit = 25,
): Promise<Discography> {
  const type = primaryType === null ? "" : `type=${encodeURIComponent(primaryType)}&`;
  const payload = await getJson<{ albums?: AlbumPayload[]; total?: number }>(
    `/api/v1/metadata/artists/${artistMbid}/albums?${type}limit=${limit}`,
  );
  return {
    albums: (payload.albums ?? []).map(toAlbum).filter((album): album is Album => album !== null),
    total: payload.total ?? 0,
  };
}

/** Every pressing of one album. Bitches Brew has 47, so this is paged, not exhaustive. */
export async function lookupPressings(albumId: string, limit = 25): Promise<Release[]> {
  const payloads = await getJson<ReleasePayload[]>(
    `/api/v1/metadata/albums/${encodeURIComponent(albumId)}/releases?limit=${limit}`,
  );
  const now = Date.now();
  return payloads.map((p) => toRelease(p, now)).filter((r): r is Release => r !== null);
}

interface AlbumCoverPayload {
  albumId?: string;
  coverArtUrl?: string;
}

/** The server caps one request at a hundred ids, so a long wishlist asks in pages. */
const COVER_BATCH = 100;

/**
 * The artwork for a set of albums, keyed by the id it was asked for.
 *
 * A wishlist entry names an album rather than a pressing, so it carries no cover of its
 * own and the server resolves one from the pressings it has mirrored. Ids it cannot answer
 * for — hand-entered `local:` albums among them — are simply absent from the map, which is
 * the same thing as a null cover to every caller: `ReleaseArt` draws the format silhouette.
 *
 * Mirrors `lookupAlbumCovers` in rekordo-frontend/src/api/releases.ts.
 */
export async function lookupAlbumCovers(
  albumIds: readonly string[],
  store?: LocalStore,
): Promise<ReadonlyMap<string, string | null>> {
  const covers = new Map<string, string | null>();
  for (let start = 0; start < albumIds.length; start += COVER_BATCH) {
    const query = albumIds
      .slice(start, start + COVER_BATCH)
      .map((albumId) => `albumId=${encodeURIComponent(albumId)}`)
      .join("&");
    for (const payload of await getJson<AlbumCoverPayload[]>(
      `/api/v1/metadata/albums/covers?${query}`,
    )) {
      if (payload.albumId !== undefined) covers.set(payload.albumId, payload.coverArtUrl ?? null);
    }
  }
  // An imported archive brought the answers the deployment it came from could give. This
  // mirror may never have heard of those albums — that is a fact about which server is
  // being asked, not about the record — so the archive fills what comes back null.
  if (store === undefined) return covers;
  return withArchivedCovers(covers, await readArchivedAlbumCovers(store));
}

/**
 * The artwork of the pressings entries were made from, keyed by release id.
 *
 * The covers endpoint answers about *albums*, and an album cannot say which of its
 * pressings somebody picked — it resolves one itself, by a rule that has nothing to do
 * with what was on screen. A wish that named a pressing asks about that pressing instead,
 * and only falls back to the album's answer when the mirror has nothing to say.
 *
 * Mirrors `lookupPressingCovers` in rekordo-frontend/src/api/releases.ts.
 */
export async function lookupPressingCovers(
  releaseIds: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const releases = await lookupReleases(releaseIds);
  return new Map(releases.map((release) => [release.id, release.coverArtUrl]));
}

/** The same hundred-id cap as the covers endpoint, so a large collection asks in pages. */
const RELEASE_BATCH = 100;

/**
 * The releases behind a set of ids, straight from the mirror.
 *
 * What the phone asks for after signing in: sync hands it copies that *name* releases,
 * never the releases themselves, so without this every record pulled onto a second device
 * is an untitled placeholder. Ids the mirror cannot answer for — hand-entered `local:`
 * releases among them — are simply absent, and the caller keeps whatever it had.
 *
 * Mirrors `lookupReleases` in rekordo-frontend/src/api/releases.ts.
 */
export async function lookupReleases(releaseIds: readonly string[]): Promise<Release[]> {
  const now = Date.now();
  const releases: Release[] = [];
  for (let start = 0; start < releaseIds.length; start += RELEASE_BATCH) {
    const query = releaseIds
      .slice(start, start + RELEASE_BATCH)
      .map((releaseId) => `releaseId=${encodeURIComponent(releaseId)}`)
      .join("&");
    for (const payload of await getJson<ReleasePayload[]>(`/api/v1/metadata/releases?${query}`)) {
      const release = toRelease(payload, now);
      if (release !== null) releases.push(release);
    }
  }
  return releases;
}
