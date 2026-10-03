import { useHandleClaimLogic } from "@/features/friends/useSharingLogic";
import { accent, accentStrong, colors, fonts } from "@/theme/colors";
import { Check, Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/**
 * Screen 15e — shown once, the first time Friends is opened.
 *
 * Not part of signing up: the app is a collection tracker first, and an account that never
 * opens Friends never needs a handle. Which is why this is a panel inside the tab rather
 * than a modal over the app — nothing else is blocked while it is up.
 */
export function ClaimHandlePanel() {
  const { t } = useTranslation();
  const logic = useHandleClaimLogic();
  const reason = logic.check?.available === false ? logic.check.reason : undefined;

  return (
    <View style={styles.panel}>
      <View style={styles.badge}>
        <Users size={19} color={colors.accent} strokeWidth={1.75} />
      </View>
      <Text style={styles.title}>{t("friends.claim.title")}</Text>
      <Text style={styles.body}>{t("friends.claim.body")}</Text>

      <View style={[styles.field, reason !== undefined && styles.fieldBad]}>
        <Text style={styles.at}>@</Text>
        <TextInput
          value={logic.value}
          onChangeText={logic.setValue}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel={t("friends.claim.label")}
          style={styles.input}
        />
        {logic.checking && <ActivityIndicator size="small" color={colors.inkSubtle} />}
        {!logic.checking && logic.check?.available === true && (
          <Check size={18} color={colors.accent} strokeWidth={2.4} />
        )}
      </View>

      <Text style={[styles.hint, reason !== undefined && styles.hintBad]}>
        {reason !== undefined ? t(REASON_KEYS[reason]) : t("friends.claim.rules")}
      </Text>

      <Pressable
        onPress={() => logic.claim.mutate()}
        disabled={!logic.canClaim}
        style={[styles.button, !logic.canClaim && styles.buttonDisabled]}
      >
        <Text style={styles.buttonLabel}>
          {t("friends.claim.action", { handle: logic.cleaned === "" ? "…" : logic.cleaned })}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Spelled out rather than built from the reason at runtime: the translation keys are typed,
 * and a key assembled from a string is one the compiler cannot check exists.
 */
const REASON_KEYS = {
  MALFORMED: "friends.claim.reason.malformed",
  TAKEN: "friends.claim.reason.taken",
  RESERVED: "friends.claim.reason.reserved",
  OK: "friends.claim.reason.ok",
} as const;

const styles = StyleSheet.create({
  panel: { padding: 24, gap: 0 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: accent(0.1),
    marginBottom: 16,
  },
  title: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  body: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.inkMuted,
    marginTop: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 20,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  fieldBad: { borderColor: accentStrong(0.45) },
  at: { fontFamily: fonts.sans, fontSize: 16, color: colors.inkSubtle },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.ink, padding: 0 },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 8,
  },
  hintBad: { color: colors.accentStrong },
  button: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: colors.paper },
});
