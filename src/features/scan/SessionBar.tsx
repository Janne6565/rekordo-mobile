import { useAppSelector } from "@/store/hooks";
import { countByDestination } from "@/store/scanSlice";
import { colors, fonts, ink } from "@/theme/colors";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * The session, at the foot of every screen that is part of it: how many are kept on the
 * left, the way to review them on the right.
 *
 * One bar under the camera, under every card and under the title search, so the tray is
 * never something a question has to be answered to get back to. It used to disappear
 * whenever a card was up, which made Review a reward for finishing the card.
 *
 * `quiet` draws Review outlined instead of filled: while something else on the screen is
 * asking a question, that question owns the one dark button.
 */
export function SessionBar({ quiet = false }: { readonly quiet?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const kept = useAppSelector((state) => state.scan.kept);
  const counts = countByDestination(kept);
  const empty = kept.length === 0;

  return (
    <View style={styles.bar}>
      <View style={styles.text}>
        <Text style={styles.count}>{t("scan.keptCount", { count: kept.length })}</Text>
        {!empty && (
          <Text style={styles.split}>
            {t("scan.destinationCount", { shelf: counts.shelf, wishlist: counts.wishlist })}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: empty }}
        disabled={empty}
        onPress={() => router.push("/scan/review")}
        style={[styles.review, quiet && styles.reviewQuiet, empty && styles.reviewEmpty]}
      >
        <Text
          style={[
            styles.reviewText,
            quiet && styles.reviewTextQuiet,
            empty && styles.reviewTextEmpty,
          ]}
        >
          {t("scan.review", { count: kept.length })}
        </Text>
      </Pressable>
    </View>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 18,
    paddingRight: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: ink(0.1),
  },
  text: { flex: 1, minWidth: 0 },
  count: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  split: { fontFamily: MONO, fontSize: 10.5, color: ink(0.5), marginTop: 2 },
  review: {
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewQuiet: { backgroundColor: colors.surface, borderColor: ink(0.16) },
  reviewEmpty: { backgroundColor: ink(0.08), borderColor: "transparent" },
  reviewText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.onInk },
  reviewTextQuiet: { color: colors.ink },
  reviewTextEmpty: { color: ink(0.35) },
});
