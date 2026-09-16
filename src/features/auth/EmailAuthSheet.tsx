import { KeyboardLift } from "@/components/KeyboardLift";
import { RisingSheet, useSheetBottom } from "@/components/RisingSheet";
import { ChallengeGate } from "@/features/auth/ChallengeGate";
import type { useAccountLogic } from "@/features/auth/useAccountLogic";
import { colors, fonts } from "@/theme/colors";
import { passwordStrength } from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import { Check, Eye, EyeOff, Lock, Mail, User, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/**
 * The e-mail half of signing in, in a sheet (design 1b).
 *
 * The tab itself is now three buttons rather than two fields: Google, Apple, and a way in
 * with an address. Almost nobody uses the third, and it was the only part of the screen
 * that needed a keyboard — so it moved down here, where it can have one without the rest
 * of the tab arranging itself around it.
 *
 * Both modes live in the same sheet because they are the same form with two more fields:
 * splitting them would have duplicated the address, the password and every error line for
 * the sake of a heading.
 */
export function EmailAuthSheet({ logic, onClose }: EmailAuthSheetProps) {
  const { t } = useTranslation();
  const registering = logic.mode === "REGISTER";
  const bottom = useSheetBottom(SHEET_PAD);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        style={styles.scrim}
      />
      <KeyboardLift style={styles.holder}>
        <RisingSheet style={styles.sheet} onDismiss={onClose}>
          <View style={styles.grabber} />
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {registering ? t("auth.createTitle") : t("auth.withEmail")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                onPress={onClose}
                hitSlop={10}
              >
                <X size={19} color={colors.inkSubtle} strokeWidth={1.75} />
              </Pressable>
            </View>

            {registering && (
              <Field
                label={t("auth.name")}
                icon={<User size={17} color={colors.inkSubtle} strokeWidth={1.75} />}
                value={logic.displayName}
                onChangeText={logic.setDisplayName}
                textContentType="name"
                placeholder={t("auth.namePlaceholder")}
              />
            )}

            <Field
              label={t("auth.email")}
              icon={<Mail size={17} color={colors.inkSubtle} strokeWidth={1.75} />}
              value={logic.email}
              onChangeText={logic.setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
              placeholder={t("auth.emailPlaceholder")}
            />

            <PasswordInput logic={logic} registering={registering} />

            {registering ? (
              <View style={styles.consents}>
                <Toggle checked={logic.agreed} onPress={() => logic.setAgreed(!logic.agreed)}>
                  {t("auth.agreeTerms")}
                </Toggle>
                <ConsentLinks onNavigate={onClose} />
                <Toggle
                  checked={logic.ageConfirmed}
                  onPress={() => logic.setAgeConfirmed(!logic.ageConfirmed)}
                >
                  {t("auth.confirmAge")}
                </Toggle>
              </View>
            ) : (
              <Toggle
                checked={logic.rememberMe}
                onPress={() => logic.setRememberMe(!logic.rememberMe)}
              >
                {t("auth.rememberMe")}
              </Toggle>
            )}

            {/* One widget for all three actions the sheet can take. It re-draws itself when
                the action changes, because a token is only good for the endpoint it was
                solved for. */}
            <ChallengeGate challenge={logic.challenge} />

            {logic.failed.map((error) => (
              <Text key={error} style={styles.error} accessibilityRole="alert">
                {errorText(error, t)}
              </Text>
            ))}
            {logic.resetSent && <Text style={styles.notice}>{t("auth.forgotSent")}</Text>}
            {/* 21f: the one place the cost of an unconfirmed address is stated. It belongs
                beside the Forgot? that would run into it -- the reset endpoint has to stay
                silent, so it can never be the thing that explains. */}
            {!registering && <Text style={styles.footnote}>{t("auth.resetNeedsConfirmed")}</Text>}

            {logic.resetting ? (
              /*
               * "Forgot?" cannot fire off a press any more: the reset endpoint wants a token
               * solved for its own action, so the widget above has to be answered first. Two
               * taps instead of one, which is the cost of the check being there at all.
               */
              <>
                <Text style={styles.footnote}>{t("auth.resetLede")}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void logic.forgotPassword()}
                  disabled={!logic.canSendReset || logic.busy}
                  style={[styles.primary, (!logic.canSendReset || logic.busy) && styles.dim]}
                >
                  {logic.busy ? (
                    <ActivityIndicator size="small" color={colors.paper} />
                  ) : (
                    <Text style={styles.primaryText}>{t("auth.sendResetLink")}</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={logic.cancelReset}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>{t("common.cancel")}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void logic.submit()}
                disabled={!logic.canSubmit || logic.busy}
                style={[styles.primary, (!logic.canSubmit || logic.busy) && styles.dim]}
              >
                {logic.busy ? (
                  <ActivityIndicator size="small" color={colors.paper} />
                ) : (
                  <Text style={styles.primaryText}>
                    {registering ? t("auth.create") : t("auth.signIn")}
                  </Text>
                )}
              </Pressable>
            )}
          </ScrollView>
        </RisingSheet>
      </KeyboardLift>
    </Modal>
  );
}

interface EmailAuthSheetProps {
  readonly logic: ReturnType<typeof useAccountLogic>;
  readonly onClose: () => void;
}

/**
 * The two documents the tick above names.
 *
 * Reading one closes the sheet: they are full screens in the stack, and a sheet left
 * standing over them would be waiting behind a document somebody is still reading.
 */
function ConsentLinks({ onNavigate }: { readonly onNavigate: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();

  const open = (path: "/legal/nutzungsbedingungen" | "/legal/datenschutz") => {
    onNavigate();
    router.push(path);
  };

  return (
    <View style={styles.consentLinks}>
      <Pressable accessibilityRole="link" onPress={() => open("/legal/nutzungsbedingungen")}>
        <Text style={styles.consentLink}>{t("legal.terms")}</Text>
      </Pressable>
      <Text style={styles.consentSeparator}>·</Text>
      <Pressable accessibilityRole="link" onPress={() => open("/legal/datenschutz")}>
        <Text style={styles.consentLink}>{t("legal.privacy")}</Text>
      </Pressable>
    </View>
  );
}

function PasswordInput({
  logic,
  registering,
}: {
  readonly logic: ReturnType<typeof useAccountLogic>;
  readonly registering: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(logic.password);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{t("auth.password")}</Text>
        {!registering && (
          <Pressable accessibilityRole="button" onPress={logic.beginReset}>
            <Text style={styles.forgot}>{t("auth.forgot")}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.inputBox}>
        <Lock size={17} color={colors.inkSubtle} strokeWidth={1.75} />
        <TextInput
          value={logic.password}
          onChangeText={logic.setPassword}
          secureTextEntry={!visible}
          autoCapitalize="none"
          textContentType={registering ? "newPassword" : "password"}
          placeholder={
            registering ? t("auth.newPasswordPlaceholder") : t("auth.passwordPlaceholder")
          }
          placeholderTextColor={colors.inkSubtle}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          // Labelled by what pressing it does rather than the current state.
          accessibilityLabel={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          onPress={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff size={17} color={colors.inkSubtle} strokeWidth={1.75} />
          ) : (
            <Eye size={17} color={colors.inkSubtle} strokeWidth={1.75} />
          )}
        </Pressable>
      </View>

      {registering && (
        <>
          <View style={styles.meter}>
            {[1, 2, 3].map((bar) => (
              <View
                key={bar}
                style={[
                  styles.bar,
                  { backgroundColor: bar <= strength ? colors.accent : colors.line },
                ]}
              />
            ))}
          </View>
          <Text style={styles.hint}>{t("auth.passwordHint")}</Text>
        </>
      )}
    </View>
  );
}

function Field({
  label,
  icon,
  ...input
}: { readonly label: string; readonly icon: React.ReactNode } & React.ComponentProps<
  typeof TextInput
>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>
        {icon}
        <TextInput placeholderTextColor={colors.inkSubtle} {...input} style={styles.input} />
      </View>
    </View>
  );
}

function Toggle({
  checked,
  onPress,
  children,
}: {
  readonly checked: boolean;
  readonly onPress: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.toggle}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Check size={13} color={colors.paper} strokeWidth={2.5} />}
      </View>
      <Text style={styles.toggleText}>{children}</Text>
    </Pressable>
  );
}

/**
 * Every reason the submit was refused gets its own line.
 *
 * Reporting only the first problem makes someone discover the rest one round trip at a
 * time, which is the same conversation a single "something went wrong" was having — just
 * slower.
 */
function errorText(
  error: ReturnType<typeof useAccountLogic>["failed"][number],
  t: (k: never) => string,
) {
  const translate = t as unknown as (key: string) => string;
  return translate(`auth.error.${error}`);
}

/** What the sheet sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 34;

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(25,23,19,0.42)" },
  holder: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(25,23,19,0.16)",
    marginTop: 10,
  },
  content: { padding: 18, paddingTop: 16, paddingBottom: SHEET_PAD, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 24, color: colors.ink },
  field: { gap: 7 },
  labelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
  },
  forgot: { fontSize: 11.5, fontWeight: "500", color: colors.accent },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  meter: { flexDirection: "row", gap: 5, marginTop: 2 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  hint: { fontSize: 11.5, color: colors.inkSubtle },
  consents: { gap: 12 },
  // Indented to the checkbox label, so the two document names read as belonging to the
  // sentence above them rather than to the age tick below.
  consentLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 31,
    marginTop: -4,
  },
  consentLink: { fontSize: 12, fontWeight: "600", color: colors.accent },
  consentSeparator: { fontSize: 12, color: colors.inkSubtle },
  toggle: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.ink, borderColor: colors.ink },
  toggleText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: colors.inkMuted },
  error: { fontSize: 13, color: colors.accent },
  notice: { fontSize: 13, color: colors.inkMuted },
  footnote: { fontSize: 11.5, lineHeight: 17, color: colors.inkSubtle },
  primary: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.paper, fontSize: 15, fontWeight: "600" },
  /* The way back out of the reset step. Text on paper, so it never competes with the send. */
  secondary: { height: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 13.5, fontWeight: "500", color: colors.inkMuted },
  dim: { opacity: 0.5 },
});
