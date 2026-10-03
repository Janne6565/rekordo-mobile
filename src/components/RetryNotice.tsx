import { colors, ink } from "@/theme/colors";
import { RotateCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * An upstream that did not answer, and the way to ask it again.
 *
 * The message on its own was a dead end: the archive is paced at one request a second and
 * a cold artist can take the better part of ten, so the failure behind it is usually a
 * moment rather than a state. "Try again in a moment" was telling people to do something
 * the screen gave them no way to do -- short of leaving and coming back, which throws away
 * everything else on it.
 *
 * The button is quiet on purpose. It is a second chance at something that usually works,
 * not an alarm.
 */
export function RetryNotice({
  message,
  onRetry,
  retrying = false,
  compact = false,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  /** Keeps the label honest while the second attempt is on its way. */
  readonly retrying?: boolean;
  /** For the pressings list under a row, where the block sits inside another block. */
  readonly compact?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View style={compact ? styles.compact : styles.block}>
      <Text style={compact ? styles.compactText : styles.text}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: retrying }}
        disabled={retrying}
        onPress={onRetry}
        style={[styles.button, retrying && styles.buttonOff]}
      >
        <RotateCw size={13} color={colors.ink} strokeWidth={2} />
        <Text style={styles.buttonText}>
          {retrying ? t("common.retrying") : t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { padding: 18, gap: 12, alignItems: "flex-start" },
  compact: { paddingVertical: 12, gap: 10, alignItems: "flex-start" },
  text: { fontSize: 13, lineHeight: 19, color: colors.inkMuted },
  compactText: { fontSize: 12, lineHeight: 17, color: colors.inkMuted },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.14),
  },
  buttonOff: { opacity: 0.5 },
  buttonText: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
});
