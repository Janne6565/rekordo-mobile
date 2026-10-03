import { API_BASE } from "@/api/config";
import { colors, fonts, ink, isDark } from "@/theme/colors";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

/**
 * A person: their picture if they brought one, their initials if they did not.
 *
 * Turn 15 said nobody uploads a picture of themselves here and turn 27 keeps that almost
 * true — the picture is offered in one row on the You tab and asked for nowhere, so most
 * people in most lists are still initials. The tint comes from the name, which makes a list
 * of twelve friends scannable without anybody choosing a colour.
 *
 * The two kinds are deliberately not distinguished (27g): same circle, same geometry, same
 * inset hairline — ink at 8% on tint, 12% over a photo, which is the only difference and is
 * there because a light photograph without it reads as a hole rather than a face.
 *
 * The initials are also the loading state (27j). Name and tint are local, so the circle is
 * right-sized and named from the first frame and the picture fades in over it at base
 * timing; a fetch that fails simply stays initials and says nothing.
 */
export function Avatar({
  name,
  uri,
  size = 38,
}: {
  readonly name: string;
  /** The path the server gave, or null/undefined for the ordinary case. */
  readonly uri?: string | null;
  readonly size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const hue = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
  const source = absolute(uri);
  const [shown, setShown] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Not clearing what is already shown: while a replacement loads, the circle keeps the
    // face it has rather than dropping to initials and back (27j).
    if (source === null) setShown(null);
  }, [source]);

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          // Low saturation, high lightness: these sit beside cover art, and a wall of vivid
          // circles would compete with the sleeves. In dark the tint drops in lightness so
          // the (now light) initials stay readable.
          backgroundColor: isDark ? `hsl(${hue}, 22%, 30%)` : `hsl(${hue}, 32%, 86%)`,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>
        {initials || "?"}
      </Text>
      {source !== null && (
        <Animated.Image
          source={{ uri: source }}
          // Deliberately silent on failure: a picture that will not load is a person without
          // one, and the circle underneath is a correct drawing of them either way.
          onLoad={() => {
            setShown(source);
            Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
          }}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size / 2, opacity: shown === source ? opacity : 0 },
          ]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.ring,
          {
            borderRadius: size / 2,
            borderColor: shown === null ? ink(0.08) : ink(0.12),
          },
        ]}
      />
    </View>
  );
}

/**
 * The server sends a path, because on the web that is all an `<img>` needs. A phone has no
 * origin of its own, so the host goes back on here rather than in every caller.
 */
export function absolute(uri: string | null | undefined): string | null {
  if (uri === null || uri === undefined || uri === "") return null;
  return uri.startsWith("http") ? uri : `${API_BASE}${uri}`;
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontFamily: fonts.sans, fontWeight: "600", color: isDark ? colors.ink : ink(0.7) },
  ring: { borderWidth: 1 },
});
