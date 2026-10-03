import { RatingFloor } from "@/components/RatingFloor";
import { RisingSheet } from "@/components/RisingSheet";
import { RollWheel } from "@/features/roll/RollWheel";
import { useRollRows } from "@/features/roll/useRollRows";
import { curve, useCross, useReducedMotion } from "@/lib/motion";
import { colors, fonts, ink } from "@/theme/colors";
import type { Format, RollLogic, RollRow } from "@janne6565/rekordo-shared";
import {
  CONDITION_LABELS,
  FORMAT_LABELS,
  ROLL_BAND_SCALE,
  ROLL_MIN_SPIN_MS,
  ROLL_PHONE_WHEEL,
  ROLL_POOL_COLLAPSE_MS,
  ROLL_POOL_FADE_MS,
  ROLL_SETTLE_MS,
  ROLL_SWAP_GAP,
  ROLL_SWAP_MS,
  copyFormat,
  isAnyPool,
  useRollLogic,
  visibleSlots,
} from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import { Dices, SlidersHorizontal } from "lucide-react-native";
import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FILTERS: readonly (Format | "ALL")[] = ["ALL", "VINYL", "CD", "CASSETTE", "DIGITAL"];

/** How many of the copies you turned down the row under the result names. */
const PASSED_ON_SHOWN = 3;

/** The sheet's own horizontal padding, which the band deliberately reaches out past. */
const PAD = 20;

/** The air above the band. */
const BAND_GAP = 16;

/** The shape of a cover on this deck, and so of the wheel slot and the result alike. */
const HERO_RATIO = 1.2;

/**
 * Turn 26a — let the shelf decide.
 *
 * One sheet and four states, and nothing here navigates: the throw is a wheel changing
 * speed, not a screen being pushed. What is picked, how long it takes and what the pool
 * means all come from the shared roll module, so a record that could come up here could
 * come up in the browser too.
 *
 * The pool is the sheet's own. Whatever the shelf behind it was filtered to is still
 * filtered to that when this closes, which is the reason the dice can sit in the toolbar
 * rather than at the bottom of the filter sheet.
 */
export function RollSheet({ onClose }: { readonly onClose: () => void }) {
  const { rows } = useRollRows();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  /**
   * Where the wheel is at the instant of a tap, so the throw can plant the pick in a slot
   * nobody is looking at. Without it the tap resampled the whole lap and every cover on
   * screen changed at once, which read as the wheel being swapped rather than thrown.
   */
  const position = useRef<(() => number) | null>(null);
  const logic = useRollLogic({
    rows,
    reducedMotion: reduced,
    visibleSlots: useCallback(
      () => visibleSlots(position.current?.() ?? 0, width, ROLL_PHONE_WHEEL),
      [width],
    ),
  });

  return (
    // `fade` on the window and the rise inside it, so the dim does not travel up with the
    // panel — the same split every sheet in this app uses.
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessible={false} />
      <View style={styles.dock} pointerEvents="box-none">
        <RisingSheet style={styles.sheet} onDismiss={onClose}>
          <SafeAreaView edges={["bottom"]}>
            <View style={styles.grabRow}>
              <View style={styles.grabber} />
            </View>
            {/* The result is taller than the question that produced it, and on a small
                phone taller than what is left of the screen. The grabber is above this, so
                the drag to dismiss and the scroll never fight. */}
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <Body logic={logic} onClose={onClose} reduced={reduced} position={position} />
            </ScrollView>
          </SafeAreaView>
        </RisingSheet>
      </View>
    </Modal>
  );
}

