import { ConfirmCard } from "@/features/scan/ConfirmCard";
import { SessionBar } from "@/features/scan/SessionBar";
import { TrayRow } from "@/features/scan/TrayRow";
import { type ScanCard, useScannerLogic } from "@/features/scan/useScannerLogic";
import { type KeptScan, scanNaming } from "@/store/scanSlice";
import { colors, fonts } from "@/theme/colors";
import { formatBarcode } from "@janne6565/rekordo-shared";
import { CameraView } from "expo-camera";
import {
  CloudOff,
  Flashlight,
  Heart,
  LibraryBig,
  MoveDiagonal,
  PencilLine,
  ScanBarcode,
  X,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** The camera window, and the shorter one a tall card is given room by. */
const WINDOW = 210;
const WINDOW_SHORT = 150;
/** The clear rectangle in the feed, and how far in from the window's sides it sits. */
const ZONE = 96;
const ZONE_SHORT = 90;
const ZONE_INSET = 22;

/**
 * The camera as a window in the app's own page, not a dark room the app switches into.
 *
 * The old scanner took the whole screen black, which made adding a record feel like
 * leaving the app to use a tool. Here the paper tone of the library stays, the feed is a
 * rounded window inside it, and everything the flow says — the advice, the card, the tray
 * — is said on the paper around it. Adding is part of the shelf, not a detour from it.
 *
 * The feed keeps reading while a card is up, so the next sleeve is its own way of saying
 * "not this one", and the session bar stays under everything: neither the camera nor the
 * tray is something a card has to be answered to get back to.
 *
 * Scan deck, screens 2a through 2f.
 */
export function ScannerScreen() {
  const { t } = useTranslation();
  const logic = useScannerLogic();

  if (logic.permission !== null && !logic.permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>{t("scan.permission.title")}</Text>
          <Text style={styles.permissionBody}>{t("scan.permission.body")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void logic.requestPermission()}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>{t("scan.permission.allow")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => logic.enterManually()}>
            <Text style={styles.quiet}>{t("scan.enterManually")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const card = logic.card;
  // Three pressings under a question is the one card taller than the room the full window
  // leaves, so the window gives way rather than the card scrolling its question off.
  const short = card !== null && (card.kind === "PRESSINGS" || logic.picking);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={logic.close}
          style={styles.round}
        >
          <X size={16} color={colors.inkMuted} strokeWidth={1.9} />
        </Pressable>
        {/* The offline note sits between the two, where it explains the flow rather than
            interrupting it: scanning still works, only the naming is postponed. */}
        {card?.kind === "OFFLINE" && (
          <View style={styles.offlineNote}>
            <CloudOff size={13} color={colors.inkMuted} strokeWidth={1.8} />
            <Text style={styles.offlineNoteText}>{t("scan.offlineKept")}</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => logic.enterManually()}
          style={styles.manualLink}
        >
          <PencilLine size={14} color={colors.accent} strokeWidth={1.8} />
          <Text style={styles.manualLinkText}>
            {card?.kind === "OFFLINE" ? t("scan.manual") : t("scan.enterManually")}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.window, short && styles.windowShort]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          enableTorch={logic.torch}
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
          }}
          onBarcodeScanned={({ data }) => logic.handleScan(data)}
        />
        <ScanZone answering={card !== null} short={short} />
        <Text style={[styles.feedLabel, short && styles.feedLabelShort]}>{t("scan.feed")}</Text>

        {logic.advising && (
          <View style={styles.advice}>
            <MoveDiagonal size={13} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
            <Text style={styles.adviceText}>{t("scan.advice")}</Text>
          </View>
        )}

        {/* What the sleeve now in frame pushed aside. In the feed rather than on the card,
            because it is about the read, and the card is already about something else. */}
        {logic.skipped !== null && (
          <View style={styles.skipped}>
            <Text style={styles.skippedText} numberOfLines={1}>
              {t("scan.skipped", { title: cardName(logic.skipped) })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={logic.undoSkip}
              hitSlop={8}
              style={styles.skippedUndo}
            >
              <Text style={styles.skippedUndoText}>{t("scan.undo")}</Text>
            </Pressable>
          </View>
        )}

        {/* Not in the short window: there the zone reaches the corner the button sits in. */}
        {!short && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("scan.torch")}
            onPress={logic.toggleTorch}
            style={[styles.torch, logic.torch && styles.torchOn]}
          >
            <Flashlight
              size={18}
              color={logic.torch ? colors.night : "#ffffff"}
              strokeWidth={logic.torch ? 1.9 : 1.8}
            />
          </Pressable>
        )}
      </View>

      {card !== null ? (
        <View style={styles.cardSpacer} />
      ) : logic.kept.length === 0 ? (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>{t("scan.prompt.title")}</Text>
          <Text style={styles.promptBody}>{t("scan.prompt.body")}</Text>
        </View>
      ) : (
        <ScrollView style={styles.tray} contentContainerStyle={styles.trayContent}>
          <Text style={styles.trayLabel}>{t("scan.keptThisSession")}</Text>
          {logic.kept.map((scan, index) => (
            <TrayRow key={scan.key} scan={scan} last={index === logic.kept.length - 1} />
          ))}
        </ScrollView>
      )}

      {card === null && logic.justKept !== null && (
        <KeptNote scan={logic.justKept} onUndo={logic.undoKeep} />
      )}
      {card !== null && <ConfirmCard logic={logic} />}

      <SessionBar quiet={card !== null} />
    </SafeAreaView>
  );
}

