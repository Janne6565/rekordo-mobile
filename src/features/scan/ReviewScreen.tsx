import { releaseDisambiguation } from "@/api/releases";
import { ReleaseArt } from "@/components/ReleaseArt";
import { useSaveBatch } from "@/features/scan/useSaveBatch";
import { SCAN_FORMATS, scanFormat } from "@/features/scan/useScannerLogic";
import { useStore } from "@/local/StoreProvider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { type KeptScan, countByDestination, scanActions, scanNaming } from "@/store/scanSlice";
import { colors, fonts } from "@/theme/colors";
import type { Format } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS, formatBarcode, wishSatisfiedBy } from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Disc3, HardDrive, Heart, LibraryBig, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The tray, opened up: everything kept this visit, still changeable.
 *
 * A full sheet rather than an expanding drawer, because this is where a mis-tap in a shop
 * gets fixed — the destination chip is a toggle, the format chips are live, and a row can
 * be dropped. Nothing has been written yet, so none of that is an edit; it is still the
 * same decision, being finished at the counter instead of at the crate.
 *
 * Turn 28 of the deck, screen 3a.
 */
export function ReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kept = useAppSelector((state) => state.scan.kept);
  const counts = countByDestination(kept);
  const { save, saving } = useSaveBatch();

  const onSave = async () => {
    await save(kept);
    router.replace("/scan/saved");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        {/* To the camera by name rather than one step back: Review is also reachable from
            the title search, and the label promises the camera from there too. */}
        <Pressable accessibilityRole="button" onPress={() => router.dismissTo("/scan")}>
          <Text style={styles.back}>{t("scan.backToCamera")}</Text>
        </Pressable>
        <Text style={styles.headerCount}>{t("scan.review", { count: kept.length })}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t("scan.fromThisCrate", { count: kept.length })}</Text>
        <Text style={styles.lede}>
          {t("scan.reviewBody", { shelf: counts.shelf, wishlist: counts.wishlist })}
        </Text>

        {kept.map((scan) => (
          <ReviewRow key={scan.key} scan={scan} />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Pressable
          accessibilityRole="button"
          disabled={saving || kept.length === 0}
          onPress={() => void onSave()}
          style={[styles.primary, (saving || kept.length === 0) && styles.primaryOff]}
        >
          <Text style={styles.primaryText}>
            {saving ? t("scan.saving") : t("scan.saveAll", { count: kept.length })}
          </Text>
        </Pressable>
        <View style={styles.reassure}>
          <HardDrive size={13} color={colors.inkMuted} strokeWidth={1.8} />
          <Text style={styles.reassureText}>{t("scan.savedOnPhone")}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ReviewRow({ scan }: { readonly scan: KeptScan }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { store } = useStore();
  const wished = scan.destination === "WISHLIST";
  /** Null only for a scan nobody could look up; a hand-typed record has a name too. */
  const naming = scanNaming(scan);

  /**
   * Whether filing this one settles something already on the wishlist.
   *
   * Said here rather than only after saving, because it changes what the row means: this
   * is not a new record arriving, it is a hunt ending, and that is worth knowing while the
   * destination chip is still a tap away. Read through the same `wishSatisfiedBy` the save
   * uses, so the row cannot promise something the write then declines to do.
   */
  const wishlist = useQuery({ queryKey: ["wishlist"], queryFn: () => store.listWishlist() });
  const settles =
    !wished &&
    scan.release !== null &&
    wishlist.data !== undefined &&
    wishSatisfiedBy(wishlist.data, { manualFormat: scan.format }, scan.release) !== undefined;

  return (
    <View style={[styles.row, wished && styles.rowWished]}>
      <View style={styles.rowTop}>
        {naming === null ? (
          <View style={styles.pending}>
            <Disc3 size={20} color="rgba(25,23,19,0.3)" strokeWidth={1.6} />
          </View>
        ) : (
          <ReleaseArt
            release={scan.release ?? undefined}
            format={scanFormat(scan)}
            previewUri={scan.manual?.cover?.uri ?? null}
            style={styles.art}
          />
        )}

        <View style={styles.rowText}>
          {naming === null ? (
            <>
              <Text style={styles.digits}>{formatBarcode(scan.barcode)}</Text>
              <Text style={styles.note}>{t("scan.pendingRow")}</Text>
            </>
          ) : (
            <>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {naming.title}
                {scan.secondCopy && (
                  <Text style={styles.rowTitleQuiet}> · {t("scan.secondCopy")}</Text>
                )}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {[
                  naming.artistName,
                  naming.year === null ? null : String(naming.year),
                  scan.release === null
                    ? [scan.manual?.fields.manualLabel, scan.manual?.fields.manualCatalogNumber]
                        .filter((part) => part != null)
                        .join(" ")
                    : releaseDisambiguation(scan.release),
                ]
                  .filter((part) => part !== null && part !== "")
                  .join(" · ")}
              </Text>
              {wished && <Text style={styles.note}>{t("scan.leftInShop")}</Text>}
              {settles && (
                <View style={styles.settles}>
                  <Heart size={11} color={colors.accentStrong} strokeWidth={2.2} />
                  <Text style={styles.settlesText}>{t("scan.wasOnWishlist")}</Text>
                </View>
              )}
            </>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("scan.remove")}
          onPress={() => dispatch(scanActions.dropped(scan.key))}
          hitSlop={8}
        >
          <X size={15} color="rgba(25,23,19,0.35)" strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.rowChips}>
        {/* A pending scan has no catalogue answer to disagree with, so its format chips
            are the only statement about it there is — and they still matter, because the
            resolver picks the pressing that matches. */}
        {SCAN_FORMATS.filter((format) => format !== "DIGITAL" || scan.format === "DIGITAL").map(
          (format) => (
            <FormatChip key={format} scan={scan} format={format} />
          ),
        )}
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            dispatch(
              scanActions.redirected({
                key: scan.key,
                destination: wished ? "SHELF" : "WISHLIST",
              }),
            )
          }
          style={[styles.destination, wished && styles.destinationWished]}
        >
          {wished ? (
            <Heart size={12} color="#ffffff" strokeWidth={2} />
          ) : (
            <LibraryBig size={12} color={colors.inkMuted} strokeWidth={2} />
          )}
          <Text style={[styles.destinationText, wished && styles.destinationTextOn]}>
            {wished ? t("scan.wishlist") : t("scan.shelf")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function FormatChip({ scan, format }: { readonly scan: KeptScan; readonly format: Format }) {
  const dispatch = useAppDispatch();
  const on = scanFormat(scan) === format;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => dispatch(scanActions.reformatted({ key: scan.key, format }))}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{FORMAT_LABELS[format]}</Text>
    </Pressable>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(25,23,19,0.09)",
  },
  back: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "500", color: colors.accent },
  headerCount: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.ink },

  body: { padding: 18 },
  title: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 29, color: colors.ink },
  lede: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 6,
  },

  row: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.09)",
  },
  rowWished: { borderColor: "rgba(162,87,58,0.35)" },
  rowTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  art: { width: 65, height: 54 },
  pending: {
    width: 54,
    height: 54,
    borderRadius: 7,
    backgroundColor: "#eae6de",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowTitleQuiet: { fontWeight: "400", color: "rgba(25,23,19,0.5)" },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  digits: { fontFamily: MONO, fontSize: 12.5, color: colors.ink },
  note: { fontFamily: fonts.sans, fontSize: 11, color: colors.inkSubtle, marginTop: 3 },
  settles: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  settlesText: { fontFamily: MONO, fontSize: 10, color: colors.accentStrong },

  rowChips: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  spacer: { flex: 1 },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.12)",
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: "500", color: colors.inkMuted },
  chipTextOn: { color: "#ffffff", fontWeight: "600" },
  destination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.12)",
  },
  destinationWished: { backgroundColor: colors.accent, borderColor: colors.accent },
  destinationText: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.inkMuted,
  },
  destinationTextOn: { color: "#ffffff" },

  footer: {
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(25,23,19,0.09)",
    backgroundColor: colors.surface,
  },
  primary: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: "#ffffff" },
  reassure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 11,
    marginBottom: 4,
  },
  reassureText: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted },
});
