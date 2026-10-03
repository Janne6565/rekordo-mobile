import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { usePulse } from "@/components/Skeleton";
import { isDark } from "@/theme/colors";
import type { Format } from "@janne6565/rekordo-shared";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";

/**
 * The format mark, ported from Format Marks.dc.html.
 *
 * One rule for all four formats: the cover stays whole and unobscured, and the thing you
 * own leans out from behind it on the right. The format is read from the shape of the
 * sliver rather than from a badge, which is what lets it work at 44px in a dense grid,
 * before any text is legible — vinyl and CD separate on value alone at that size, dark
 * against cream, and the cassette and the plug hold because their edges are straight.
 *
 * It replaced four unrelated compositions: a jewel case, a cassette lying on its case and
 * nine waveform bars, two of which were drawn *over* the artwork.
 *
 * Only the right edge of each object is ever visible — the cover ends at 83.33% and the
 * objects are laid out in the deck's full coordinates — so what this port has to get right
 * is the rim. The vinyl's label and the CD's centre hole are behind the cover and are not
 * drawn at all rather than drawn where nothing can see them. React Native has no radial or
 * conic gradients, so the two discs are layered views with a linear sheen; every other
 * part of the mark is a rectangle and is exact.
 */
export function FormatThumb({
  format,
  style,
  cover,
  waiting,
}: {
  readonly format: Format;
  readonly style?: ViewStyle;
  /**
   * The real cover, drawn into the cover panel.
   *
   * Artwork fills the cover and nothing is drawn over it. The object leans out beside it
   * instead, which is the whole point of the mark: a cover you can read, and a format you
   * can read next to it.
   */
  readonly cover?: ReactNode;
  /** Breathes the mark while the cover it will hold is still on its way. */
  readonly waiting?: boolean;
}) {
  const pulse = usePulse(waiting === true);

  return (
    /*
     * The whole mark breathes while it waits, not just the cover panel — the object beside
     * it is as much a placeholder as the paper is, and one of the two standing still while
     * the other moves reads as a bug rather than as a distinction.
     */
    <Animated.View style={[styles.root, style, { opacity: pulse }]}>
      {format === "VINYL" && <Record />}
      {format === "CD" && <Disc />}
      {format === "CASSETTE" && <Cassette />}
      {format === "DIGITAL" && <Plug />}
      {/* `OTHER` leans nothing out. It is not a format but the absence of one — the answer
          for a copy whose release this device cannot describe yet — so there is no object
          to draw. A bare cover is what "not known" actually looks like. */}
      <Cover cover={cover} waiting={waiting} />
    </Animated.View>
  );
}

/**
 * The cover panel — a square, the same in every format, and the one the artwork fills.
 *
 * The paper is a sibling of the artwork rather than the panel's own background, so the
 * cover lands on paper rather than on whatever is behind the mark. The edge is a sibling
 * too, and drawn last: a border on the clipping view paints under its children, and the
 * artwork would swallow it. The clip is a child of the shadow-caster rather than the same
 * view, because iOS draws no shadow on a view that clips its own contents.
 */
function Cover({ cover, waiting }: { readonly cover?: ReactNode; readonly waiting?: boolean }) {
  /*
   * With no artwork the panel is the same empty sleeve the item detail's hero draws, at
   * tile size — paper catching light with the disc pressed faintly into it. It used to be
   * a flat fill, which on a shelf of records nobody has photographed read as a grid of
   * blank swatches rather than as a grid of covers not yet taken.
   *
   * Not while a cover is still on its way, though. The whole mark is breathing then, and
   * an "empty sleeve" that pulses is promising a picture and denying one in the same
   * frame.
   */
  const empty = cover == null && waiting !== true;

  return (
    <View style={styles.cover}>
      <View style={styles.coverClip}>
        {empty ? (
          <CoverPlaceholder />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: PAPER }]} />
        )}
        {cover}
        <View pointerEvents="none" style={styles.coverEdge} />
      </View>
    </View>
  );
}

/** The record, leaning out on the right: dark, with the groove ring that reaches the rim. */
function Record() {
  return (
    <View style={styles.disc}>
      <View style={styles.recordGroove} />
    </View>
  );
}

/**
 * The compact disc: the same silhouette as the record, and that is the point — at 44px
 * what separates them is value, not outline.
 *
 * The deck builds its iridescence from a conic sweep with a radial sheen laid over the
 * outer 58% of the disc, and React Native has neither. Two things make the flattening
 * honest. The visible sliver is a single arc — the cover ends at 83.33%, so only the rim
 * between roughly 32° and 148° ever shows — and along that arc the sweep runs top to
 * bottom, near-white into blue, violet, salmon, yellow, green. So it becomes a vertical
 * gradient, with the stops placed where each of the deck's angles actually lands on the
 * rim rather than spaced evenly. And that whole arc lies inside the sheen band, so the
 * sheen is a flat white wash instead of a ring: same result, one view.
 *
 * The wash is what keeps this a white disc catching light rather than a coloured one. It
 * takes back 55% of the hue the sweep supplies, which is the deck's proportion.
 */
