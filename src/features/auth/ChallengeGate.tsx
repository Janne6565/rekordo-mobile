import {
  CHALLENGE_BASE_URL,
  CHALLENGE_HEIGHT,
  type ChallengeMessage,
  challengeHtml,
} from "@/features/auth/challengeHtml";
import type { Challenge } from "@/features/auth/useChallenge";
import { colors, fonts } from "@/theme/colors";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

/**
 * The bot check, in the only thing that can render it.
 *
 * `baseUrl` is not decoration: Turnstile refuses to draw on a hostname that is not on the
 * widget's domain list, and a document loaded from a string has no hostname at all. It has
 * to name a domain the widget allows, and the backend's approved-hostname list has to
 * contain the same value, because that is what siteverify will report the challenge as
 * having been solved on.
 */
export function ChallengeGate({ challenge }: { challenge: Challenge }) {
  const { t, i18n } = useTranslation();
  const { siteKey, action } = challenge;

  const html = useMemo(
    () => (siteKey === null ? null : challengeHtml(siteKey, action, i18n.language)),
    [siteKey, action, i18n.language],
  );

  if (html === null) return null;

  return (
    <View style={styles.holder}>
      <WebView
        // A new document per generation, which is how a spent token is replaced: the reset
        // has to happen inside the page, and remounting is one mechanism instead of two.
        key={`${action}-${challenge.generation}`}
        source={{ html, baseUrl: CHALLENGE_BASE_URL }}
        onMessage={(event) => {
          let message: ChallengeMessage;
          try {
            message = JSON.parse(event.nativeEvent.data) as ChallengeMessage;
          } catch {
            // Nothing else posts into this webview, so an unparseable message means the
            // document is not the one written here. Treated as a failure rather than ignored.
            challenge.onMessage({ type: "error" });
            return;
          }
          challenge.onMessage(message);
        }}
        // The widget is the whole page and it is exactly this tall, so a scroll gesture here
        // would only fight the sheet it sits in.
        scrollEnabled={false}
        // Nothing in the document is worth a system share sheet or a text selection.
        style={styles.web}
        androidLayerType="software"
        // Without this the page renders on white and the sheet shows a bright rectangle
        // until the widget paints.
        backgroundColor={colors.paper}
      />
      {challenge.failed && <Text style={styles.error}>{t("auth.challengeUnavailable")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { gap: 6 },
  web: { height: CHALLENGE_HEIGHT, backgroundColor: colors.paper },
  error: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.accent,
  },
});
