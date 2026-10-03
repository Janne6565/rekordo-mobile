import { EmailAuthSheet } from "@/features/auth/EmailAuthSheet";
import { ProviderMark } from "@/features/auth/ProviderMark";
import type { useAccountLogic } from "@/features/auth/useAccountLogic";
import { colors, fonts, ink } from "@/theme/colors";
import { Disc3, Mail } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * The signed-out You tab — design 1b.
 *
 * Not a form any more. Three ways in, in the order people actually use them: the two
 * providers as marked pills, then an address behind {@link EmailAuthSheet}. Signing in
 * with a provider is one tap and needs no keyboard, so putting two text fields above those
 * buttons was making the common path scroll past the rare one.
 *
 * "Use it without an account" is gone with it. On a phone the app is already running
 * locally — the collection below these buttons is proof of it — so a button offering what
 * the person is currently doing was answering a question nobody had asked.
 */
export function AuthForm({ logic }: { readonly logic: ReturnType<typeof useAccountLogic> }) {
  const { t } = useTranslation();
  const [emailOpen, setEmailOpen] = useState(false);
  const registering = logic.mode === "REGISTER";

  /** Opening the sheet in the other mode, from the line under the buttons. */
  const switchMode = () => {
    logic.setMode(registering ? "SIGN_IN" : "REGISTER");
  };

  return (
    <View style={styles.root}>
      <View style={styles.logo}>
        <Disc3 size={26} color={colors.paper} strokeWidth={1.6} />
      </View>
      <Text style={styles.title}>
        {registering ? t("auth.createTitle") : t("auth.signInTitle")}
      </Text>
      <Text style={styles.lede}>{registering ? t("auth.createLede") : t("auth.signInLede")}</Text>

      {/* The provider buttons have no form to put tick boxes in, so the agreement is stated
          beside them instead. The account they create records the same consent a password
          sign-up does. */}
      {registering && logic.providers.length > 0 && (
        <Text style={styles.providerConsent}>{t("auth.providerConsent")}</Text>
      )}

      {logic.providers.map((provider) => (
        <Pressable
          key={provider.id}
          accessibilityRole="button"
          // Opened in the system browser: the provider will refuse an embedded webview,
          // and the system browser is where any existing session already lives. The
          // browser hands control back to the app when it is done.
          onPress={() => void logic.signInWith(provider.id)}
          disabled={logic.busy}
          style={[styles.provider, logic.busy && styles.dim]}
        >
          <ProviderMark providerId={provider.id} />
          <Text style={styles.providerText}>
            {t("auth.continueWith", { provider: provider.displayName })}
          </Text>
        </Pressable>
      ))}

      {logic.providers.length > 0 && (
        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>{t("auth.or")}</Text>
          <View style={styles.rule} />
        </View>
      )}

      {/* Outlined rather than filled, and a shade darker than the provider pills: the
          providers hand you off, this one opens a form. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setEmailOpen(true)}
        style={styles.withEmail}
      >
        <Mail size={17} color={colors.inkMuted} strokeWidth={1.75} />
        <Text style={styles.withEmailText}>
          {registering ? t("auth.createWithEmail") : t("auth.withEmail")}
        </Text>
      </Pressable>

      {/* Whatever the browser round trip came back with. The sheet prints the same list
          while it is open, so this is only ever a provider's answer. */}
      {!emailOpen &&
        logic.failed.map((error) => (
          <Text key={error} style={styles.error} accessibilityRole="alert">
            {t(`auth.error.${error}` as "auth.error.generic")}
          </Text>
        ))}
      {logic.busy && !emailOpen && <ActivityIndicator color={colors.inkMuted} />}

      <Pressable accessibilityRole="button" onPress={switchMode}>
        <Text style={styles.switchMode}>
          {registering ? t("auth.haveAccount") : t("auth.needAccount")}
        </Text>
      </Pressable>

      {emailOpen && <EmailAuthSheet logic={logic} onClose={() => setEmailOpen(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.serif, fontSize: 34, color: colors.ink },
  lede: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, marginTop: -8 },
  providerConsent: { fontSize: 11, lineHeight: 17, color: colors.inkSubtle, marginBottom: -4 },
  provider: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.14),
  },
  providerText: { fontSize: 14.5, fontWeight: "600", color: colors.ink },
  dim: { opacity: 0.5 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dividerText: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  withEmail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    height: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ink(0.28),
  },
  withEmailText: { fontSize: 14.5, fontWeight: "600", color: colors.ink },
  error: { fontSize: 13, color: colors.accent, textAlign: "center" },
  switchMode: { textAlign: "center", fontSize: 13, color: colors.inkMuted, marginTop: 4 },
});
