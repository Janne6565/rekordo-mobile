import { ReleaseArt } from "@/components/ReleaseArt";
import { useCoverPhotos } from "@/features/photos/useCoverPhotos";
import { curve } from "@/lib/motion";
import { colors } from "@/theme/colors";
import type { RollPhase, RollRow, RollStrip } from "@janne6565/rekordo-shared";
import {
  ROLL_MIN_SPIN_MS,
  ROLL_PHONE_WHEEL,
  ROLL_PICK_GROW_DELAY_MS,
  ROLL_PICK_GROW_MS,
  ROLL_PICK_LAP,
  ROLL_PICK_SCALE,
  ROLL_SETTLE_EASING,
  ROLL_SETTLE_MS,
  ROLL_SPIN_EASING,
  ROLL_STRIP_LAPS,
  ROLL_SWAP_MS,
  catalogArtShown,
  copyFormat,
  copyPreviewSrc,
  rollBandHeight,
  rollLapWidth,
  rollRestOffset,
  rollThrowPlan,
} from "@janne6565/rekordo-shared";
import { LinearGradient } from "expo-linear-gradient";
import { type MutableRefObject, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const WHEEL = ROLL_PHONE_WHEEL;

/** How wide the paper fade over each end of the band is. */
const FADE = WHEEL.fade;

/** How long the picked slot takes to open out into the result's artwork. */
const HERO_MS = 420;

const SETTLE_CURVE = Easing.bezier(
  ...(ROLL_SETTLE_EASING as unknown as [number, number, number, number]),
);
const SPIN_CURVE = Easing.bezier(
  ...(ROLL_SPIN_EASING as unknown as [number, number, number, number]),
);

/**
 * Where the strip is, worked out rather than reported.
 *
 * `Animated.Value.addListener` is the obvious way to know, and it is the wrong one here:
 * under the native driver every frame of the answer is a message from the UI thread to
 * the JS one, and this wheel drifts for as long as the sheet is open. That was one bridge
 * hop per frame, forever, for a number that is read once per tap.
 *
 * So each leg of the movement says where it starts and how fast it goes, and the position
 * is extrapolated from the clock. Only the two legs a tap can land in have to be exact:
 * the idle drift, which is linear and so exactly this, and the rest, which is a constant.
 * The throw's own two curves are read by nobody — taps during them are ignored.
 *
 * It may be whole laps out from the transform's literal value after the loop has restarted
 * it, and that is harmless by construction: the strip is one lap repeated, so every reader
 * of this number either wraps it into a lap (`visibleSlots`) or is itself lap-invariant
 * (`rollThrowPlan`, which rounds the jump to a whole number of laps).
 */
interface Leg {
  readonly value: number;
  readonly time: number;
  /** Pixels of translateX per millisecond. Negative: the strip travels left. */
  readonly rate: number;
}

/**
 * The wheel — turn 26a's band of covers, drifting, thrown, and stopped on one of them.
 *
 * Everything about *what* it is showing comes from the shared roll module; what lives here
 * is only how this platform moves it. The strip is the lap five times over so there are
 * covers either side of every resting place, and the transform is the one thing that ever
 * changes: no cover is ever remounted mid-throw, which is what lets the settle land on the
 * same object that was spinning.
 *
 * Three animated values, split by which thread can afford them rather than by what they
 * mean. `x` and `lean` and `veil` are native, because they run while the wheel is moving;
 * `grow` is the one that resizes a view, which no driver but the JS one can do, and it is
 * deliberately confined to the hero — the step where the wheel has already stopped and
 * there is nothing left for it to jank.
 */
export function RollWheel({
  strip,
  phase,
  bandWidth,
  reduced,
  position,
  hero,
  heroWidth,
  heroHeight,
}: {
  readonly strip: RollStrip;
  readonly phase: RollPhase;
  readonly bandWidth: number;
  readonly reduced: boolean;
  /**
   * Whether the copy the wheel stopped on is now the result's artwork.
   *
   * It is the same view either way — the slot the settle parked on simply opens out to the
   * width of the sheet. The deck asks for the throw to read as one continuous object, and
   * cross-fading a wheel out and a hero in is two objects however well it is timed.
   *
   * It needs no travel, only size: the picked slot rests on the band's centreline and the
   * result's artwork is centred in the sheet, and the band runs the full width of the
   * screen, so those two centres are already the same point.
   */
  readonly hero: boolean;
  readonly heroWidth: number;
  readonly heroHeight: number;
  /**
   * Where the strip is, for whoever needs to know at the moment of a tap. A ref rather
   * than a prop back up: the position is a running animation, not state, and rendering on
   * every frame of it would be absurd.
   */
  readonly position?: MutableRefObject<(() => number) | null>;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const lapWidth = rollLapWidth(strip, WHEEL);

  /** The leg of the movement currently under way — see `Leg`. */
  const leg = useRef<Leg>({ value: 0, time: 0, rate: 0 });
  const now = useCallback(
    () => leg.current.value + leg.current.rate * (Date.now() - leg.current.time),
    [],
  );
  const start = useCallback((value: number, rate: number) => {
    leg.current = { value, time: Date.now(), rate };
  }, []);

  useEffect(() => {
    if (position === undefined) return;
    position.current = now;
    return () => {
      position.current = null;
    };
  }, [position, now]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    const stop = () => {
      animation?.stop();
      running.current?.stop();
    };
    running.current?.stop();
    if (lapWidth === 0) return;

    const rest = rollRestOffset(bandWidth, strip, WHEEL);

    if (reduced) {
      // No drift and no blur: the pick simply is where it is. The sheet cross-fades the
      // result in instead, which is the whole of the movement under this setting.
      const at = phase === "IDLE" ? 0 : rest;
      x.setValue(at);
      start(at, 0);
      return;
    }

    if (phase === "THROWING") {
      // The spin is planned all the way to the resting place, so it can end at the speed
      // the settle needs to be handed. Moving the start whole laps from where the wheel
      // already is changes nothing on screen — the strip repeats every lap — and is what
      // stops a repeat throw from snapping back to the top.
      const plan = rollThrowPlan(now(), rest, lapWidth);
      x.setValue(plan.from);
      // Nobody reads the position during a throw; the average rate keeps the extrapolation
      // in the right neighbourhood rather than stranded at the start of the spin.
      start(plan.from, (plan.handover - plan.from) / ROLL_MIN_SPIN_MS);
      animation = Animated.timing(x, {
        toValue: plan.handover,
        duration: ROLL_MIN_SPIN_MS,
        easing: SPIN_CURVE,
        useNativeDriver: true,
      });
      running.current = animation;
      animation.start();
      return stop;
    }

    if (phase === "SETTLING" || phase === "SETTLED") {
      // Where it is going, which is where the next tap will find it: the settle is the last
      // thing that moves the strip, and the sheet ignores taps until it has arrived.
      start(rest, 0);
      animation = Animated.timing(x, {
        toValue: rest,
        // A sheet that mounts already settled — reopened, or reduced motion — has nothing
        // to animate; the transform is simply where it ended up.
        duration: phase === "SETTLED" ? 0 : ROLL_SETTLE_MS,
        easing: SETTLE_CURVE,
        useNativeDriver: true,
      });
      running.current = animation;
      animation.start();
      return stop;
    }

    // Idle: picked up from where the strip already is rather than from nought. Two steps,
    // because whatever is left of the lap it is in the middle of has to run before the lap
    // can go on repeat.
    const at = now();
    const from = at % lapWidth > 0 ? (at % lapWidth) - lapWidth : at % lapWidth;
    x.setValue(from);
    const leadMs = (WHEEL.idleLapMs * (from + lapWidth)) / lapWidth;
    start(from, -lapWidth / WHEEL.idleLapMs);
    const lead = Animated.timing(x, {
      toValue: -lapWidth,
      duration: leadMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation = lead;
    running.current = lead;
    lead.start(({ finished }) => {
      if (!finished) return;
      x.setValue(0);
      // The transform jumps a lap back; the extrapolation deliberately does not follow it.
      // See `Leg` — every reader of this number is lap-invariant.
      const loop = Animated.loop(
        Animated.timing(x, {
          toValue: -lapWidth,
          duration: WHEEL.idleLapMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      animation = loop;
      running.current = loop;
      loop.start();
    });
    return stop;
  }, [phase, strip, bandWidth, lapWidth, reduced, x, now, start]);

  /**
   * The picked cover leaning forward as the wheel stops on it — the settle's last gesture.
   *
   * A scale and not a size, and so native: this runs *while the strip is still travelling*,
   * and it is the one moment in the throw where the two most expensive things the wheel can
   * do would otherwise coincide. Twelve per cent is far too little for the resolution
   * argument that keeps the hero below on the JS thread to apply.
   */
  const lean = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = phase === "SETTLING" || phase === "SETTLED" ? 1 : 0;
    if (reduced) {
      lean.setValue(to);
      return;
    }
    const animation = Animated.timing(lean, {
      toValue: to,
      duration: to === 1 ? ROLL_PICK_GROW_MS : ROLL_SWAP_MS,
      // Held back so the lean lands exactly as the strip stops, rather than growing all
      // the way through a settle that is still travelling.
      delay: to === 1 && phase === "SETTLING" ? ROLL_PICK_GROW_DELAY_MS : 0,
      easing: to === 1 ? SETTLE_CURVE : curve.move,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [phase, reduced, lean]);

  /**
   * The picked slot opening out into the result's artwork, and the band opening out with it.
   *
   * Size rather than a transform, because the hero is nearly a whole screen wider than the
   * slot and a scale that large drags the artwork's resolution with it — which means the JS
   * driver, and a relayout of the band on every frame. That is affordable here and nowhere
   * else in the throw: by the time this runs the wheel has stopped, so it is the only thing
   * moving on the screen.
   */
  const grow = useRef(new Animated.Value(0)).current;
  /** Everything that is not the pick, going as the pick becomes the result. Native, as opacity. */
  const veil = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = hero ? 1 : 0;
    if (reduced) {
      grow.setValue(to);
      veil.setValue(to);
      return;
    }
    // Coming back out of the hero takes the same span as the block below it swapping back,
    // so the cover and the button arrive together rather than one chasing the other.
    const duration = to === 1 ? HERO_MS : ROLL_SWAP_MS;
    const easing = to === 1 ? curve.enter : curve.move;
    const animation = Animated.parallel([
      Animated.timing(grow, { toValue: to, duration, easing, useNativeDriver: false }),
      Animated.timing(veil, { toValue: to, duration, easing, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [hero, reduced, grow, veil]);

  /**
   * The artwork's size. The lean is a scale on top of this, so the slot's own width only
   * ever has two stops: what it is in the lap, and what it is as the result.
   */
  const pickWidth = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [WHEEL.cover, heroWidth],
  });
  const pickHeight = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [WHEEL.band, heroHeight],
  });
  // The lean is released as the hero takes over, so the two do not compound into a cover
  // twelve per cent wider than the sheet it is filling.
  const pickScale = Animated.multiply(
    lean.interpolate({ inputRange: [0, 1], outputRange: [1, ROLL_PICK_SCALE] }),
    veil.interpolate({ inputRange: [0, 1], outputRange: [1, 1 / ROLL_PICK_SCALE] }),
  );
  const rest = veil.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const slots = useMemo(
    () => Array.from({ length: ROLL_STRIP_LAPS }, () => strip.lap).flat(),
    [strip],
  );
  const covers = useCoverPhotos(useMemo(() => strip.lap.map((row) => row.copy.id), [strip]));
  const chosenIndex = strip.pickSlot + ROLL_PICK_LAP * strip.lap.length;

  return (
    // Taller than the covers, so the picked one has room to lean forward without the
    // clipping box slicing its top and bottom off — and then as tall as the artwork it
    // becomes, so the band and the hero are one box rather than two.
    <Animated.View
      style={[
        styles.band,
        {
          height: grow.interpolate({
            inputRange: [0, 1],
            outputRange: [rollBandHeight(WHEEL), heroHeight],
          }),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.strip,
          {
            transform: [{ translateX: x }],
            // The band is meant to blur while it is thrown. React Native has no filter, so
            // the covers lose their edges by dropping opacity instead — the same reading
            // (this is moving too fast to look at) by the only means the platform has.
            opacity: phase === "THROWING" && !reduced ? 0.72 : 1,
          },
        ]}
      >
        {slots.map((row, index) => (
          <Slot
            // The same copy legitimately appears once a lap, so the key has to say which
            // slot as well as which record.
            key={`${index}:${row.copy.id}`}
            row={row}
            previewUri={copyPreviewSrc(row.copy, covers.get(row.copy.id) ?? null)}
            // The one slot the wheel is stopping on — the copy in the lap the settle aims
            // at, not every appearance of that record on the strip.
            chosen={index === chosenIndex}
            width={pickWidth}
            height={pickHeight}
            scale={pickScale}
            opacity={rest}
          />
        ))}
      </Animated.View>
      {/* The two ends of the wheel. They go with it: once the pick is the result's
          artwork there is no strip running off the edges for them to describe, and they
          would simply be washing out the sides of the cover. */}
      <Animated.View
        style={[styles.fade, { left: 0, width: FADE, opacity: rest }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[colors.paper, `${colors.paper}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[styles.fade, { right: 0, width: FADE, opacity: rest }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[`${colors.paper}00`, colors.paper]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * One cover on the strip.
 *
 * Memoised, and that is the whole reason it is a component at all. Sixty of these are
 * mounted at once and the wheel above re-renders on every phase change and on every throw —
 * so without this, tapping the dice rebuilt sixty cover trees, each with its own image
 * state and its own placeholder, in the same frame as the spin was starting. The animated
 * values are stable nodes rather than numbers, so the only prop that ever really changes is
 * the one slot whose record was written into.
 */
const Slot = memo(function Slot({
  row,
  previewUri,
  chosen,
  width,
  height,
  scale,
  opacity,
}: {
  readonly row: RollRow;
  readonly previewUri: string | null;
  readonly chosen: boolean;
  readonly width: Animated.AnimatedInterpolation<number>;
  readonly height: Animated.AnimatedInterpolation<number>;
  readonly scale: Animated.AnimatedMultiplication<number>;
  readonly opacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View
      style={[
        styles.slot,
        // The slot keeps the lap's pitch whatever the artwork inside it is doing. An
        // oversized child overflows a box this size rather than widening it, so the pick can
        // open out without shoving its neighbours along the strip.
        // Above its neighbours as it opens out, or the two beside it draw over its edges.
        chosen ? styles.chosenSlot : null,
      ]}
    >
      {/*
       * Two views and not one, and the reason is a hard rule rather than a preference: a
       * style object holding any natively driven node has its *whole* props node moved to
       * the UI thread, and the native module has no idea what `width` is. Mixing the hero's
       * size in with the lean's scale therefore does not merely fail to animate — it throws,
       * and takes the JS-driven value with it, because that value is now native too.
       *
       * So the outer box owns everything the JS driver has to do (the hero's size, and
       * nothing else), and the inner one everything the native driver does (the lean, and
       * the fade of every cover that is not the pick). The tree keeps its shape whether this
       * slot is the chosen one or not, so a throw that picks it never remounts the artwork.
       */}
      <Animated.View style={chosen ? { width, height } : styles.fill}>
        <Animated.View
          style={chosen ? [styles.fill, { transform: [{ scale }] }] : [styles.fill, { opacity }]}
        >
          <ReleaseArt
            release={row.release}
            format={copyFormat(row.copy, row.release)}
            previewUri={previewUri}
            allowCatalogArt={catalogArtShown(row.copy, true)}
            style={styles.art}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  band: { overflow: "hidden" },
  slot: {
    width: WHEEL.cover,
    height: WHEEL.band,
    marginRight: WHEEL.gap,
    alignItems: "center",
    justifyContent: "center",
  },
  chosenSlot: { zIndex: 1 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  fill: { width: "100%", height: "100%" },
  art: { width: "100%", height: "100%" },
  fade: { position: "absolute", top: 0, bottom: 0 },
});
