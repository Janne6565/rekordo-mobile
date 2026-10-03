import Storage from "expo-sqlite/kv-store";

/**
 * The hidden dark mode's two switches, per device (deck turn "Rekordo Dark Mode · Mobile").
 *
 * Read synchronously, unlike everything else in `settings.ts`: the colour tokens are chosen
 * once, when `theme/colors.ts` is first imported, and every stylesheet in the app is built
 * from them at module load. That happens before any store is open or any effect has run,
 * so the answer has to be on hand without awaiting anything. `expo-sqlite/kv-store` keeps
 * its own small database for exactly this; it is not the collection's database, so it adds
 * no second handle to that one.
 *
 * Changing the mode therefore takes a restart, which `restartInto` performs.
 */

const DARK_MODE = "appearance.darkMode";
/** Whether the Appearance section has been found by the seven taps, and so stays shown. */
const REVEALED = "appearance.revealed";
/** The screen to reopen after the restart a switch takes, so the change shows where it was made. */
const RETURN_TO = "appearance.returnTo";

function read(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    // An unreadable preference is a light app, never a crash at the first import.
    return null;
  }
}

export function readDarkMode(): boolean {
  return read(DARK_MODE) === "true";
}

export function writeDarkMode(dark: boolean): void {
  Storage.setItemSync(DARK_MODE, String(dark));
}

export function readAppearanceRevealed(): boolean {
  return read(REVEALED) === "true";
}

export function writeAppearanceRevealed(revealed: boolean): void {
  Storage.setItemSync(REVEALED, String(revealed));
}

/** Where to go once the app is back up, read once and forgotten. */
export function takeReturnTo(): string | null {
  const route = read(RETURN_TO);
  if (route !== null) Storage.removeItemSync(RETURN_TO);
  return route;
}

export function writeReturnTo(route: string): void {
  Storage.setItemSync(RETURN_TO, route);
}
