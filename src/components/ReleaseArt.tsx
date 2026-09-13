import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { FormatThumb } from "@/components/FormatThumb";
import { usePulse } from "@/components/Skeleton";
import type { Format } from "@janne6565/rekordo-shared";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
/**
 * Everything the art actually needs: a URL to try, and a format to fall back to.
 *
 * Structural rather than `Release`, because an album (a release group) has a cover too and
 * has no format of its own — its placeholder is the generic sleeve. Widening the prop is
 * cheaper than casting an album into a shape it is not. Mirrors `CoverSubject` in
 * rekordo-frontend/src/components/ReleaseArt.tsx.
 */
export interface CoverSubject {
  readonly coverArtUrl: string | null;
  readonly format?: Format;
}

/**
 * The layout properties both a View and an Image accept. Typing the prop as `ViewStyle`
 * does not compile against `Image`, whose `overflow` is narrower — and the callers only
 * ever pass box geometry anyway.
 */
type ArtStyle = Pick<ViewStyle, "width" | "height" | "borderRadius" | "aspectRatio">;

/**
 * A release's cover.
 *
 * The format thumbnail underneath is not decoration, and it is not only a fallback. The
 * server builds the Cover Art Archive URL from the release mbid, and for a release it has
 * not probed it cannot yet know whether any bytes sit behind it — around four in ten do
 * not. So the thumbnail holds the frame in all three cases: while the cover is on its way
 * (the sleeve breathing to say so), when there turns out to be nothing behind the URL,
 * and when there was never a URL at all.
 *
 * The cover is layered into the sleeve rather than over the tile. Replacing the whole
 * composition would bury the very thing the silhouette is there to say — which format
 * this copy is — in the one view where a release appears four times, once per format.
 * `bleed` is the item detail's hero (screens 3a and 1j), which the deck draws as an
 * edge-to-edge cover with no format furniture at all.
 *
 * The loaded and failed URLs are remembered rather than booleans, so the component
 * self-corrects when it is handed a different release without needing to be re-keyed by
 * the caller — a new URL is neither loaded nor failed, which is exactly "loading".
 *
 * Mirrored from rekordo-frontend/src/components/ReleaseArt.tsx.
 */
