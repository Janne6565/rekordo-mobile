import { ReleaseArt } from "@/components/ReleaseArt";
import { CopyEditor } from "@/features/detail/CopyEditor";
import { CoverSheet } from "@/features/detail/CoverSheet";
import { useCopySwipe } from "@/features/detail/useCopySwipe";
import { useCoverWash } from "@/features/detail/useCoverWash";
import { useDetailLogic } from "@/features/detail/useDetailLogic";
import { PhotoStrip } from "@/features/photos/PhotoStrip";
import { usePhotoStripLogic } from "@/features/photos/usePhotoStripLogic";
import { Tracklist } from "@/features/tracklist/Tracklist";
import { useAppDispatch } from "@/store/hooks";
import { scanActions } from "@/store/scanSlice";
import { fonts } from "@/theme/colors";
import type { Copy, DetailChrome, Release } from "@janne6565/rekordo-shared";
import {
  CONDITION_LABELS,
  CONDITION_SHORT,
  FORMAT_LABELS,
  copyFormat,
  copyPreviewSrc,
  formatBarcode,
} from "@janne6565/rekordo-shared";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft, CopyPlus, Pencil, Star, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * A copy's page (screens 1j, 3a and 3b).
 *
 * `startEditing` is how adding a record lands here: the copy exists but says nothing
 * about itself yet, so the page opens on its editor rather than on a page of blanks with
 * an Edit button. Saving or cancelling leaves it in the ordinary read state — the flag
 * only decides where the page starts, never where it stays.
 *
 * `scanned` is the barcode the scanner read when this is the copy a duplicate card opened
 * (scan deck, screen 3a). The page is the same; what changes is the way out, which says
 * where it leads, and a bar that keeps the card's question answerable from here.
 */
