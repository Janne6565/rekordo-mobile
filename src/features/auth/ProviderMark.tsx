import { colors } from "@/theme/colors";
import Svg, { Path } from "react-native-svg";

/**
 * The provider's own mark, beside its button (design 1b).
 *
 * The buttons are the first thing the signed-out tab offers, and an unmarked pill reading
 * "Continue with Google" is a pill anybody could have drawn. The mark is what people
 * actually scan for, and for Apple it is not optional: "Sign in with Apple" may only be
 * offered with Apple's own glyph.
 *
 * Keyed by the provider id the server sends, so a provider this does not know about simply
 * gets no mark rather than a wrong one — the button still reads and still works.
 */
export function ProviderMark({ providerId, size = 18 }: ProviderMarkProps) {
  switch (providerId) {
    case "google":
      return <GoogleMark size={size} />;
    case "apple":
      return <AppleMark size={size} />;
    default:
      return null;
  }
}

interface ProviderMarkProps {
  readonly providerId: string;
  readonly size?: number;
}

/** Google's four-colour G, at the proportions Google publishes it in. */
function GoogleMark({ size }: { readonly size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </Svg>
  );
}

/** Apple's mark, in the ink the rest of the button is set in. */
function AppleMark({ size }: { readonly size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        // Black on the light button, white on the dark one -- both are Apple's own marks.
        fill={colors.ink}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}
