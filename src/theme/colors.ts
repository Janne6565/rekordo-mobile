import { readDarkMode } from "@/local/appearance";

/**
 * Design tokens from the Claude Design deck (project a1b6280a…).
 *
 * This mirrors `src/styles.css` in rekordo-frontend. The two apps are meant to
 * read as one product — change a token here and change it there in the same commit.
 *
 * Two palettes, one table (deck "Rekordo Dark Mode · Mobile", 2d): the hidden dark mode
 * swaps the values, never the layouts. Which one is chosen once, here, at first import:
 * every stylesheet in the app is built from these at module load, so switching takes a
 * restart (see `local/appearance.ts`). Dark extends the cover-derived detail chrome rather
 * than inventing a second dark palette: paper is `night`, accent is `accentNight`. Ink is a
 * warm off-white rather than pure white, so long lists do not glare.
 */
export const isDark = readDarkMode();

/** The ink every translucent tint is made from, as RGB, so an opacity carries over unchanged. */
const INK_RGB = isDark ? "244,241,236" : "25,23,19";
/** What sits on an ink fill: white on near-black, near-black on off-white. */
const ON_INK_RGB = isDark ? "20,19,17" : "255,255,255";

/** Ink at an opacity: the deck's `rgba(25,23,19,a)`, in whichever palette is on. */
export function ink(alpha: number): string {
  return `rgba(${INK_RGB},${alpha})`;
}

/** The accent at an opacity, for tints behind accent-coloured marks. */
export function accent(alpha: number): string {
  return `rgba(${isDark ? "208,138,95" : "162,87,58"},${alpha})`;
}

/** The destructive accent at an opacity. */
export function accentStrong(alpha: number): string {
  return `rgba(${isDark ? "227,161,132" : "140,69,48"},${alpha})`;
}

/** Text or an icon on an ink-filled control, at an opacity. */
export function onInk(alpha: number): string {
  return `rgba(${ON_INK_RGB},${alpha})`;
}

const light = {
  canvas: "#efece6",
  paper: "#faf8f5",
  surface: "#ffffff",
  ink: "#191713",
  inkMuted: "rgba(25,23,19,0.55)",
  inkSubtle: "rgba(25,23,19,0.42)",
  line: "rgba(25,23,19,0.09)",
  accent: "#a2573a",
  accentHover: "#7d3f27",
  /** The darker accent the deck reserves for destructive wording ("Delete account"). */
  accentStrong: "#8c4530",
  /** Text and icons on an ink, accent or accentStrong fill. */
  onInk: "#ffffff",
  onInkMuted: "rgba(255,255,255,0.55)",
  /** A placeholder block: a sleeve not yet drawn, a tile still loading. */
  well: "#eae6de",
  /** What every shadow is cast in. Never the ink: in dark mode that would be a glow. */
  shadow: "#191713",
  /** A switch's track when on. Dark mode draws it in the accent: an off-white track hides the white knob. */
  switchOn: "#191713",
} as const;

const dark: { readonly [K in keyof typeof light]: string } = {
  canvas: "#0f0e0c",
  paper: "#141311",
  surface: "#1e1c19",
  ink: "#f4f1ec",
  inkMuted: "rgba(244,241,236,0.55)",
  inkSubtle: "rgba(244,241,236,0.42)",
  line: "rgba(244,241,236,0.09)",
  accent: "#d08a5f",
  accentHover: "#e3a184",
  accentStrong: "#e3a184",
  onInk: "#141311",
  onInkMuted: "rgba(20,19,17,0.55)",
  // Two steps above the canvas, as the dark cover placeholder (3b) is.
  well: "#25231f",
  shadow: "#000000",
  switchOn: "#d08a5f",
};

/**
 * Both palettes, for the one thing that has to paint the *other* one: the veil a restart
 * fades to (deck 1d-v), which shows the new mode before the app has reloaded into it.
 */
export const palettes = { light, dark } as const;

export const colors = {
  ...(isDark ? dark : light),

  /**
   * Dark chrome — used by the cover-derived theme on item detail screens, and by anything
   * drawn over a camera feed. The same in both palettes: it is dark either way.
   */
  night: "#141311",
  nightRaised: "#191713",
  nightInk: "#ffffff",
  nightMuted: "rgba(255,255,255,0.55)",
  nightLine: "rgba(255,255,255,0.09)",
  accentNight: "#d08a5f",
} as const;

/**
 * The two families, by the name the embedded faces carry.
 *
 * Shipped in `assets/fonts` and registered through the `expo-font` plugin in `app.json`,
 * so they are in the binary before the first frame. They were named here long before they
 * were shipped, and an unknown family is not an error on either platform -- it is a silent
 * fall back to the system font, which is what every build did until 2026-09-03.
 *
 * `sans` carries weights 400, 500, 600 and 700; `serif` only 400. A `fontWeight` outside
 * that set does not fail, it just draws the nearest face that is there. See
 * `assets/fonts/README.md`.
 */
export const fonts = {
  sans: "Manrope",
  serif: "Newsreader",
} as const;

/**
 * The cover-theming rule from turn 3 of the deck: a sleeve whose dominant tone is darker
 * than this picks the dark chrome, anything lighter picks the light one. The threshold is
 * WCAG relative luminance, which the backend computes at import and returns with the release.
 */
export const DARK_CHROME_LUMINANCE_THRESHOLD = 0.55;
