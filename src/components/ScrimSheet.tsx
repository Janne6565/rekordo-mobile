import { LEAVE_MS, RISE_MS, RisingSheet, useSheetBottom } from "@/components/RisingSheet";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View, type ViewStyle } from "react-native";

/**
 * A bottom sheet that closes itself the way it opened: the frame of 2d-ii and 3a-x.
 *
 * The modal window itself does not animate: its fade would take the panel along, so the
 * panel faded while it rose. The scrim fades and the panel only slides, both ways. Every way
 * out -- an answer included -- plays the exit first and only then tells the owner, because
 * the owner's reaction (a card closing, a screen going back) unmounts the sheet on the spot.
 *
 * The body gets `close(then)`: it starts the exit and runs `then` once the panel is gone.
 * The scrim, a swipe down and Android back all close with `onClose`.
 */
export function ScrimSheet({
  open,
  onClose,
  scrimColor,
  sheetStyle,
  design,
  exitMs,
  exitEasing,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly scrimColor: string;
  readonly sheetStyle: ViewStyle | readonly ViewStyle[];
  /** The bottom padding the design draws; grown only where the system bar reaches further. */
  readonly design: number;
  readonly exitMs?: number;
  readonly exitEasing?: (value: number) => number;
  readonly children: (close: (then: () => void) => void) => ReactNode;
}) {
  const bottom = useSheetBottom(design);
  const scrim = useRef(new Animated.Value(0)).current;
  /** What to do once the exit has played; set means the sheet is already on its way out. */
  const after = useRef<(() => void) | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!open) return;
    after.current = null;
    setExiting(false);
    scrim.setValue(0);
    Animated.timing(scrim, {
      toValue: 1,
      duration: RISE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, scrim]);

  /*
   * Cleared before the owner hears about it, not when the sheet next opens.
   *
   * The panel remounts on every open, and a child's effects run before its parent's: a
   * fresh panel handed a stale `exiting` has no height to animate, so it reports the exit
   * at once and replays the last close -- the sheet shut in the frame it opened, and the
   * button took a second tap.
   */
  const finish = () => {
    const then = after.current;
    after.current = null;
    setExiting(false);
    then?.();
  };

  const close = (then: () => void) => {
    if (after.current !== null) return;
    after.current = then;
    setExiting(true);
    // On its own track and shorter than the panel's drop, as the deck draws it.
    Animated.timing(scrim, {
      toValue: 0,
      duration: LEAVE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={() => close(onClose)}>
      <Animated.View style={[styles.scrim, { backgroundColor: scrimColor, opacity: scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => close(onClose)}
          accessibilityRole="button"
        />
      </Animated.View>
      {/* `box-none` so a tap above the panel still reaches the scrim underneath it. */}
      <View style={styles.holder} pointerEvents="box-none">
        <RisingSheet
          visible={open}
          style={[
            ...(Array.isArray(sheetStyle) ? sheetStyle : [sheetStyle]),
            { paddingBottom: bottom },
          ]}
          onDismiss={() => close(onClose)}
          exiting={exiting}
          onExited={finish}
          exitMs={exitMs}
          exitEasing={exitEasing}
        >
          {children(close)}
        </RisingSheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill },
  holder: { flex: 1, justifyContent: "flex-end" },
});