export function DetailScreen({
  copyId,
  startEditing = false,
  scanned = null,
}: {
  readonly copyId: string;
  readonly startEditing?: boolean;
  readonly scanned?: string | null;
}) {
  const { t } = useTranslation();
  const logic = useDetailLogic(copyId);
  const photos = usePhotoStripLogic(copyId);
  const [editing, setEditing] = useState(startEditing);
  const wash = useCoverWash(logic.data?.release?.coverTheme ?? null);

  if (logic.loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }
  if (logic.data === null) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text>{t("detail.notFound")}</Text>
      </SafeAreaView>
    );
  }

  const { copy, release, otherCopies } = logic.data;

  /*
   * The screen is drawn in its destination chrome from the first frame; the paper it may
   * be arriving from is a layer on top of the background, and the words it is arriving
   * from are a second copy of this body fading out over 100ms. See `useCoverWash`.
   */
  return (
    <View style={styles.root}>
      {/* What is on the screen now, underneath — and above it the destination, fading in.
          This way round because the colour that has to be correct the instant the animation
          starts is the destination's, which this render already knows; the one underneath
          may lag a commit without anybody seeing it. See `useCoverWash`. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash.settled }]} />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: wash.chrome.background, opacity: wash.paper },
        ]}
      />
      <DetailBody
        chrome={wash.chrome}
        accent={wash.accent}
        copy={copy}
        release={release}
        otherCopies={otherCopies}
        logic={logic}
        photos={photos}
        editing={editing}
        setEditing={setEditing}
        scanned={scanned}
      />
      {wash.outgoing !== null && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: wash.outgoingOpacity }]}
        >
          <DetailBody
            chrome={wash.outgoing}
            accent={wash.accent}
            copy={copy}
            release={release}
            otherCopies={otherCopies}
            logic={logic}
            photos={photos}
            editing={editing}
            setEditing={setEditing}
            scanned={scanned}
          />
        </Animated.View>
      )}
      <StatusBar style={wash.barStyle} />
    </View>
  );
}

/** The paper the screen washes away from, and the only colour that is not the chrome's. */
interface DetailBodyProps {
  readonly chrome: DetailChrome;
  readonly accent: Animated.Value;
  readonly copy: Copy;
  readonly release: Release | undefined;
  readonly otherCopies: readonly { copy: Copy; release: Release | undefined }[];
  readonly logic: ReturnType<typeof useDetailLogic>;
  readonly photos: ReturnType<typeof usePhotoStripLogic>;
  readonly editing: boolean;
  readonly setEditing: (editing: boolean) => void;
  readonly scanned: string | null;
}

/**
 * Everything on the page, as a function of the chrome it is drawn in.
 *
 * Presentational on purpose: both hooks it needs are held by the screen above and handed
 * down, so rendering a second copy during a wash costs a second tree and no second
 * database read, no second photo list and no second scroll position to keep in step.
 */
function DetailBody({
  chrome,
  accent,
  copy,
  release,
  otherCopies,
  logic,
  photos,
  editing,
  setEditing,
  scanned,
}: DetailBodyProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  // Left and right move through the order the shelf was showing. The responder sits on the
  // root rather than the ScrollView so it can watch a gesture before the scroll claims it,
  // and it only claims clearly horizontal ones.
  const swipe = useCopySwipe(copy.id);

  const art = (
    <ReleaseArt
      release={release}
      format={copyFormat(copy, release)}
      style={styles.coverImage}
      variant="bleed"
      previewUri={copyPreviewSrc(copy, photos.firstUri)}
      allowCatalogArt={copy.catalogArt !== "HIDDEN"}
    />
  );

  /*
   * 2a: editing is a mode with its own frame, not a block that unfolds inside this one.
   * Everything below is a record being read — the sleeve at full size, the photographs,
   * the tracklist, the way to throw it away — and none of it is being edited.
   */
  if (editing) {
    return (
      <CopyEditor
        copy={copy}
        release={release}
        art={art}
        chrome={chrome}
        saving={logic.saving}
        photos={<PhotoStrip logic={photos} chrome={chrome} release={release} />}
        onSave={(patch) => {
          logic.save(patch);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  /**
   * The two answers the duplicate card was asking for, given from the copy itself.
   *
   * Opening the copy used to drop the card, so having looked at the grade there was no
   * longer anywhere to say "yes, a second one". Leaving without adding is the other
   * answer, so it closes the card too rather than returning to a question already settled.
   */
  const backToCamera = () => {
    dispatch(scanActions.cardDismissed());
    router.back();
  };
  const addSecond = () => {
    if (scanned === null || release === undefined) return;
    dispatch(
      scanActions.kept({
        key: Crypto.randomUUID(),
        barcode: scanned,
        release,
        format: copy.manualFormat ?? (release.format === "OTHER" ? null : release.format),
        destination: "SHELF",
        secondCopy: true,
        keptAt: Date.now(),
      }),
    );
    router.back();
  };

  return (
    <CoverSheet
      chrome={chrome}
      onClose={() => router.back()}
      fade={swipe.fade}
      // No leafing to the neighbours from here: the bar below is about this copy, and a
      // swipe would leave it standing under a different record.
      handlers={scanned === null ? swipe.handlers : undefined}
      art={art}
      back={
        scanned === null ? undefined : (
          <Pressable
            accessibilityRole="button"
            onPress={backToCamera}
            style={[styles.backToScan, { backgroundColor: chrome.surface }]}
          >
            <ChevronLeft size={17} color={chrome.ink} strokeWidth={2} />
            <Text style={[styles.editText, { color: chrome.ink }]}>
              {t("scan.owned.backToScanning")}
            </Text>
          </Pressable>
        )
      }
      footer={
        scanned === null ? undefined : (
          <View
            style={[
              styles.scanBar,
              {
                backgroundColor: chrome.surface,
                borderTopColor: chrome.line,
                paddingBottom: 12 + insets.bottom,
              },
            ]}
          >
            <Text style={[styles.scanBarNote, { color: chrome.muted }]}>
              {t("scan.owned.scannedThis", { barcode: formatBarcode(scanned) })}
            </Text>
            <View style={styles.scanBarActions}>
              <Pressable
                accessibilityRole="button"
                onPress={backToCamera}
                style={[
                  styles.scanBarButton,
                  styles.scanBarButtonQuiet,
                  { backgroundColor: chrome.background, borderColor: chrome.line },
                ]}
              >
                <Text style={[styles.scanBarText, { color: chrome.ink }]}>
                  {t("scan.backToCamera")}
                </Text>
              </Pressable>
              {release !== undefined && (
                <Pressable
                  accessibilityRole="button"
                  onPress={addSecond}
                  style={[styles.scanBarButton, { backgroundColor: chrome.ink }]}
                >
                  <CopyPlus size={16} color={chrome.background} strokeWidth={2} />
                  <Text style={[styles.scanBarText, { color: chrome.background }]}>
                    {t("scan.owned.addSecond")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )
      }
      action={
        /* On the sleeve, opposite the way out, so the page starts with the record's own
           facts instead of with a button — and so the one thing you can do to it is still
           to hand however far down you have read. */
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("detail.editLabel")}
          onPress={() => setEditing(true)}
          style={[styles.edit, { backgroundColor: chrome.ink }]}
        >
          <Pencil size={14} color={chrome.background} strokeWidth={1.75} />
          <Text style={[styles.editText, { color: chrome.background }]}>{t("detail.edit")}</Text>
        </Pressable>
      }
    >
      <View style={styles.body}>
        <View style={styles.badges}>
          {/* The copy's format, not the release's: a tape of a record listed as vinyl
                is still a tape on your shelf. */}
          <Badge chrome={chrome} strong>
            {FORMAT_LABELS[copyFormat(copy, release)]}
          </Badge>
          {copy.condition !== null && (
            <Badge chrome={chrome}>{CONDITION_SHORT[copy.condition]}</Badge>
          )}
        </View>

        <Text style={[styles.title, { color: chrome.ink }]}>{release?.title ?? "—"}</Text>
        <Text style={[styles.subtitle, { color: chrome.muted }]}>
          {release?.artistName}
          {release?.year == null ? "" : ` · ${release.year}`}
        </Text>

        {/*
         * The accent lands last, 120ms after the words have swapped. Until then the
         * stars are drawn in a colour that was chosen against a chrome the screen has
         * already left, so they are simply not shown yet.
         */}
        <Animated.View style={[styles.stars, { opacity: accent }]}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              size={15}
              strokeWidth={1.5}
              // An empty star is a secondary glyph, so it takes the tone every other
              // secondary glyph on this screen takes. `line` is 9% -- a hairline weight
              // for 1px rules, which left the unearned stars all but invisible.
              color={star <= (copy.rating ?? 0) ? chrome.accent : chrome.muted}
              fill={star <= (copy.rating ?? 0) ? chrome.accent : "transparent"}
            />
          ))}
        </Animated.View>

        <Fields copy={copy} chrome={chrome} />

        {/* The photographs are not here. Adding, starring and removing them is editing the
            copy, and it belongs in the mode that says so -- this page is the record being
            read, and the picture it shows is already the strip's first one, at full size. */}
        <View style={[styles.card, styles.notesCard, { backgroundColor: chrome.surface }]}>
          <Text style={[styles.fieldKey, { color: chrome.muted }]}>{t("detail.notes")}</Text>
          <Text style={[styles.notes, { color: copy.notes === null ? chrome.muted : chrome.ink }]}>
            {copy.notes ?? t("detail.notesEmpty")}
          </Text>
        </View>

        {copy.notesConflict !== null && (
          <NotesConflict
            copy={copy}
            chrome={chrome}
            saving={logic.saving}
            onKeep={(notes) => logic.save({ notes })}
          />
        )}

        {otherCopies.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: chrome.ink }]}>
              {t("detail.otherCopies")}
            </Text>
            <View style={styles.otherRow}>
              {otherCopies.map(({ copy: sibling, release: siblingRelease }) => (
                <Pressable
                  key={sibling.id}
                  onPress={() => router.push(`/copies/${sibling.id}`)}
                  style={[styles.card, styles.otherCard, { backgroundColor: chrome.surface }]}
                >
                  <Text style={[styles.fieldKey, { color: chrome.muted }]}>
                    {siblingRelease === undefined && sibling.manualFormat === null
                      ? "—"
                      : FORMAT_LABELS[copyFormat(sibling, siblingRelease)]}
                  </Text>
                  <Text style={[styles.otherValue, { color: chrome.ink }]}>
                    {siblingRelease?.year ?? ""}
                    {sibling.condition === null ? "" : ` · ${CONDITION_SHORT[sibling.condition]}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* 26a on the phone: the last section of the screen, under everything the copy
              says about itself and above the one action that ends it. */}
        <Tracklist
          releaseId={release?.id}
          chrome={chrome}
          trackCount={release?.trackCount}
          discCount={release?.discCount}
        />

        <Pressable
          accessibilityRole="button"
          onPress={logic.remove}
          disabled={logic.removing}
          style={[styles.remove, { backgroundColor: chrome.surface }]}
        >
          {logic.removing ? (
            <ActivityIndicator size="small" color={chrome.muted} />
          ) : (
            <Trash2 size={15} color={chrome.muted} strokeWidth={1.75} />
          )}
          <Text style={[styles.removeText, { color: chrome.muted }]}>{t("detail.remove")}</Text>
        </Pressable>
      </View>
    </CoverSheet>
  );
}

/**
 * Another device wrote different notes, and the merge kept that version instead of
 * discarding it. Shown until the person picks one: sync can tell that two versions differ,
 * but not which of them anybody has actually read.
 */
function NotesConflict({
  copy,
  chrome,
  onKeep,
  saving,
}: {
  readonly copy: Copy;
  readonly chrome: DetailChrome;
  readonly onKeep: (notes: string) => void;
  readonly saving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.card,
        styles.conflict,
        { backgroundColor: chrome.surface, borderColor: chrome.accent },
      ]}
    >
      <Text style={[styles.fieldKey, { color: chrome.accent }]}>{t("detail.conflict.title")}</Text>
      <Text style={[styles.notes, { color: chrome.ink }]}>{copy.notesConflict}</Text>
      <View style={styles.conflictActions}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => onKeep(copy.notesConflict as string)}
          style={[styles.conflictButton, { borderColor: chrome.line }, saving && styles.dim]}
        >
          <Text style={[styles.conflictButtonText, { color: chrome.ink }]}>
            {t("detail.conflict.keepThis")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => onKeep(copy.notes ?? "")}
          style={[styles.conflictButton, { borderColor: chrome.line }, saving && styles.dim]}
        >
          <Text style={[styles.conflictButtonText, { color: chrome.ink }]}>
            {t("detail.conflict.keepMine")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Fields({ copy, chrome }: { readonly copy: Copy; readonly chrome: DetailChrome }) {
  const { t } = useTranslation();
  const rows: readonly (readonly [string, string])[] = [
    [t("detail.mediaCondition"), copy.condition === null ? "—" : CONDITION_LABELS[copy.condition]],
    [
      t("detail.sleeveCondition"),
      copy.sleeveCondition === null ? "—" : CONDITION_LABELS[copy.sleeveCondition],
    ],
    [t("detail.paid"), formatMoney(copy.pricePaidCents, copy.currency)],
    [t("detail.bought"), copy.purchasedOn ?? "—"],
    [t("detail.where"), copy.purchasedAt ?? "—"],
  ];
  return (
    <View style={styles.fields}>
      {rows.map(([key, value]) => (
        <View
          key={key}
          style={[styles.card, styles.fieldCard, { backgroundColor: chrome.surface }]}
        >
          <Text style={[styles.fieldKey, { color: chrome.muted }]}>{key}</Text>
          <Text style={[styles.fieldValue, { color: chrome.ink }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function Badge({
  children,
  chrome,
  strong = false,
}: {
  readonly children: React.ReactNode;
  readonly chrome: DetailChrome;
  readonly strong?: boolean;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: chrome.surface }]}>
      <Text style={[styles.badgeText, { color: strong ? chrome.ink : chrome.muted }]}>
        {children}
      </Text>
    </View>
  );
}

/** Exported for testing. */
export function formatMoney(cents: number | null, currency: string): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Width only: the hero is square because `cover` is, and a percentage height here is
  // what collapsed the art to nothing.
  coverImage: { width: "100%" },
  body: { paddingHorizontal: 20, paddingTop: 22 },
  badges: { flexDirection: "row", gap: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5 },
  badgeText: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "500" },
  title: { fontFamily: fonts.serif, fontSize: 32, marginTop: 14 },
  subtitle: { fontSize: 14, marginTop: 5 },
  stars: { flexDirection: "row", gap: 3, marginTop: 14 },
  edit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    marginTop: 8,
  },
  editText: { fontSize: 12.5, fontWeight: "600" },
  backToScan: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingLeft: 9,
    paddingRight: 14,
    borderRadius: 999,
    marginTop: 8,
  },
  scanBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  scanBarNote: {
    fontFamily: "ui-monospace",
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginHorizontal: 2,
    marginBottom: 10,
  },
  scanBarActions: { flexDirection: "row", gap: 10 },
  scanBarButton: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanBarButtonQuiet: { borderWidth: 1 },
  scanBarText: { fontSize: 14, fontWeight: "600" },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
  card: { borderRadius: 10, padding: 14 },
  fieldCard: { width: "47%" },
  fieldKey: { fontSize: 9.5, letterSpacing: 0.9, textTransform: "uppercase", fontWeight: "500" },
  fieldValue: { fontSize: 14, fontWeight: "600", marginTop: 5 },
  notesCard: { marginTop: 14 },
  notes: { fontSize: 13.5, lineHeight: 21, marginTop: 6 },
  conflict: { marginTop: 10, borderWidth: 1 },
  conflictActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  conflictButton: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  conflictButtonText: { fontSize: 12, fontWeight: "600" },
  dim: { opacity: 0.5 },
  sectionTitle: { fontSize: 13, fontWeight: "600", marginTop: 22, marginBottom: 10 },
  otherRow: { flexDirection: "row", gap: 10 },
  otherCard: { flex: 1 },
  otherValue: { fontSize: 12.5, fontWeight: "600", marginTop: 6 },
  remove: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 999,
    marginTop: 28,
  },
  removeText: { fontSize: 13, fontWeight: "500" },
});
