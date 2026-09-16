import { RisingSheet, useSheetBottom } from "@/components/RisingSheet";
import { CURRENCIES, type CurrencyCode, currencyChipLabel } from "@/domain/currency";
import { formatRelativeTime } from "@/domain/relativeTime";
import { useSettingsLogic } from "@/features/settings/useSettingsLogic";
import type { AppLanguage } from "@/local/settings";
import { colors, fonts } from "@/theme/colors";
import { useRouter } from "expo-router";
import { Check, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Screen 20h — Settings, stacked off the You tab.
 *
 * Same six preferences as the web, drawn for a phone: the pickers open as sheets rather
 * than dropping a menu, and each sheet repeats the scope in one line above the list —
 * because a picker opened from a tap is exactly where the wrong assumption gets made.
 */
export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const logic = useSettingsLogic();
  const values = logic.values;
  const [picking, setPicking] = useState<"appLanguage" | "documentLanguage" | "currency" | null>(
    null,
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <ChevronLeft size={20} color={colors.ink} strokeWidth={1.75} />
        </Pressable>
        <Text style={styles.barTitle}>{t("nav.settings")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.scope}>
          {logic.signedIn ? t("settings.scope.signedIn") : t("settings.scope.anonymous")}
        </Text>

        <Text style={styles.sectionLabel}>{t("settings.section.languageCurrency")}</Text>
        <View style={styles.card}>
          <PickerRow
            title={t("settings.appLanguage.title")}
            body={
              values === undefined
                ? undefined
                : values.appLanguage === "system"
                  ? t("settings.appLanguage.following", {
                      language: t(
                        `settings.language.${i18n.language.startsWith("en") ? "en" : "de"}`,
                      ),
                    })
                  : t("settings.appLanguage.chosen")
            }
            value={
              values === undefined
                ? ""
                : t(`settings.appLanguage.option.${values.appLanguage}` as never)
            }
            state={logic.state("appLanguage")}
            failure={t("settings.appLanguage.failed", {
              value: t(`settings.appLanguage.option.${values?.appLanguage ?? "system"}` as never),
            })}
            onPress={() => setPicking("appLanguage")}
          />
          <View style={styles.divider} />
          {/* Its own row rather than folded into the one above: German is the binding
              original of these documents and English a translation of it, so which one you
              read is a different question from which language the buttons are in. */}
          <PickerRow
            title={t("settings.documents.title")}
            body={values === undefined ? undefined : t("settings.documents.body")}
            value={values === undefined ? "" : t(`settings.language.${values.documentLanguage}`)}
            state={logic.state("documentLanguage")}
            failure={t("settings.documents.failed", {
              value: t(`settings.language.${values?.documentLanguage ?? "de"}`),
            })}
            onPress={() => setPicking("documentLanguage")}
          />
          <View style={styles.divider} />
          {/* "For new copies" lives in the title, not the help text, so the scope survives
              being skim-read (20d). Nothing on this row can change a copy already saved. */}
          <PickerRow
            title={t("settings.currency.title")}
            body={
              values === undefined
                ? undefined
                : t("settings.currency.body", { count: logic.copyCount })
            }
            value={values?.currency ?? ""}
            state={logic.state("currency")}
            failure={t("settings.currency.failed", { value: values?.currency ?? "EUR" })}
            onPress={() => setPicking("currency")}
          />
        </View>

        <Text style={styles.sectionLabel}>{t("settings.section.storageSync")}</Text>
        <View style={styles.card}>
          {/* 20g: with no account there is nothing to sync to, so the row becomes the
              invitation rather than a switch that would do nothing. */}
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t("settings.sync.title")}</Text>
              <Text style={styles.rowBody}>
                {!logic.signedIn
                  ? t("settings.sync.anonymous", { count: logic.copyCount })
                  : values === undefined
                    ? " "
                    : values.lastSyncedAt === null
                      ? t("settings.sync.never")
                      : t("settings.sync.lastSynced", {
                          when: formatRelativeTime(values.lastSyncedAt, i18n.language),
                        })}
              </Text>
            </View>
            {logic.signedIn ? (
              <Switch
                value={values?.syncEnabled ?? true}
                onValueChange={logic.setSyncEnabled}
                trackColor={{ true: colors.ink, false: colors.line }}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/(tabs)/you")}
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonLabel}>{t("settings.sync.signIn")}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t("settings.local.title")}</Text>
              <Text style={styles.rowBody}>{t("settings.local.bodyPhone")}</Text>
            </View>
            {/* Fixed on, and honest about it: every screen reads from the local store, so a
                switch that turned it off would break reading rather than move data. */}
            <Switch
              value
              disabled
              trackColor={{ true: colors.ink, false: colors.line }}
              accessibilityLabel={`${t("settings.local.title")}, ${t("settings.local.always")}`}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowTitle,
                  values?.recentSearches === 0 && logic.cleared === null && styles.dimmed,
                ]}
              >
                {t("settings.searches.title")}
              </Text>
              <Text style={styles.rowBody}>
                {values === undefined
                  ? " "
                  : values.recentSearches === 0
                    ? t("settings.searches.emptyPhone")
                    : t("settings.searches.bodyPhone", { count: values.recentSearches })}
              </Text>
            </View>
            {logic.cleared !== null ? (
              <Text style={styles.acknowledgement}>
                {t("settings.searches.cleared", { count: logic.cleared })}
              </Text>
            ) : values !== undefined && values.recentSearches > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={logic.clearSearches}
                style={styles.destructiveButton}
              >
                <Text style={styles.destructiveLabel}>{t("settings.searches.clear")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={styles.footnote}>{t("settings.footnote.savesPhone")}</Text>
      </ScrollView>

      <PickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={
          picking === "currency"
            ? t("settings.currency.title")
            : picking === "documentLanguage"
              ? t("settings.documents.title")
              : t("settings.appLanguage.title")
        }
        /* The scope is repeated here on purpose: this sheet is where somebody decides what
           the setting means, and the row's help text is off-screen behind it. */
        note={
          picking === "currency"
            ? t("settings.currency.sheetNote", { count: logic.copyCount })
            : picking === "documentLanguage"
              ? t("settings.documents.body")
              : t("settings.appLanguage.sheetNote")
        }
        footnote={picking === "currency" ? t("settings.currency.sheetFootnote") : undefined}
        options={
          picking === "currency"
            ? CURRENCIES.map((code) => ({ value: code, label: currencyChipLabel(code) }))
            : picking === "documentLanguage"
              ? (["de", "en"] as const).map((value) => ({
                  value,
                  label: t(`settings.language.${value}`),
                }))
              : (["system", "de", "en"] as const).map((value) => ({
                  value,
                  label: t(`settings.appLanguage.option.${value}`),
                }))
        }
        selected={
          picking === "currency"
            ? (values?.currency ?? "EUR")
            : picking === "documentLanguage"
              ? (values?.documentLanguage ?? "de")
              : (values?.appLanguage ?? "system")
        }
        onChoose={(value) => {
          if (picking === "currency") logic.setCurrency(value as CurrencyCode);
          if (picking === "documentLanguage")
            logic.setDocumentLanguage(value === "en" ? "en" : "de");
          if (picking === "appLanguage") logic.setAppLanguage(value as AppLanguage);
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}

/**
 * A row whose value opens a sheet, in whichever of the three states it is in (20b).
 *
 * Loading keeps the title and shimmers nothing — on a phone the read is a single SQLite
 * query and the placeholder would flash — but it does keep the row's height, so the list
 * does not jump. A failure keeps the *stored* value and names it underneath.
 */
function PickerRow({
  title,
  body,
  value,
  state,
  failure,
  onPress,
}: {
  readonly title: string;
  readonly body: string | undefined;
  readonly value: string;
  readonly state: "idle" | "saved" | "failed";
  readonly failure: string;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowBody}>{body ?? " "}</Text>
        </View>
        {state === "saved" && <Text style={styles.acknowledgement}>{t("settings.saved")}</Text>}
        <Text style={styles.value}>{value}</Text>
        <ChevronRight size={16} color={colors.inkSubtle} strokeWidth={1.75} />
      </Pressable>
      {state === "failed" && (
        <View style={styles.failure}>
          <Text style={styles.failureText}>{failure}</Text>
        </View>
      )}
    </View>
  );
}

function PickerSheet({
  open,
  onClose,
  title,
  note,
  footnote,
  options,
  selected,
  onChoose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly note: string;
  readonly footnote?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly selected: string;
  readonly onChoose: (value: string) => void;
}) {
  const bottom = useSheetBottom(SHEET_PAD);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheetHolder} pointerEvents="box-none">
        <RisingSheet
          visible={open}
          style={[styles.sheet, { paddingBottom: bottom }]}
          onDismiss={onClose}
        >
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetNote}>{note}</Text>
          <View style={styles.sheetCard}>
            {options.map((option, index) => (
              <View key={option.value}>
                {index > 0 && <View style={styles.divider} />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onChoose(option.value)}
                  style={styles.sheetRow}
                >
                  <Text style={styles.sheetLabel}>{option.label}</Text>
                  {option.value === selected && (
                    <Check size={16} color={colors.accent} strokeWidth={2.25} />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
          {footnote !== undefined && <Text style={styles.sheetFootnote}>{footnote}</Text>}
        </RisingSheet>
      </View>
    </Modal>
  );
}

/** What the option sheet sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 34;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  barTitle: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  scope: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.inkMuted,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 22,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: colors.line },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowBody: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 2,
  },
  dimmed: { color: colors.inkMuted },
  value: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: "600", color: colors.inkMuted },
  acknowledgement: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.accent,
  },
  failure: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(162,87,58,0.06)",
    borderTopWidth: 1,
    borderTopColor: "rgba(162,87,58,0.18)",
  },
  failureText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.accentStrong,
  },
  smallButton: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.ink },
  destructiveButton: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(162,87,58,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  destructiveLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "600",
    color: colors.accentStrong,
  },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkSubtle,
    marginTop: 16,
  },
  // Covers the whole screen, behind the panel as well as above it: as a `flex: 1`
  // sibling it only filled the space the sheet left over, so the strip the rising
  // panel was about to occupy stayed undimmed while it travelled.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(25,23,19,0.35)" },
  // `box-none` so a tap above the panel still reaches the scrim underneath it.
  sheetHolder: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: SHEET_PAD,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  sheetNote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 6,
    marginBottom: 14,
  },
  sheetCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sheetLabel: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  sheetFootnote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.inkSubtle,
    marginTop: 12,
  },
});
