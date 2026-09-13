import * as Haptics from "expo-haptics";
import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, type PanGesture } from "react-native-gesture-handler";
import Animated, {
  type AnimatedRef,
  type SharedValue,
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/**
 * Picking a record up and carrying it somewhere else.
 *
 * One primitive for two lists that look nothing alike -- the shelf is a grid of sleeves and
 * the wishlist is a column of rows -- because they are the same gesture, and somebody who
 * has learnt to arrange one has learnt to arrange the other. What differs is geometry,
 * which they hand in; what is shared is everything that decides how it feels.
 *
 * The whole drag runs on the UI thread. React is told exactly twice: once when something
 * is lifted, so the overlay knows what to draw, and once when it is set down. The version
 * this replaces put every frame of a carry through a `PanResponder` and a re-render, which
 * is most of why it did not feel like anything.
 *
 * ## What it does that the old one did not
 *
 * - **A hold that never moves puts itself back down.** The carry is one `Pan` that
 *   activates after a long press, ended by `onFinalize` -- the one callback that fires
 *   whether or not the gesture ever activated. The old version armed a row on
 *   `onLongPress` and then waited for a `PanResponder` that only claimed the touch on
 *   *move*, so holding still left a row lifted with nothing left that could put it down.
 * - **The neighbours move.** Every other item slides into the slot it would occupy if you
 *   let go now, and slides back if you carry on past it. That is the whole point: you are
 *   meant to watch the order you are building rather than guess it.
 * - **The carried item is drawn in an overlay**, above the list rather than inside it. A
 *   tile carried up out of its own row would otherwise be painted *under* the rows above
 *   it on Android, where z-index only orders siblings.
 * - **It scrolls itself** near an edge, which is the difference between arranging a shelf
 *   and arranging the part of one you can see.
 * - **It ticks**: a tap when the record leaves the shelf, a selection tick each time the
 *   drop position changes, a softer tap when it lands.
 *
 * ## Coordinates
 *
 * Every rectangle here is in **gesture coordinates**: x as the gesture reports it, y in the
 * scrolling content. So a slot's x already includes the list's own padding, and its y is
 * measured from the top of the content rather than the top of the screen. Both suppliers
 * of geometry -- {@link uniformSlots} and {@link DragSortItem}'s own measurement -- are
 * given the list's padding as `origin` and state their answers that way.
 *
 * ## The slot model
 *
 * Projection is the nearest slot centre to the carried item's centre, and each neighbour's
 * displacement is the gap between its own slot and the slot one step along. That is exact
 * when the items are the same size -- which is the shelf, and the reason its tiles reserve
 * a fixed height -- and off by the difference in row heights when they are not, which is
 * the wishlist and amounts to a few points mid-carry that the real layout corrects on drop.
 */

/** One item's rectangle, in gesture coordinates. */
export interface Slot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the scrolling content's own padding puts the first item. */
export interface Origin {
  readonly x: number;
  readonly y: number;
}

/**
 * How the carry moves.
 *
 * Deliberately not in the shared motion set. The deck's four transitions are durations and
 * easings, none of them a spring -- and a spring is the whole of why a carried object has
 * weight. A number that cannot be said in CSS does not belong in a file both clients read.
 */
export const CARRY = {
  /** How long a press is held before the record leaves the shelf. */
  longPress: 220,
  /** The lift: enough to read as off the page, not enough to bury its neighbours. */
  scale: 1.07,
  /** Neighbours opening a gap. Quick and a little soft -- they are getting out of the way. */
  shift: { damping: 20, stiffness: 220, mass: 0.55 },
  /** The record landing. Stiffer: it is being set down, not thrown. */
  drop: { damping: 24, stiffness: 300, mass: 0.6 },
  /** How near an edge, in points, before the list starts moving on its own. */
  edge: 88,
  /** Points a second at the very edge, tapering to nothing at the top of that band. */
  scrollRate: 900,
} as const;

export interface DragSort {
  /** Goes on a `GestureDetector` around the scrolling view — or use {@link DragSortArea}. */
  readonly gesture: PanGesture;
  /** The index in the air, or -1. */
  readonly active: SharedValue<number>;
  /** Where it would land if you let go now, or -1. */
  readonly projected: SharedValue<number>;
  readonly carriedX: SharedValue<number>;
  readonly carriedY: SharedValue<number>;
  /** The geometry, in list order. */
  readonly slots: SharedValue<Slot[]>;
  readonly scrollY: SharedValue<number>;
  /** The height of the frame the edge bands are measured against. */
  readonly frameHeight: SharedValue<number>;
  readonly origin: Origin;
  /** Put this on the list's `onScroll`, with `scrollEventThrottle={16}`. */
  readonly onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** The index being carried, on the JS side: drives the overlay and `scrollEnabled`. */
  readonly carrying: number | null;
  /** Hands measured geometry in, for lists whose items are not all one size. */
  readonly measure: boolean;
  /**
   * Where measured rectangles are collected before they go to the UI thread.
   *
   * A plain ref rather than the shared value itself, because a shared value written from
   * the JS thread does not read back its own write in the same tick -- so twenty-one rows
   * each doing `slots.value = [...slots.value]` on layout all copied the *empty* array,
   * and what arrived was an array of the right length with nothing in it. Every row's
   * rectangle is therefore accumulated here, synchronously, and the whole array is handed
   * over at once.
   */
  readonly measured: RefObject<Slot[]>;
}

export function useDragSort({
  count,
  scrollRef,
  onDrop,
  origin,
  enabled = true,
  measure = false,
}: {
  readonly count: number;
  /** The list being arranged, so the carry can scroll it. */
  // biome-ignore lint/suspicious/noExplicitAny: an AnimatedRef is invariant in its element
  readonly scrollRef: AnimatedRef<any>;
  /**
   * Where it ended up. Called on the JS thread, once, and only when the position actually
   * changed -- a lift that goes nowhere is not a reorder and must not write anything.
   */
  readonly onDrop: (from: number, to: number) => void;
  readonly origin: Origin;
  /**
   * Whether anything may be picked up at all. False on a filtered list: a position in a
   * narrowed list means nothing in the whole one, so the gesture refuses rather than
   * quietly carrying somebody else's record.
   */
  readonly enabled?: boolean;
  /** True when items report their own rectangles rather than being laid out uniformly. */
  readonly measure?: boolean;
}): DragSort {
  const active = useSharedValue(-1);
  const projected = useSharedValue(-1);
  const carriedX = useSharedValue(0);
  const carriedY = useSharedValue(0);
  const slots = useSharedValue<Slot[]>([]);
  const scrollY = useSharedValue(0);
  const frameHeight = useSharedValue(0);
  /** Where in the visible frame the finger is, which is what the edge bands are about. */
  const fingerY = useSharedValue(0);
  /** How far the list has scrolled itself during this carry, so the item stays under the finger. */
  const scrolled = useSharedValue(0);

  const [carrying, setCarrying] = useState<number | null>(null);
  const measured = useRef<Slot[]>([]);

  const tick = useCallback(() => void Haptics.selectionAsync(), []);
  const lift = useCallback(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), []);
  const land = useCallback(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), []);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  /**
   * The nearest slot to where the carried item is now.
   *
   * Nearest centre, rather than counting how many midpoints have been passed the way the
   * old wishlist did: passing counts work along one axis and a grid has two. One formula
   * then serves both lists, so the two cannot drift apart.
   */
  const project = useCallback(
    (from: number) => {
      "worklet";
      const all = slots.value;
      const own = all[from];
      if (own === undefined) return from;
      const centreX = own.x + own.width / 2 + carriedX.value;
      const centreY = own.y + own.height / 2 + carriedY.value;

      let best = from;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < all.length; index += 1) {
        const slot = all[index];
        if (slot === undefined) continue;
        const dx = slot.x + slot.width / 2 - centreX;
        const dy = slot.y + slot.height / 2 - centreY;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      return best;
    },
    [slots, carriedX, carriedY],
  );

  /** A tick every time the answer changes, and only then. */
  useAnimatedReaction(
    () => projected.value,
    (now, before) => {
      if (before !== null && before !== -1 && now !== -1 && now !== before) runOnJS(tick)();
    },
  );

  /**
   * The edge scroll, a step per frame.
   *
   * Every point the list moves is added to the carry: the carried item is positioned in
   * content coordinates and the finger has not moved, so without this it would slide out
   * from under the finger at exactly the speed the list is scrolling.
   */
  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    if (active.value === -1) return;
    const height = frameHeight.value;
    if (height === 0) return;

    const fromTop = fingerY.value;
    const fromBottom = height - fingerY.value;
    let rate = 0;
    if (fromTop < CARRY.edge) rate = -CARRY.scrollRate * (1 - Math.max(fromTop, 0) / CARRY.edge);
    else if (fromBottom < CARRY.edge)
      rate = CARRY.scrollRate * (1 - Math.max(fromBottom, 0) / CARRY.edge);
    if (rate === 0) return;

    const all = slots.value;
    const last = all[all.length - 1];
    const contentHeight = last === undefined ? 0 : last.y + last.height + origin.y;
    const step = (rate * (timeSincePreviousFrame ?? 16)) / 1000;
    const next = Math.min(Math.max(scrollY.value + step, 0), Math.max(contentHeight - height, 0));
    const moved = next - scrollY.value;
    if (moved === 0) return;

    scrollY.value = next;
    scrolled.value += moved;
    carriedY.value += moved;
    projected.value = project(active.value);
    scrollTo(scrollRef, 0, next, false);
  }, false);

  const runFrames = useCallback((on: boolean) => frame.setActive(on), [frame]);

  /**
   * Putting the record down, in one React commit.
   *
   * `setCarrying(null)` and whatever `onDrop` writes are batched together, so the frame
   * that stops drawing the carried tile is the same frame the list comes back reordered.
   * The two must not be allowed to land separately: the reordered list and the displaced
   * tiles are the same picture, and either one alone is the wrong one.
   *
   * This is why `onDrop` has to apply its new order *synchronously*. A caller that only
   * starts an async write here — and reorders when it resolves — puts the old order back
   * on screen in between.
   */
  const finish = useCallback(
    (from: number, to: number) => {
      setCarrying(null);
      if (from !== to) onDrop(from, to);
    },
    [onDrop],
  );

  /**
   * The carry's own state is cleared only after that commit has happened.
   *
   * An effect rather than the spring's callback, because this is the half that must come
   * second: while these still hold their values the items keep their displacement, which
   * is exactly what makes the swap invisible.
   */
  useEffect(() => {
    if (carrying !== null) return;
    active.value = -1;
    projected.value = -1;
    carriedX.value = 0;
    carriedY.value = 0;
    scrolled.value = 0;
  }, [carrying, active, projected, carriedX, carriedY, scrolled]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && count > 1)
        // One gesture for the whole list rather than one per row: a shelf is hundreds of
        // rows, and hundreds of native handlers is hundreds of things to arbitrate between
        // on every single touch.
        .activateAfterLongPress(CARRY.longPress)
        /**
         * The scroll waits for this to fail rather than racing it.
         *
         * `simultaneousWithExternalGesture` was the first attempt and it does not work:
         * the two run side by side, the scroll claims the touch the moment the finger
         * moves past its slop, and it claims it *before* the long press has had its 220ms
         * — so a drag that started with the smallest wobble scrolled the shelf instead of
         * picking anything up. Blocking is the right relationship: a press that moves
         * early fails this gesture, the scroll is released and behaves normally, and a
         * press that is held wins outright.
         */
        .blocksExternalGesture(scrollRef)
        .onBegin((event) => {
          fingerY.value = event.y;
        })
        .onStart((event) => {
          const contentY = event.y + scrollY.value;
          const all = slots.value;
          let found = -1;
          for (let index = 0; index < all.length; index += 1) {
            const slot = all[index];
            if (
              slot !== undefined &&
              event.x >= slot.x &&
              event.x <= slot.x + slot.width &&
              contentY >= slot.y &&
              contentY <= slot.y + slot.height
            ) {
              found = index;
              break;
            }
          }
          if (found === -1) return;

          cancelAnimation(carriedX);
          cancelAnimation(carriedY);
          carriedX.value = 0;
          carriedY.value = 0;
          scrolled.value = 0;
          active.value = found;
          projected.value = found;
          runOnJS(setCarrying)(found);
          runOnJS(lift)();
          runOnJS(runFrames)(true);
        })
        .onUpdate((event) => {
          if (active.value === -1) return;
          fingerY.value = event.y;
          carriedX.value = event.translationX;
          carriedY.value = event.translationY + scrolled.value;
          projected.value = project(active.value);
        })
        /**
         * Ends the carry however it ended: a release, a cancelled touch, or a long press
         * that never moved at all. `onFinalize` rather than `onEnd` for that last case --
         * it is the only one that fires whether or not the gesture activated, and a hold
         * with no movement is exactly the state the old implementation got stuck in.
         */
        .onFinalize(() => {
          const from = active.value;
          if (from === -1) return;
          const to = projected.value === -1 ? from : projected.value;

          runOnJS(runFrames)(false);
          runOnJS(land)();

          const all = slots.value;
          const own = all[from];
          const target = all[to];
          // Spring into the gap that has been held open rather than vanishing from under
          // the finger: the landing is the half of the gesture that says the drop was taken.
          const restX = own === undefined || target === undefined ? 0 : target.x - own.x;
          const restY = own === undefined || target === undefined ? 0 : target.y - own.y;
          carriedX.value = withSpring(restX, CARRY.drop);
          carriedY.value = withSpring(restY, CARRY.drop, (settled) => {
            if (settled !== true) return;
            /*
             * Hands over to React and writes nothing else.
             *
             * Clearing `active` and the offsets here — which the first version did — is
             * the bug somebody sees as the record blinking back to where it came from.
             * These are UI-thread writes, so every tile snapped to an identity transform
             * on the very next frame, while React still held the *old* order: one or two
             * frames of the old arrangement, dropped record back in its old place, and
             * then the new order arriving as a flash. The reset now happens after the
             * commit that reorders the list — see `useDragSort`'s effect.
             */
            runOnJS(finish)(from, to);
          });
        }),
    [
      enabled,
      count,
      scrollRef,
      slots,
      scrollY,
      active,
      projected,
      carriedX,
      carriedY,
      scrolled,
      fingerY,
      project,
      lift,
      land,
      runFrames,
      finish,
    ],
  );

  return {
    gesture,
    active,
    projected,
    carriedX,
    carriedY,
    slots,
    scrollY,
    frameHeight,
    origin,
    onScroll,
    carrying,
    measure,
    measured,
  };
}

