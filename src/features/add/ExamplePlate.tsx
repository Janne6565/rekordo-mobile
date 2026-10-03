import { ReleaseArt } from "@/components/ReleaseArt";
import { EXAMPLE_RELEASES } from "@/features/add/exampleReleases";
import type { ExampleRelease } from "@/features/add/types";
import { colors, fonts, ink } from "@/theme/colors";
import { Search } from "lucide-react-native";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";

/** Three across, as the deck draws it. */
const COLUMNS = 3;

/**
 * The examples plate (screen 1a).
 *
 * A recessed canvas plate rather than the white surface the rest of this screen uses.
 * White is where the app puts *your* data — your wishlist, your recent searches — and
 * these records are not yours in any sense: they are the app's sample page, the way a
 * catalogue prints one. Sitting them on the same surface as the wishlist would quietly
 * claim they had something to do with you.
 *
 * Tiles rather than the result row next door. The row's whole right side is the two
 * destination buttons, and a tile has no right side at all, so it stays a picture of a
 * record rather than a control with two answers.
 *
 * A tap opens the confirm sheet on the record, rather than running its search. The sheet
 * lists the album's other pressings under the one it opens on, so the choice the search
 * used to offer is still there -- one screen later, and without a query nobody typed.
 */
export function ExamplePlate({
  coverOf,
  openingAlbumId,
  onOpen,
}: {
  readonly coverOf: (albumId: string) => string | null;
  /** The tile whose pressings are on their way, which shows the wait in place. */
  readonly openingAlbumId: string | null;
  readonly onOpen: (example: ExampleRelease) => void;
}) {
  const { t } = useTranslation();

  /*
   * Padded to a whole number of rows so the last row is not a short shelf. The spacers
   * carry the same flex as a tile and draw nothing, which keeps every sleeve the same
   * width no matter how many examples ship.
   */
  const rows: { key: string; tiles: (ExampleRelease | null)[] }[] = [];
  for (let start = 0; start < EXAMPLE_RELEASES.length; start += COLUMNS) {
    const tiles: (ExampleRelease | null)[] = [...EXAMPLE_RELEASES.slice(start, start + COLUMNS)];
    // Keyed by what is in the row rather than by where it sits, so editing the shipped list
    // does not hand a row the identity of the one that used to be in its place.
    const key = tiles.map((tile) => tile?.albumId ?? "gap").join("+");
    while (tiles.length < COLUMNS) tiles.push(null);
    rows.push({ key, tiles });
  }

  return (
    <View style={styles.plate}>
      <View style={styles.plateHead}>
        <Text style={styles.plateLabel}>{t("add.examples.label")}</Text>
        <View style={styles.plateHint}>
          <Search size={11} color={colors.inkSubtle} strokeWidth={2} />
          <Text style={styles.plateHintText}>{t("add.examples.tapToSearch")}</Text>
        </View>
      </View>

      <Text style={styles.plateLead}>{t("add.examples.lead")}</Text>

      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.key} style={styles.gridRow}>
            {row.tiles.map((example, column) =>
              example === null ? (
                <View key={`${row.key}-gap-${column}`} style={styles.tile} />
              ) : (
                <ExampleTile
                  key={example.albumId}
                  example={example}
                  cover={coverOf(example.albumId)}
                  opening={openingAlbumId === example.albumId}
                  onPress={() => onOpen(example)}
                />
              ),
            )}
          </View>
        ))}
      </View>

      <Text style={styles.plateFoot}>{t("add.examples.footnote")}</Text>
    </View>
  );
}

/**
 * One tile: sleeve, title, artist.
 *
 * No year and no format mark, unlike every other place a release is drawn. Both would be
 * saying something about a pressing, and this stands for the album -- the pressing is the
 * thing the search it opens exists to let you choose.
 */
function ExampleTile({
  example,
  cover,
  opening,
  onPress,
}: {
  readonly example: ExampleRelease;
  readonly cover: string | null;
  readonly opening: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  /* The deck's press state: the sleeve alone dips, not the words under it. */
  const scale = useRef(new Animated.Value(1)).current;
  const dip = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("add.examples.open", {
        title: example.title,
        artist: example.artistName,
      })}
      onPress={onPress}
      onPressIn={() => dip(0.97)}
      onPressOut={() => dip(1)}
      style={styles.tile}
    >
      <Animated.View style={[styles.sleeve, { transform: [{ scale }] }]}>
        {/*
          `bleed`, not the default sleeve.
          The sleeve variant composes the cover into a FormatThumb, which is a 6:5 box with
          the record leaning out from behind it -- correct for a row that is naming a
          pressing, wrong here twice over: the tile is square by design, and it is standing
          for an album that has no one format to lean out of. `bleed` is the edge-to-edge
          frame, and it carries the square itself.

          `plain` with it, so an album with no art stays a quiet ground: the empty sleeve
          the item detail draws is a statement about one physical copy, and this plate is
          standing for an album nobody necessarily owns.
        */}
        <ReleaseArt release={{ coverArtUrl: cover }} variant="bleed" placeholder="plain" />
        {/* The wait sits on the sleeve that caused it, so a slow mirror never leaves the
            plate looking as though the tap missed. */}
        {opening && (
          <View style={styles.opening}>
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        )}
      </Animated.View>
      <Text style={styles.tileTitle} numberOfLines={1}>
        {example.title}
      </Text>
      <Text style={styles.tileArtist} numberOfLines={1}>
        {example.artistName}
      </Text>
    </Pressable>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  plate: {
    marginTop: 22,
    borderRadius: 16,
    backgroundColor: colors.canvas,
    paddingTop: 15,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  plateHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  plateLabel: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  plateHint: { flexDirection: "row", alignItems: "center", gap: 5 },
  plateHintText: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  plateLead: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
    marginTop: 9,
  },
  grid: { marginTop: 14, gap: 12 },
  gridRow: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, gap: 6 },
  /* The hairline the deck draws as an inset shadow, which React Native has no equivalent
     for. It also keeps a sleeve whose ground matches the plate from vanishing into it. */
  sleeve: {
    width: "100%",
    borderRadius: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ink(0.12),
  },
  opening: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(25,23,19,0.42)",
  },
  tileTitle: { fontSize: 11.5, fontWeight: "600", color: colors.ink },
  tileArtist: { fontSize: 10.5, color: colors.inkMuted },
  plateFoot: {
    marginTop: 14,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkMuted,
  },
});
