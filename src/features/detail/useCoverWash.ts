import { appChromeFor } from "@/theme/chrome";
import {
  type CoverTheme,
  DURATION,
  type DetailChrome,
  EASING,
  REDUCED,
  WASH_DARK,
  WASH_INSTANT_BEFORE,
  WASH_LANES,
  lightnessOfHex,
} from "@janne6565/rekordo-shared";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/**
 * The cover-theme wash (turn 13c/13d) — the one moment in this app where a screen changes
 * under a reader who has not touched it.
 *
 * A release added from search arrives with no palette; it is sampled server-side on the
 * detail lookup, which is now fetched *beside* the screen rather than in front of it. So
 * the record opens in paper and the sleeve's colour lands anywhere from 100ms to several
 * seconds later — sometimes taking the whole screen from paper to near-black.
 *
 * The deck's finding, and the reason this is not one tween: interpolating ink and paper
 * together passes through a grey where neither is legible. So the text does not tween. Two
 * stacked copies of the screen cross-fade over 100ms at the point where the contrast
 * crosses, while the background alone runs the full 560ms underneath them.
 *
 * Nothing here interpolates `backgroundColor`, which would be JS-driven and stutters on a
 * cheap Android device. The themed screen is rendered *under* the paper one and it is the
 * paper layer's opacity that moves, on the native driver. Same picture, no dropped frames,
 * and no animation library.
 */
export interface CoverWash {
  /** The chrome to draw the screen in — the destination, from the first frame. */
  readonly chrome: DetailChrome;
  /** The chrome the outgoing copy is drawn in, or null when there is nothing to fade out. */
  readonly outgoing: DetailChrome | null;
  /**
   * Opacity of the *destination* background, which lies on top and fades in.
   *
   * This way round on purpose. It used to be the other way -- the destination underneath
   * and a covering layer fading out -- and that layer's colour was React state while its
   * opacity was an Animated value. State lands on the next render, `setValue` lands at
   * once, so for a frame or more a fully opaque layer sat there in the *previous*
   * transition's colour: a white flash on the first swipe and a stale one on every
   * subsequent one. The colour that has to be right at the instant the animation starts is
   * now the one this render already knows.
   */
  readonly paper: Animated.Value;
  /**
   * The background currently painted underneath — what the destination is fading in over.
   *
   * It lags by one transition by construction, which is exactly right: at the moment a new
   * theme lands this still holds the colour that is on the screen, so nothing has to be
   * updated in time for anything.
   */
  readonly settled: string;
  /** Opacity of the outgoing copy of the screen's content. */
  readonly outgoingOpacity: Animated.Value;
  /** Opacity of accent-coloured marks, which land last. */
  readonly accent: Animated.Value;
  /** What the status bar should be while the wash runs. It flips with the text. */
  readonly barStyle: "light" | "dark";
}

const bezier = (curve: readonly [number, number, number, number]) =>
  Easing.bezier(curve[0], curve[1], curve[2], curve[3]);