const DragSortContext = createContext<DragSort | null>(null);

/**
 * Wraps the scrolling view: holds the gesture, measures the frame the edge bands are
 * relative to, and draws the carried item above everything.
 */
export function DragSortArea({
  drag,
  overlay,
  children,
}: {
  readonly drag: DragSort;
  /** Draws the item in the air — given its index, returns what the list draws for it. */
  readonly overlay: (index: number) => ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <DragSortContext.Provider value={drag}>
      <View
        style={styles.area}
        onLayout={(event) => {
          drag.frameHeight.value = event.nativeEvent.layout.height;
        }}
      >
        <GestureDetector gesture={drag.gesture}>
          <View style={styles.area}>{children}</View>
        </GestureDetector>
        {/* Gone outright between carries: the shared values behind it are cleared a beat
            later (see `useDragSort`), so a `CarriedItem` left mounted would spend that
            beat drawing an empty box with the lift's shadow under it. */}
        {drag.carrying === null ? null : (
          <CarriedItem drag={drag}>{overlay(drag.carrying)}</CarriedItem>
        )}
      </View>
    </DragSortContext.Provider>
  );
}

/**
 * The record in the air.
 *
 * Positioned against the frame rather than the content, so it stays under the finger while
 * the list scrolls beneath it. Pointer events pass through -- it is a picture of what is
 * being carried, and the gesture doing the carrying belongs to the list.
 */
