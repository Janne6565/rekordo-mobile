import { WEB_BASE } from "@/api/config";
import type { Visibility } from "@/api/friends";
import { useSharingLogic } from "@/features/friends/useSharingLogic";
import { colors, fonts } from "@/theme/colors";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Check, ChevronLeft, Copy, EyeOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Screen 15f — three lists, three separate answers.
 *
 * The collection and the wishlist are asked separately because a public wishlist over a
 * friends-only shelf is the normal case: what you are hunting for is a much smaller thing
 * to share than what you own.
 */
export function SharingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const logic = useSharingLogic();
  const settings = logic.settings;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <ChevronLeft size={20} color={colors.ink} strokeWidth={1.75} />
        </Pressable>
        <Text style={styles.barTitle}>{t("sharing.title")}</Text>
      </View>

      {settings === undefined ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.inkSubtle} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t("sharing.handleLabel")}</Text>
                <Text style={styles.rowBody}>@{settings.handle}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t("sharing.findable.title")}</Text>
                <Text style={styles.rowBody}>{t("sharing.findable.body")}</Text>
              </View>
              <Switch
                value={settings.findable ?? true}
                onValueChange={(findable) => logic.set({ findable })}
                trackColor={{ true: colors.ink, false: colors.line }}
              />
            </View>
          </View>

          {/*
           * The address itself, always shown and always copyable.
           *
           * The web panel only draws it once a list is public; on a phone that is the wrong
           * trade. This is the one screen that knows the address, there is no URL bar to
           * read it out of, and a friends-only shelf is still a page a friend can open. So
           * the link stays, and the line under it says who can open it today.
           */}
          {settings.handle !== undefined && settings.handle !== "" && (
            <>
              <Text style={styles.sectionLabel}>{t("sharing.link.heading")}</Text>
              <View style={styles.card}>
                <PublicLink
                  handle={settings.handle}
                  label={t("sharing.link.collection")}
                  who={t(WHO_KEY[settings.collectionVisibility ?? "FRIENDS"])}
                />
                {/* Only where it is a second address worth sending. A wishlist nobody may
                    see is not one, and a copy button beside the wrong of two links that
                    truncate alike is a link sent to the wrong place. */}
                {settings.wishlistVisibility === "PUBLIC" && (
                  <>
                    <View style={styles.divider} />
                    <PublicLink
                      handle={settings.handle}
                      path="/wishlist"
                      label={t("sharing.link.wishlist")}
                      who={t("sharing.link.who.public")}
                    />
                  </>
                )}
              </View>
            </>
          )}

          <Choices
            legend={t("sharing.collection.legend")}
            value={settings.collectionVisibility ?? "FRIENDS"}
            onChange={logic.setCollection}
          />

          <Choices
            legend={t("sharing.wishlist.legend")}
            value={settings.wishlistVisibility ?? "FRIENDS"}
            onChange={logic.setWishlist}
            note={t("sharing.wishlist.note")}
          />

          <Text style={styles.sectionLabel}>{t("sharing.money")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t("sharing.prices.title")}</Text>
                <Text style={styles.rowBody}>
                  {settings.pricesPublic === true
                    ? t("sharing.prices.on")
                    : t("sharing.prices.off")}
                </Text>
              </View>
              <Switch
                value={settings.pricesPublic ?? false}
                onValueChange={(pricesPublic) => logic.set({ pricesPublic })}
                trackColor={{ true: colors.ink, false: colors.line }}
              />
            </View>
          </View>

          {/* Its own section rather than a second row under Money: what a record is worth to
              you and what it cost are two different confidences, and somebody who opens the
              prices off is not thereby saying anything about the stars. */}
          <Text style={styles.sectionLabel}>{t("sharing.stars")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t("sharing.ratings.title")}</Text>
                <Text style={styles.rowBody}>
                  {settings.ratingsShared === true
                    ? t("sharing.ratings.on")
                    : t("sharing.ratings.off")}
                </Text>
              </View>
              <Switch
                value={settings.ratingsShared ?? false}
                onValueChange={(ratingsShared) => logic.set({ ratingsShared })}
                trackColor={{ true: colors.ink, false: colors.line }}
              />
            </View>
          </View>

          <View style={styles.footnote}>
            <EyeOff size={15} color={colors.inkMuted} strokeWidth={1.75} />
            <Text style={styles.footnoteText}>{t("sharing.perCopyNote")}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * All three answers visible at once, rather than behind a picker. A privacy setting
 * somebody has to open a menu to compare is one they will get wrong.
 */
