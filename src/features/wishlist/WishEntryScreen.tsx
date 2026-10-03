import { CoverLightbox } from "@/components/CoverLightbox";
import { ReleaseArt } from "@/components/ReleaseArt";
import { Tracklist } from "@/features/tracklist/Tracklist";
import { RemoveWishSheet } from "@/features/wishlist/RemoveWishSheet";
import { WishSheet } from "@/features/wishlist/WishSheet";
import { useWishCoverLogic } from "@/features/wishlist/useWishCoverLogic";
import { useWishEntryLogic } from "@/features/wishlist/useWishlistLogic";
import { appChromeFor } from "@/theme/chrome";
import { colors, fonts } from "@/theme/colors";
import type { WishFormat } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS, asWishFormat } from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import {
  Camera,
  Check,
  ChevronLeft,
  Heart,
  HeartOff,
  ImagePlus,
  Pencil,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** The four chips of screen 16b, matching the sheet. */
const CHIPS: readonly (WishFormat | null)[] = ["VINYL", "CD", "CASSETTE", null];

/**
 * Screen 16b — one entry.
 *
 * A release, not a copy: the format you want, a note, the date it went on, and the three
 * things you can do to it. What it is careful *not* to have is anything about a pressing —
 * condition, price, where you bought it — because none of that is true yet.
 */
export function WishEntryScreen({ wishId }: { readonly wishId: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const logic = useWishEntryLogic(wishId);
  const cover = useWishCoverLogic(wishId);
  const [editing, setEditing] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  /** Whether Remove is asking first (16b-x). */
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const entry = logic.entry;

  if (logic.loading) return <SafeAreaView style={styles.safe} edges={["top"]} />;
  if (entry === null) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header onBack={() => router.back()} />
        <Text style={styles.gone}>{t("wishlist.entryGone")}</Text>
      </SafeAreaView>
    );
  }

  /**
   * The picture the hero is actually drawing, in the order `ReleaseArt` picks it.
   *
   * Your own picture first, the catalogue's second — the same precedence the tile uses, so
   * a tap enlarges what is on screen rather than whatever the catalogue happens to hold.
   */
  const heroUri = cover.uri ?? logic.pictureOf(entry) ?? logic.coverOf(entry);

  const since = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(entry.createdAt);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {/*
           * The sleeve, not a drawing of the format. `bleed` is the plain square: a quiet
           * ground while the artwork is on its way, and the format silhouette only where
           * there is genuinely no picture to show — the same treatment the copy detail
           * got. At this size the silhouette read as the answer rather than as a wait.
           *
           * It also gives the frame its own aspect ratio, so the box is definite without
           * depending on the silhouette underneath to give it a height.
           */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("wishlist.viewCover")}
            // Not a button when there is nothing behind it: the silhouette is a statement
            // about the format, and opening it full-screen would be enlarging a placeholder.
            disabled={heroUri === null}
            onPress={() => setEnlarged(true)}
          >
            <ReleaseArt
              release={{ coverArtUrl: logic.coverOf(entry) }}
              previewUri={cover.uri ?? logic.pictureOf(entry)}
              format={entry.desiredFormat ?? "OTHER"}
              variant="bleed"
            />
          </Pressable>
        </View>

        {/*
         * The entry's own picture (19b), under the tile it changes.
         *
         * Any entry may have one. The catalogue's answer is the sleeve of one pressing —
         * the one that was picked where there was one, whichever the mirror ranks first
         * otherwise — and a wish is a note to yourself, so your own picture outranks it.
         */}
        <View style={styles.coverActions}>
          <Pressable
            accessibilityRole="button"
            disabled={cover.working}
            onPress={() => cover.choose("CAMERA")}
            style={styles.coverAction}
          >
            <Camera size={14} color={colors.inkMuted} strokeWidth={1.75} />
            <Text style={styles.coverActionText}>{t("wishlist.coverPhoto")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={cover.working}
            onPress={() => cover.choose("LIBRARY")}
            style={styles.coverAction}
          >
            <ImagePlus size={14} color={colors.inkMuted} strokeWidth={1.75} />
            <Text style={styles.coverActionText}>
              {t(cover.has ? "wishlist.coverImageReplace" : "wishlist.coverImageAction")}
            </Text>
          </Pressable>
          {cover.has && (
            <Pressable
              accessibilityRole="button"
              disabled={cover.working}
              onPress={() => cover.drop()}
              style={styles.coverAction}
            >
              <X size={14} color={colors.inkMuted} strokeWidth={1.75} />
              <Text style={styles.coverActionText}>{t("wishlist.coverImageRemove")}</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>{entry.title}</Text>
        <Text style={styles.subtitle}>
          {entry.artistName}
          {entry.year === null ? "" : ` · ${entry.year}`}
        </Text>

        <View style={styles.sinceRow}>
          <View style={styles.sinceBadge}>
            <Heart size={13} color={colors.accent} strokeWidth={2} />
            <Text style={styles.sinceBadgeText}>{t("wishlist.onWishlist")}</Text>
          </View>
          <Text style={styles.sinceText}>{t("wishlist.since", { date: since })}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t("wishlist.wantedFormat")}</Text>
          <View style={styles.chips}>
            {CHIPS.map((chip) => {
              const on = asWishFormat(entry.desiredFormat) === chip;
              return (
                <Pressable
                  key={chip ?? "ANY"}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  // Editable in place: the format you want is the one thing about an entry
                  // that changes on its own — you give up on the original press, or you
                  // stop caring — and a sheet in front of that is a sheet in the way.
                  onPress={() => logic.edit(entry, { desiredFormat: chip })}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {chip === null ? t("wishlist.anyFormat") : FORMAT_LABELS[chip]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>{t("wishlist.note")}</Text>
          <Text style={entry.note === null ? styles.noteEmpty : styles.note}>
            {entry.note ?? t("wishlist.noNote")}
          </Text>
        </View>

        {/*
         * "I found a copy" hands over to the add flow with the entry's search already run.
         * The entry stays on the list until a copy actually exists — backing out of the
         * add flow has to cost nothing, and the removal is the add's business (16e).
         */}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push(
              `/add?wish=${encodeURIComponent(`${entry.artistName} ${entry.title}`.trim())}`,
            )
          }
          style={styles.primary}
        >
          <Check size={17} color={colors.paper} strokeWidth={2} />
          <Text style={styles.primaryText}>{t("wishlist.foundACopy")}</Text>
        </Pressable>
        <Text style={styles.primaryHint}>{t("wishlist.foundACopyHint")}</Text>

        <View style={styles.secondaries}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={styles.secondary}
          >
            <Pencil size={15} color={colors.ink} strokeWidth={1.75} />
            <Text style={styles.secondaryText}>{t("wishlist.editNote")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmingRemove(true)}
            style={styles.secondary}
          >
            <HeartOff size={15} color={colors.ink} strokeWidth={1.75} />
            <Text style={styles.secondaryText}>{t("wishlist.remove")}</Text>
          </Pressable>
          <RemoveWishSheet
            open={confirmingRemove}
            onClose={() => setConfirmingRemove(false)}
            onConfirm={(summary) => {
              setConfirmingRemove(false);
              logic.remove(entry, summary);
              router.back();
            }}
            entry={entry}
            since={since}
            coverUri={logic.coverOf(entry)}
            pictureUri={cover.uri ?? logic.pictureOf(entry)}
          />
        </View>

        {/* 26c: the same section on a record nobody owns yet. An entry typed in by hand,
            or made before pressings were recorded, names no release at all — there is
            nothing to read a tracklist from, so the section is not there. */}
        <View style={styles.tracklist}>
          <Tracklist releaseId={entry.releaseId ?? undefined} chrome={PAPER} />
        </View>

        {logic.alsoOwned.length > 0 && (
          <View style={styles.also}>
            <Text style={styles.alsoTitle}>
              {t("wishlist.alsoOwn", { artist: entry.artistName, count: logic.alsoOwned.length })}
            </Text>
            <Text style={styles.alsoList} numberOfLines={2}>
              {logic.alsoOwned.join(" · ")}
            </Text>
          </View>
        )}
      </ScrollView>

      {editing && <WishSheet onClose={() => setEditing(false)} entry={entry} />}
      {enlarged && heroUri !== null && (
        <CoverLightbox uri={heroUri} onClose={() => setEnlarged(false)} />
      )}
    </SafeAreaView>
  );
}

function Header({ onBack }: { readonly onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
      <ChevronLeft size={20} color={colors.ink} strokeWidth={1.75} />
      <Text style={styles.backText}>{t("nav.wishlist")}</Text>
    </Pressable>
  );
}

/* The wishlist screen is paper throughout — it never takes a sleeve's palette the way the
   library's detail screen does, because a wish has no copy to sample. */
const PAPER = appChromeFor(null);

const styles = StyleSheet.create({
  tracklist: { paddingHorizontal: 20 },
  safe: { flex: 1, backgroundColor: colors.paper },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backText: { fontSize: 14, color: colors.ink },
  gone: { padding: 18, fontSize: 13, color: colors.inkMuted },
  content: { padding: 18, paddingBottom: 60 },
  hero: { width: 148, alignSelf: "center", borderRadius: 8, overflow: "hidden" },
  coverActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  coverAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  coverActionText: { fontSize: 11.5, color: colors.inkMuted },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    textAlign: "center",
    marginTop: 18,
  },
  subtitle: { fontSize: 13, color: colors.inkMuted, textAlign: "center", marginTop: 4 },
  sinceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
  },
  sinceBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  sinceBadgeText: { fontSize: 12, fontWeight: "600", color: colors.accent },
  sinceText: { fontSize: 11.5, color: colors.inkSubtle },
  card: {
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  label: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.inkSubtle },
  chips: { flexDirection: "row", gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12.5, color: colors.inkMuted, fontWeight: "500" },
  chipTextOn: { color: colors.paper, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 16 },
  note: { fontSize: 13.5, lineHeight: 20, color: colors.ink, marginTop: 8 },
  noteEmpty: { fontSize: 13.5, color: colors.inkSubtle, marginTop: 8 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.ink,
    marginTop: 22,
  },
  primaryText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "700", color: colors.paper },
  primaryHint: {
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: 10,
  },
  secondaries: { flexDirection: "row", gap: 10, marginTop: 18 },
  secondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  secondaryText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  also: { marginTop: 26 },
  alsoTitle: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
  alsoList: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
});
