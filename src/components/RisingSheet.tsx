import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type LayoutChangeEvent,
  PanResponder,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The panel of a bottom sheet, rising into place while the scrim behind it only fades.
 *
 * `<Modal animationType="slide">` moves the whole modal window, and every sheet in this app
 * draws its own scrim inside that window — so the dim rectangle slid up together with the
 * panel, leaving the top of the screen briefly undimmed and the grey edge visibly travelling.
 * The fix is to hand the scrim to `animationType="fade"` and animate the panel here instead.
 *
 * The rise starts from the panel's own measured height rather than a constant, so a short
 * sheet travels a short distance: a fixed offset would send a two-row sheet on the same
 * journey as a full-height one and make the small ones look flung.
 */
const RISE_MS = 260;

/** How far the panel drops back into place when a drag is let go short of dismissing. */
const SETTLE_MS = 180;

/**
 * How far down the panel has to be dragged before letting go dismisses it.
 *
 * A flick counts too, at `DISMISS_VELOCITY`, because the gesture people actually make is
 * a short fast swipe rather than a long slow haul.
 */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.8;

/**
 * The strip at the top of the panel where a drag starts, measured from its own top edge.
 *
 * The gesture is deliberately not attached to the whole panel. Two of these sheets hold a
 * ScrollView, and a pan that claimed the panel would take the scroll away from it -- so the
 * handle is where the grabber already promises it is, and everything below it scrolls as
 * before. Kept to the grabber and its surrounding padding, no further, because the touch is
 * claimed the moment it lands here.
 */
const GRAB_ZONE = 32;

/**
 * Sheets that are kept mounted behind a `visible` prop have to replay the rise every time
 * they reopen; ones that are mounted only while open get it from the first layout. Both go
 * through the same path, which is why `visible` defaults to true.
 */
interface RisingSheetProps {
  readonly visible?: boolean;
  readonly style?: ViewStyle | readonly ViewStyle[];
  /**
   * Called when the panel has been dragged down far enough to dismiss.
   *
   * Passing it is what turns the grabber into a real handle. Without it the panel is not
   * draggable at all, which is the right answer for a sheet whose only way out is a
   * decision -- but every sheet that draws a grabber should pass it, because the grabber
   * is otherwise an affordance for a gesture that does nothing.
   */
  readonly onDismiss?: () => void;
  readonly children: React.ReactNode;
}

/**
 * The gap the app keeps between a sheet's last line and whatever the system owns below it.
 *
 * Small on purpose: it is breathing room above the bar, not a second margin.
 */
const SYSTEM_GAP = 14;

/**
 * The bottom padding a sheet panel should carry, given the one its design asks for.
 *
 * A panel sits on the bottom edge of the screen, which on Android is where the navigation
 * bar is drawn -- 48dp of it with three buttons. A fixed padding tuned against the iOS home
 * indicator is less than that, so the last control in the sheet ends up behind the bar:
 * "Put it on the shelf instead" was sitting on top of the Android back button.
 *
 * The designed padding is kept wherever the system leaves room for it, and only grown where
 * the system bar actually reaches further -- rather than adding the inset on top, which
 * would double the air under every sheet on a phone with a home indicator.
 */
export function useSheetBottom(design: number) {
  const insets = useSafeAreaInsets();
  return Math.max(design, insets.bottom + SYSTEM_GAP);
}

export function RisingSheet({ visible = true, style, onDismiss, children }: RisingSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const height = useRef(0);
  // Held invisible until the first layout has been measured, otherwise the panel shows for
  // one frame at its resting place before being pushed down to start the rise.
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (live) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  const play = useCallback(() => {
    if (height.current === 0) return;
    setReady(true);
    // Motion is the whole of what this component adds, so with it turned off there is
    // nothing left to do but sit at the resting place.
    if (reduceMotion) {
      translateY.setValue(0);
      return;
    }
    translateY.setValue(height.current);
    Animated.timing(translateY, {
      toValue: 0,
      duration: RISE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, translateY]);

  useEffect(() => {
    if (visible) {
      dismissing.current = false;
      play();
    } else setReady(false);
  }, [visible, play]);

  /*
   * The drag rides the same value as the rise.
   *
   * They never run together -- the rise has finished before a finger can be on the panel --
   * and sharing the value means a dismissal continues from wherever the drag left off
   * rather than snapping back to nought first.
   */
  const dismissing = useRef(false);

  const settle = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: SETTLE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const leave = useCallback(() => {
    if (onDismiss === undefined) return;
    dismissing.current = true;
    if (reduceMotion || height.current === 0) {
      onDismiss();
      return;
    }
    Animated.timing(translateY, {
      toValue: height.current,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDismiss());
  }, [onDismiss, reduceMotion, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        /*
         * Claimed on touch-down, inside the grab strip only.
         *
         * The obvious shape -- refuse the touch and claim later, once the finger has moved
         * far enough to prove it is a downward drag -- does not work here. Android only
         * runs that negotiation for a touch some view is already tracking, so a handle that
         * declines the press never hears about the movement that follows: the start
         * callbacks fire, the move callbacks never do, and the sheet sits there.
         *
         * Claiming up front is safe because the strip is the grabber and the padding around
         * it, where nothing is tappable. A press that turns out to be a tap moves nothing
         * and settles back where it was.
         */
        onStartShouldSetPanResponder: (event) =>
          onDismiss !== undefined &&
          !dismissing.current &&
          event.nativeEvent.locationY <= GRAB_ZONE,
        onPanResponderMove: (_event, gesture) => {
          // Clamped at nought: the panel is already at the bottom of the screen, and
          // letting it be dragged upward would open a gap under it.
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) leave();
          else settle();
        },
        onPanResponderTerminate: () => settle(),
      }),
    [leave, onDismiss, settle, translateY],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    // Later layouts are the panel growing around its own content — a keyboard appearing, a
    // pressing picker opening. Replaying the rise there would drop the sheet mid-use.
    if (next === 0 || height.current !== 0) return;
    height.current = next;
    if (visible) play();
  };

  return (
    <Animated.View
      onLayout={onLayout}
      {...(onDismiss === undefined ? {} : pan.panHandlers)}
      style={[style, { opacity: ready ? 1 : 0, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}
