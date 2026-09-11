import {
  CHALLENGE_HEIGHT,
  type ChallengeMessage,
  challengeUrl,
} from "@/features/auth/challengeUrl";
import type { Challenge } from "@/features/auth/useChallenge";
import { colors, fonts } from "@/theme/colors";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

/**
 * The bot check, in the only thing that can render it.
 *
 * The page is loaded by URL from the app's own domain. It used to be an HTML string with a
 * `baseUrl` pointing at production, which looks equivalent and is not: a string-loaded
 * document has no real origin, Turnstile would not run in one, and the sheet showed "the
 * check could not be loaded" on every phone while the identical widget worked in a browser.
 */
export function ChallengeGate({ challenge }: { challenge: Challenge }) {
  const { t, i18n } = useTranslation();
  const { siteKey, action } = challenge;

  const uri = useMemo(() => challengeUrl(action, i18n.language), [action, i18n.language]);

  // The page fetches the site key itself, but there is no reason to load it at all when the
  // app already knows the server has the check switched off.
  if (siteKey === null) return null;

  return (
    <View style={styles.holder}>
      <WebView
        // A fresh document per generation, which is how a spent token is replaced: the reset
        // has to happen inside the page, and remounting is one mechanism instead of two.
        key={`${action}-${challenge.generation}`}
        source={{ uri }}
        onMessage={(event) => {
          let message: ChallengeMessage;
          try {
            message = JSON.parse(event.nativeEvent.data) as ChallengeMessage;
          } catch {
            // Nothing else posts into this webview, so an unparseable message means the page
            // is not the one we serve. Treated as a failure rather than ignored.
            challenge.onMessage({ type: "error", code: "unparseable" });
            return;
          }
          challenge.onMessage(message);
        }}
        // The page failed to load at all -- offline, DNS, a captive portal. Distinct from the
        // widget failing inside a page that did load, and it has to be reported or the sheet
        // sits with an empty box and says nothing.
        onError={() => challenge.onMessage({ type: "error", code: "page-unreachable" })}
        onHttpError={(event) =>
          challenge.onMessage({
            type: "error",
            code: `page-${event.nativeEvent.statusCode}`,
          })
        }
        // The widget is the whole page and it is exactly this tall, so a scroll gesture here
        // would only fight the sheet it sits in.
        scrollEnabled={false}
        style={styles.web}
        // Without this the page renders on white and the sheet shows a bright rectangle until
        // the widget paints.
        backgroundColor={colors.paper}
      />
      {challenge.failed && (
        <Text style={styles.error}>
          {t("auth.challengeUnavailable")}
          {/* The code, small and in brackets. Cloudflare's own widget shows one for the same
              reason: the person looking at this screen is never the person who can read a
              log, and "110200" is the difference between a bug and a bad network. */}
          {challenge.failureCode !== null && (
            <Text style={styles.code}> ({challenge.failureCode})</Text>
          )}
        </Text>
      )}
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
  code: { color: colors.inkSubtle },
});
