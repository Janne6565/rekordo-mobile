import { colors, fonts, ink } from "@/theme/colors";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export interface SegmentOption {
  readonly key: string;
  readonly label: string;
  /** Shown beside the label, never inside it: a number is a quantity, not part of a name. */
  readonly count?: number;
}

/**
 * One track with a thumb that slides, rather than two pills that light up.
 *
 * The moving part is what says these are two positions of one control. When the white
 * panel simply appeared under the other label, nothing connected the two halves and the
 * pair read as separate buttons that happened to share a background.
 *
 * The thumb is measured rather than assumed, because the track is however wide the header
 * is; a hardcoded half would be wrong on every screen but the one it was written on.
 */
export function Segments({
  options,
  active,
  onChange,
}: {
  readonly options: readonly SegmentOption[];
  readonly active: string;
  readonly onChange: (key: string) => void;
}) {
  const [track, setTrack] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.key === active),
  );
  const slot = options.length === 0 ? 0 : (track - PAD * 2) / options.length;

  const at = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    Animated.spring(at, {
      toValue: index,
      // Enough damping that it lands rather than settling — this is a switch, not a
      // gesture being thrown.
      damping: 20,
      stiffness: 220,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [index, at]);

  return (
    <View style={styles.track} onLayout={(event) => setTrack(event.nativeEvent.layout.width)}>
      {/* Only once the track has been measured: at zero width it would be a hairline
          sitting under the first label for one frame. */}
      {slot > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: slot,
              transform: [
                {
                  translateX: at.interpolate({
                    inputRange: options.map((_option, position) => position),
                    outputRange: options.map((_option, position) => position * slot),
                  }),
                },
              ],
            },
          ]}
        />
      )}

      {options.map((option) => {
        const selected = option.key === active;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={styles.segment}
          >
            <Text style={[styles.label, selected && styles.labelActive]}>{option.label}</Text>
            {option.count === undefined ? null : <Text style={styles.count}>{option.count}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The track's inset, and so the thumb's, on all four sides. */
const PAD = 3;

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    marginTop: 16,
    padding: PAD,
    borderRadius: 9,
    backgroundColor: ink(0.06),
  },
  thumb: {
    position: "absolute",
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: 7,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  segment: {
    flex: 1,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.inkMuted },
  labelActive: { color: colors.ink, fontWeight: "600" },
  count: { fontFamily: "Menlo", fontSize: 11, color: colors.inkSubtle },
});