export function ReleaseArt({
  release,
  style,
  variant = "sleeve",
  previewUri = null,
  allowCatalogArt = true,
  format,
  placeholder = "sleeve",
}: {
  readonly release: CoverSubject | undefined;
  readonly style?: ArtStyle;
  readonly variant?: "sleeve" | "bleed";
  /**
   * The copy's preview image — the first picture in its own list.
   *
   * It outranks the catalogue's artwork rather than standing in for it: the images of a
   * copy are one ordered list with the catalogue art among them, and starring a photo is
   * what puts it at the front. A preview that ranked below the archive would make that
   * gesture do nothing on the four records in ten the archive does have — which is what
   * this app did until the two clients were brought into line. Pass it through
   * `copyPreviewSrc`, which is null when the catalogue art has been starred instead.
   *
   * The catalogue cover is still the next candidate, so a preview whose file is not on
   * this device yet shows artwork rather than a placeholder.
   */
  readonly previewUri?: string | null;
  /**
   * Whether the release's own cover art may be drawn at all.
   *
   * False for a copy that has dropped it: what the archive holds for a pressing is
   * sometimes the wrong cover, and a copy that said so should fall back to its own photo
   * or the silhouette rather than keep being handed what it discarded.
   */
  readonly allowCatalogArt?: boolean;
  /**
   * The format to draw the silhouette in, when the caller knows better than the release.
   *
   * A copy may be a cassette of a pressing the archive lists as vinyl, and the tile it
   * sits in should say what is on the shelf — see `copyFormat`.
   */
  readonly format?: Format;
  /**
   * What the `bleed` hero draws when there is no picture at all.
   *
   * "sleeve" is an empty sleeve filling the frame a cover would have filled — see
   * {@link CoverPlaceholder}. "plain" is the quiet ground, for a hero whose surroundings
   * already say the format in words *and* that has no business pretending a record was
   * photographed: a shared sheet is somebody else's shelf, and an embossed sleeve there
   * would look like a picture of their copy.
   *
   * Ignored by `sleeve` the *variant*, whose whole subject is the format silhouette. The
   * two names are unrelated: in a grid tile the silhouette is the only thing that can say
   * what a 44px square is, and it stays there.
   */
  readonly placeholder?: "sleeve" | "plain";
}) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  // A set rather than one URL: with a preview there are two addresses in play, and
  // remembering only the last failure would let the first one look untried again.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const cover = allowCatalogArt ? (release?.coverArtUrl ?? null) : null;
  // Preview first, catalogue second, and whichever has already failed is skipped.
  const url =
    [previewUri, cover].find((candidate) => candidate != null && !failed.has(candidate)) ?? null;

  const gone = url === null;
  /**
   * Shown outright when this picture has been on screen before, even in another instance.
   *
   * A grid tile does not survive the shelf being reordered. `FlatList` with `numColumns`
   * builds each row's key by joining the keys of the items in it, so moving one record
   * changes which records share a row, every row key changes, and React tears the rows
   * down and builds new ones — brand-new `ReleaseArt`s with no memory of what they had
   * loaded. Every cover then introduced itself again, which is the flicker somebody sees
   * after dropping a record. Scrolling a long shelf does the same thing for the same
   * reason, and always did.
   *
   * So "have I loaded this?" cannot live in component state alone. `SEEN` is the session's
   * answer: a url in it is a picture React Native already holds, and one that is already
   * held has not arrived and must not be animated as though it had. It only ever grows by
   * one entry per distinct picture actually displayed, which is bounded by the collection.
   */
  const shown = !gone && (loadedUrl === url || SEEN.has(url));
  /**
   * Whether the subject itself has not been read yet.
   *
   * `undefined` and a null `coverArtUrl` are two different answers and were being drawn as
   * one: the second says this release has no art and the placeholder is the final picture,
   * the first says nobody has looked yet — the catalogue row has not arrived from the
   * store or from sync, and a cover may well appear a moment later. Drawn as "no art" it
   * came out as a still placeholder that then popped into a sleeve, which is the "blank
   * beige, no skeleton" this fixes.
   */
  const unresolved = release === undefined;
  /**
   * How long an unresolved row is given before its placeholder settles.
   *
   * A release row does not always arrive: the catalogue does not travel with sync, so a
   * copy on a second device can sit without one indefinitely. Breathing on `undefined`
   * alone would leave those tiles pulsing for good, promising a picture nothing is going
   * to bring — so the wait is bounded, and what is left afterwards is the still
   * placeholder, which by then is the honest answer.
   */
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    if (!unresolved) {
      setWaitedOut(false);
      return;
    }
    const timer = setTimeout(() => setWaitedOut(true), UNRESOLVED_GRACE_MS);
    return () => clearTimeout(timer);
  }, [unresolved]);
  /**
   * The cover crosses over the sleeve rather than replacing it in one frame, which is
   * what stops a grid of covers arriving as a series of snaps.
   */
  const reveal = useRef(new Animated.Value(0)).current;
  /**
   * Anything still on its way breathes — a fetched cover, a photo being read off this
   * phone, or a release whose row is not here yet. It used to be catalogue art alone, on
   * the argument that a local file is never away; a large photo decoded off disk is away
   * long enough to look broken, and a placeholder that only sometimes breathes reads as a
   * bug rather than as a distinction.
   */
  const waiting = gone ? unresolved && !waitedOut : !shown;
  const pulse = usePulse(waiting);

  /*
   * Opacity is driven from state, never from the Image's own callbacks.
   *
   * It used to be reset in `onLoadStart` and raised in `onLoad`, which made the cover
   * appear or not appear depending on whether React Native happened to have the bytes
   * cached: for an image it has already decoded it may fire `onLoadStart` without ever
   * firing `onLoad` again, and the reveal then sat at zero for good. That is exactly the
   * shape of the bug -- the same record loading one time and showing nothing the next,
   * with a placeholder underneath standing in for a picture that was in fact right there.
   *
   * Keyed on the URL, so a component handed a second release still hides the old cover
   * the instant the source swaps rather than flashing it at full opacity.
   */
  // The body does not read `url` because its whole job is to run again when `url` changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the url, see above.
  useEffect(() => {
    /*
     * A picture this component has already loaded is shown the instant it is asked for
     * again — no reset to zero, and so no second fade.
     *
     * Resetting unconditionally meant that any churn in the props replayed the arrival
     * animation on an image that had never left: a query whose key changed handed the
     * tile `null` and then the same uri back, and the cover visibly reloaded. That was a
     * real bug in the cover-photo query and is fixed there, but the rule belongs here
     * too — the reveal exists to introduce a picture, and one already on screen is not
     * being introduced.
     */
    reveal.setValue(url !== null && (url === loadedUrl || SEEN.has(url)) ? 1 : 0);
  }, [url, reveal]);

  useEffect(() => {
    if (!shown) return;
    Animated.timing(reveal, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [shown, reveal]);

  const art = gone ? null : (
    <Animated.Image
      source={{ uri: url }}
      style={[StyleSheet.absoluteFill, { opacity: reveal }]}
      onLoad={() => {
        SEEN.add(url);
        setLoadedUrl(url);
      }}
      onError={() => setFailed((seen) => new Set(seen).add(url))}
    />
  );

  if (variant === "bleed") {
    return (
      /*
       * The frame carries its own aspect ratio here. It used to take its height from the
       * silhouette underneath, which meant the hero collapsed to nothing -- image laid out
       * at zero, never even fetched -- the moment that silhouette was conditional. Anything
       * layered in this frame is absolutely positioned, so the box has to be definite on
       * its own or the whole thing quietly disappears.
       */
      <View style={[styles.frame, styles.bleed, style]}>
        {gone && !waiting && placeholder === "sleeve" ? (
          /*
           * Nothing is coming — and known to be, which is why the release has to be
           * resolved for this branch: an empty sleeve is a statement that this record has
           * no picture, and making it before the catalogue row has arrived means saying so
           * about a record whose cover is one read away.
           *
           * Full bleed and square, exactly the frame a cover would have taken, so the
           * header does not change shape depending on whether the archive had artwork.
           */
          <CoverPlaceholder />
        ) : (
          /*
           * A plain ground while the cover is on its way. The hero is edge to edge, and a
           * format silhouette at that size reads as the answer rather than as a wait --
           * so it flashes a vinyl the size of the screen and then throws it away. A quiet
           * rectangle says "not yet" without claiming anything.
           */
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.ground, { opacity: waiting ? pulse : 1 }]}
          />
        )}
        {art}
      </View>
    );
  }

  return (
    <FormatThumb
      format={format ?? release?.format ?? "OTHER"}
      style={style}
      cover={art}
      waiting={waiting}
    />
  );
}

/** See `waitedOut`. Long enough to cover a store read and a sync round, short enough that
 *  a tile which is never getting a cover stops promising one. */
const UNRESOLVED_GRACE_MS = 4000;

/**
 * Every picture this session has drawn at least once — see `shown`.
 *
 * Module scope on purpose: the whole point is to outlive the components, which a grid
 * unmounts and remounts freely. Not cleared, and not a cache of anything — it holds urls,
 * never bytes, and answers one question: has this been on screen before?
 */
const SEEN = new Set<string>();

const styles = StyleSheet.create({
  /*
   * No height of its own: it takes the silhouette's, which is square by its own aspect
   * ratio. A percentage height here resolves against a parent whose own height comes from
   * `aspectRatio`, and Yoga does not treat that as definite -- so it came out as zero.
   */
  frame: { width: "100%", overflow: "hidden" },
  /** Square, and definite, so the hero has a height with or without a silhouette in it. */
  bleed: { aspectRatio: 1 },
  ground: { backgroundColor: "#efece6" },
});
