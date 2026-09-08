import { KeyboardLift } from "@/components/KeyboardLift";
import { CHOOSABLE_FORMATS } from "@/domain/formats";
import { useManualEntryLogic } from "@/features/manual/useManualEntryLogic";
import { colors } from "@/theme/colors";
import type { Format } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS, formatBarcode } from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import { Camera, ImagePlus, LibraryBig, ScanBarcode, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Screen 14a — entering a copy no database has.
 *
 * One column, artist first, and everything below it optional. A record that is not in an
 * archive is usually one you know very little about, and a form that insisted on a
 * catalogue number would simply not get filled in. Saving lands on the copy with its
 * editor open, which is where the condition, the price and the shop belong.
 */
export function ManualScreen({ barcode = "" }: { readonly barcode?: string } = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const logic = useManualEntryLogic();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardLift style={styles.fill}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.cancel}>{t("common.cancel")}</Text>
          </Pressable>
          <Text style={styles.heading}>{t("manual.heading")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !logic.canSave || logic.saving }}
            onPress={logic.save}
            disabled={!logic.canSave || logic.saving}
            hitSlop={10}
          >
            {logic.saving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={logic.canSave ? styles.save : styles.saveOff}>{t("manual.save")}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* Screen 4b: arrived at from a scan the catalogues could not answer. The read
              itself worked, and showing it says so — and saves reading it off the sleeve. */}
          {barcode !== "" && (
            <View style={styles.scanStrip}>
              <ScanBarcode size={16} color={colors.inkSubtle} strokeWidth={1.7} />
              <Text style={styles.scanDigits}>{formatBarcode(barcode)}</Text>
              <Text style={styles.scanNote}>{t("manual.keptFromScan")}</Text>
            </View>
          )}

          <View style={styles.topRow}>
            {/*
             * The deck's cover well, and the one picture this form takes.
             *
             * A record no catalogue has starts life with nothing to show of it, so the
             * well is the picker rather than a label: the frame itself chooses from the
             * library, the badge takes a photo. Everything after this one — a strip of
             * them, which is the preview, whether to prefer catalogue art — stays on the
             * copy detail, where the whole strip lives.
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("manual.coverChoose")}
              onPress={() => logic.chooseCover("LIBRARY")}
              disabled={logic.choosingCover}
              style={[styles.coverWell, logic.coverUri !== null && styles.coverWellFilled]}
            >
              {logic.coverUri === null ? (
                <>
                  <ImagePlus size={17} color={colors.inkSubtle} strokeWidth={1.6} />
                  <Text style={styles.coverLabel}>{t("manual.cover")}</Text>
                </>
              ) : (
                <Image source={{ uri: logic.coverUri }} style={styles.coverImage} />
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("manual.coverPhoto")}
                onPress={() => logic.chooseCover("CAMERA")}
                disabled={logic.choosingCover}
                hitSlop={6}
                style={styles.coverBadge}
              >
                <Camera size={12} color="#ffffff" strokeWidth={2} />
              </Pressable>

              {/* Only once there is one to take off, and never as a confirm step: nothing
                  is written until the form is saved, so leaving it is the undo. */}
              {logic.coverUri !== null && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("manual.coverRemove")}
                  onPress={logic.dropCover}
                  hitSlop={6}
                  style={[styles.coverBadge, styles.coverBadgeRemove]}
                >
                  <X size={12} color="#ffffff" strokeWidth={2} />
                </Pressable>
              )}
            </Pressable>

            <View style={styles.fill}>
              <Text style={styles.eyebrow}>{t("manual.artist")}</Text>
              <TextInput
                value={logic.fields.artist}
                onChangeText={(value) => logic.set("artist", value)}
                placeholder={t("manual.artistPlaceholder")}
                placeholderTextColor="rgba(25,23,19,0.3)"
                autoFocus
                style={[styles.input, styles.inputLead]}
              />
              {logic.artistHint !== null && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => logic.set("artist", logic.artistHint?.name ?? "")}
                  style={styles.shelfRow}
                >
                  <LibraryBig size={13} color={colors.inkSubtle} strokeWidth={1.75} />
                  <Text style={styles.shelfText} numberOfLines={1}>
                    {t("manual.onShelf", {
                      artist: logic.artistHint.name,
                      count: logic.artistHint.count,
                    })}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.eyebrow}>{t("manual.title")}</Text>
            <TextInput
              value={logic.fields.title}
              onChangeText={(value) => logic.set("title", value)}
              placeholder={t("manual.titlePlaceholder")}
              placeholderTextColor="rgba(25,23,19,0.3)"
              style={styles.input}
            />
          </View>

          <View style={styles.pairRow}>
            <View style={styles.yearField}>
              <Text style={styles.eyebrow}>{t("manual.year")}</Text>
              <TextInput
                value={logic.fields.year}
                onChangeText={(value) => logic.set("year", value)}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="————"
                placeholderTextColor="rgba(25,23,19,0.3)"
                style={styles.input}
              />
            </View>
            <View style={styles.fill}>
              <Text style={styles.eyebrow}>{t("manual.label")}</Text>
              <TextInput
                value={logic.fields.label}
                onChangeText={(value) => logic.set("label", value)}
                placeholder={t("manual.labelPlaceholder")}
                placeholderTextColor="rgba(25,23,19,0.3)"
                style={styles.input}
              />
            </View>
          </View>

          {/*
           * The catalogue number, its own field rather than typed after the label.
           *
           * It is the one string that identifies a pressing nobody has listed — "UD 01" is
           * what a collector writes down about a bootleg — and folding it into the label
           * field made it unsearchable and unsortable for the sake of one line of layout.
           */}
          <View style={styles.field}>
            <Text style={styles.eyebrow}>{t("manual.catalogNumber")}</Text>
            <TextInput
              value={logic.fields.catalogNumber}
              onChangeText={(value) => logic.set("catalogNumber", value)}
              placeholder={t("manual.catalogPlaceholder")}
              placeholderTextColor="rgba(25,23,19,0.3)"
              style={styles.input}
            />
          </View>

          <View style={styles.formatBlock}>
            <Text style={styles.eyebrow}>{t("manual.format")}</Text>
            <View style={styles.chips}>
              {CHOOSABLE_FORMATS.map((format) => (
                <FormatChip
                  key={format}
                  format={format}
                  selected={logic.fields.format === format}
                  onPress={() => logic.set("format", format)}
                />
              ))}
            </View>
          </View>

          {/* What the copy is like is the next screen's question, not this one's — saving
              opens the editor on the copy this creates. */}
          <View style={styles.laterRow}>
            <Text style={styles.laterLabel}>{t("manual.later")}</Text>
            <Text style={styles.laterAction}>{t("manual.laterAction")}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <ScanBarcode size={17} color={colors.inkSubtle} strokeWidth={1.6} />
          <Text style={styles.footerText}>{t("manual.nothingLookedUp")}</Text>
        </View>
      </KeyboardLift>
    </SafeAreaView>
  );
}

