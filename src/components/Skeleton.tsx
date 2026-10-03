import { useReducedMotion } from "@/lib/motion";
import { ink } from "@/theme/colors";
import { useEffect, useRef } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";

/** The deck's three bar weights, strongest first. */
export type SkeletonTone = "strong" | "soft" | "faint";

/**
 * Ink on paper, not white on dark.
 *
 * The deck drew these on the add screen's dark chrome and the tones were white to match.
 * That screen went light and these did not follow, which made every placeholder in the app
 * invisible — a search whose artists were still loading looked like a search that had
 * finished and found nothing. The one call site still on dark chrome, the tracklist, has
 * always had its own skeleton that takes the chrome it is drawn in.
 *
 * The weights are the deck's, kept as they were; only the colour they are mixed from moved.
 */
const TONES: Record<SkeletonTone, string> = {
  strong: ink(0.1),
  soft: ink(0.075),
  faint: ink(0.055),
};

/**
 * A pulse rather than the web's travelling gradient.
 *
 * The deck's shimmer is a gradient sliding across the block, which needs a gradient
 * library this app does not carry; a synchronised pulse at the same 1.4s is the same
 * signal — "this is a placeholder, something is on its way" — without adding a dependency
 * to move a highlight nobody will look at directly.
 */
const CYCLE_MS = 700;

/**
 * The pulse itself, shared with anything that wants to breathe while it waits — the
 * placeholder blocks below, and the cover silhouette that holds a frame until its image
 * arrives. Respects the system's reduce-motion setting, which is why it is worth having
 * in one place rather than re-derived at each call site.
 *
 * The *value* is deliberately still one per caller, and the reduce-motion answer is the
 * only thing shared. Handing every caller one module-level node looks like the obvious
 * win — the roll's wheel mounts sixty of these at once — and it is a trap: the node is
 * driven natively, so a view that has ever been attached to it has its opacity owned by
 * the UI thread, and swapping in a different node when the cover finally loads leaves
 * that view frozen at whatever the loop happened to be on. A shelf of covers stuck at
 * half opacity, with the record behind each one showing through it.
 *
 * What was actually expensive was never the loop. It was that each caller asked the
 * accessibility service for the same boolean and kept its own native listener for it, so
 * opening the roll meant sixty subscriptions and sixty promises before a cover was drawn.
 * That is what `useReducedMotion` now answers from one subscription for the whole process.
 */
export function usePulse(active: boolean): Animated.Value {
  const pulse = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // An indicator that will not stop moving is exactly the kind of motion people turn
    // off. Held at a steady mid-tone instead, which still reads as "not content yet".
    if (!active || reduceMotion) {
      pulse.setValue(active ? 0.75 : 1);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: CYCLE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([step(0.5), step(1)]));
    loop.start();
    return () => loop.stop();
  }, [pulse, active, reduceMotion]);

  return pulse;
}

interface SkeletonProps {
  readonly tone?: SkeletonTone;
  readonly style?: ViewStyle | readonly ViewStyle[];
}

/**
 * One placeholder block (turn 9).
 *
 * Deliberately dimensionless: the rule the deck sets out is that a skeleton keeps the
 * dimensions of the content it replaces, so the caller — which is the only thing that
 * knows those dimensions — supplies them, and this contributes nothing but the pulse.
 */
export function Skeleton({ tone = "strong", style }: SkeletonProps) {
  const pulse = usePulse(true);

  return (
    <Animated.View
      // Hidden from VoiceOver: the status line above the list already says the search is
      // running, and reading out a dozen empty boxes adds nothing to that.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ backgroundColor: TONES[tone], borderRadius: 3, opacity: pulse }, style]}
    />
  );
}
