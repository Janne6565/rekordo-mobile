import { useAccountLogic } from "@/features/auth/useAccountLogic";
import { DeleteAccountSheet } from "@/features/legal/DeleteAccountSheet";
import { useStore } from "@/local/StoreProvider";
import { colors, fonts } from "@/theme/colors";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, FileJson, Table } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Screen 17g — every DSGVO right the app can answer by itself, each next to its article.
 *
 * The articles are printed on purpose: somebody who came here because the privacy policy
 * told them they had a right to something should see that this is the button for it.
 */
export function YourDataScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { store } = useStore();
  const logic = useAccountLogic();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => store.stats() });
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);
  const signedIn = logic.user !== null;

  async function runExport(kind: "json" | "csv") {
    setExporting(kind);
    try {
      await (kind === "json" ? logic.exportJson() : logic.exportCsv());
    } finally {
      setExporting(null);
    }
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
          <Text style={styles.title}>{t("legal.yourData")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lede}>
          {signedIn ? t("legal.data.lede") : t("legal.data.ledeLocal")}
        </Text>

        <Card title={t("legal.data.export.title")} article="ART. 15 · 20">
          <Text style={styles.cardBody}>
            {signedIn ? t("legal.data.export.body") : t("legal.data.export.bodyLocal")}
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void runExport("json")}
              disabled={exporting !== null}
              style={[styles.primaryButton, exporting !== null && styles.dim]}
            >
              {exporting === "json" ? (
                <ActivityIndicator size="small" color={colors.paper} />
              ) : (
                <>
                  <FileJson size={14} color={colors.paper} strokeWidth={1.9} />
                  <Text style={styles.primaryButtonText}>JSON</Text>
                </>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void runExport("csv")}
              disabled={exporting !== null}
              style={[styles.secondaryButton, exporting !== null && styles.dim]}
            >
              {exporting === "csv" ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <>
                  <Table size={14} color={colors.ink} strokeWidth={1.9} />
                  <Text style={styles.secondaryButtonText}>CSV</Text>
                </>
              )}
            </Pressable>
          </View>
          <Text style={styles.hint}>{t("legal.data.export.hint")}</Text>
        </Card>

        {signedIn && (
          <>
            <Card title={t("legal.data.correct.title")} article="ART. 16">
              <Text style={styles.cardBody}>{t("legal.data.correct.body")}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.dismissAll()}
                style={styles.secondaryButtonWide}
              >
                <Text style={styles.secondaryButtonText}>{t("legal.data.correct.action")}</Text>
              </Pressable>
            </Card>

            <Card title={t("legal.data.withdraw.title")} article="ART. 7 (3)">
              <Text style={styles.cardBody}>{t("legal.data.withdraw.body")}</Text>
              <Pressable
                accessibilityRole="button"
                // Straight to the Sharing screen rather than a one-tap switch here: the
                // three answers it holds are the withdrawal, and turning them off behind
                // somebody's back is the opposite of what a consent control is for.
                onPress={() => router.push("/sharing")}
                style={styles.secondaryButtonWide}
              >
                <Text style={styles.secondaryButtonText}>{t("legal.data.withdraw.action")}</Text>
              </Pressable>
            </Card>

            {/* Set apart rather than listed with the rest: the one action here that cannot
                be undone, and the tinted panel is the deck's way of saying so. */}
            <View style={styles.danger}>
              <View style={styles.cardHead}>
                <Text style={styles.dangerTitle}>{t("legal.data.delete.title")}</Text>
                <Text style={styles.dangerArticle}>ART. 17</Text>
              </View>
              <Text style={styles.cardBody}>{t("legal.data.delete.body")}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirming(true)}
                style={styles.dangerButton}
              >
                <Text style={styles.dangerButtonText}>{t("legal.data.delete.action")}</Text>
              </Pressable>
            </View>

            <Text style={styles.footnote}>{t("legal.data.otherRequests")}</Text>
          </>
        )}
      </ScrollView>

      {confirming && (
        <DeleteAccountSheet
          copyCount={stats.data?.copyCount}
          onExport={() => void runExport("json")}
          onConfirm={async () => {
            await logic.deleteAccount();
            setConfirming(false);
            router.dismissAll();
          }}
          onCancel={() => setConfirming(false)}
          deleting={logic.busy}
        />
      )}
    </SafeAreaView>
  );
}

function Card({
  title,
  article,
  children,
}: {
  readonly title: string;
  readonly article: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardArticle}>{article}</Text>
      </View>
      {children}
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
  body: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 80 },
  lede: { fontSize: 13, lineHeight: 21, color: colors.inkMuted },
  card: {
    marginTop: 14,
    padding: 15,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  cardTitle: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  cardArticle: { fontSize: 9.5, fontWeight: "500", color: colors.inkSubtle },
  cardBody: { fontSize: 11.5, lineHeight: 18, color: colors.inkMuted, marginTop: 4 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  primaryButton: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  primaryButtonText: { fontSize: 12.5, fontWeight: "600", color: colors.paper },
  secondaryButton: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryButtonWide: {
    height: 38,
    borderRadius: 9,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
  dim: { opacity: 0.5 },
  hint: { fontSize: 11, color: colors.inkSubtle, marginTop: 9 },
  danger: { marginTop: 22, padding: 15, borderRadius: 12, backgroundColor: "rgba(162,87,58,0.07)" },
  dangerTitle: { fontSize: 13.5, fontWeight: "600", color: colors.accentStrong },
  dangerArticle: { fontSize: 9.5, fontWeight: "500", color: "rgba(140,69,48,0.6)" },
  dangerButton: {
    height: 38,
    borderRadius: 9,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accentStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: { fontSize: 12.5, fontWeight: "600", color: colors.accentStrong },
  footnote: { fontSize: 11.5, lineHeight: 18, color: colors.inkSubtle, marginTop: 14 },
});
