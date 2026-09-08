import { lookupAlbumCovers, lookupPressingCovers } from "@/api/releases";
import { KeyboardLift } from "@/components/KeyboardLift";
import { ReleaseArt } from "@/components/ReleaseArt";
import { RisingSheet } from "@/components/RisingSheet";
import {
  type PhotoSource,
  type PickedImage,
  pickImage,
  storePhotoBytes,
} from "@/features/photos/pickImage";
import { useStore } from "@/local/StoreProvider";
import { colors, fonts } from "@/theme/colors";
import type { Release, WishFormat, WishlistItem } from "@janne6565/rekordo-shared";
import {
  FORMAT_LABELS,
  applyWishPatch,
  asWishFormat,
  createPhoto,
  createWishlistItem,
  isManualReleaseId,
  manualReleaseId,
  tombstonePhoto,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Camera, Heart, ImagePlus, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/** The four chips of screen 16c: the three formats you hunt for, then "any". */
const CHIPS: readonly (WishFormat | null)[] = ["VINYL", "CD", "CASSETTE", null];

interface WishSheetProps {
  readonly onClose: () => void;
  /** The release a heart was pressed on — a search result, a discography row, a shelf. */
  readonly release?: Release | null;
  /**
   * An existing entry, reopened to change the format or the note.
   *
   * Neither a release nor an entry means hand entry — the record no archive has. That is
   * the absence itself rather than a flag, because a flag could disagree with it.
   */
  readonly entry?: WishlistItem | null;
}

/**
 * Screen 16c — the sheet every way onto the wishlist lands in.
 *
 * The four doors differ only in what they already know: a search result knows the release,
 * an edit knows the entry, hand entry knows nothing yet. What they ask is the same two
 * questions, which is what makes "adding it twice just reopens this sheet" true.
 */
export function WishSheet({ onClose, release = null, entry = null }: WishSheetProps) {
  const { t } = useTranslation();
  const { store, clock } = useStore();
  const queryClient = useQueryClient();

  const [format, setFormat] = useState<WishFormat | null>(
    entry !== null ? asWishFormat(entry.desiredFormat) : asWishFormat(release?.format ?? null),
  );
  const [note, setNote] = useState(entry?.note ?? "");
  /**
   * The picture this entry should wear, held rather than written.
   *
   * Nothing reaches the disk until the sheet is saved: an image attached to an entry
   * somebody then abandoned would be bytes nothing ever references. Closing the sheet is
   * the undo, which is what the web dialog does too.
   */
  const [picked, setPicked] = useState<PickedImage | null>(null);
  /** Whether the picture already on the entry has been taken back off. */
  const [dropped, setDropped] = useState(false);
  const [typed, setTyped] = useState({
    title: entry?.title ?? "",
    artistName: entry?.artistName ?? "",
    year: entry?.year === undefined || entry?.year === null ? "" : String(entry.year),
  });

  const heading =
    entry !== null
      ? {
          title: entry.title,
          subtitle: `${entry.artistName}${entry.year === null ? "" : ` · ${entry.year}`}`,
        }
      : release !== null
        ? {
            title: release.title,
            subtitle: `${release.artistName}${release.year === null ? "" : ` · ${release.year}`}${release.label === null ? "" : ` · ${release.label}`}`,
          }
        : null;

  /**
   * The album's artwork, for a sheet reopened on an entry.
   *
   * A wish knows its album and nothing about any pressing, so unlike the release door it
   * has no cover to hand. Skipped for a hand-typed album, which no catalogue can answer for.
   */
  const albumCover = useQuery({
    queryKey: ["albumCovers", entry === null ? [] : [entry.albumId]],
    enabled: entry !== null && !isManualReleaseId(entry.albumId),
    staleTime: 60 * 60 * 1000,
    queryFn: () => lookupAlbumCovers([entry?.albumId ?? ""], store),
  });

  /**
   * The sleeve of the pressing the entry was made from, asked before the album's.
   *
   * The album's answer is resolved from whichever pressing the mirror ranks first, which
   * is how an entry ended up wearing a different sleeve than the row it was made from.
   */
  const pinned = entry?.releaseId ?? null;
  const pressingCover = useQuery({
    queryKey: ["pressingCovers", pinned === null ? [] : [pinned]],
    enabled: pinned !== null,
    staleTime: 60 * 60 * 1000,
    queryFn: () => lookupPressingCovers([pinned ?? ""]),
  });

  /** The picked pressing's cover, the album's as a fallback, null while neither is known. */
  const pinnedCover = pinned === null ? undefined : pressingCover.data?.get(pinned);
  const coverArtUrl =
    release?.coverArtUrl ??
    pinnedCover ??
    (entry === null ? null : (albumCover.data?.get(entry.albumId) ?? null));

  /**
   * The picture this entry already wears, for a sheet reopened on one.
   *
   * The same key `useWishCoverLogic` reads, so the entry screen and this sheet cannot end
   * up disagreeing about which picture is on the entry.
   */
  const ownPhoto = useQuery({
    queryKey: ["wish-photo", entry?.id ?? ""],
    enabled: entry !== null,
    queryFn: async () =>
      (await store.listWishPhotos([entry?.id ?? ""])).get(entry?.id ?? "") ?? null,
  });

  /**
   * What the tile shows: the file being chosen right now, else the one already saved.
   *
   * The unsaved choice outranks the saved one on purpose — picking a picture and watching
   * the tile keep the old one is the app telling you it did not hear you — and both
   * outrank the catalogue, whose answer is one pressing's sleeve among several.
   */
  const previewUri =
    picked?.uri ?? (dropped || ownPhoto.data == null ? null : store.photoUri(ownPhoto.data.id));
  const hasPicture = previewUri !== null;

  const choose = useMutation({
    mutationFn: (source: PhotoSource) => pickImage(source),
    onSuccess: (result) => {
      if (result === null) return;
      setDropped(false);
      setPicked(result);
    },
  });

  /**
   * Writes the chosen picture against a wish that now exists.
   *
   * Bytes first, like every other photo: a record whose image is missing renders as a
   * permanent placeholder, whereas bytes with no record are merely unreferenced. The
   * previous picture is tombstoned rather than overwritten — a photo id points at one
   * image forever, and the upload of the new one has not happened yet.
   */
  const attachPicture = async (wishId: string) => {
    if (picked === null && !dropped) return;
    const previous = (await store.listWishPhotos([wishId])).get(wishId);

    if (picked === null) {
      // Taken back off: the catalogue's cover — the pressing's, then the album's — is
      // what the entry falls back to.
      if (previous !== undefined) await store.putPhoto(tombstonePhoto(previous, clock, Date.now()));
      return;
    }

    const id = Crypto.randomUUID();
    await storePhotoBytes(store, id, picked.uri);
    await store.putPhoto(
      createPhoto(
        { wishId, contentType: picked.contentType, byteSize: picked.byteSize, sortIndex: 0 },
        clock,
        Date.now(),
        id,
      ),
    );
    if (previous !== undefined) await store.putPhoto(tombstonePhoto(previous, clock, Date.now()));
  };

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = note.trim();
      const cleaned = trimmed === "" ? null : trimmed;

      if (entry !== null) {
        await store.putWishlistItem(
          applyWishPatch(entry, { desiredFormat: format, note: cleaned }, clock),
        );
        await attachPicture(entry.id);
        return;
      }

      const year = Number.parseInt(typed.year, 10);
      const subject =
        release !== null
          ? {
              albumId: release.albumId,
              // The row that was hearted was one pressing among several, each with its own
              // sleeve. Remembering which one keeps the entry wearing the cover that was
              // on screen when it was made.
              releaseId: release.id,
              title: release.title,
              artistName: release.artistName,
              year: release.year,
            }
          : {
              // `local:` for the same reason a hand-entered copy uses it (turn 14): the
              // entry makes no claim about anything in the archive, so it must never match
              // one — and an album id nothing can look up is exactly an uncatalogued album.
              albumId: manualReleaseId(Crypto.randomUUID()),
              // Nothing was picked, because there was nothing to pick from.
              releaseId: null,
              title: typed.title.trim(),
              artistName: typed.artistName.trim(),
              year: Number.isFinite(year) ? year : null,
            };

      // One entry per release. A second heart reopens this sheet rather than adding a row,
      // checked against the live list because the entry may have synced in from elsewhere.
      const already = (await store.listWishlist()).find((item) => item.albumId === subject.albumId);
      if (already !== undefined) {
        await store.putWishlistItem(
          applyWishPatch(already, { desiredFormat: format, note: cleaned }, clock),
        );
        await attachPicture(already.id);
        return;
      }

      const wishId = Crypto.randomUUID();
      await store.putWishlistItem(
        createWishlistItem(
          { ...subject, desiredFormat: format, note: cleaned },
          clock,
          Date.now(),
          wishId,
        ),
      );
      await attachPicture(wishId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      await queryClient.invalidateQueries({ queryKey: ["wish-photos"] });
      await queryClient.invalidateQueries({ queryKey: ["wish-photo"] });
      onClose();
    },
  });

  const canSave =
    entry !== null ||
    release !== null ||
    typed.title.trim() !== "" ||
    typed.artistName.trim() !== "";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <KeyboardLift style={styles.sheetWrap}>
        <RisingSheet style={styles.sheet} onDismiss={onClose}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {heading !== null ? (
              <View style={styles.subject}>
                <View style={styles.subjectThumb}>
                  {/* The format is the one the chips below are choosing, not the pressing's:
                      the tile should follow what is being asked for as it is asked for. */}
                  <ReleaseArt
                    release={{ coverArtUrl }}
                    previewUri={previewUri}
                    format={format ?? "OTHER"}
                  />
                </View>
                <View style={styles.subjectText}>
                  <Text style={styles.subjectTitle} numberOfLines={1}>
                    {heading.title}
                  </Text>
                  <Text style={styles.subjectSubtitle} numberOfLines={1}>
                    {heading.subtitle}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.typed}>
                <Text style={styles.label}>{t("manual.title")}</Text>
                <TextInput
                  value={typed.title}
                  onChangeText={(value) => setTyped((was) => ({ ...was, title: value }))}
                  style={styles.input}
                />
                <Text style={styles.label}>{t("manual.artist")}</Text>
                <TextInput
                  value={typed.artistName}
                  onChangeText={(value) => setTyped((was) => ({ ...was, artistName: value }))}
                  style={styles.input}
                />
                <Text style={styles.label}>{t("manual.year")}</Text>
                <TextInput
                  value={typed.year}
                  onChangeText={(value) => setTyped((was) => ({ ...was, year: value }))}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </View>
            )}

            {/*
             * The one picture a wish can own.
             *
             * Every entry may carry one, not only a record no catalogue has: the mirror's
             * answer is one pressing's sleeve among several and often not the one being
             * hunted for, and a wish is a note to yourself — the picture on it should be
             * the one you recognise the record by. Offered here as well as on the entry
             * screen because a record nobody has a row for has nothing else to show, and
             * the sheet is where it is written down.
             */}
            <Text style={[styles.label, styles.spaced]}>{t("wishlist.coverImage")}</Text>
            <View style={styles.coverRow}>
              {heading === null && previewUri !== null && (
                <Image source={{ uri: previewUri }} style={styles.coverThumb} />
              )}
              <Pressable
                accessibilityRole="button"
                disabled={choose.isPending}
                onPress={() => choose.mutate("CAMERA")}
                style={styles.coverAction}
              >
                <Camera size={14} color={colors.inkMuted} strokeWidth={1.75} />
                <Text style={styles.coverActionText}>{t("wishlist.coverPhoto")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={choose.isPending}
                onPress={() => choose.mutate("LIBRARY")}
                style={styles.coverAction}
              >
                <ImagePlus size={14} color={colors.inkMuted} strokeWidth={1.75} />
                <Text style={styles.coverActionText}>
                  {t(hasPicture ? "wishlist.coverImageReplace" : "wishlist.coverImageAction")}
                </Text>
              </Pressable>
              {/* Only once there is one to take off, and never as a confirm step: nothing
                  is written until the sheet is saved, so closing it is the undo. */}
              {hasPicture && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setPicked(null);
                    setDropped(true);
                  }}
                  style={styles.coverAction}
                >
                  <X size={14} color={colors.inkMuted} strokeWidth={1.75} />
                  <Text style={styles.coverActionText}>{t("wishlist.coverImageRemove")}</Text>
                </Pressable>
              )}
            </View>

            <Text style={[styles.label, styles.spaced]}>{t("wishlist.wantedFormat")}</Text>
            <View style={styles.chips}>
              {CHIPS.map((chip) => (
                <Pressable
                  key={chip ?? "ANY"}
                  accessibilityRole="button"
                  accessibilityState={{ selected: format === chip }}
                  onPress={() => setFormat(chip)}
                  style={[styles.chip, format === chip && styles.chipOn]}
                >
                  <Text style={[styles.chipText, format === chip && styles.chipTextOn]}>
                    {chip === null ? t("wishlist.anyFormat") : FORMAT_LABELS[chip]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, styles.spaced]}>{t("wishlist.note")}</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder={t("wishlist.notePlaceholder")}
              placeholderTextColor={colors.inkSubtle}
              style={[styles.input, styles.noteInput]}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() => save.mutate()}
              disabled={!canSave || save.isPending}
              style={[styles.primary, (!canSave || save.isPending) && styles.primaryOff]}
            >
              <Heart size={16} color={colors.paper} strokeWidth={2} />
              <Text style={styles.primaryText}>
                {t(entry !== null ? "common.save" : "wishlist.addToWishlist")}
              </Text>
            </Pressable>
            <Text style={styles.footnote}>{t("wishlist.oneEntryHint")}</Text>
          </ScrollView>
        </RisingSheet>
      </KeyboardLift>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(25,23,19,0.35)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.line,
    marginTop: 10,
  },
  content: { padding: 18, paddingBottom: 34 },
  subject: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  subjectThumb: { width: 52 },
  subjectText: { flex: 1, minWidth: 0 },
  subjectTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  subjectSubtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  typed: { gap: 4 },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 8,
  },
  spaced: { marginTop: 18 },
  coverRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    marginTop: 10,
  },
  coverThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surface },
  coverAction: { flexDirection: "row", alignItems: "center", gap: 6 },
  coverActionText: { fontSize: 12, color: colors.inkMuted, fontWeight: "500" },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
    marginTop: 6,
  },
  noteInput: { height: 84, paddingTop: 10, textAlignVertical: "top" },
  chips: { flexDirection: "row", gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12.5, color: colors.inkMuted, fontWeight: "500" },
  chipTextOn: { color: colors.paper, fontWeight: "700" },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.ink,
    marginTop: 22,
  },
  primaryOff: { opacity: 0.5 },
  primaryText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: "700", color: colors.paper },
  footnote: { fontSize: 11.5, color: colors.inkMuted, textAlign: "center", marginTop: 10 },
});
