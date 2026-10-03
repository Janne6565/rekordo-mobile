import { fonts, palettes } from "@/theme/colors";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, StyleSheet, Text } from "react-native";

/** The veil's fades: in before the reload, out once the screen behind it is back. */
export const VEIL_IN_MS = 150;
export const VEIL_OUT_MS = 250;

/**
 * Screen 1d-v: the restart second.
 *
 * The new paper with the wordmark, over everything. It fades in before the reload and the
 * reloaded app starts under it, then it fades out over Legal -- so the old palette never
 * flashes during the relaunch. It paints the mode being switched *to*, which is why it reads
 * the palettes directly rather than `colors`, which still holds the one being left.
 */
export function RestartVeil({
  dark,
  visible,
  onShown,
}: {
  /** Which mode the app is going into. */
  readonly dark: boolean;
  readonly visible: boolean;
  /** Once fully faded in: the moment to reload. */
  readonly onShown?: () => void;
}) {
  const { t } = useTranslation();
  const palette = dark ? palettes.dark : palettes.light;
  // Starts opaque when it opens over a fresh start, transparent when it fades in over a screen.
  const opacity = useRef(new Animated.Value(onShown === undefined ? 1 : 0)).current;
  const shown = useRef(onShown);
  shown.current = onShown;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? VEIL_IN_MS : VEIL_OUT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && visible) shown.current?.();
    });
  }, [visible, opacity]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.veil, { backgroundColor: palette.paper, opacity }]}
    >
      <Text style={[styles.wordmark, { color: palette.ink }]}>Rekordo</Text>
      <Text style={[styles.mode, { color: palette.inkSubtle }]}>
        {dark ? t("legal.appearance.darkMode") : t("legal.appearance.lightMode")}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 1000,
    elevation: 1000,
  },
  wordmark: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 38 },
  mode: {
    fontFamily: "ui-monospace",
    fontSize: 9.5,
    fontWeight: "500",
    letterSpacing: 0.95,
    textTransform: "uppercase",
  },
});
