import { ScrimSheet } from "@/components/ScrimSheet";
import { colors, fonts, ink } from "@/theme/colors";
import { LibraryBig, type LucideIcon } from "lucide-react-native";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Easing, Pressable, StyleSheet, Text, View } from "react-native";

/** One line of "Goes with it": a label, and either a value on the right or a note under it. */
export interface RemoveRow {
  readonly key: string;
  readonly label: string;
  readonly value?: ReactNode;
  /** Free text the person typed; two lines of it, under the label. */
  readonly note?: string;
}

/**
 * Screens 3a-x and 16b-x: one sheet asking before a copy or a wish is removed.
 *
 * The 2d-ii frame with different contents: the question, the thing itself, then "Goes with
 * it" listing only the fields that hold data, so the cost is visible before the answer. A
 * sparse record gets no list at all and the sheet shrinks to the release and the answers.
 *
 * Keep is the bottom button, where the thumb rests after tapping the screen's Remove; the
 * destructive answer sits one row up, and ignores taps for its first `ARMED_AFTER_MS` so a
 * double tap on the screen's button cannot carry through to it. Every other way out keeps.
 */
export function RemoveSheet({
  open,
  onClose,
  onConfirm,
  over,
  title,
  art,
  name,
  meta,
  subMeta,
  rows,
  stays,
  confirmLabel,
  confirmIcon: ConfirmIcon,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  /** What the sheet rises over: the dark cover chrome of 3a, or the paper of 16b. */
  readonly over: "DARK" | "PAPER";
  readonly title: string;
  readonly art: ReactNode;
  readonly name: string;
  readonly meta: string;
  readonly subMeta?: string;
  readonly rows: readonly RemoveRow[];
  /** The other copies of the release, which this removal leaves alone. */
  readonly stays?: { readonly title: string; readonly line: string };
  readonly confirmLabel: string;
  readonly confirmIcon: LucideIcon;
}) {
  const { t } = useTranslation();
  const openedAt = useRef(0);
  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open]);

  return (
    <ScrimSheet
      open={open}
      onClose={onClose}
      scrimColor={over === "DARK" ? "rgba(0,0,0,0.5)" : "rgba(25,23,19,0.32)"}
      sheetStyle={over === "DARK" ? styles.sheet : [styles.sheet, styles.sheetOnPaper]}
      design={SHEET_PAD}
      exitMs={EXIT_MS}
      exitEasing={EXIT_EASING}
    >
      {(close) => (
        <>
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          <View style={styles.release}>
            <View style={styles.art}>{art}</View>
            <View style={styles.releaseText}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
              {subMeta !== undefined && <Text style={styles.subMeta}>{subMeta}</Text>}
            </View>
          </View>

          {rows.length > 0 && (
            <>
              <Text style={styles.label}>{t("remove.goesWithIt")}</Text>
              <View style={styles.card}>
                {rows.map((row, index) => (
                  <View key={row.key} style={[styles.row, index > 0 && styles.rowRuled]}>
                    {row.note === undefined ? (
                      <View style={styles.rowLine}>
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        {typeof row.value === "string" ? (
                          <Text style={styles.rowValue}>{row.value}</Text>
                        ) : (
                          row.value
                        )}
                      </View>
                    ) : (
                      <>
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        <Text style={styles.rowNote} numberOfLines={2}>
                          {row.note}
                        </Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {stays !== undefined && (
            <View style={styles.stays}>
              <LibraryBig size={16} color={colors.inkMuted} strokeWidth={1.75} />
              <View style={styles.releaseText}>
                <Text style={styles.staysTitle}>{stays.title}</Text>
                <Text style={styles.staysLine} numberOfLines={2}>
                  {stays.line}
                </Text>
              </View>
            </View>
          )}

          <View style={[styles.answers, rows.length === 0 && styles.answersBare]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (Date.now() - openedAt.current < ARMED_AFTER_MS) return;
                close(onConfirm);
              }}
              style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}
            >
              <ConfirmIcon size={16} color={colors.onInk} strokeWidth={1.9} />
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => close(onClose)}
              style={({ pressed }) => [styles.keep, pressed && styles.pressed]}
            >
              <Text style={styles.keepText}>{t("remove.keep")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrimSheet>
  );
}

/** How long the destructive answer ignores taps after the sheet opens. */
const ARMED_AFTER_MS = 400;
/** The deck's close: a slower drop than a swipe-down, on its own curve. */
const EXIT_MS = 320;
const EXIT_EASING = Easing.bezier(0.32, 0.72, 0, 1);
/** What the sheet sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 42;
const MONO = "ui-monospace";
const RULE = colors.line;

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: SHEET_PAD,
  },
  // Over the paper of 16b the scrim is light, so the panel needs its own edge.
  sheetOnPaper: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: ink(0.16),
    marginBottom: 18,
  },
  title: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28, color: colors.ink },
  release: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 14 },
  art: { width: 72, height: 60 },
  releaseText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.inkMuted, marginTop: 2 },
  subMeta: {
    fontFamily: MONO,
    fontSize: 10.5,
    fontWeight: "500",
    color: colors.inkSubtle,
    marginTop: 3,
  },
  label: {
    fontFamily: MONO,
    fontSize: 9.5,
    fontWeight: "500",
    letterSpacing: 0.95,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: RULE,
    overflow: "hidden",
  },
  row: { paddingHorizontal: 14, paddingVertical: 11 },
  rowRuled: { borderTopWidth: 1, borderTopColor: RULE },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 18 },
  rowLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.inkMuted },
  rowValue: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  rowNote: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
    marginTop: 3,
  },
  stays: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ink(0.04),
  },
  staysTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  staysLine: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  answers: { gap: 10, marginTop: 20 },
  answersBare: { marginTop: 22 },
  confirm: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.accentStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: colors.onInk },
  keep: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  keepText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: colors.ink },
  pressed: { opacity: 0.85 },
});
