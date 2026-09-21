import { useLegalLanguage } from "@/features/legal/useLegalLanguage";
import { colors, fonts } from "@/theme/colors";
import {
  BINDING_LANGUAGE,
  type LegalDocument,
  type LegalDocumentId,
  type LegalLanguage,
  legalDocument,
  sectionChip,
  sectionLabel,
} from "@janne6565/rekordo-shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Languages } from "lucide-react-native";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Which route segment stands for which document. German, because the documents are. */
const SLUGS: Record<string, LegalDocumentId> = {
  impressum: "impressum",
  datenschutz: "privacy",
  nutzungsbedingungen: "terms",
};

/**
 * Screens 17d, 17e and 17f — one document, read on a phone.
 *
 * The jump list at the top is not decoration: the Datenschutzerklärung is six sections of
 * legal German on a 400-point screen, and without it the only way to reach section 5 is to
 * scroll past four you did not want.
 */
export function LegalDocumentScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { language, choose } = useLegalLanguage();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  const jumpTo = useCallback((id: string) => {
    const y = offsets.current[id];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  const documentId = SLUGS[doc ?? ""];
  if (documentId === undefined) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Text style={styles.missing}>{t("legal.unknownDocument")}</Text>
      </SafeAreaView>
    );
  }
  const document = legalDocument(documentId);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        {/* The switch stays outside: it changes the language, not the screen you leave to. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          style={styles.backGroup}
        >
          <View style={styles.back}>
            <ChevronLeft size={17} color={colors.inkMuted} strokeWidth={2} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {document.title[language]}
          </Text>
        </Pressable>
        <LanguageSwitch language={language} onChoose={choose} />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.body}>
        {language !== BINDING_LANGUAGE && (
          <View style={styles.translation}>
            <Languages size={15} color={colors.inkMuted} strokeWidth={1.75} />
            <Text style={styles.translationText}>{t("legal.translationNotice")}</Text>
          </View>
        )}

        {document.summary !== null && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>{document.summary[language]}</Text>
          </View>
        )}

        {document.numbered && (
          <View style={styles.chips}>
            {document.sections.map((section, index) => (
              <Pressable
                key={section.id}
                accessibilityRole="button"
                onPress={() => jumpTo(section.id)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{sectionChip(document, index, language)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Sections
          document={document}
          language={language}
          onMeasure={(id, y) => {
            offsets.current[id] = y;
          }}
        />

        {document.closing !== null && (
          <View style={styles.closing}>
            <Text style={styles.closingText}>{document.closing[language]}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t("legal.effective", { date: document.effective, version: document.version })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Sections({
  document,
  language,
  onMeasure,
}: {
  readonly document: LegalDocument;
  readonly language: LegalLanguage;
  readonly onMeasure: (id: string, y: number) => void;
}) {
  return (
    <>
      {document.sections.map((section, index) => (
        <View
          key={section.id}
          // Measured as it lays out rather than looked up later: a jump list on a native
          // ScrollView needs a y for every target, and there is no #anchor to fall back on.
          onLayout={(event) => onMeasure(section.id, event.nativeEvent.layout.y)}
        >
          <Text style={styles.sectionHeading}>{sectionLabel(document, index, language)}</Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph[language]} style={styles.paragraph}>
              {paragraph[language]}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

function LanguageSwitch({
  language,
  onChoose,
}: {
  readonly language: LegalLanguage;
  readonly onChoose: (next: LegalLanguage) => void;
}) {
  return (
    <View style={styles.switch}>
      {(["de", "en"] as const).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: language === option }}
          onPress={() => onChoose(option)}
          style={[styles.switchOption, language === option && styles.switchOptionOn]}
        >
          <Text style={[styles.switchText, language === option && styles.switchTextOn]}>
            {option.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backGroup: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
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
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  switch: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 8,
    backgroundColor: "rgba(25,23,19,0.06)",
  },
  switchOption: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  switchOptionOn: { backgroundColor: colors.surface },
  switchText: { fontSize: 10, fontWeight: "600", color: colors.inkSubtle },
  switchTextOn: { color: colors.ink },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  translation: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
    padding: 13,
    borderRadius: 11,
    backgroundColor: "rgba(25,23,19,0.05)",
  },
  translationText: { flex: 1, fontSize: 11.5, lineHeight: 18, color: colors.inkMuted },
  summary: {
    marginTop: 14,
    padding: 13,
    borderRadius: 11,
    backgroundColor: "rgba(162,87,58,0.07)",
  },
  summaryText: { fontSize: 12, lineHeight: 19, color: "rgba(25,23,19,0.7)" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.14)",
  },
  chipText: { fontSize: 10.5, fontWeight: "500", color: colors.inkMuted },
  sectionHeading: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink, marginTop: 20 },
  paragraph: { fontSize: 13, lineHeight: 22, color: "rgba(25,23,19,0.75)", marginTop: 7 },
  closing: {
    marginTop: 20,
    padding: 13,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closingText: { fontSize: 12, lineHeight: 19, color: "rgba(25,23,19,0.65)" },
  footer: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.line },
  footerText: { fontSize: 11.5, color: colors.inkSubtle },
  missing: { margin: 20, fontSize: 13, color: colors.inkMuted },
});