function CarriedItem({
  drag,
  children,
}: { readonly drag: DragSort; readonly children: ReactNode }) {
  // Pulled apart before the worklet, never captured whole: a worklet copies everything its
  // closure names, and `drag` also holds the `PanGesture` -- a host object that cannot
  // cross to the UI thread. Capturing the controller throws "Cannot copy value of type
  // `PanGesture`" on the screen's first render rather than at the first drag.
  const { active, slots, carriedX, carriedY, scrollY } = drag;

  const style = useAnimatedStyle(() => {
    const index = active.value;
    const slot = slots.value[index];
    if (index === -1 || slot === undefined) return { opacity: 0 };
    return {
      opacity: 1,
      width: slot.width,
      height: slot.height,
      transform: [
        { translateX: slot.x + carriedX.value },
        { translateY: slot.y - scrollY.value + carriedY.value },
        { scale: withSpring(CARRY.scale, CARRY.shift) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.carried, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * One arrangeable item: wears whatever displacement the current projection asks of it, and
 * on a measured list reports its own rectangle.
 *
 * The item being carried is hidden rather than unmounted -- the overlay is drawing it, and
 * unmounting a row mid-carry would cost the list a re-render on every lift.
 */
export function DragSortItem({
  index,
  children,
  style,
}: {
  readonly index: number;
  readonly children: ReactNode;
  readonly style?: object;
}) {
  const drag = useContext(DragSortContext);
  const carrying = drag !== null && drag.carrying !== null;
  /**
   * Whether *this* is the record in the air, as a React value rather than a shared one.
   *
   * Hiding it is React's job and nothing else's. It used to be `opacity: 0` inside the
   * worklet, and Reanimated writes that straight onto the native view: React never learns
   * of it, so when the animated style stops being applied React diffs its own styles,
   * finds that neither mentions opacity, emits no change, and the view keeps the zero.
   * The record is put down and is simply not there.
   *
   * A reorder hid that, by accident — `FlatList` re-keys every row when the order changes,
   * so the tile was rebuilt as a fresh native view with no stale opacity on it. Picking a
   * record up and putting it straight back down reorders nothing, rebuilds nothing, and
   * left the tile invisible. Opacity set from here is opacity React can take away again.
   */
  const carriedHere = drag !== null && drag.carrying === index;

  // The shared values, never the controller: see `CarriedItem`.
  const active = drag?.active;
  const projected = drag?.projected;
  const slots = drag?.slots;

  /** Movement only. Opacity belongs to React — see `carriedHere`. */
  const animated = useAnimatedStyle(() => {
    if (active === undefined || projected === undefined || slots === undefined) return {};
    const from = active.value;
    const to = projected.value;
    if (from === -1 || to === -1 || index === from) return RESTING;

    // Where this item goes if the record is set down now: one step along, into the hole it
    // left behind.
    let moved = index;
    if (from < to && index > from && index <= to) moved = index - 1;
    else if (from > to && index >= to && index < from) moved = index + 1;

    const here = slots.value[index];
    const there = slots.value[moved];
    if (here === undefined || there === undefined) return RESTING;
    return {
      transform: [
        { translateX: withSpring(there.x - here.x, CARRY.shift) },
        { translateY: withSpring(there.y - here.y, CARRY.shift) },
      ],
    };
  }, [active, projected, slots, index]);

  const onLayout =
    drag === null || !drag.measure
      ? undefined
      : (event: { nativeEvent: { layout: Slot } }) => {
          const { x, y, width, height } = event.nativeEvent.layout;
          // Already in gesture coordinates, with no `origin` to add: onLayout reports a
          // child's frame within its parent *including* that parent's padding, so the
          // first row's x already is the list's 18pt inset. Adding the origin on top of
          // it -- which the first version did -- shifts every rectangle down and right by
          // one padding, and the carry then picks up the row below the one pressed.
          drag.measured.current[index] = { x, y, width, height };
          drag.slots.value = [...drag.measured.current];
        };

  /*
   * The animated style is worn only while something is in the air.
   *
   * It is a React value that switches it off, deliberately, and that is the other half of
   * the atomic drop: the commit that reorders the list is the same commit that stops these
   * items reading the carry. Left on, they would spend the frame after the drop applying a
   * displacement meant for the *old* order to the new one — the same flash from the other
   * side. Off, the drop is invisible, because a list of displaced tiles and the reordered
   * list are the same picture.
   */
  return (
    <Animated.View
      style={[style, carrying ? animated : RESTING, carriedHere ? HIDDEN : null]}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The geometry a virtualised grid cannot measure for itself.
 *
 * A `FlatList` only lays out the rows near the viewport, so nine tenths of a long shelf
 * would have no rectangle at all and the carry would have nowhere to put anything. Tiles
 * that are all one size make measuring unnecessary: one cell is the whole grid.
 */
export function uniformSlots({
  count,
  columns,
  width,
  height,
  gapX,
  gapY,
  origin,
}: {
  readonly count: number;
  readonly columns: number;
  readonly width: number;
  readonly height: number;
  readonly gapX: number;
  readonly gapY: number;
  readonly origin: Origin;
}): Slot[] {
  const slots: Slot[] = [];
  for (let index = 0; index < count; index += 1) {
    slots.push({
      x: origin.x + (index % columns) * (width + gapX),
      y: origin.y + Math.floor(index / columns) * (height + gapY),
      width,
      height,
    });
  }
  return slots;
}

/**
 * Where an item sits when it is not getting out of anything's way.
 *
 * Stated rather than left off: Reanimated writes transforms straight onto the native view,
 * so a style that simply stops mentioning them leaves the last ones in place.
 */
const RESTING = { transform: [{ translateX: 0 }, { translateY: 0 }] } as const;

/** The record in the air. Its place is kept open; the overlay draws the tile itself. */
const HIDDEN = { opacity: 0 } as const;

const styles = StyleSheet.create({
  area: { flex: 1 },
  carried: {
    position: "absolute",
    left: 0,
    top: 0,
    shadowColor: "#191713",
    shadowOpacity: 0.22,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
    zIndex: 20,
  },
});
