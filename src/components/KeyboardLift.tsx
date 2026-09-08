import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Keeps whatever it wraps clear of the software keyboard, on both platforms.
 *
 * iOS is `KeyboardAvoidingView` with `behavior="padding"`, which is what every sheet in
 * this app already did. Android was passed no behaviour at all, so the component did
 * nothing there: the keyboard came up over the sheet and the field somebody had just
 * tapped was behind it.
 *
 * Android cannot use the same behaviour for arithmetic reasons, not policy ones.
 * `KeyboardAvoidingView` measures the gap between its own bottom edge and the event's
 * `screenY`, and on Android that is the bottom of the visible window -- which, with
 * edge-to-edge on (Expo enforces it), does not move when the keyboard opens. The lift would
 * come out as nought, or as the height of the navigation bar. So the overlap is worked out
 * here instead, from the one number Android does report honestly: `endCoordinates.height`,
 * the keyboard's height above the navigation bar.
 *
 * The keyboard's top edge is therefore `window height - height - navigation bar`, and the
 * lift is however far this view's own bottom edge reaches past it. Measuring rather than
 * assuming is what lets one component serve both shapes it is used in: a full-screen form
 * inside a `SafeAreaView`, which needs the keyboard's height, and a sheet in a `Modal` that
 * draws behind the navigation bar, which needs that plus the bar. Neither has to say which.
 */
export function KeyboardLift({ style, children }: KeyboardLiftProps) {
  const { ref, lift } = useAndroidKeyboardLift();

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView behavior="padding" style={style}>
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View ref={ref} style={[style, lift > 0 && { paddingBottom: lift }]}>
      {children}
    </View>
  );
}

interface KeyboardLiftProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly children: React.ReactNode;
}

/**
 * How far this view has to be padded at the bottom to sit clear of the keyboard.
 *
 * Nought everywhere but Android, where the listeners are the only thing that reports the
 * keyboard at all. The measurement is taken from the unlifted box: the padding shrinks the
 * content inside the view rather than the view itself, so a second keyboard event -- the
 * emoji panel opening, a numeric layout swapping in -- measures the same edge and works
 * out the same lift as the first one.
 */
function useAndroidKeyboardLift() {
  const ref = useRef<View>(null);
  const [lift, setLift] = useState(0);
  const insets = useSafeAreaInsets();

  const measure = useCallback(
    (keyboardHeight: number) => {
      ref.current?.measureInWindow((_x, y, _width, height) => {
        const keyboardTop = Dimensions.get("window").height - keyboardHeight - insets.bottom;
        setLift(Math.max(0, y + height - keyboardTop));
      });
    },
    [insets.bottom],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const shown = Keyboard.addListener("keyboardDidShow", (event) =>
      measure(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () => setLift(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [measure]);

  return { ref, lift };
}