export function useCoverWash(given: CoverTheme | null): CoverWash {
  /*
   * A null palette almost never means "this record is paper-coloured". It is sampled only
   * on the single-release lookup, so every release reached any other way -- through sync,
   * through search -- arrives without one and gets it fetched afterwards. Leafing through
   * records therefore ran theme -> null -> theme, and the null leg is paper: a white flash
   * on every copy whose detail had not been opened before.
   *
   * So an unknown palette holds whatever is already on screen instead of falling back to
   * paper. Paper is still the answer on arrival, when there is nothing to hold. The cost is
   * that a record which genuinely has no cover keeps the previous one's tone while you are
   * leafing, which is a far smaller lie than a strobe.
   */
  const [held, setHeld] = useState<CoverTheme | null>(given);
  useEffect(() => {
    if (given !== null) setHeld(given);
  }, [given]);
  const theme = given ?? held;
  const chrome = appChromeFor(theme);

  const paper = useRef(new Animated.Value(0)).current;
  const outgoingOpacity = useRef(new Animated.Value(0)).current;
  const accent = useRef(new Animated.Value(1)).current;

  const mountedAt = useRef(Date.now());
  /** The chrome the screen was in before this theme arrived, while it fades away. */
  const [outgoing, setOutgoing] = useState<DetailChrome | null>(null);
  const [barStyle, setBarStyle] = useState<"light" | "dark">(chrome.dark ? "light" : "dark");
  const previous = useRef<CoverTheme | null>(theme);
  const [settled, setSettled] = useState<string>(appChromeFor(null).background);
  const reduced = useRef(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduced.current = on;
    });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
      reduced.current = on;
    });
    return () => {
      alive = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    const was = previous.current;
    previous.current = theme;

    // Nothing arrived. No fade to neutral, no flash, no retry affordance — paper was
    // already the answer, and a failure looks identical to it.
    if (theme === null) {
      setBarStyle(chrome.dark ? "light" : "dark");
      return;
    }

    const from = appChromeFor(was);
    const to = appChromeFor(theme);
    if (from.dark === to.dark && from.background === to.background) {
      /*
       * Nothing to cross -- but the destination still has to be *on*. The screen is two
       * stacked layers, `settled` underneath and the destination above it at `paper`'s
       * opacity, and this branch used to return with `paper` still at zero: correct when
       * it fires mid-life (the layer is already up from the wash that got us here), wrong
       * on the very first run, because `previous` starts out holding this same theme.
       *
       * That is the case where the palette is already known at mount -- a record opened a
       * second time, or one of the neighbours warmed by `useNeighbourPalettes` -- and the
       * screen came up drawn entirely in the sleeve's chrome over a background still on
       * paper: white text on cream, unreadable, and only "sometimes" because it needed the
       * theme to be there before the first frame.
       */
      paper.setValue(1);
      setSettled(to.background);
      setBarStyle(to.dark ? "light" : "dark");
      return;
    }

    /*
     * One cover swapped for another, which only happens now that the record next to this
     * one is a swipe away. The background alone crosses -- the words are already being
     * handed over by whatever caused the swap, and a second fade on top of that reads as
     * mud. It crosses *from the old sleeve's tone*, never through paper: two dark covers
     * with a white flash between them would be worse than the snap this replaces.
     */
    if (was !== null) {
      /*
       * Shorter than the arrival wash on purpose. That one is slow because it happens *to*
       * a reader who did not ask for it -- a palette landing seconds after the record
       * opened. This one answers a swipe, and a leisurely fade behind a gesture reads as
       * lag rather than as craft.
       */
      paper.setValue(0);
      const flipBar = setTimeout(() => setBarStyle(to.dark ? "light" : "dark"), 120);
      Animated.timing(paper, {
        toValue: 1,
        duration: reduced.current ? REDUCED.washDuration : 260,
        easing: bezier(EASING.move),
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Only once it has actually arrived: the layer underneath becomes the colour that
        // just won, ready to be the "from" of whatever comes next.
        if (finished) setSettled(to.background);
      });
      return () => clearTimeout(flipBar);
    }

    setSettled(appChromeFor(null).background);

    /*
     * Landed while the push was still settling. A wash inside a push reads as a glitch, so
     * it is applied outright — and the reader never saw the paper version anyway.
     */
    if (Date.now() - mountedAt.current < WASH_INSTANT_BEFORE) {
      paper.setValue(1);
      setSettled(to.background);
      setBarStyle(to.dark ? "light" : "dark");
      return;
    }

    if (reduced.current) {
      // The fade stays; only the staging goes.
      paper.setValue(0);
      setBarStyle(to.dark ? "light" : "dark");
      Animated.timing(paper, {
        toValue: 1,
        duration: REDUCED.washDuration,
        easing: bezier(EASING.move),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setSettled(to.background);
      });
      return;
    }

    /*
     * The bigger the change, the more it has to read as a wash rather than a light switch,
     * so a very dark target stretches and takes the text swap with it.
     */
    const gap = Math.abs((lightnessOfHex(theme.dominantColor) ?? 0.5) - 0.97);
    const long = gap > WASH_DARK.gapThreshold;
    const duration = long ? WASH_DARK.duration : DURATION.wash;
    const textAt = long ? WASH_DARK.textAt : WASH_LANES.textAt;

    paper.setValue(0);
    outgoingOpacity.setValue(1);
    accent.setValue(0);
    setOutgoing(from);

    // Lane one: the background, the whole way, on its own.
    Animated.timing(paper, {
      toValue: 1,
      duration,
      easing: bezier(EASING.move),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSettled(to.background);
    });

    // Lane two: the text, as two stacked copies rather than one tween through grey. The
    // 100ms is centred on the crossing point, so it starts half of it earlier.
    Animated.timing(outgoingOpacity, {
      toValue: 0,
      delay: Math.max(0, textAt - WASH_LANES.textDuration / 2),
      duration: WASH_LANES.textDuration,
      easing: bezier(EASING.move),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setOutgoing(null);
    });

    // The bar belongs to the text, not the background: it flips when the words do.
    const flip = setTimeout(() => setBarStyle(to.dark ? "light" : "dark"), textAt);

    // Lane three: the accent lands last, once there is a settled chrome to be legible on.
    Animated.timing(accent, {
      toValue: 1,
      delay: WASH_LANES.accentAt,
      duration: WASH_LANES.accentDuration,
      easing: bezier(EASING.move),
      useNativeDriver: true,
    }).start();

    return () => clearTimeout(flip);
  }, [theme, chrome.dark, paper, outgoingOpacity, accent]);

  return { chrome, outgoing, paper, settled, outgoingOpacity, accent, barStyle };
}
