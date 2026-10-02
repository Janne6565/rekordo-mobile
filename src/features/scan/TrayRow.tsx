import { ReleaseArt } from "@/components/ReleaseArt";
import { scanFormat } from "@/features/scan/useScannerLogic";
import { type KeptScan, scanNaming } from "@/store/scanSlice";
import { colors, fonts } from "@/theme/colors";
import { FORMAT_LABELS, formatBarcode } from "@janne6565/rekordo-shared";
import { Disc3, Heart } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

/**
 * One line of the tray under the camera window.
 *
 * Both destinations share the row. A heart badge on the thumbnail is the only difference,
 * because at a glance in a shop the question is "did that one land?", not "which list did
 * it land on" — and the count above already answers the second one.
 */
export function TrayRow({
  scan,
  last = false,
}: {
  readonly scan: KeptScan;
  readonly last?: boolean;
}) {
  const { t } = useTranslation();
  const wished = scan.destination === "WISHLIST";
  // A record typed in by hand has a name and no release, so the row asks for the name
  // rather than for the release: only a scan nobody could look up is drawn as digits.
  const naming = scanNaming(scan);

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.artBox}>
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
        {wished && (
          <View style={styles.badge}>
            <Heart size={9} color="#ffffff" strokeWidth={2.6} />
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
    borderBottomColor: "rgba(25,23,19,0.08)",
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
    backgroundColor: "#eae6de",
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
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: "rgba(25,23,19,0.5)", marginTop: 2 },
});
