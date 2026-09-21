import { listDevices, muteDevice } from "@/api/devices";
import {
  type NotificationCategory,
  notificationPreferences,
  updateNotificationPreference,
} from "@/api/notifications";
import {
  type PushPermission,
  askForPush,
  pushPermissionState,
  syncPushRegistration,
} from "@/features/notifications/push";
import { useStore } from "@/local/StoreProvider";
import { useAppSelector } from "@/store/hooks";
import { colors, fonts } from "@/theme/colors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, Lock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ORDER: readonly NotificationCategory[] = [
  "FRIEND_REQUEST",
  "FRIEND_ACTIVITY",
  "SECURITY",
  "PRODUCT_NEWS",
];

/**
 * Screen 22a on the phone, with 22e's off states folded in — they are the same screen.
 *
 * Two levels, deliberately: *what* may reach you belongs to the account, *which device*
 * buzzes belongs to the device.
 *
 * This screen is also the only way back into the OS prompt (22b): somebody who declined on
 * the priming screen, or who never reached it because they *sent* the friend request rather
 * than accepting one, turns push on by flipping a switch in the push column. Flipping the
 * first one on is what opens the iOS dialog, and a grant registers this phone before the
 * choice is saved. Once iOS has been told no for good, 22e applies instead: the column
 * greys out, keeps its remembered positions, and points at iOS Settings rather than
 * pretending a switch here could undo that.
 *
 * The grid is read from the server, not the local store — unlike everything else under
 * Settings, which stays on this phone. That is the whole point of it: set here, and the web
 * reads the same switches.
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { store } = useStore();
  const user = useAppSelector((state) => state.auth.user);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    void store.deviceId().then(setDeviceId);
  }, [store]);

  const grid = useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: notificationPreferences,
    enabled: user !== null,
  });

  const flip = useMutation({
    mutationFn: async (next: { category: NotificationCategory; mail: boolean; push: boolean }) =>
      updateNotificationPreference(next.category, next.mail, next.push),
    onSuccess: (answer) => queryClient.setQueryData(["notificationPreferences"], answer),
  });

  const devices = useQuery({
    queryKey: ["notificationDevices"],
    queryFn: () => listDevices(deviceId ?? ""),
    enabled: user !== null && deviceId !== null,
  });

  const mute = useMutation({
    mutationFn: async (next: { id: string; muted: boolean }) =>
      muteDevice(next.id, next.muted, deviceId ?? ""),
    onSuccess: (answer) => queryClient.setQueryData(["notificationDevices"], answer),
  });

  const categories = grid.data?.categories ?? [];
  const pushAvailable = grid.data?.pushAvailable === true;
  // Security mail is excluded on purpose: it is not silenceable, so counting it would mean
  // this line could never appear.
  const allQuiet =
    categories.length > 0 && categories.every((row) => row.mailLocked || (!row.mail && !row.push));
  const emailReachable = user?.emailVerified !== false;

  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    void pushPermissionState().then(setPermission);
  }, []);

  // Live wherever flipping one could still lead somewhere: iOS has said yes, or has not been
  // asked yet. A simulator ("unsupported") can never mint a token, and until the OS has
  // answered we go by what the server knows rather than flickering the column.
  const pushSwitchable =
    permission === null ? pushAvailable : permission === "granted" || permission === "askable";
  const pushBlocked = permission === "blocked";

  /**
   * The second of the app's two doors to the iOS dialog, and the one 22b's footnote
   * promises: turning a push switch on is what asks.
   *
   * Order matters. The grid is written only after a grant, so a declined prompt leaves the
   * switch where it was rather than storing a preference nothing could honour. The device
   * registers in between, which is what turns the server's `pushAvailable` true.
   */
  const grantThenSet = async (category: NotificationCategory, mail: boolean) => {
    setAsking(true);
    try {
      const granted = await askForPush();
      setPermission(await pushPermissionState());
      if (!granted) return;
      await syncPushRegistration(store);
      await queryClient.invalidateQueries({ queryKey: ["notificationDevices"] });
      flip.mutate({ category, mail, push: true });
    } finally {
      setAsking(false);
    }
  };

  const set = (category: NotificationCategory, channel: "mail" | "push", on: boolean) => {
    const row = categories.find((candidate) => candidate.category === category);
    if (row === undefined) return;
    if (channel === "push" && on && permission !== "granted") {
      void grantThenSet(category, row.mail);
      return;
    }
    flip.mutate({
      category,
      mail: channel === "mail" ? on : row.mail,
      push: channel === "push" ? on : row.push,
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.bar}>
        {/* The title is inside the button, not beside it: going back is what the whole
            group means, and a 20px chevron is a small thing to ask a thumb to find. */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          style={styles.backGroup}
        >
          <ChevronLeft size={20} color={colors.ink} strokeWidth={1.75} />
          <Text style={styles.barTitle}>{t("notifications.title")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.scope}>{t("notifications.scopeMobile")}</Text>

        {allQuiet && (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>{t("notifications.allQuiet.title")}</Text>
            <Text style={styles.noticeBody}>{t("notifications.allQuiet.body")}</Text>
          </View>
        )}

        {/* 22e: iOS has been told no for good. The screen does not argue with that, and it
            does not offer a switch that could not honour the flip. */}
        {pushBlocked && (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>{t("notifications.pushBlocked.title")}</Text>
            <Text style={styles.noticeBody}>{t("notifications.pushBlocked.body")}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openSettings()}
              style={styles.noticeAction}
            >
              <Text style={styles.noticeActionText}>{t("notifications.pushBlocked.open")}</Text>
            </Pressable>
            <Text style={styles.noticeFootnote}>{t("notifications.pushBlocked.footnote")}</Text>
          </View>
        )}

        <View style={styles.headerRow}>
          <Text style={[styles.columnLabel, styles.categoryColumn]}>
            {t("notifications.column.category")}
          </Text>
          <Text style={styles.columnLabel}>{t("notifications.channel.mail")}</Text>
          <Text style={styles.columnLabel}>{t("notifications.channel.push")}</Text>
        </View>

        {grid.isPending ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.ink} style={styles.spinner} />
          </View>
        ) : (
          <View style={styles.card}>
            {ORDER.map((category, index) => {
              const row = categories.find((candidate) => candidate.category === category);
              if (row === undefined) return null;
              return (
                <View
                  key={category}
                  style={[styles.row, index === ORDER.length - 1 && styles.rowLast]}
                >
                  <View style={styles.categoryColumn}>
                    <Text style={styles.rowTitle}>
                      {t(`notifications.category.${category}.title`)}
                    </Text>
                    <Text style={styles.rowBody}>
                      {t(`notifications.category.${category}.short`)}
                    </Text>
                  </View>

                  <View style={styles.cell}>
                    {row.mailLocked ? (
                      <Lock size={15} color={colors.inkSubtle} strokeWidth={1.75} />
                    ) : !emailReachable ? (
                      <Text style={styles.cellNote}>{t("notifications.noConfirmedAddress")}</Text>
                    ) : (
                      <Switch
                        value={row.mail}
                        onValueChange={(on) => set(category, "mail", on)}
                        trackColor={{ true: colors.ink, false: colors.line }}
                      />
                    )}
                  </View>

                  <View style={styles.cell}>
                    {pushSwitchable ? (
                      <Switch
                        value={row.push}
                        onValueChange={(on) => set(category, "push", on)}
                        disabled={asking}
                        trackColor={{ true: colors.ink, false: colors.line }}
                      />
                    ) : pushBlocked ? (
                      // Greyed, not blank, and still showing what was chosen: if push is ever
                      // allowed again the account's answers are already here (22e).
                      <Switch
                        value={row.push}
                        disabled
                        style={styles.greyed}
                        trackColor={{ true: colors.ink, false: colors.line }}
                      />
                    ) : (
                      <Text style={styles.dash}>—</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.footnote}>{t("notifications.lockFootnote")}</Text>

        {/* The second, shorter question: which device buzzes. One mute per device, and the
            categories above are never duplicated per phone. */}
        <Text style={styles.sectionLabel}>{t("notifications.devices.heading")}</Text>
        <View style={styles.card}>
          {(devices.data ?? []).length === 0 ? (
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.categoryColumn}>
                <Text style={styles.rowTitle}>{t("notifications.devices.none")}</Text>
                <Text style={styles.rowBody}>
                  {pushSwitchable && permission !== "granted"
                    ? t("notifications.devices.noneAskable")
                    : pushBlocked
                      ? t("notifications.devices.noneBlocked")
                      : t("notifications.noPush.bodyMobile")}
                </Text>
              </View>
            </View>
          ) : (
            (devices.data ?? []).map((device, index) => (
              <View
                key={device.id}
                style={[styles.row, index === (devices.data ?? []).length - 1 && styles.rowLast]}
              >
                <View style={styles.categoryColumn}>
                  <Text style={styles.rowTitle}>
                    {device.current
                      ? t("push.devices.thisPhone")
                      : (device.label ?? device.platform)}
                  </Text>
                  <Text style={styles.rowBody}>
                    {device.mutedAt === null ? t("push.devices.allowed") : t("push.devices.muted")}
                  </Text>
                </View>
                <Switch
                  value={device.mutedAt === null}
                  onValueChange={(on) => mute.mutate({ id: device.id, muted: !on })}
                  trackColor={{ true: colors.ink, false: colors.line }}
                />
              </View>
            ))
          )}
        </View>

        <Text style={styles.footnote}>{t("notifications.savesAsYouGo")}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  barTitle: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.ink },
  body: { padding: 18, paddingBottom: 40, gap: 10 },
  scope: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.inkMuted },
  notice: {
    backgroundColor: colors.canvas,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  noticeTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  noticeBody: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.inkMuted },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  columnLabel: {
    width: 58,
    textAlign: "center",
    fontFamily: fonts.sans,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  categoryColumn: { flex: 1, gap: 2 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  spinner: { paddingVertical: 28 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowBody: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.inkMuted },
  cell: { width: 58, alignItems: "center" },
  cellNote: {
    fontFamily: fonts.sans,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
    color: colors.accent,
  },
  dash: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkSubtle },
  greyed: { opacity: 0.4 },
  noticeAction: {
    alignSelf: "flex-start",
    marginTop: 8,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  noticeActionText: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.paper,
  },
  noticeFootnote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.inkSubtle,
    marginTop: 6,
  },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 14,
  },
  footnote: { fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: colors.inkSubtle },
});
