import { starGlyphs } from "@/domain/rating";
import { colors } from "@/theme/colors";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

/**
 * One record in a grid of them — your shelf, and a friend's.
 *
 * The artwork arrives as an element rather than as data, because the two callers resolve it
 * in genuinely different ways: your own shelf has the release, the copy's own photos and
 * its catalogue-art flag to weigh up, while a friend's has one URL the server decided on.
 * Sharing the resolution would mean inventing a shape that fits neither; sharing the tile
 * shares what was actually duplicated — the geometry, the type and the truncation.
 *
 * `style` is the caller's, because the containers differ for a good reason: the shelf is a
 * FlatList that has to window thousands of rows, and a friend's is a short wrapping column
 * inside a ScrollView, where a nested list would be worse than the duplication.
 */
export function CopyTile({
  art,
  title,
  subtitle,
  rating,
  onPress,
  style,
}: {
  readonly art: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  /**
   * Screen 25a — the rating as a third line under the meta.
   *
   * Null or absent draws nothing at all, which is the rule rather than a shortcut: most
   * shelves are rated in patches, and a grid where every third tile carries five hollow
   * stars reads as a list of things you have not got round to.
   */
  readonly rating?: number | null;
  readonly onPress?: () => void;
  readonly style?: ViewStyle;
}) {
  const content = (
    <>
      {art}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
      <TileRating rating={rating ?? null} />
    </>
  );

  // Optional because a tile with nowhere to go should not answer to a press — a control
  // that does nothing is worse than no control.
  return onPress === undefined ? (
    <View style={style}>{content}</View>
  ) : (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      {content}
    </Pressable>
  );
}

/**
 * The glyphs come from `starGlyphs`, which the shared detail sheet reads too: a friend's
 * shelf and your own draw the same stars, and rounding them in two places is how the two end
 * up disagreeing about what a 3 looks like. Whole stars only — a half at this size is a smudge.
 */
function TileRating({ rating }: { readonly rating: number | null }) {
  const stars = starGlyphs(rating);
  if (stars === null) return null;

  return (
    <Text style={styles.rating} numberOfLines={1}>
      <Text style={styles.ratingOn}>{stars.on}</Text>
      <Text style={styles.ratingOff}>{stars.off}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 11.5, fontWeight: "600", marginTop: 6, color: colors.ink },
  subtitle: { fontSize: 10.5, color: colors.inkMuted },
  rating: { fontSize: 10, lineHeight: 13, letterSpacing: 1.5, marginTop: 3 },
  ratingOn: { color: colors.accent },
  ratingOff: { color: "rgba(25,23,19,0.2)" },
});