function FormatChip({
  format,
  selected,
  onPress,
}: {
  readonly format: Format;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
    >
      <Text style={selected ? styles.chipTextOn : styles.chipTextOff}>{FORMAT_LABELS[format]}</Text>
    </Pressable>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  cancel: { fontSize: 13.5, fontWeight: "500", color: colors.inkMuted },
  heading: { fontSize: 14, fontWeight: "600", color: colors.ink },
  save: { fontSize: 13.5, fontWeight: "600", color: colors.accent },
  saveOff: { fontSize: 13.5, fontWeight: "600", color: "rgba(25,23,19,0.28)" },
  body: { paddingHorizontal: 18, paddingBottom: 28 },
  topRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  coverWell: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(25,23,19,0.2)",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  /** The dashed frame is an invitation; once there is a picture in it, it is furniture. */
  coverWellFilled: { borderStyle: "solid", borderColor: "rgba(25,23,19,0.12)" },
  coverImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8.5 },
  coverBadge: {
    position: "absolute",
    bottom: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  coverBadgeRemove: { bottom: undefined, right: -6, top: -6 },
  coverLabel: {
    marginTop: 4,
    fontSize: 8.5,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  eyebrow: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  input: {
    marginTop: 5,
    paddingBottom: 9,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(25,23,19,0.14)",
  },
  /** The field the screen opens on gets the solid rule the deck draws under it. */
  inputLead: {
    fontSize: 17,
    fontWeight: "500",
    borderBottomWidth: 1.5,
    borderBottomColor: colors.ink,
  },
  shelfRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 },
  shelfText: { flex: 1, fontSize: 11.5, color: colors.inkMuted },
  field: { marginTop: 20 },
  pairRow: { flexDirection: "row", gap: 16, marginTop: 18 },
  yearField: { width: 88 },
  formatBlock: { marginTop: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999 },
  chipOn: { backgroundColor: colors.ink },
  chipOff: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.12)",
  },
  chipTextOn: { fontSize: 12.5, fontWeight: "600", color: "#ffffff" },
  chipTextOff: { fontSize: 12.5, fontWeight: "500", color: colors.inkMuted },
  laterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(25,23,19,0.09)",
  },
  laterLabel: { fontSize: 13.5, fontWeight: "500", color: colors.ink },
  laterAction: { fontSize: 12, fontWeight: "500", color: colors.inkMuted },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(25,23,19,0.08)",
  },
  footerText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.inkMuted },

  /**
   * 4b: the digits the scanner did read, kept at the top.
   *
   * Not stored on the copy — a hand-typed pressing is identified by what you typed, and a
   * barcode field would invite the resolver to re-point it at a catalogue release and
   * throw that away. It is here so the number does not have to be read off the sleeve
   * twice, and so you can see the scan worked.
   */
  scanStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "rgba(25,23,19,0.05)",
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.09)",
  },
  scanDigits: { flex: 1, fontFamily: MONO, fontSize: 11.5, color: "rgba(25,23,19,0.65)" },
  scanNote: { fontSize: 11, color: colors.inkSubtle },
});
