import { ScrimSheet } from "@/components/ScrimSheet";
import { colors, fonts, ink, isDark } from "@/theme/colors";
import { EyeOff, type LucideIcon, Moon, RotateCw, Sun } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Easing, Pressable, StyleSheet, Text, View } from "react-native";

/** What the restart is for: the switch either way, or the seven taps that hide the section. */
export type RestartReason = "ON" | "OFF" | "HIDE";

const ICON: Record<RestartReason, LucideIcon> = { ON: Moon, OFF: Sun, HIDE: EyeOff };

/**
 * Screen 1d: the restart the hidden dark mode takes, asked first.
 *
 * The 3a-x sheet with a lighter question: Restart is the accent pill, not accentStrong,
 * since nothing is removed, and Cancel sits below it, nearest the thumb. Scrim, swipe down
 * and Android back all cancel.
 */
export function RestartSheet({
  reason,
  onRestart,
  onCancel,
}: {
  /** Null while nothing is being asked. */
  readonly reason: RestartReason | null;
  readonly onRestart: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  const shown = reason ?? "ON";
  const Icon = ICON[shown];
  const key = shown === "ON" ? "on" : shown === "OFF" ? "off" : "hide";

  return (
    <ScrimSheet
      open={reason !== null}
      onClose={onCancel}
      scrimColor={isDark ? "rgba(0,0,0,0.6)" : "rgba(25,23,19,0.32)"}
      sheetStyle={styles.sheet}
      design={SHEET_PAD}
      exitMs={EXIT_MS}
      exitEasing={EXIT_EASING}
    >
      {(close) => (
        <View accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.eyebrow}>
            <Icon size={13} color={colors.accent} strokeWidth={1.9} />
            <Text style={styles.eyebrowText}>
              {shown === "HIDE" ? t("legal.appearance.title") : t("legal.appearance.darkMode")}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t(`legal.appearance.restart.${key}.title`)}
          </Text>
          <Text style={styles.body}>{t(`legal.appearance.restart.${key}.body`)}</Text>
          <View style={styles.answers}>
            <Pressable
              accessibilityRole="button"
              onPress={() => close(onRestart)}
              style={({ pressed }) => [styles.restart, pressed && styles.pressed]}
            >
              <RotateCw size={16} color={colors.onInk} strokeWidth={1.9} />
              <Text style={styles.restartText}>
                {shown === "HIDE"
                  ? t("legal.appearance.restart.hideAction")
                  : t("legal.appearance.restart.action")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => close(onCancel)}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>{t("legal.appearance.restart.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrimSheet>
  );
}

/** The deck's close, shared with the remove sheet: a 320ms drop on its own curve. */
const EXIT_MS = 320;
const EXIT_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_PAD = 42;
const MONO = "ui-monospace";

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: SHEET_PAD,
    shadowColor: colors.shadow,
    shadowOpacity: isDark ? 0.5 : 0.18,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
    // On a dark page the shadow has nothing to fall on, so the panel gets an edge instead.
    ...(isDark ? { borderTopWidth: 1, borderTopColor: ink(0.07) } : {}),
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: ink(0.16),
    marginBottom: 18,
  },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 7 },
  eyebrowText: {
    fontFamily: MONO,
    fontSize: 9.5,
    fontWeight: "500",
    letterSpacing: 0.95,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
    marginTop: 10,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: ink(0.6),
    marginTop: 9,
  },
  answers: { gap: 10, marginTop: 22 },
  restart: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  restartText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: colors.onInk },
  cancel: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: colors.ink },
  pressed: { opacity: 0.85 },
});
