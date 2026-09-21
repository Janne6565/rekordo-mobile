import { albumCoverUrl } from "@/api/releases";
import { colors } from "@/theme/colors";
import type { Album } from "@janne6565/rekordo-shared";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

/**
 * A record's sleeve, square, at the size it is drawn.
 *
 * A search result is a record rather than a pressing now, so this shows the artwork
 * instead of the format silhouette a pressing row carries: choosing between records is a
 * visual job and the sleeve is what people recognise. There is no format to draw anyway
 * until somebody says which copy they own.
 *
 * The box keeps its shape whether or not a cover arrives. An answer from Discogs often has
 * none, and a row that collapsed without artwork would make the list jump as the slower
 * half of it landed.
 */
export function AlbumArt({ album, size }: { readonly album: Album; readonly size: number }) {
  // A URL is not a promise that anything is behind it: a cover can 404 long after the
  // catalogue said it existed, and the empty panel is a better answer than a torn image.
  const [broken, setBroken] = useState(false);
  const src = albumCoverUrl(album, size);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {src !== null && !broken && (
        <Image
          source={{ uri: src }}
          style={styles.image}
          onError={() => setBroken(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  image: { width: "100%", height: "100%" },
});
