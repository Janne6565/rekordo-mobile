import { FramingScreen } from "@/features/account/FramingScreen";
import type { ProfilePictureLogic } from "@/features/account/useProfilePictureLogic";
import { Avatar } from "@/features/friends/Avatar";
import { accent, colors, fonts, ink, isDark } from "@/theme/colors";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Screen 27a and 27c — the only place in the app that offers a profile picture.
 *
 * <p>One row above the display name, a 44 circle showing exactly what everyone else sees,
 * and a chevron rather than a verb, because on a phone the row itself is the control.
 * Nothing anywhere else asks for a picture, nudges towards one, or marks its absence: a list
 * where nine of twelve people are initials only reads as intended if nothing ever suggested
 * otherwise.
 *
 * <p>The circle never previews the upload. It changes on the server's word and not before
 * (27d), so a failure never has to un-show a face.
 */
export function PictureRow({
  logic,
  name,
  handle,
}: {
  readonly logic: ProfilePictureLogic;
  readonly name: string;
  readonly handle: string | null;
}) {
  const { t } = useTranslation();
  const { state } = logic;
  const failed =
    state.kind === "wrongType" || state.kind === "tooLarge" || state.kind === "unavailable";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("account.picture.title")}
        onPress={state.kind === "uploading" ? logic.cancelUpload : logic.open}
        style={[styles.row, failed && styles.rowFailed]}
      >
        <Progress logic={logic}>
          <Avatar name={name} uri={logic.url} size={state.kind === "uploading" ? 42 : 44} />
        </Progress>
        <View style={styles.text}>
          <Text style={styles.title}>{t("account.picture.title")}</Text>
          <Text style={[styles.body, failed && styles.bodyFailed]}>
            <Caption logic={logic} handle={handle} />
          </Text>
        </View>
        {state.kind === "uploading" ? (
          <Text style={styles.verb}>{t("common.cancel")}</Text>
        ) : failed ? (
          <Text style={styles.verb}>
            {state.kind === "unavailable"
              ? t("account.picture.tryAgain")
              : t("account.picture.chooseAnother")}
          </Text>
        ) : (
          <ChevronRight size={16} color={colors.inkSubtle} strokeWidth={1.75} />
        )}
      </Pressable>

      {state.kind === "framing" && (
        <FramingScreen
          picture={state.picture}
          onCancel={logic.cancelFraming}
          onConfirm={logic.confirmFraming}
        />
      )}
      {logic.sheetOpen && <ActionSheet logic={logic} handle={handle} />}
    </>
  );
}

/**
 * Screen 27e — replace and remove, and the sheet is its own confirmation.
 *
 * <p>No second dialog behind the destructive row: standing a sheet on a sheet to ask about a
 * picture would be the app taking itself more seriously than the thing it is asking about.
 * The row is set apart and coloured, which on a phone is what a confirmation looks like.
 */
function ActionSheet({
  logic,
  handle,
}: {
  readonly logic: ProfilePictureLogic;
  readonly handle: string | null;
}) {
  const { t } = useTranslation();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={logic.closeSheet}>
      <Pressable style={styles.scrim} onPress={logic.closeSheet} accessibilityRole="button">
        <View style={styles.sheetArea}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetHeadText}>
                {handle === null
                  ? t("account.picture.sheet.publicNoHandle")
                  : t("account.picture.sheet.publicAt", { handle })}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={logic.pick} style={styles.sheetRow}>
              <Text style={styles.sheetRowText}>{t("account.picture.sheet.replace")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={logic.remove}
              style={[styles.sheetRow, styles.sheetRowLast]}
            >
              <Text style={[styles.sheetRowText, styles.destructive]}>
                {t("account.picture.sheet.remove")}
              </Text>
            </Pressable>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={logic.closeSheet} style={styles.cancel}>
            <Text style={styles.sheetRowText}>{t("common.cancel")}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * The ring around the circle while the bytes are going up.
 *
 * Determinate, because it can be: a 12 MB picture on a phone connection is long enough to
 * watch, and a spinner over a long wait says only that something is happening. Drawn as an
 * arc-less ring plus a fill sweep, since a conic gradient is a browser thing.
 */
function Progress({
  logic,
  children,
}: {
  readonly logic: ProfilePictureLogic;
  readonly children: React.ReactNode;
}) {
  if (logic.state.kind !== "uploading") return <>{children}</>;
  const { sent, total } = logic.state;
  const done = total === 0 ? 0 : Math.min(1, sent / total);

  return (
    <View style={styles.progress}>
      <View style={styles.progressTrack} />
      {/* The ring fills by width rather than by sweep: a real arc would need a drawing
          library, and at 52px a bar around the rim reads the same. */}
      <View style={[styles.progressFill, { width: `${done * 100}%` }]} />
      <View style={styles.progressInner}>{children}</View>
    </View>
  );
}

/** The sentence under "Picture", which is different in every one of 27d's states. */
function Caption({
  logic,
  handle,
}: {
  readonly logic: ProfilePictureLogic;
  readonly handle: string | null;
}) {
  const { t } = useTranslation();

  switch (logic.state.kind) {
    case "choosing":
      return <>{t("account.picture.choosing")}</>;
    case "uploading":
      return (
        <>
          {t("account.picture.uploading", {
            sent: (logic.state.sent / 1_000_000).toFixed(1),
            total: (logic.state.total / 1_000_000).toFixed(1),
          })}
        </>
      );
    case "wrongType":
      return <>{t("account.picture.wrongType", { name: logic.state.name })}</>;
    case "tooLarge":
      return (
        <>
          {t("account.picture.tooLarge", {
            name: logic.state.name,
            size: (logic.state.bytes / 1_000_000).toFixed(1),
          })}
        </>
      );
    case "unavailable":
      return <>{t("account.picture.unavailable")}</>;
    default:
      if (logic.url === null) return <>{t("account.picture.notSet")}</>;
      if (logic.justUpdated) return <>{t("account.picture.updated")}</>;
      return handle === null ? (
        <>{t("account.picture.publicNoHandle")}</>
      ) : (
        <>{t("account.picture.publicAt", { handle })}</>
      );
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowFailed: {
    borderWidth: 1,
    borderColor: accent(0.35),
    borderRadius: 12,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  body: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  bodyFailed: { color: colors.accentStrong, lineHeight: 17 },
  verb: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.accent },

  progress: {
    width: 52,
    height: 52,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: ink(0.12),
  },
  progressTrack: { ...StyleSheet.absoluteFill },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
  },
  progressInner: { position: "absolute", left: 5, top: 5, right: 5, bottom: 5 },

  scrim: { flex: 1, backgroundColor: "rgba(25,23,19,0.34)", justifyContent: "flex-end" },
  sheetArea: { padding: 10, paddingBottom: 12 },
  sheet: {
    backgroundColor: isDark ? "rgba(20,19,17,0.97)" : "rgba(250,248,245,0.97)",
    borderRadius: 16,
    overflow: "hidden",
  },
  sheetHead: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: ink(0.08),
  },
  sheetHeadText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: "500",
    color: colors.inkMuted,
  },
  sheetRow: {
    paddingVertical: 15,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: ink(0.08),
  },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetRowText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  destructive: { color: colors.accentStrong },
  cancel: {
    marginTop: 9,
    backgroundColor: colors.paper,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
});