/**
 * Spelled out rather than lower-cased from the enum: the i18n resources are typed, and a
 * key built by string arithmetic is not a key the type checker can see.
 */
const WHO_KEY = {
  ONLY_ME: "sharing.link.who.only_me",
  FRIENDS: "sharing.link.who.friends",
  PUBLIC: "sharing.link.who.public",
} as const;

/**
 * One public address, with a button that puts it on the clipboard.
 *
 * The label earns its place as soon as there can be two: `/@janne` and `/@janne/wishlist`
 * truncate to nearly the same string in this width.
 *
 * The scheme is dropped from what is drawn and kept in what is copied. A phone has no room
 * for eight characters that say nothing, and a link pasted without them is not a link.
 */
function PublicLink({
  handle,
  path = "",
  label,
  who,
}: {
  readonly handle: string;
  readonly path?: string;
  readonly label: string;
  readonly who: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `${WEB_BASE}/@${handle}${path}`;

  // Otherwise the two-second reset fires into a screen that has been left, which React
  // Native answers with a warning about setting state on an unmounted component.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <View style={styles.linkRow}>
      <View style={styles.rowText}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.linkUrl} numberOfLines={1}>
          {url.replace(/^https?:\/\//, "")}
        </Text>
        <Text style={styles.linkWho}>{who}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("sharing.copy")} ${label}`}
        hitSlop={8}
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          setCopied(true);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        }}
        style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
      >
        {copied ? (
          <Check size={13} color={colors.ink} strokeWidth={2.2} />
        ) : (
          <Copy size={13} color={colors.ink} strokeWidth={1.9} />
        )}
        <Text style={styles.copyLabel}>{copied ? t("sharing.copied") : t("sharing.copy")}</Text>
      </Pressable>
    </View>
  );
}

const CHOICES = [
  { value: "ONLY_ME", title: "sharing.choice.only_me.title", body: "sharing.choice.only_me.body" },
  { value: "FRIENDS", title: "sharing.choice.friends.title", body: "sharing.choice.friends.body" },
  { value: "PUBLIC", title: "sharing.choice.public.title", body: "sharing.choice.public.body" },
] as const;

function Choices({
  legend,
  value,
  onChange,
  note,
}: {
  readonly legend: string;
  readonly value: Visibility;
  readonly onChange: (value: Visibility) => void;
  readonly note?: string;
}) {
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.sectionLabel}>{legend}</Text>
      <View style={styles.card}>
        {CHOICES.map((choice, index) => (
          <View key={choice.value}>
            {index > 0 && <View style={styles.divider} />}
            <Pressable
              onPress={() => onChange(choice.value)}
              style={styles.row}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === choice.value }}
            >
              <View style={[styles.radio, value === choice.value && styles.radioOn]}>
                {value === choice.value && <Check size={11} color={colors.paper} strokeWidth={3} />}
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t(choice.title)}</Text>
                <Text style={styles.rowBody}>{t(choice.body)}</Text>
              </View>
            </Pressable>
          </View>
        ))}
      </View>
      {note !== undefined && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  barTitle: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "600", color: colors.ink },
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20, paddingBottom: 40, gap: 4 },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: colors.line },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  linkUrl: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink, marginTop: 3 },
  linkWho: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.inkMuted,
    marginTop: 3,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  copyButtonPressed: { backgroundColor: colors.canvas },
  copyLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowBody: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 2,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  note: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 8,
  },
  footnote: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.canvas,
  },
  footnoteText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
  },
});
