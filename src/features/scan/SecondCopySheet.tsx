import { ReleaseArt } from "@/components/ReleaseArt";
import { ScrimSheet } from "@/components/ScrimSheet";
import { useStore } from "@/local/StoreProvider";
import type { ScanDestination } from "@/store/scanSlice";
import { accent, colors, fonts, ink } from "@/theme/colors";
import type { Copy, Format, Release } from "@janne6565/rekordo-shared";
import { CONDITION_SHORT, FORMAT_LABELS, wishSatisfiedBy } from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";
import { Check, Heart, LibraryBig, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Screen 2d-ii: where a second copy goes.
 *
 * Asked by the duplicate card's "Add as a second copy" and by "Add a second" under the copy
 * opened from it, which is the same question asked from the other side. A paper sheet in
 * both places, even over the copy's dark cover chrome: it is a scan-flow question and reads
 * the same wherever it rises.
 *
 * Wishlist left, Shelf right, two identical tiles with neither filled or placed as the
 * default. When the album is already wished for in this format, the Wishlist tile keeps its
 * size and place but turns into a dashed note, so the thumb's target for Shelf never moves.
 * Never mind, a scrim tap or a swipe down closes it and adds nothing.
 */
export function SecondCopySheet({
  open,
  onClose,
  onChoose,
  release,
  format,
  owned,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChoose: (destination: ScanDestination) => void;
  readonly release: Release;
  readonly format: Format | null;
  /** The copy the question started from: its date and grade are what the line under it reads. */
  readonly owned: Copy;
}) {
  const { t } = useTranslation();
  const { store } = useStore();
  const shown = format ?? release.format;

  // Only read while the sheet is up; both are local reads, so there is nothing to wait for.
  const copies = useQuery({
    queryKey: ["second-copy-count", release.id],
    queryFn: () => store.listCopies(),
    enabled: open,
  });
  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => store.listWishlist(),
    enabled: open,
  });

  // At least the one the question is about, while the count is still being read.
  const count = Math.max(
    1,
    copies.data?.filter((copy) => copy.deletedAt === null && copy.releaseId === release.id)
      .length ?? 0,
  );
  // Read through the same `wishSatisfiedBy` the save uses, so the note cannot claim an
  // entry the write would not find.
  const wish =
    wishlist.data === undefined
      ? undefined
      : wishSatisfiedBy(wishlist.data, { manualFormat: format }, release);

  const date = (at: number) => new Date(at).toLocaleDateString();
  const meta = [
    t("scan.secondWhere.owned", { count }),
    t("scan.secondWhere.added", { date: date(owned.createdAt) }),
    owned.condition === null ? null : CONDITION_SHORT[owned.condition],
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <ScrimSheet
      open={open}
      onClose={onClose}
      scrimColor={SCRIM}
      sheetStyle={styles.sheet}
      design={SHEET_PAD}
    >
      {(close) => (
        <>
          <View style={styles.grabber} />
          <View style={styles.release}>
            <ReleaseArt release={release} format={shown} style={styles.art} />
            <View style={styles.releaseText}>
              <Text style={styles.releaseTitle} numberOfLines={1}>
                {release.title}
              </Text>
              <Text style={styles.releaseMeta} numberOfLines={1}>
                {[
                  release.artistName,
                  release.year === null ? null : String(release.year),
                  FORMAT_LABELS[shown],
                ]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </Text>
            </View>
          </View>
          <Text style={styles.question}>{t("scan.secondWhere.title")}</Text>
          <Text style={styles.meta}>{meta}</Text>

          <View style={styles.tiles}>
            {wish === undefined ? (
              <Tile
                icon={Heart}
                title={t("scan.wishlist")}
                body={t("scan.secondWhere.wishlistBody")}
                tag={t("scan.secondWhere.wishlistTag")}
                onPress={() => close(() => onChoose("WISHLIST"))}
              />
            ) : (
              <View style={[styles.tile, styles.tileWished]}>
                <View style={[styles.badge, styles.badgeWished]}>
                  <Heart size={19} color={colors.accent} fill={colors.accent} strokeWidth={1.8} />
                </View>
                <View style={styles.tileText}>
                  <Text style={[styles.tileTitle, styles.tileTitleWished]}>
                    {t("scan.secondWhere.wished")}
                  </Text>
                  <Text style={styles.tileBody}>
                    {t("scan.secondWhere.wishedBody", { date: date(wish.createdAt) })}
                  </Text>
                </View>
                <View style={styles.tagRow}>
                  <Check size={12} color={colors.accentStrong} strokeWidth={2.4} />
                  <Text style={[styles.tag, styles.tagWished]}>
                    {t("scan.secondWhere.wishedTag")}
                  </Text>
                </View>
              </View>
            )}
            <Tile
              icon={LibraryBig}
              title={t("scan.shelf")}
              body={t("scan.secondWhere.shelfBody")}
              tag={t("scan.secondWhere.shelfTag", { number: count + 1 })}
              onPress={() => close(() => onChoose("SHELF"))}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => close(onClose)}
            style={styles.neverMind}
          >
            <Text style={styles.neverMindText}>{t("scan.secondWhere.neverMind")}</Text>
          </Pressable>
        </>
      )}
    </ScrimSheet>
  );
}

/** One answer: the two are drawn by the same component so neither can drift into the default. */
function Tile({
  icon: Icon,
  title,
  body,
  tag,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.badge}>
        <Icon size={19} color={colors.onInk} strokeWidth={1.8} />
      </View>
      <View style={styles.tileText}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileBody}>{body}</Text>
      </View>
      <Text style={styles.tag}>{tag}</Text>
    </Pressable>
  );
}

/** What the sheet sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 46;
const MONO = "ui-monospace";
const SCRIM = "rgba(12,11,8,0.5)";

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: SHEET_PAD,
    shadowColor: colors.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
    elevation: 16,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: ink(0.18),
    marginBottom: 16,
  },
  release: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  art: { width: 54, height: 45 },
  releaseText: { flex: 1, minWidth: 0 },
  releaseTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  releaseMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  question: {
    fontFamily: fonts.serif,
    fontSize: 25,
    lineHeight: 30,
    color: colors.ink,
    marginTop: 16,
    marginHorizontal: 4,
  },
  meta: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 6,
    marginHorizontal: 4,
  },
  // A row stretches its children to the taller one, so the two tiles stay equal height
  // when German wraps one subline to three lines.
  tiles: { flexDirection: "row", gap: 10, marginTop: 16 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 148,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.14),
    gap: 10,
  },
  tilePressed: { backgroundColor: colors.canvas },
  tileWished: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: ink(0.2),
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWished: { backgroundColor: accent(0.12) },
  tileText: { flex: 1 },
  tileTitle: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600", color: colors.ink },
  tileTitleWished: { color: ink(0.72) },
  tileBody: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 3,
  },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tag: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  tagWished: { color: colors.accentStrong },
  neverMind: { height: 48, marginTop: 8, alignItems: "center", justifyContent: "center" },
  neverMindText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: ink(0.6),
  },
});
