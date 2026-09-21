import { releaseDisambiguation } from "@/api/releases";
import { ReleaseArt } from "@/components/ReleaseArt";
import { RisingSheet, useSheetBottom } from "@/components/RisingSheet";
import { type AddDestination, useAddSheetLogic } from "@/features/add/useAddSheetLogic";
import { colors, fonts } from "@/theme/colors";
import type { Format, Release } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { Check, ChevronRight, Disc3, Heart, LibraryBig } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

/** The four a person picks between. `OTHER` is a catalogue answer, never a choice. */
const CHIPS: readonly Format[] = ["VINYL", "CD", "CASSETTE", "DIGITAL"];

/**
 * Confirming which copy, before it is written.
 *
 * Screen 6c. One sheet for both destinations, because they ask the same thing of the same
 * record — and the line under the button turns one into the other, which is the cheapest
 * possible fix for pressing the wrong one of two adjacent buttons.
 */
export function AddSheet({
  release,
  destination,
  chosen = true,
  pressingChosen = true,
  prefer,
  onClose,
}: {
  readonly release: Release;
  readonly destination: AddDestination;
  /**
   * Whether `destination` is a choice somebody made, or only where this sheet starts.
   *
   * Pressing the heart or the shelf button on a row is a decision, and the line at the top
   * reads it back. Opening the sheet on a record without having pressed either -- an
   * example tile, anything that is just "add this" -- is not, and announcing "to your
   * shelf" there states a decision on the reader's behalf. The buttons are unaffected:
   * they are still both offered, and pressing one is where the choice actually happens.
   */
  readonly chosen?: boolean;
  /**
   * Whether `release` is a pressing somebody picked, or the record they tapped.
   *
   * False from an artist row or an example tile, where all that was named is an album. The
   * sheet then opens with no pressing chosen and the box offers the list, rather than
   * writing down whichever pressing the catalogue happened to rank first.
   */
  readonly pressingChosen?: boolean;
  /**
   * A format to open on, and to land the pressing on, where the tap named only an album.
   *
   * The example plate passes `VINYL`. See `useAddSheetLogic`.
   */
  readonly prefer?: Format;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const logic = useAddSheetLogic(release, destination, onClose, pressingChosen, prefer);
  const bottom = useSheetBottom(SHEET_PAD);
  const shelf = logic.destination === "SHELF";

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheetHolder} pointerEvents="box-none">
        <RisingSheet style={[styles.sheet, { paddingBottom: bottom }]} onDismiss={onClose}>
          <View style={styles.grabber} />

          {logic.picking ? (
            <>
              <View style={styles.pickerHead}>
                <Text style={styles.serif}>{t("addSheet.whichPressing")}</Text>
                <Pressable accessibilityRole="button" onPress={logic.closePicker}>
                  <Text style={styles.link}>{t("common.cancel")}</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.pickerList}>
                {logic.pressings.map((pressing) => (
                  <PressingRow
                    key={pressing.id}
                    release={pressing}
                    picked={logic.picked.id === pressing.id}
                    onPress={() => logic.pick(pressing)}
                  />
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.eyebrow}>
                {!chosen ? (
                  <Disc3 size={13} color={colors.inkSubtle} strokeWidth={2} />
                ) : shelf ? (
                  <LibraryBig size={13} color={colors.inkSubtle} strokeWidth={2} />
                ) : (
                  <Heart size={13} color={colors.inkSubtle} strokeWidth={2} />
                )}
                <Text style={styles.eyebrowText}>
                  {!chosen
                    ? t("addSheet.addThisRecord")
                    : shelf
                      ? t("addSheet.toYourShelf")
                      : t("addSheet.toYourWishlist")}
                </Text>
              </View>

              <View style={styles.head}>
                <ReleaseArt release={logic.picked} format={logic.format} style={styles.art} />
                <View style={styles.headText}>
                  <Text style={styles.serif}>{logic.picked.title}</Text>
                  <Text style={styles.headMeta}>
                    {[
                      logic.picked.artistName,
                      logic.picked.year === null ? null : String(logic.picked.year),
                      // OTHER is the catalogue saying it does not know, not a format
                      // anybody chose, and printing it as one reads like an answer. A
                      // record reached by typing its name has no format until the chips
                      // below are used, so the line simply leaves it out until then.
                      logic.format === "OTHER" ? null : FORMAT_LABELS[logic.format],
                    ]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>{t("addSheet.pressing")}</Text>
              {/*
                The box is the control, not a label with a link beside it.
                The way to another pressing used to be a small "3 others" line that only
                appeared once the count was known, so on an album the archive answers with
                one row -- anything from Discogs, among others -- there was no way to change
                the pressing and nothing saying why. Now the box always reports where it
                stands: a chevron and a count when there is a choice, a plain line when the
                archive genuinely holds only this one.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("addSheet.whichPressing")}
                accessibilityState={{ disabled: !logic.canPick }}
                disabled={!logic.canPick}
                onPress={logic.openPicker}
                style={[styles.pressing, logic.canPick && styles.pressingPickable]}
              >
                <View style={styles.headText}>
                  <View style={styles.pressingTitleRow}>
                    <Text style={styles.pressingTitle}>
                      {logic.hasPressing
                        ? [
                            FORMAT_LABELS[logic.picked.format],
                            logic.picked.year === null ? null : String(logic.picked.year),
                          ]
                            .filter((part) => part !== null)
                            .join(" · ")
                        : t("addSheet.noPressing")}
                    </Text>
                    {logic.isGuess && (
                      <View style={styles.guess}>
                        <Text style={styles.guessText}>{t("addSheet.firstListed")}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.pressingMeta}>
                    {logic.hasPressing
                      ? releaseDisambiguation(logic.picked) || t("addSheet.noCatalog")
                      : t("addSheet.noPressingMeta")}
                  </Text>
                </View>
                {logic.loadingPressings ? (
                  <ActivityIndicator size="small" color={colors.inkSubtle} />
                ) : logic.canPick ? (
                  <View style={styles.pressingPick}>
                    <Text style={styles.link}>
                      {logic.hasPressing
                        ? t("addSheet.others", { count: logic.others })
                        : t("addSheet.choosePressing", { count: logic.pressings.length })}
                    </Text>
                    <ChevronRight size={15} color={colors.accent} strokeWidth={2} />
                  </View>
                ) : (
                  <Text style={styles.pressingOnly}>
                    {logic.hasPressing ? t("addSheet.onlyPressing") : t("addSheet.noneListed")}
                  </Text>
                )}
              </Pressable>

              <Text style={styles.label}>{t("addSheet.format")}</Text>
              <View style={styles.chips}>
                {CHIPS.map((chip) => (
                  <Pressable
                    key={chip}
                    accessibilityRole="button"
                    accessibilityState={{ selected: logic.format === chip }}
                    onPress={() => logic.setFormat(chip)}
                    style={[styles.chip, logic.format === chip && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, logic.format === chip && styles.chipTextOn]}>
                      {FORMAT_LABELS[chip]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={logic.save}
                disabled={logic.saving}
                style={[styles.primary, logic.saving && styles.primaryOff]}
              >
                <Check size={17} color="#ffffff" strokeWidth={2.2} />
                <Text style={styles.primaryText}>
                  {shelf ? t("addSheet.addToShelf") : t("addSheet.addToWishlist")}
                </Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={logic.flip}>
                <Text style={styles.flip}>
                  {shelf ? t("addSheet.wishlistInstead") : t("addSheet.shelfInstead")}
                </Text>
              </Pressable>
            </>
          )}
        </RisingSheet>
      </View>
    </Modal>
  );
}

/**
 * One pressing in the picker.
 *
 * No badge on the first row. It used to say "best guess", which nothing here had earned:
 * the order is the catalogue's, and the check already says which one is picked.
 */
function PressingRow({
  release,
  picked,
  onPress,
}: {
  readonly release: Release;
  readonly picked: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.pressing, styles.pressingRow, picked && styles.pressingOn]}
    >
      <ReleaseArt release={release} format={release.format} style={styles.pressingArt} />
      <View style={styles.headText}>
        <View style={styles.pressingTitleRow}>
          <Text style={styles.pressingTitle}>
            {[FORMAT_LABELS[release.format], release.year === null ? null : String(release.year)]
              .filter((part) => part !== null)
              .join(" · ")}
          </Text>
        </View>
        <Text style={styles.pressingMeta}>{releaseDisambiguation(release)}</Text>
      </View>
      {picked && <Check size={17} color={colors.ink} strokeWidth={2.2} />}
    </Pressable>
  );
}

/** What the panel sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 30;

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  // Covers the whole screen, behind the panel as well as above it: as a `flex: 1`
  // sibling it only filled the space the sheet left over, so the strip the rising
  // panel was about to occupy stayed undimmed while it travelled.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(25,23,19,0.35)" },
  // `box-none` so a tap above the panel still reaches the scrim underneath it.
  sheetHolder: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    marginHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.09)",
    borderBottomWidth: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: SHEET_PAD,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(25,23,19,0.16)",
    alignSelf: "center",
    marginBottom: 16,
  },

  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrowText: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  head: { flexDirection: "row", gap: 14, marginTop: 14 },
  art: { width: 79, height: 66 },
  headText: { flex: 1, minWidth: 0 },
  serif: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 25, color: colors.ink },
  headMeta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.inkMuted, marginTop: 3 },

  label: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 16,
  },
  pressing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  /* A choice reads as one: the accent edge is the app's way of saying "this opens". */
  pressingPickable: { borderColor: colors.accent },
  pressingPick: { flexDirection: "row", alignItems: "center", gap: 4 },
  pressingOnly: { fontSize: 11, color: colors.inkSubtle, maxWidth: 92, textAlign: "right" },
  pressingRow: { borderWidth: 1, borderColor: "rgba(25,23,19,0.1)", marginBottom: 8 },
  pressingOn: { borderWidth: 1.5, borderColor: colors.ink },
  pressingArt: { width: 60, height: 50 },
  pressingTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  pressingTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  pressingMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  guess: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "rgba(162,87,58,0.14)",
  },
  guessText: {
    fontFamily: MONO,
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "600",
    color: colors.accentStrong,
  },
  link: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "500", color: colors.accent },

  pickerHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  pickerList: { marginTop: 12, maxHeight: 400 },

  chips: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8, flexWrap: "wrap" },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.12)",
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "500", color: colors.inkMuted },
  chipTextOn: { color: "#ffffff", fontWeight: "600" },

  primary: {
    height: 52,
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryOff: { opacity: 0.5 },
  primaryText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: "#ffffff" },
  flip: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    fontWeight: "500",
    color: colors.accent,
    textAlign: "center",
    marginTop: 13,
  },
});
