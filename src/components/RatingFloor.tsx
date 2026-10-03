import { colors, ink } from "@/theme/colors";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

const STEPS = [1, 2, 3, 4, 5] as const;

/**
 * "Min rating ★★★★☆ 4+" — the floor, inclusive.
 *
 * One component and one set of words, because the deck draws this identical row in two
 * sheets: the roll's pool (26a) and the shelf's filters (26c). They are the same control
 * asking the same question, and two copies of it is how the two end up disagreeing about
 * what tapping the fourth star does.
 *
 * Tapping the floor you already asked for takes it off again, which is the only gesture
 * that can get back to "any" without a sixth control.
 */
export function RatingFloor({
  value,
  onChange,
}: {
  readonly value: number | null;
  readonly onChange: (next: number | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t("rating.floorLabel")}</Text>
      <View style={styles.stars}>
        {STEPS.map((step) => {
          const on = value !== null && step <= value;
          return (
            <Pressable
              key={step}
              accessibilityRole="button"
              accessibilityLabel={t("rating.atLeast", { count: step })}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(value === step ? null : step)}
              hitSlop={6}
            >
              <Text style={[styles.star, on && styles.starOn]}>{on ? "★" : "☆"}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.value}>
        {value === null ? t("rating.any") : t("rating.floor", { count: value })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ink(0.38),
  },
  stars: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  star: { fontSize: 19, lineHeight: 22, color: ink(0.18) },
  starOn: { color: colors.accent },
  value: { fontSize: 11, fontWeight: "500", color: colors.inkSubtle },
});
