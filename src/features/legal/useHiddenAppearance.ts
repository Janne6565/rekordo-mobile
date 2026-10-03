import type { RestartReason } from "@/features/legal/RestartSheet";
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
 * Deck "Rekordo Dark Mode · Mobile", 1a-1d: the hidden dark mode on Legal & privacy.
 *
 * Seven taps on the version line reveal an Appearance section with one switch; seven more
 * hide it again and return the app to light. The section stays found from then on, per
 * device. Turning the switch off alone keeps the section.
 *
 * The palette is chosen at start-up (see `theme/colors.ts`), so every change is a restart,
 * asked first in the 1d sheet. The switch moves under the thumb before the sheet rises, so
 * the question reads as the result of the flip, and springs back if it is cancelled. Restart
 * fades the veil in (1d-v) and only then stores the mode and reloads, straight back onto
 * this screen.
 */
export function useHiddenAppearance() {
  const [revealed, setRevealed] = useState(readAppearanceRevealed);
  const [taps, setTaps] = useState(0);
  const [toast, setToast] = useState<number | null>(null);
  const [asking, setAsking] = useState<RestartReason | null>(null);
  /** The restart under way once Restart is pressed: the mode it goes into, and whether the section goes too. */
  const [leaving, setLeaving] = useState<{ readonly dark: boolean; readonly hide: boolean } | null>(
    null,
  );
  const lastTap = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const tapVersion = useCallback(() => {
    if (asking !== null || leaving !== null) return;
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

    setToast(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!revealed) {
      setTaps(0);
      writeAppearanceRevealed(true);
      setRevealed(true);
      return;
    }
    // Hiding the section while dark is on ends dark mode too, which is a restart (1d-iii).
    // The version line keeps its pressed tint while that is asked.
    if (isDark) {
      setAsking("HIDE");
      return;
    }
    setTaps(0);
    writeAppearanceRevealed(false);
    setRevealed(false);
  }, [taps, revealed, asking, leaving]);

  return {
    revealed,
    /** The countdown the toast shows, or null when it is not up. */
    tapsLeft: toast,
    /** True while a count is under way, for the version line's pressed tint. */
    counting: taps > 0,
    /** Where the switch stands: already at the asked-for position while the sheet is up. */
    dark: asking === "ON" ? true : asking === "OFF" ? false : isDark,
    asking,
    /** The mode the veil fades to, or null while no restart is under way. */
    leavingFor: leaving?.dark ?? null,
    tapVersion,
    setDark: (dark: boolean) => {
      if (dark !== isDark) setAsking(dark ? "ON" : "OFF");
    },
    /** Restart now: the veil fades in first, and `leave` runs once it covers the screen. */
    restart: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLeaving({ dark: asking === "ON", hide: asking === "HIDE" });
      setAsking(null);
    },
    /** Cancel keeps everything as it was, and starts the tap count over. */
    cancel: () => {
      setAsking(null);
      setTaps(0);
    },
    /** Stores the new mode and reloads into it. Called by the veil once it is opaque. */
    leave: () => {
      if (leaving === null) return;
      writeDarkMode(leaving.dark);
      // Leaving dark by the seven taps hides the section as well; the switch never does.
      if (leaving.hide) writeAppearanceRevealed(false);
      writeReturnTo("/legal");
      void reloadAppAsync("Appearance changed");
    },
  };
}
