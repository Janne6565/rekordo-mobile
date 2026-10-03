import type { useLibraryLogic } from "@/features/library/useLibraryLogic";
import { colors, ink } from "@/theme/colors";
import { Check, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * 29e-5 — the one line the shelf says after the sign-in conflict is settled.
 *
 * It is also the only undo there is, which is why "Show them" filters the grid rather than
 * navigating anywhere: a line that states a number and cannot show which records it means
 * is decoration, and there is nothing to check it against.
 */
export function SyncOutcomeStrip({
  logic,
}: {
  readonly logic: ReturnType<typeof useLibraryLogic>;
}) {
  const { t } = useTranslation();
  const outcome = logic.outcome;
  if (outcome === null || outcome === undefined) return null;

  return (
    <View style={styles.strip}>
      <Check size={15} color={colors.inkMuted} strokeWidth={2} />
      <Text style={styles.text}>
        {t(`conflict.banner.${outcome.resolution}` as const, {
          arrived: outcome.arrived,
          edits: outcome.edits,
        })}
      </Text>
      {outcome.ids.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={logic.showingArrived ? logic.dismissOutcome : logic.showArrived}
        >
          <Text style={styles.action}>
            {t(logic.showingArrived ? "conflict.banner.showAll" : "conflict.banner.show")}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={logic.dismissOutcome}
      >
        <X size={14} color={colors.inkSubtle} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: ink(0.05),
  },
  text: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.inkMuted },
  action: { fontSize: 11.5, fontWeight: "600", color: colors.accent },
});
