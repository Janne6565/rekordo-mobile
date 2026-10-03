import { ReleaseArt } from "@/components/ReleaseArt";
import { scanFormat } from "@/features/scan/useScannerLogic";
import { useAppDispatch } from "@/store/hooks";
import { type KeptScan, scanActions, scanNaming } from "@/store/scanSlice";
import { colors, fonts, ink } from "@/theme/colors";
import { FORMAT_LABELS, formatBarcode } from "@janne6565/rekordo-shared";
import { Disc3, Heart, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * One line of the tray under the camera window.
 *
 * Both destinations share the row. A heart badge on the thumbnail is the only difference,
 * because at a glance in a shop the question is "did that one land?", not "which list did
 * it land on" — and the count above already answers the second one.
 *
 * The X is Review's own remove, at the same size and weight: nothing is written until the
 * batch is saved, so taking a row out here is the same act as taking it out there.
 */
export function TrayRow({
  scan,
  last = false,
}: {
  readonly scan: KeptScan;
  readonly last?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const wished = scan.destination === "WISHLIST";
  // A record typed in by hand has a name and no release, so the row asks for the name
  // rather than for the release: only a scan nobody could look up is drawn as digits.
  const naming = scanNaming(scan);

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.artBox}>
        {naming === null ? (
          <View style={styles.pending}>
            <Disc3 size={20} color={ink(0.3)} strokeWidth={1.6} />
          </View>
        ) : (
          <ReleaseArt
            release={scan.release ?? undefined}
            format={scanFormat(scan)}
            previewUri={scan.manual?.cover?.uri ?? null}
            style={styles.art}
          />
        )}
        {wished && (
          <View style={styles.badge}>
            <Heart size={9} color={colors.onInk} strokeWidth={2.6} />
          </View>
        )}
      </View>

      <View style={styles.text}>
        {naming === null ? (
          <>
            <Text style={styles.digits}>{formatBarcode(scan.barcode)}</Text>
            <Text style={styles.meta}>{t("scan.pendingRow")}</Text>
          </>
        ) : (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {naming.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[
                naming.artistName,
                naming.year === null ? null : String(naming.year),
                FORMAT_LABELS[scanFormat(scan)],
              ]
                .filter((part) => part !== null && part !== "")
                .join(" · ")}
            </Text>
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("scan.remove")}
        onPress={() => dispatch(scanActions.dropped(scan.key))}
        hitSlop={8}
      >
        <X size={15} color={ink(0.35)} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ink(0.08),
    marginTop: 6,
  },
  rowLast: { borderBottomWidth: 0 },
  // 1.2:1, the ratio every format mark in the deck is drawn at.
  artBox: { width: 50, height: 42 },
  art: { width: 50, height: 42 },
  pending: {
    width: 50,
    height: 42,
    borderRadius: 6,
    backgroundColor: colors.well,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  digits: { fontFamily: MONO, fontSize: 12.5, color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: ink(0.5), marginTop: 2 },
});
