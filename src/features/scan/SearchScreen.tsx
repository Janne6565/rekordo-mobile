import { albumCoverUrl } from "@/api/releases";
import { KeyboardLift } from "@/components/KeyboardLift";
import { ReleaseArt } from "@/components/ReleaseArt";
import { SessionBar } from "@/features/scan/SessionBar";
import { useScanSearchLogic } from "@/features/scan/useScanSearchLogic";
import { colors, fonts, ink } from "@/theme/colors";
import type { RecordGroup } from "@janne6565/rekordo-shared";
import { formatBarcode } from "@janne6565/rekordo-shared";
import { ChevronLeft, ChevronRight, PencilLine, ScanBarcode, Search, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** The row's artwork box, at the 1.2:1 every format mark in the deck is drawn at. */
const ART = { width: 60, height: 50 } as const;

/**
 * Searching by title without leaving the scan session (scan deck, screen 3c).
 *
 * "Search title" on the not-found card used to close the card and search nothing. This is
 * what it was always claiming to do: the field opens focused, the barcode that failed
 * stays in view so it is clear what is being looked for, and the session bar is still at
 * the foot — the tray survives the detour. Picking a record goes back to the camera with
 * its pressings on a card; manual entry is offered last, for when this comes up empty too.
 */
export function SearchScreen({ barcode = "" }: { readonly barcode?: string } = {}) {
  const { t } = useTranslation();
  const logic = useScanSearchLogic(barcode);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardLift style={styles.fill}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("scan.backToCamera")}
            onPress={logic.back}
            style={styles.round}
          >
            <ChevronLeft size={17} color={ink(0.65)} strokeWidth={1.9} />
          </Pressable>
          <View style={styles.field}>
            <Search size={15} color={colors.inkMuted} strokeWidth={2} />
            <TextInput
              value={logic.term}
              onChangeText={logic.setTerm}
              placeholder={t("scan.search.placeholder")}
              placeholderTextColor={ink(0.3)}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              style={styles.input}
            />
            {logic.term !== "" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("scan.search.clear")}
                onPress={logic.clear}
                hitSlop={10}
              >
                <X size={15} color={colors.inkSubtle} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>

        {barcode !== "" && (
          <View style={styles.failed}>
            <ScanBarcode size={13} color={colors.inkSubtle} strokeWidth={1.8} />
            <Text style={styles.failedText}>
              {t("scan.search.noBarcodeMatch", { barcode: formatBarcode(barcode) })}
            </Text>
          </View>
        )}

        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {logic.searching && logic.loading && logic.results.length === 0 && (
            <ActivityIndicator style={styles.spinner} color={colors.inkSubtle} />
          )}
          {logic.searching && logic.failed && (
            <Text style={styles.message}>{t("scan.search.unreachable")}</Text>
          )}
          {logic.searching && !logic.loading && !logic.failed && logic.results.length === 0 && (
            <Text style={styles.message}>{t("scan.search.nothing")}</Text>
          )}

          {logic.results.length > 0 && (
            <>
              <Text style={styles.eyebrow}>
                {t("scan.search.releases", { count: logic.results.length })}
              </Text>
              {logic.results.map((group) => (
                <ResultRow
                  key={group.album.albumId}
                  group={group}
                  picking={logic.pickingId === group.album.albumId}
                  unavailable={logic.unavailableId === group.album.albumId}
                  disabled={logic.pickingId !== null}
                  onPress={() => logic.pick(group.album)}
                />
              ))}
            </>
          )}

          <Pressable accessibilityRole="button" onPress={logic.enterManually} style={styles.manual}>
            <PencilLine size={14} color={colors.accent} strokeWidth={1.8} />
            <Text style={styles.manualText}>{t("scan.search.notHere")}</Text>
          </Pressable>
        </ScrollView>

        <SessionBar quiet />
      </KeyboardLift>
    </SafeAreaView>
  );
}

function ResultRow({
  group,
  picking,
  unavailable,
  disabled,
  onPress,
}: {
  readonly group: RecordGroup;
  readonly picking: boolean;
  readonly unavailable: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const { album, editions } = group;

  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.row}>
      {/* No format to draw yet: a search result is a record, and which pressing of it is
          in hand is the card's question once this row has been picked. */}
      <ReleaseArt release={{ coverArtUrl: albumCoverUrl(album, ART.width) }} style={ART} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {album.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {unavailable
            ? t("scan.search.noPressings")
            : [
                album.artistName,
                album.year === null ? null : String(album.year),
                editions.length === 0
                  ? null
                  : t("scan.search.editions", { count: editions.length + 1 }),
              ]
                .filter((part) => part !== null && part !== "")
                .join(" · ")}
        </Text>
      </View>
      {picking ? (
        <ActivityIndicator size="small" color={colors.inkSubtle} />
      ) : (
        <ChevronRight size={16} color={ink(0.35)} strokeWidth={2} />
      )}
    </Pressable>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  round: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  input: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.sans,
    fontSize: 14.5,
    fontWeight: "500",
    color: colors.ink,
  },
  failed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginHorizontal: 18,
  },
  failedText: { fontFamily: MONO, fontSize: 10.5, color: colors.inkMuted },

  body: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 },
  spinner: { marginVertical: 18 },
  message: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.inkMuted,
  },
  eyebrow: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ink(0.08),
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  manual: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  manualText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "500", color: colors.accent },
});