function Body({
  logic,
  onClose,
  reduced,
  position,
}: {
  readonly logic: RollLogic;
  readonly onClose: () => void;
  readonly reduced: boolean;
  readonly position: MutableRefObject<(() => number) | null>;
}) {
  const { t } = useTranslation();
  // The band reaches out past the sheet's padding to both edges of the phone, so the wheel
  // runs off the screen rather than stopping inside a margin — and the centreline it parks
  // the pick on is the screen's, not the sheet's.
  const { width } = useWindowDimensions();
  const settled = logic.phase === "SETTLED" && logic.picked !== null;
  const throwing = logic.phase === "THROWING" || logic.phase === "SETTLING";
  /**
   * The band leans in as the wheel gets up to speed and back out as it slows, on the same
   * two durations the wheel itself uses. It is the only thing standing in for the pool
   * block folding away, which on this platform cannot animate its own height.
   */
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.timing(scale, {
      toValue: logic.phase === "THROWING" ? ROLL_BAND_SCALE : 1,
      duration: logic.phase === "THROWING" ? ROLL_MIN_SPIN_MS : ROLL_SETTLE_MS,
      easing: curve.move,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [logic.phase, reduced, scale]);

  const heading = useCross(settled ? "settled" : throwing ? "throwing" : "idle");

  /**
   * The result as it was when it settled, held while it plays its exit.
   *
   * "Roll again" picks the next copy on the tap, and the block saying so is still on
   * screen — so it relabelled itself with a record it was not showing, for the length of
   * one fade. Freezing the whole element rather than just the copy also holds the roll
   * count and the ones you passed on still, which change on the same tap.
   */
  const answer = useRef<ReactNode>(null);
  if (settled && logic.picked !== null) {
    answer.current = <Result logic={logic} picked={logic.picked} onClose={onClose} />;
  }

  return (
    <View style={styles.pad}>
      {/* A Cross rather than a swap: three different sentences stand here over one throw,
          and cutting between them reads as the sheet being replaced. */}
      <Animated.View style={{ opacity: heading }}>
        {settled ? (
          <View style={styles.resultHead}>
            <Text style={styles.eyebrow}>{t("roll.rolledFrom", { count: logic.poolCount })}</Text>
            <Text style={styles.eyebrowQuiet}>{t("roll.nth", { count: logic.rollCount })}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.title}>
              {throwing
                ? t("roll.throwingTitle", { pool: logic.poolCount })
                : t("roll.title", { pool: logic.poolCount, total: logic.totalCount })}
            </Text>
            {/* Two lines' worth of room whichever sentence is in it. The throwing line is
                one line long, and letting the block shrink under it would jog the whole
                sheet upward in the middle of the pool folding away. */}
            <Text style={styles.lede} numberOfLines={2}>
              {throwing ? t("roll.throwingLede") : t("roll.lede")}
            </Text>
          </>
        )}
      </Animated.View>

      {/* The pool folds away for the throw and stays folded under the result, where the
          row at the bottom says what it was and offers to reopen it. */}
      <CollapsingPool open={logic.poolOpen} reduced={reduced}>
        <Pool logic={logic} />
      </CollapsingPool>

      {/*
       * Kept mounted in every state, and merely given no height once the copy has landed.
       * The wheel's position is the thing that must not be lost: "roll again" re-enters the
       * spin from where the strip already is, and a band that unmounted with the result
       * would start every repeat throw by snapping back to the top of the lap.
       */}
      <View style={styles.bandBox} pointerEvents="none">
        <Animated.View style={{ transform: [{ scale }] }}>
          <RollWheel
            strip={logic.strip}
            phase={logic.phase}
            bandWidth={width}
            reduced={reduced}
            position={position}
            // The wheel's own box grows into the result's artwork, so the band never has to
            // leave and the copy you were given is literally the one that was spinning.
            hero={settled}
            heroWidth={width - 2 * PAD}
            heroHeight={(width - 2 * PAD) / HERO_RATIO}
          />
        </Animated.View>
      </View>

      {/*
       * The question and the answer take turns in the same place. Both stay mounted so the
       * block can be measured from either side, and so that "Roll again" has something to
       * leave rather than something to unmount.
       */}
      <Swap
        showAnswer={settled && logic.picked !== null}
        reduced={reduced}
        question={
          <>
            <Text style={styles.pickedLine} numberOfLines={1}>
              {logic.poolCount === 0 ? t("roll.emptyPool") : ""}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!logic.canRoll}
              onPress={logic.roll}
              style={[styles.primary, !logic.canRoll && styles.primaryOff]}
            >
              <Dices
                size={17}
                color={logic.canRoll ? colors.paper : colors.inkSubtle}
                strokeWidth={1.75}
              />
              <Text style={[styles.primaryText, !logic.canRoll && styles.primaryTextOff]}>
                {throwing ? t("roll.rolling") : t("roll.action", { count: logic.poolCount })}
              </Text>
            </Pressable>
          </>
        }
        answer={answer.current}
      />
    </View>
  );
}

/**
 * The result, once the wheel has stopped.
 *
 * It crosses in rather than sliding: the settle has just delivered the cover to the middle
 * of the band, and a second movement on top of that one would be two things arriving.
 */
