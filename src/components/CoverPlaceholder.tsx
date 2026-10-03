import { isDark } from "@/theme/colors";
import { LinearGradient } from "expo-linear-gradient";
import { Disc3 } from "lucide-react-native";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";

/**
 * What stands where a record's cover would be when there is no picture of it.
 *
 * One placeholder in every size it is needed: the item detail's hero, where it occupies
 * exactly the frame a cover would — full bleed, square, cropping under the header as you
 * scroll like any sleeve does — and the cover panel of a `FormatThumb`, which is the
 * shelf grid, a friend's grid and every row that draws a record small. The header should
 * not change shape depending on whether the archive happened to have artwork, and a copy
 * with no cover should look like a record you own rather than like a tile that failed to
 * load.
 *
 * The format silhouette used to stand here instead. It is the right answer in a grid tile,
 * where it is the only thing that can say what a 44px square is — but at the width of the
 * screen it was a vinyl the size of the hero, saying in a drawing what the badge directly
 * underneath already says in words, and its 6:5 composition left a band of bare ground
 * across the bottom of a square frame.
 *
 * So this is paper rather than an object: the sleeve's own stock, the light falling across
 * it, and the disc pressed into it faintly enough to read as an emboss rather than as a
 * picture of a record. Drawn rather than shipped as a file, like every other mark in the
 * app, so it is sharp at any size and carries no bytes.
 */
export function CoverPlaceholder() {
  // The mark is a proportion of the frame, and a lucide icon takes a number. Measured
  // rather than guessed, because this same placeholder is drawn at a wishlist entry's
  // tile size and at the full width of a phone.
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={[StyleSheet.absoluteFill, styles.paper]} onLayout={onLayout}>
      {/*
       * Light across the sleeve, top-left to bottom-right. Flat beige is what a broken
       * image looks like; a sheet of paper catching light is what an empty sleeve looks
       * like, and the difference is one gradient.
       */}
      <LinearGradient
        colors={LIGHT_FALL}
        locations={[0, 0.58, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {width >= MIN_MARK_WIDTH && (
        <View style={styles.centre}>
          <Disc3 size={width * MARK_SCALE} color={MARK_INK} strokeWidth={0.7} />
        </View>
      )}
    </View>
  );
}

/**
 * The light across the sleeve. In dark mode (deck 3b) the sheet is lifted two steps above
 * the canvas, so a white highlight would read as a glare: the fall is kept, much fainter.
 */
const LIGHT_FALL = isDark
  ? (["rgba(244,241,236,0.06)", "rgba(244,241,236,0.015)", "rgba(0,0,0,0.12)"] as const)
  : (["rgba(255,255,255,0.55)", "rgba(255,255,255,0.06)", "rgba(25,23,19,0.06)"] as const);

/** How much of the frame the embossed disc takes across. */
const MARK_SCALE = 0.32;

/**
 * Below this the mark is left off and the sleeve is paper alone.
 *
 * At the 40px panel of a conflict row the emboss is four grey pixels arguing with the
 * silhouette leaning out beside it. Paper on its own still reads as an empty sleeve there,
 * and the format mark is doing the talking at that size anyway.
 */
const MIN_MARK_WIDTH = 52;

/**
 * Faint on purpose.
 *
 * Anything darker reads as an icon — a symbol placed on the sleeve — rather than as the
 * paper's own surface, and an icon at this size competes with the title underneath for
 * being the thing the screen is about.
 */
const MARK_INK = isDark ? "rgba(244,241,236,0.1)" : "rgba(25,23,19,0.13)";

/**
 * The sleeve stock. Dark (deck 3b) stripes #25231f and #2b2824; flattened to their mean,
 * as the light paper is, because React Native has no repeating gradient.
 */
const SLEEVE = isDark ? "#282521" : "#e7e2d9";

const styles = StyleSheet.create({
  /** The sleeve stock `FormatThumb` prints its cover panel on, so the two agree. */
  paper: { backgroundColor: SLEEVE, overflow: "hidden" },
  centre: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
});
