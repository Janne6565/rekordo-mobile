import {
  readAppearanceRevealed,
  writeAppearanceRevealed,
  writeDarkMode,
  writeReturnTo,
} from "@/local/appearance";
import { isDark } from "@/theme/colors";
import { reloadAppAsync } from "expo";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";

/** Taps on the version line that open (or close again) the Appearance section. */
export const TAPS_TO_TOGGLE = 7;
/** The countdown starts here, as Android's developer options do: from the fourth tap. */
const COUNTDOWN_FROM = 4;
/** A pause this long starts the count over, so stray taps weeks apart never add up. */
const TAP_WINDOW_MS = 1500;
const TOAST_MS = 1200;

/**
 * Deck "Rekordo Dark Mode · Mobile", 1a-1c: the hidden dark mode on Legal & privacy.
 *
 * Seven taps on the version line reveal an Appearance section with one switch; seven more
 * hide it again and return the app to light. The section stays found from then on, per
 * device. Turning the switch off alone keeps the section.
 *
 * The palette is chosen at start-up (see `theme/colors.ts`), so flipping the switch asks
 * first and then restarts the app straight back onto this screen, now in the other mode.
 */
export function useHiddenAppearance({
  confirmRestart,
}: {
  /** Asks before the restart a switch takes; resolves true to go ahead. */
  readonly confirmRestart: () => Promise<boolean>;
}) {
  const [revealed, setRevealed] = useState(readAppearanceRevealed);
  const [taps, setTaps] = useState(0);
  const [toast, setToast] = useState<number | null>(null);
  const lastTap = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /** Asks, then stores the mode (and whatever else `alsoWrite` says) and restarts into it. */
  const restartInto = useCallback(
    async (dark: boolean, alsoWrite?: () => void) => {
      if (dark === isDark) return;
      if (!(await confirmRestart())) return;
      writeDarkMode(dark);
      alsoWrite?.();
      writeReturnTo("/legal");
      await reloadAppAsync("Appearance changed");
    },
    [confirmRestart],
  );

  const tapVersion = useCallback(() => {
    const now = Date.now();
    const count = now - lastTap.current > TAP_WINDOW_MS ? 1 : taps + 1;
    lastTap.current = now;
    void Haptics.selectionAsync();

    if (count < TAPS_TO_TOGGLE) {
      setTaps(count);
      if (count >= COUNTDOWN_FROM) {
        setToast(TAPS_TO_TOGGLE - count);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
      }
      return;
    }

    setTaps(0);
    setToast(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!revealed) {
      writeAppearanceRevealed(true);
      setRevealed(true);
      return;
    }
    // Hiding it again also returns the app to light, so nothing is left switched on with
    // no way to see the switch.
    // Stored only once the restart is agreed to: cancelling must not leave a dark app whose
    // switch is gone.
    if (isDark) {
      void restartInto(false, () => writeAppearanceRevealed(false));
      return;
    }
    writeAppearanceRevealed(false);
    setRevealed(false);
  }, [taps, revealed, restartInto]);

  return {
    revealed,
    /** The countdown the toast shows, or null when it is not up. */
    tapsLeft: toast,
    /** True while a count is under way, for the version line's pressed tint. */
    counting: taps > 0,
    dark: isDark,
    tapVersion,
    setDark: (dark: boolean) => void restartInto(dark),
  };
}
