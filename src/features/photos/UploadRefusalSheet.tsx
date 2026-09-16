import { accountStorage } from "@/api/storage";
import { RisingSheet, useSheetBottom } from "@/components/RisingSheet";
import { formatMegabytes } from "@/features/account/storageReading";
import { useStore } from "@/local/StoreProvider";
import { markRefusalSeen, readUploadRefusal } from "@/local/uploadRefusal";
import { colors, fonts } from "@/theme/colors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * What a refused upload says, once (design 28d).
 *
 * The photo was saved and attached before the server ever answered, so this reports a fact
 * rather than a failure: nothing to retry, nothing lost, and the picture is on this phone
 * and perfectly usable. That is why the heading is "Saved on this phone" and not an
 * apology, and why the only button is OK.
 *
 * **The two refusals must not read alike.** A full account is fixed by deleting a photo; a
 * picture over the single-upload ceiling is fixed by choosing another one. So each wording
 * names its own fix *and rules out the other's*, because the one thing worse than no advice
 * is advice that cannot work.
 *
 * Shown from above the tabs rather than from the editor. The refusal is learned during a
 * sync, which lands whenever it lands: often after the sheet that saved the copy is long
 * gone. Hanging this off the editor would mean the news arrives only if you happen to still
 * be standing there.
 */
export function UploadRefusalSheet() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { store } = useStore();
  const queryClient = useQueryClient();

  // Every sync ends in invalidateQueries, so this re-reads itself the moment one records a
  // refusal, and clears itself the moment one uploads something.
  const refusal = useQuery({
    queryKey: ["uploadRefusal"],
    queryFn: async () => {
      const found = await readUploadRefusal(store);
      if (found === null) return null;
      const seen = await store.readSetting("photo.upload.refusal.seen");
      return seen === String(found.at) ? null : found;
    },
  });

  const pending = refusal.data ?? null;

  // The allowance is configuration, not a constant, so the sentence asks rather than
  // hardcoding what the board happened to draw. Same query key as the meter, so it is one
  // request; and if it has not answered, the sentence is drawn without the figures rather
  // than with invented ones.
  const usage = useQuery({
    queryKey: ["accountStorage"],
    queryFn: accountStorage,
    enabled: pending?.reason === "full",
  });
  const quota =
    usage.data === undefined ? null : formatMegabytes(usage.data.quotaBytes, i18n.language);

  const dismiss = async () => {
    if (pending !== null) await markRefusalSeen(store, pending);
    await queryClient.invalidateQueries({ queryKey: ["uploadRefusal"] });
  };

  const bottom = useSheetBottom(SHEET_PAD);

  const showStorage = async () => {
    await dismiss();
    router.push("/(tabs)/you");
  };

  return (
    <Modal
      visible={pending !== null}
      transparent
      animationType="fade"
      onRequestClose={() => void dismiss()}
    >
      <View style={styles.scrim}>
        <RisingSheet
          visible={pending !== null}
          style={[styles.sheet, { paddingBottom: bottom }]}
          onDismiss={() => void dismiss()}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{t("photos.refusal.title")}</Text>
          <Text style={styles.body}>
            {pending?.reason === "tooLarge"
              ? t("photos.refusal.tooLarge")
              : quota === null
                ? t("photos.refusal.fullPlain")
                : t("photos.refusal.full", { quota })}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void dismiss()} style={styles.ok}>
            <Text style={styles.okText}>{t("photos.refusal.ok")}</Text>
          </Pressable>
          {/* Only for the one this screen can do something about: there is no storage to
              look at when the answer is "choose a smaller picture". */}
          {pending?.reason === "full" && (
            <Pressable accessibilityRole="button" onPress={() => void showStorage()}>
              <Text style={styles.link}>{t("photos.refusal.showStorage")}</Text>
            </Pressable>
          )}
        </RisingSheet>
      </View>
    </Modal>
  );
}

/** What the sheet sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 40;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(25,23,19,0.38)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: SHEET_PAD,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(25,23,19,0.16)",
    alignSelf: "center",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 23,
    lineHeight: 27,
    color: colors.ink,
    marginTop: 18,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 21,
    color: colors.inkMuted,
    marginTop: 10,
  },
  ok: {
    height: 48,
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  okText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.paper },
  link: {
    textAlign: "center",
    marginTop: 14,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },
});