function Result({
  logic,
  picked,
  onClose,
}: {
  readonly logic: RollLogic;
  readonly picked: RollRow;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const opacity = useCross(picked.copy.id);
  const pool = usePoolLine(logic);
  const release = picked.release;

  const open = () => {
    onClose();
    router.push(`/copies/${picked.copy.id}`);
  };

  return (
    <Animated.View style={{ opacity }}>
      {/* No artwork here: the wheel's own slot has opened out into it, directly above
          this block. Drawing a second copy of the cover and cross-fading it in would make
          the throw end on two objects where the deck asks for one. */}
      <Text style={styles.heroTitle}>{release?.title ?? t("conflict.untitled")}</Text>
      <Text style={styles.heroMeta}>
        {release === undefined
          ? ""
          : `${release.artistName}${release.year === null ? "" : ` · ${release.year}`}`}
      </Text>
      <Text style={styles.heroFacts}>{facts(picked)}</Text>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={open} style={styles.primary}>
          <Text style={styles.primaryText}>{t("roll.openCopy")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={logic.roll} style={styles.secondary}>
          <Dices size={15} color={colors.accent} strokeWidth={1.75} />
          <Text style={styles.secondaryText}>{t("roll.again")}</Text>
        </Pressable>
      </View>

      <View style={styles.footRow}>
        <Text style={styles.footLabel}>{t("roll.pool")}</Text>
        <Text style={styles.footValue} numberOfLines={1}>
          {pool}
        </Text>
        <Pressable accessibilityRole="button" onPress={logic.editPool} style={styles.edit}>
          <SlidersHorizontal size={13} color={colors.accent} strokeWidth={1.75} />
          <Text style={styles.editText}>{t("roll.edit")}</Text>
        </Pressable>
      </View>

      {logic.passedOn.length > 0 && (
        <View style={styles.passedRow}>
          <Text style={styles.footLabel}>{t("roll.passedOn")}</Text>
          {/* The three most recent, not the whole session: the row is one line, and the
              older ones are not what you passed on just now. */}
          <Text style={styles.passed} numberOfLines={1}>
            {logic.passedOn
              .slice(0, PASSED_ON_SHOWN)
              .map((row) => row.release?.title ?? t("conflict.untitled"))
              .join(" · ")}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

/**
 * The two blocks that take turns under the wheel: the button that throws, and the copy it
 * threw. A Cross, and the app's rule for one — the old one leaves at `quick`, and only then
 * does the new one arrive at `base`.
 *
 * One value drives all three of the things that have to agree: the height of the box, and
 * the two opacities. Timing them separately is how the height ends up finishing after the
 * text it was making room for.
 *
 * The question stays in normal flow and the answer is laid over it, so before either has
 * been measured the box is already the right height for the state it opens in. Both are
 * mounted throughout: "Roll again" needs an answer to fade *out*, and a block that
 * unmounted on the tap is exactly the cut this is here to remove.
 */
function Swap({
  showAnswer,
  reduced,
  question,
  answer,
}: {
  readonly showAnswer: boolean;
  readonly reduced: boolean;
  readonly question: ReactNode;
  readonly answer: ReactNode;
}) {
  const [asked, setAsked] = useState(0);
  const [answered, setAnswered] = useState(0);
  const progress = useRef(new Animated.Value(showAnswer ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(showAnswer ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: showAnswer ? 1 : 0,
      duration: ROLL_SWAP_MS,
      easing: curve.move,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [showAnswer, reduced, progress]);

  const measured = asked > 0 && answered > 0;
  // The leaving half is gone before the arriving half starts, which is what makes this a
  // Cross rather than a dissolve.
  const leaving = { inputRange: [0, ROLL_SWAP_GAP, 1], outputRange: [1, 0, 0] };
  const arriving = { inputRange: [0, ROLL_SWAP_GAP, 1], outputRange: [0, 0, 1] };

  return (
    <Animated.View
      style={{
        overflow: "hidden",
        height: measured
          ? progress.interpolate({ inputRange: [0, 1], outputRange: [asked, answered] })
          : undefined,
      }}
    >
      <Animated.View
        onLayout={(event) => setAsked(event.nativeEvent.layout.height)}
        style={{ opacity: progress.interpolate(leaving) }}
        pointerEvents={showAnswer ? "none" : "auto"}
      >
        {question}
      </Animated.View>
      <Animated.View
        onLayout={(event) => setAnswered(event.nativeEvent.layout.height)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          opacity: progress.interpolate(arriving),
        }}
        pointerEvents={showAnswer ? "auto" : "none"}
      >
        {answer}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The pool block folding away, and unfolding again — the deck's own two durations.
 *
 * The height has to be measured before it can be animated: React Native cannot transition
 * to or from `auto`, so the block is laid out once at its natural size and every collapse
 * after that runs between that number and nought. The children stay mounted throughout, or
 * reopening would have nothing to measure and the fold would only ever work once.
 *
 * Opacity leaves faster than the height does, which is what stops the chips from being
 * legible while they are already halfway through the paper below them.
 */
function CollapsingPool({
  open,
  reduced,
  children,
}: {
  readonly open: boolean;
  readonly reduced: boolean;
  readonly children: ReactNode;
}) {
  const natural = useRef(0);
  const [measured, setMeasured] = useState(0);
  const fade = useRef(new Animated.Value(open ? 1 : 0)).current;
  const size = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      // The deck: with motion turned down the collapse becomes instant.
      fade.setValue(open ? 1 : 0);
      size.setValue(open ? 1 : 0);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(fade, {
        toValue: open ? 1 : 0,
        duration: ROLL_POOL_FADE_MS,
        easing: open ? curve.enter : curve.exit,
        useNativeDriver: false,
      }),
      Animated.timing(size, {
        toValue: open ? 1 : 0,
        duration: ROLL_POOL_COLLAPSE_MS,
        easing: curve.move,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [open, reduced, fade, size]);

  return (
    <Animated.View
      style={{
        overflow: "hidden",
        opacity: fade,
        // Left to lay itself out until it has been measured once; animated ever after.
        height:
          measured === 0
            ? undefined
            : size.interpolate({ inputRange: [0, 1], outputRange: [0, measured] }),
      }}
      pointerEvents={open ? "auto" : "none"}
    >
      <View
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          // Only the first real layout, and only while open: once the container's height
          // is animated the child is measured inside it, and reading that back would ratchet
          // the block down to nothing.
          if (height === 0 || natural.current !== 0) return;
          natural.current = height;
          setMeasured(height);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function Pool({ logic }: { readonly logic: RollLogic }) {
  const { t } = useTranslation();

  return (
    <View>
      <View style={styles.chips}>
        {FILTERS.map((filter) => {
          const active = logic.pool.format === filter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => logic.setFormat(filter)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>
                {filter === "ALL" ? t("format.all") : FORMAT_LABELS[filter]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <RatingFloor value={logic.pool.minRating} onChange={logic.setMinRating} />
    </View>
  );
}

/** "Vinyl · 2×LP · Very Good Plus · ★★★★☆", with every part that is unknown left out. */
function facts(row: RollRow): string {
  const parts: string[] = [FORMAT_LABELS[copyFormat(row.copy, row.release)]];
  if (row.copy.condition !== null) parts.push(CONDITION_LABELS[row.copy.condition]);
  if (row.copy.rating !== null && row.copy.rating > 0) {
    const filled = Math.min(5, Math.round(row.copy.rating));
    parts.push("★".repeat(filled) + "☆".repeat(5 - filled));
  }
  return parts.join(" · ");
}

/** What the pool was, in the words the chips use — "Vinyl · Rated 4 and up". */
function usePoolLine(logic: RollLogic): string {
  const { t } = useTranslation();
  if (isAnyPool(logic.pool)) return t("roll.poolEverything");
  const parts: string[] = [];
  if (logic.pool.format !== "ALL") parts.push(FORMAT_LABELS[logic.pool.format]);
  if (logic.pool.minRating !== null)
    parts.push(t("roll.poolRated", { count: logic.pool.minRating }));
  return parts.join(" · ");
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(25,23,19,0.5)",
  },
  dock: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
  },
  grabRow: { paddingTop: 12, paddingBottom: 16, alignItems: "center" },
  grabber: { width: 36, height: 4, borderRadius: 999, backgroundColor: ink(0.16) },
  pad: { paddingHorizontal: PAD, paddingBottom: 14 },
  title: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 25, color: colors.ink },
  lede: { fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 5 },
  resultHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  eyebrowQuiet: { fontSize: 10, color: ink(0.35) },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.14),
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.inkMuted },
  chipTextOn: { color: colors.paper },

  // Pulled out to both edges of the phone, which is what makes it a wheel passing behind
  // the sheet rather than a filmstrip sitting inside it.
  bandBox: { marginHorizontal: -PAD, marginTop: BAND_GAP, overflow: "hidden" },
  pickedLine: {
    height: 17,
    marginTop: 10,
    fontSize: 11.5,
    fontWeight: "500",
    color: colors.inkMuted,
    textAlign: "center",
  },

  primary: {
    height: 50,
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryOff: { backgroundColor: ink(0.14) },
  primaryText: { fontSize: 15, fontWeight: "600", color: colors.paper },
  primaryTextOff: { color: colors.inkSubtle },
  secondary: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryText: { fontSize: 13.5, fontWeight: "600", color: colors.accent },
  actions: { gap: 9, marginTop: 20 },

  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    lineHeight: 29,
    marginTop: 16,
    color: colors.ink,
  },
  heroMeta: { fontSize: 13, fontWeight: "500", color: colors.inkMuted, marginTop: 5 },
  heroFacts: { fontSize: 11, fontWeight: "500", color: colors.inkSubtle, marginTop: 8 },

  footRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  footLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ink(0.38),
  },
  footValue: { flex: 1, fontSize: 11, fontWeight: "500", color: colors.inkMuted },
  edit: { flexDirection: "row", alignItems: "center", gap: 5 },
  editText: { fontSize: 11.5, fontWeight: "600", color: colors.accent },
  passedRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  passed: { flex: 1, fontSize: 11, fontWeight: "500", color: ink(0.45) },
});