function Disc() {
  return (
    <View style={[styles.disc, styles.discCd]}>
      <LinearGradient
        colors={[
          "#f2f0ec",
          "#f2f0ec",
          "rgba(159,190,214,0.95)",
          "rgba(199,164,204,0.85)",
          "rgba(214,170,158,0.9)",
          "rgba(214,206,158,0.75)",
          "rgba(170,206,190,0.85)",
          "#f4f2ee",
        ]}
        locations={[0, 0.2, 0.365, 0.552, 0.731, 0.857, 0.95, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.discSheen}
      />
      <View pointerEvents="none" style={[styles.discSheen, styles.discWash]} />
      {/* The deck's inner white ring, which reads as the bevel of the polycarbonate. The
          dark edge is the disc's own border and paints over this one's outer half, which
          is the layering the deck's two inset rings produce. */}
      <View pointerEvents="none" style={styles.discBevel} />
    </View>
  );
}

/**
 * The shell seen end-on, which is how a cassette sits on a shelf.
 *
 * Only the strip to the right of the cover is ever visible, so every part here is placed by
 * where it lands in it. The two winds are deliberately different sizes — a played tape is
 * wound onto one hub, and equal spools are what make a cassette look like an icon of one.
 *
 * Two flattenings, both in the deck's favour. The shell's and the label's ramps are real
 * gradients, because the shell's is the whole of its roundness and the label's is the light
 * on the edge that faces you. The winds' radial gradient is not: it is a brown disc barely
 * a millimetre across at the size this is read, and a solid at its mean is indistinguishable
 * from it. The hubs keep their hard stop, which is a ring rather than a gradient anyway, and
 * so is drawn as one.
 */
function Cassette() {
  return (
    <>
      <View style={styles.shell}>
        <LinearGradient
          colors={["#211e18", "#211e18", "#2b2721", "#332e26", "#262219"]}
          locations={[0, 0.55, 0.82, 0.94, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shellFace}
        />
      </View>
      <View style={styles.label}>
        <LinearGradient
          colors={["#ddd6c8", "#ddd6c8", "#e9e3d6"]}
          locations={[0, 0.7, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.labelFace}
        />
      </View>
      <View style={styles.spine} />
      <View style={styles.window} />
      <View style={[styles.wind, styles.windTop]} />
      <View style={[styles.wind, styles.windBottom]} />
      <View style={[styles.hub, styles.hubTop]}>
        <View style={styles.hubCentre} />
      </View>
      <View style={[styles.hub, styles.hubBottom]}>
        <View style={styles.hubCentre} />
      </View>
      <View style={[styles.screw, styles.screwTop]} />
      <View style={[styles.screw, styles.screwBottom]} />
    </>
  );
}

/**
 * A USB-A plug leaning out, which is what "digital" is when you actually own a copy of it.
 *
 * It replaced a waveform, which drew a sound rather than a thing — the other three marks
 * are all objects you can hold, and a file on a stick is the honest member of that set.
 */
function Plug() {
  return (
    <>
      <View style={styles.plugBody} />
      <View style={styles.plugLed} />
      <View style={styles.plugShell} />
      <View style={[styles.plugStamp, styles.plugStampTop]} />
      <View style={[styles.plugStamp, styles.plugStampBottom]} />
      <View style={styles.plugSeam} />
    </>
  );
}

/** The deck's paper, flattened: React Native has no repeating gradient to stripe it with. */
const PAPER = isDark ? "#282521" : "#e7e2d9";

/*
 * Dark mode (deck 3b): the objects keep their own colours, but the shadows they cast go
 * deeper, since a 16% near-black shadow vanishes on a near-black ground.
 */
const SHADOW = isDark ? "#000000" : "#191713";

const styles = StyleSheet.create({
  /*
   * A square cover plus the object beside it, which is 6:5. Stated here rather than
   * assumed of the caller, so a mark handed a square box still draws its record round.
   */
  root: { width: "100%", aspectRatio: 6 / 5, position: "relative" },

  cover: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "83.333%",
    height: "100%",
    shadowColor: SHADOW,
    shadowOpacity: isDark ? 0.5 : 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 3, height: 1 },
    elevation: 3,
  },
  coverClip: { ...StyleSheet.absoluteFill, borderRadius: 2, overflow: "hidden" },
  coverEdge: {
    ...StyleSheet.absoluteFill,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDark ? "rgba(244,241,236,0.08)" : "rgba(25,23,19,0.12)",
  },

  disc: {
    position: "absolute",
    right: 0,
    top: "8%",
    width: "70%",
    height: "84%",
    borderRadius: 999,
    backgroundColor: "#2a2620",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    // In dark mode a faint light rim, so the black disc separates from the black ground.
    borderColor: isDark ? "rgba(244,241,236,0.12)" : "rgba(0,0,0,0.35)",
    /*
     * The deck's drop shadow, and on the CD it is not decoration but the whole reason the
     * disc is visible: a near-white disc leaning out over near-white paper has nothing but
     * this to separate it from the page. Which is also why nothing here clips — iOS draws
     * no shadow on a view that clips its own contents, and the sheen is round on its own.
     */
    shadowColor: SHADOW,
    shadowOpacity: isDark ? 0.55 : 0.28,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  discCd: {
    backgroundColor: "#f2f0ec",
    borderColor: "rgba(25,23,19,0.28)",
    borderWidth: 1.5,
    shadowOpacity: isDark ? 0.5 : 0.26,
  },
  /** The one groove the rim actually shows; the rest of the deck's rings are behind the cover. */
  recordGroove: {
    width: "68%",
    height: "68%",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#191713",
    backgroundColor: "#26231d",
  },
  discSheen: { ...StyleSheet.absoluteFill, borderRadius: 999 },
  /** The radial sheen, flattened: the arc that shows lies wholly inside its band. */
  discWash: { backgroundColor: "rgba(255,255,255,0.55)" },
  discBevel: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
  },

  /*
   * The shell casts the mark's drop shadow, so it carries a background of its own: iOS
   * derives a shadow from the view's own paint, and a view whose colour lives entirely in a
   * gradient child casts nothing. The gradient then covers it.
   */
  shell: {
    position: "absolute",
    right: 0,
    top: "13%",
    width: "33%",
    height: "74%",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 2,
    backgroundColor: "#211e18",
    shadowColor: SHADOW,
    shadowOpacity: isDark ? 0.55 : 0.3,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  shellFace: {
    ...StyleSheet.absoluteFill,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.42)",
  },

  label: {
    position: "absolute",
    right: "3%",
    top: "17%",
    width: "27%",
    height: "66%",
    borderTopLeftRadius: 1,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    borderBottomLeftRadius: 1,
    backgroundColor: "#ddd6c8",
  },
  labelFace: {
    ...StyleSheet.absoluteFill,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    borderBottomLeftRadius: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(25,23,19,0.22)",
  },
  /** The spine the label wraps around. */
  spine: {
    position: "absolute",
    right: "3%",
    top: "17%",
    width: "2.6%",
    height: "66%",
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: "#8b8880",
  },
  window: {
    position: "absolute",
    right: "7%",
    top: "29%",
    width: "12%",
    height: "42%",
    borderRadius: 5,
    backgroundColor: "#14120f",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(25,23,19,0.5)",
  },
  /** The tape, wound unevenly: the top spool is full, the bottom one nearly spent. */
  wind: { position: "absolute", borderRadius: 999, backgroundColor: "#352822" },
  windTop: { right: "7.5%", top: "33.4%", width: "11%", height: "13.2%" },
  windBottom: { right: "8.75%", top: "54.9%", width: "8.5%", height: "10.2%" },
  hub: {
    position: "absolute",
    right: "9.25%",
    width: "7.5%",
    height: "9%",
    borderRadius: 999,
    backgroundColor: "#e8e3d8",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(25,23,19,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  hubTop: { top: "35.5%" },
  hubBottom: { top: "55.5%" },
  /** The deck's hard stop at 32% of the radius, which is a disc rather than a gradient. */
  hubCentre: { width: "32%", height: "32%", borderRadius: 999, backgroundColor: "#14120f" },
  screw: {
    position: "absolute",
    right: "1%",
    width: "2%",
    height: "2.4%",
    borderRadius: 999,
    backgroundColor: "#0e0d0b",
  },
  screwTop: { top: "15%" },
  screwBottom: { top: "82.6%" },

  plugBody: {
    position: "absolute",
    right: "13.5%",
    top: "37%",
    width: "30%",
    height: "26%",
    borderRadius: 3,
    backgroundColor: "#2a2620",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.45)",
  },
  plugLed: {
    position: "absolute",
    right: "15.5%",
    top: "41.5%",
    width: "3.5%",
    height: "5%",
    borderRadius: 999,
    backgroundColor: "#a2573a",
  },
  plugShell: {
    position: "absolute",
    right: 0,
    top: "40.5%",
    width: "15.5%",
    height: "19%",
    borderRadius: 2,
    backgroundColor: "#c6c1b7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(25,23,19,0.4)",
  },
  plugStamp: {
    position: "absolute",
    right: "4.5%",
    width: "3.8%",
    height: "4.6%",
    backgroundColor: "#6b665e",
  },
  plugStampTop: { top: "44%" },
  plugStampBottom: { top: "51.4%" },
  plugSeam: {
    position: "absolute",
    right: "15.5%",
    top: "39.5%",
    width: "0.8%",
    height: "21%",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});
