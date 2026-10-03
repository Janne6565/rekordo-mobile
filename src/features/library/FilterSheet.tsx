import { RatingFloor } from "@/components/RatingFloor";
import { RisingSheet } from "@/components/RisingSheet";
import type { FormatFilter, LibraryLogic } from "@/features/library/useLibraryLogic";
import { colors, fonts, ink } from "@/theme/colors";
import type { Format } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FILTERS: readonly FormatFilter[] = ["ALL", "VINYL", "CD", "CASSETTE", "DIGITAL"];

/**
 * Turn 26c — the shelf's filters, as a sheet.
 *
 * It replaces the flat row of format chips that used to sit under the header. The chips
 * were the whole of the shelf's filtering and they could only ever be the whole of it:
 * every further axis was another chip in the same row, and the row was already the width
 * of the phone. Behind a sheet the shelf gets a second axis without the header growing,
 * and the line the sheet leaves behind says what the shelf now is.
 *
 * What it does *not* carry is 26c's dice. The deck itself says so on the way out — "if the
 * roll owns its own pool, 26c probably goes" — and it does: 26a shipped, the roll draws
 * from a pool it keeps itself, and a second dice rolling from the library's filter instead
 * would be a different feature wearing the same icon. Roll keeps its own place in the
 * toolbar, beside this.
 *
 * Nothing here is applied on a confirm. The count under the controls is live, and "Show"
 * is the way out rather than the commit — which is why dismissing the sheet keeps what you
 * set rather than throwing it away.
 */
export function FilterSheet({
  logic,
  onClose,
}: {
  readonly logic: LibraryLogic;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    // `fade` on the window and the rise inside it, so the dim does not travel up with the
    // panel — the same split every sheet in this app uses.
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessible={false} />
      <View style={styles.dock} pointerEvents="box-none">
        <RisingSheet style={styles.sheet} onDismiss={onClose}>
          <SafeAreaView edges={["bottom"]}>
            <View style={styles.grabRow}>
              <View style={styles.grabber} />
            </View>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.pad}>
                <View style={styles.head}>
                  <Text style={styles.title}>{t("library.filters.title")}</Text>
                  {/* Only offered when there is something to clear. A permanently lit
                      "Clear" over an unfiltered shelf is a control that does nothing. */}
                  {logic.filtered && (
                    <Pressable accessibilityRole="button" onPress={logic.clearFilters} hitSlop={8}>
                      <Text style={styles.clear}>{t("library.filters.clear")}</Text>
                    </Pressable>
                  )}
                </View>

                <Text style={styles.eyebrow}>{t("library.filters.format")}</Text>
                <View style={styles.chips}>
                  {FILTERS.map((filter) => {
                    const active = logic.format === filter;
                    return (
                      <Pressable
                        key={filter}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => logic.setFormat(filter)}
                        style={[styles.chip, active && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextOn]}>
                          {filter === "ALL" ? t("format.all") : FORMAT_LABELS[filter as Format]}
                          {filter !== "ALL" && logic.stats !== undefined
                            ? ` ${logic.stats.byFormat[filter as Format]}`
                            : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <RatingFloor value={logic.minRating} onChange={logic.setMinRating} />

                <View style={styles.matchRow}>
                  <Text style={styles.matchLabel}>{t("library.filters.matching")}</Text>
                  <Text style={styles.matchCount}>{logic.matching}</Text>
                </View>

                <Pressable accessibilityRole="button" onPress={onClose} style={styles.primary}>
                  <Text style={styles.primaryText}>
                    {t("library.filters.show", { count: logic.matching })}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </RisingSheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(25,23,19,0.5)",
  },
  dock: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
  },
  grabRow: { paddingTop: 12, paddingBottom: 16, alignItems: "center" },
  grabber: { width: 36, height: 4, borderRadius: 999, backgroundColor: ink(0.16) },
  pad: { paddingHorizontal: 20, paddingBottom: 14 },

  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 26, color: colors.ink },
  clear: { fontSize: 12.5, fontWeight: "600", color: colors.accent },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 22,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.14),
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.inkMuted },
  chipTextOn: { color: colors.paper },

  matchRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 26,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  matchLabel: { fontSize: 13, fontWeight: "500", color: colors.inkMuted },
  matchCount: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 24, color: colors.ink },

  primary: {
    height: 50,
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 14.5, fontWeight: "600", color: colors.paper },
});
