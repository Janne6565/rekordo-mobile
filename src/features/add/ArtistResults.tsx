import { Skeleton } from "@/components/Skeleton";
import { artistSubtitle } from "@/domain/artist";
import { useArtistImage } from "@/features/add/useArtistImage";
import type { useArtistSearchLogic } from "@/features/add/useArtistSearchLogic";
import { colors, ink } from "@/theme/colors";
import type { Artist } from "@janne6565/rekordo-shared";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";

/**
 * An artist's portrait, or the striped disc they get until there is one.
 *
 * The stripes are the deck's own answer, and they stay the floor rather than a stopgap:
 * an artist has no cover art, borrowing one of their albums' would make a row look like a
 * release, and plenty of artists have no picture in Discogs at all. The initial keeps the
 * row recognisably the same family of art while being unmistakably a different kind of
 * thing, and it is what a row shows before its portrait lands, when there is none, and if
 * the image fails to load.
 *
 * Rendered underneath the image rather than swapped for it, so the circle never blinks
 * empty between the two and a broken URL degrades to the initial with no extra state.
 *
 * React Native has no repeating gradients, so the deck's 135° stripes are drawn as an SVG
 * pattern — the same trick FormatThumb uses for the textures it cannot express in styles.
 */
export function ArtistAvatar({
  name,
  size,
  mbid,
}: { readonly name: string; readonly size: number; readonly mbid?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="artistStripes" width={14.14} height={14.14} patternUnits="userSpaceOnUse">
            <Rect width={14.14} height={14.14} fill={colors.well} />
            <Line x1={0} y1={14.14} x2={14.14} y2={0} stroke={ink(0.05)} strokeWidth={7.07} />
          </Pattern>
        </Defs>
        <Rect width={size} height={size} fill="url(#artistStripes)" />
      </Svg>
      <Text style={[styles.avatarInitial, { fontSize: Math.round(size / 3) }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
      {mbid !== undefined && <ArtistPortrait mbid={mbid} />}
    </View>
  );
}

/**
 * Split from the avatar so the query only runs where a portrait was asked for, and so the
 * initial underneath never re-renders when the picture arrives.
 */
function ArtistPortrait({ mbid }: { readonly mbid: string }) {
  const uri = useArtistImage(mbid);
  const [failed, setFailed] = useState(false);
  if (uri === null || failed) return null;

  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  );
}

interface ArtistResultsProps {
  readonly logic: ReturnType<typeof useArtistSearchLogic>;
  readonly onOpen: (artist: Artist) => void;
}

/** Screen 10a — the artists section above the releases on the add screen. */
export function ArtistResults({ logic, onOpen }: ArtistResultsProps) {
  const { t } = useTranslation();

  // A failed artist lookup takes the section away, not the search. Releases are still
  // useful on their own, and MusicBrainz times out often enough that this matters.
  if (logic.failed) return null;
  if (logic.loading) return <ArtistSkeletons />;
  if (logic.total === 0) return null;

  return (
    <View>
      <View style={styles.sectionRow}>
        <Text style={styles.section}>{t("artists.sectionCount", { count: logic.total })}</Text>
        <Text style={styles.sectionAside}>{t("artists.sortedByShort")}</Text>
      </View>

      {logic.shown.map((artist) => (
        <ArtistRow key={artist.mbid} artist={artist} onOpen={() => onOpen(artist)} />
      ))}

      {!logic.expanded && logic.hidden > 0 && (
        <Pressable accessibilityRole="button" onPress={logic.expand} style={styles.moreRow}>
          <Text style={styles.moreText}>{t("artists.showMore", { count: logic.hidden })}</Text>
          <ChevronDown size={16} color={colors.inkSubtle} strokeWidth={1.75} />
        </Pressable>
      )}
    </View>
  );
}

function ArtistRow({ artist, onOpen }: { readonly artist: Artist; readonly onOpen: () => void }) {
  const { t } = useTranslation();
  const meta = artistSubtitle(artist);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${artist.name}, ${t("artists.discography")}`}
      onPress={onOpen}
      style={styles.row}
    >
      <ArtistAvatar name={artist.name} size={48} mbid={artist.mbid} />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {artist.name}
          </Text>
          <Text style={styles.badge}>{t("artists.badge")}</Text>
        </View>
        {/* The line that tells two artists of the same name apart. MusicBrainz holds at
            least three called "Daughter"; without this the rows are identical. */}
        {artist.disambiguation !== "" && (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {artist.disambiguation}
          </Text>
        )}
        {meta !== "" && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={colors.inkSubtle} strokeWidth={1.75} />
    </Pressable>
  );
}

/** The same row shape, while the artist request is still out (the rule from turn 9). */
function ArtistSkeletons() {
  const { t } = useTranslation();

  return (
    <View>
      <View style={styles.sectionRow}>
        <Text accessibilityLiveRegion="polite" style={styles.section}>
          {t("artists.searching")}
        </Text>
      </View>
      {(["58%", "44%"] as const).map((width) => (
        <View key={width} style={styles.row}>
          <Skeleton style={styles.avatarSkeleton} />
          <View style={styles.rowBody}>
            <Skeleton style={{ height: 11, width }} />
            <Skeleton tone="soft" style={{ height: 9, width: "66%", marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Matches the release rows this section sits with (`AddScreen`), not the deck's dark
 * chrome the block was first drawn on. The add screen went light and this file did not
 * follow, which left the whole section white on white and effectively invisible.
 */
const HAIRLINE = ink(0.08);

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  avatarInitial: { fontWeight: "500", color: colors.inkSubtle },
  avatarSkeleton: { width: 48, height: 48, borderRadius: 999 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    paddingBottom: 8,
  },
  section: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  sectionAside: { fontSize: 10.5, fontWeight: "500", color: colors.inkSubtle },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  rowBody: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  rowTitle: { flexShrink: 1, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  badge: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: colors.inkMuted,
    backgroundColor: ink(0.06),
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: "hidden",
  },
  rowSubtitle: { fontSize: 11.5, color: colors.inkMuted },
  rowMeta: { fontSize: 10, color: colors.inkSubtle },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  moreText: { fontSize: 12, fontWeight: "500", color: colors.inkMuted },
});