/** What a card is called once it is no longer on screen: its record, or its digits. */
function cardName(card: ScanCard): string {
  return card.picked?.title ?? formatBarcode(card.barcode);
}

/**
 * What just landed, and the one tap that takes it back.
 *
 * A new row in the tray was the only confirmation a keep used to get, so a thumb that
 * landed on the wrong one of two equal buttons was found out in Review, if at all. This
 * names the record and the list it went to, for a few seconds, right above where the
 * buttons were.
 */
function KeptNote({ scan, onUndo }: { readonly scan: KeptScan; readonly onUndo: () => void }) {
  const { t } = useTranslation();
  const wished = scan.destination === "WISHLIST";
  const naming = scanNaming(scan);
  const title = naming === null || naming.title === "" ? formatBarcode(scan.barcode) : naming.title;
  const Icon = wished ? Heart : LibraryBig;

  return (
    <View style={styles.noteWrap}>
      <View style={styles.note}>
        <Icon size={14} color="#ffffff" strokeWidth={1.9} />
        <Text style={styles.noteText} numberOfLines={1}>
          {wished ? t("scan.onTheWishlist", { title }) : t("scan.onTheShelf", { title })}
        </Text>
        <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={8} style={styles.noteUndo}>
          <Text style={styles.noteUndoText}>{t("scan.undo")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The scan zone: the feed dimmed everywhere except one clear rectangle.
 *
 * Four dimming panels around a hole rather than one giant spread shadow. The deck draws it
 * as a 400px shadow spread, which is a CSS trick with no dependable equivalent here — and
 * four rectangles are exactly what the effect is, with nothing left to a shadow renderer.
 *
 * While a card is being answered the zone stays, dashed and darker, and says what pointing
 * at it now would do. Hiding it told people the camera had stopped, which it has not.
 *
 * No corner brackets and no laser line: the hole says where to point, and a shop is not
 * the place to explain a viewfinder twice.
 */
function ScanZone({ answering, short }: { readonly answering: boolean; readonly short: boolean }) {
  const { t } = useTranslation();
  const height = short ? ZONE_SHORT : ZONE;
  const edge = ((short ? WINDOW_SHORT : WINDOW) - height) / 2;
  const dim = answering ? styles.dimAnswering : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.dim, dim, { left: 0, right: 0, top: 0, height: edge }]} />
      <View style={[styles.dim, dim, { left: 0, right: 0, bottom: 0, height: edge }]} />
      <View style={[styles.dim, dim, { left: 0, top: edge, bottom: edge, width: ZONE_INSET }]} />
      <View style={[styles.dim, dim, { right: 0, top: edge, bottom: edge, width: ZONE_INSET }]} />
      <View style={[styles.zone, answering && styles.zoneAnswering, { top: edge, height }]}>
        {answering && (
          <>
            <ScanBarcode size={14} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            <Text style={styles.zoneText}>{t("scan.nextSleeveSkips")}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 10,
  },
  round: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  offlineNote: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  offlineNoteText: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: colors.inkMuted,
  },
  manualLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  manualLinkText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "500", color: colors.accent },

  window: {
    height: WINDOW,
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#23211a",
  },
  windowShort: { height: WINDOW_SHORT },
  dim: { position: "absolute", backgroundColor: "rgba(12,11,8,0.42)" },
  dimAnswering: { backgroundColor: "rgba(12,11,8,0.55)" },
  zone: {
    position: "absolute",
    left: ZONE_INSET,
    right: ZONE_INSET,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  zoneAnswering: { borderStyle: "dashed", borderColor: "rgba(255,255,255,0.4)" },
  zoneText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },
  feedLabel: {
    position: "absolute",
    left: 16,
    top: 14,
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.95,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
  },
  feedLabelShort: { top: 10 },
  advice: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  adviceText: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.85)",
    flexShrink: 1,
  },
  skipped: {
    position: "absolute",
    left: 13,
    bottom: 13,
    // Stops short of the torch, so a long title is cut rather than laid over the button.
    maxWidth: "78%",
    height: 36,
    paddingLeft: 13,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  skippedText: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },
  skippedUndo: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  skippedUndoText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: "#ffffff" },
  torch: {
    position: "absolute",
    right: 13,
    bottom: 13,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  torchOn: { backgroundColor: "#ffffff" },

  prompt: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 },
  promptTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 27,
    color: colors.ink,
    textAlign: "center",
  },
  promptBody: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: 6,
  },
  /*
   * The gap between the camera window and the card, and nothing else.
   *
   * A zero basis with no shrink of its own: it takes whatever space is spare and gives up
   * none, so a card taller than the room left shrinks and scrolls rather than running off
   * the bottom edge with its buttons on it.
   */
  cardSpacer: { flexGrow: 1, flexShrink: 0, flexBasis: 0 },

  tray: { flex: 1 },
  trayContent: { paddingHorizontal: 16, paddingTop: 18 },
  trayLabel: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },

  noteWrap: { alignItems: "center", paddingHorizontal: 16, paddingBottom: 10 },
  note: {
    maxWidth: "100%",
    height: 40,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  noteText: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    fontWeight: "500",
    color: "#ffffff",
  },
  noteUndo: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  noteUndoText: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: "600", color: "#ffffff" },

  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  permissionTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    textAlign: "center",
  },
  permissionBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkMuted,
    textAlign: "center",
  },
  primary: {
    height: 50,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: "#ffffff" },
  quiet: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "500", color: colors.accent },
});
