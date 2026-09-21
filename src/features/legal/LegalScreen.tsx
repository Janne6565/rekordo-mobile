import { accountConsents } from "@/api/auth";
import { useLegalLanguage } from "@/features/legal/useLegalLanguage";
import { colors, fonts } from "@/theme/colors";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Download, Pencil, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SLUG_OF: Record<LegalDocumentId, string> = {
  impressum: "impressum",
  privacy: "datenschutz",
  terms: "nutzungsbedingungen",
};

/**
 * Screen 17c — the Legal & privacy group.
 *
 * Documents first, then what you can do about your own data, then the language switch. The
 * order is the reading order: somebody arrives here either to read something or to act on
 * something, and the language is a setting for the first of those.
 */
export function LegalScreen({ signedIn }: { readonly signedIn: boolean }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { language, choose } = useLegalLanguage();

  // Only meaningful with an account, and quietly empty without one -- a device that never
  // registered has agreed to nothing on a server.
  const consents = useQuery({
    queryKey: ["consents"],
    queryFn: accountConsents,
    enabled: signedIn,
  });

  function acceptedLine(documentId: LegalDocumentId): string | null {
    const kind = documentId === "terms" ? "TERMS" : documentId === "privacy" ? "PRIVACY" : null;
    if (kind === null) return null;
    const record = consents.data?.find((entry) => entry.document === kind);
    if (record === undefined) return null;
    return t("legal.accepted", {
      date: new Date(record.acceptedAt).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        {/* The circle keeps its own look, but the title goes inside the button with it:
            one control, and the word is the part a thumb can actually find. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          style={styles.backGroup}
        >
          <View style={styles.back}>
            <ChevronLeft size={17} color={colors.inkMuted} strokeWidth={2} />
          </View>
          <Text style={styles.title}>{t("legal.title")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel}>{t("legal.documents")}</Text>
        <View style={styles.card}>
          {LEGAL_DOCUMENTS.map((document, index) => (
            <Pressable
              key={document.id}
              accessibilityRole="button"
              onPress={() => router.push(`/legal/${SLUG_OF[document.id]}`)}
              style={[styles.row, index < LEGAL_DOCUMENTS.length - 1 && styles.rowDivider]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{document.title[language]}</Text>
                <Text style={styles.rowBody}>
                  {acceptedLine(document.id) ?? t(`legal.subtitle.${document.id}`)}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.inkSubtle} strokeWidth={1.75} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t("legal.yourData")}</Text>
        <View style={styles.card}>
          <DataRow
            icon={<Download size={16} color={colors.inkSubtle} strokeWidth={1.75} />}
            label={t("legal.data.export.title")}
            onPress={() => router.push("/legal/data")}
            divider
          />
          {signedIn && (
            <DataRow
              icon={<Pencil size={16} color={colors.inkSubtle} strokeWidth={1.75} />}
              label={t("legal.data.correct.title")}
              onPress={() => router.back()}
              divider
            />
          )}
          <DataRow
            icon={
              <Trash2
                size={16}
                color={signedIn ? colors.accentStrong : colors.inkSubtle}
                strokeWidth={1.75}
              />
            }
            label={signedIn ? t("legal.data.delete.title") : t("legal.data.deleteNoAccount")}
            destructive={signedIn}
            onPress={() => router.push("/legal/data")}
          />
        </View>
        <Text style={styles.note}>{t("legal.rightsNote")}</Text>

        <Text style={styles.sectionLabel}>{t("legal.documentLanguage")}</Text>
        <View style={styles.languageSwitch}>
          {(["de", "en"] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: language === option }}
              onPress={() => choose(option)}
              style={[styles.languageOption, language === option && styles.languageOptionOn]}
            >
              <Text style={[styles.languageText, language === option && styles.languageTextOn]}>
                {t(`legal.language.${option}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>{t("legal.bindingNotice")}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DataRow({
  icon,
  label,
  onPress,
  divider = false,
  destructive = false,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onPress: () => void;
  readonly divider?: boolean;
  readonly destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, divider && styles.rowDivider]}
    >
      <View style={styles.dataRowLabel}>
        {icon}
        <Text style={[styles.rowTitle, destructive && styles.destructive]}>{label}</Text>
      </View>
      <ChevronRight size={16} color={colors.inkSubtle} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backGroup: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  body: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 22,
  },
  card: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: "rgba(25,23,19,0.07)" },
  rowText: { flex: 1, paddingRight: 10 },
  rowTitle: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowBody: { fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  dataRowLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  destructive: { color: colors.accentStrong },
  note: {
    fontSize: 11.5,
    lineHeight: 18,
    color: colors.inkMuted,
    marginTop: 9,
    paddingHorizontal: 2,
  },
  languageSwitch: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 10,
    backgroundColor: "rgba(25,23,19,0.06)",
    marginTop: 8,
  },
  languageOption: {
    flex: 1,
    height: 34,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  languageOptionOn: { backgroundColor: colors.surface },
  languageText: { fontSize: 12.5, fontWeight: "500", color: colors.inkMuted },
  languageTextOn: { fontWeight: "600", color: colors.ink },
});
