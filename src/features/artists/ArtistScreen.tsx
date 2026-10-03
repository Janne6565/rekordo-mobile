import { ReleaseArt } from "@/components/ReleaseArt";
import { RetryNotice } from "@/components/RetryNotice";
import { Skeleton } from "@/components/Skeleton";
import { AddSheet } from "@/features/add/AddSheet";
import { ArtistAvatar } from "@/features/add/ArtistResults";
import { albumAsRelease } from "@/features/add/albumRelease";
import type { AddDestination } from "@/features/add/useAddSheetLogic";
import {
  OWNERSHIP_FILTERS,
  PRIMARY_TYPES,
  useDiscographyLogic,
} from "@/features/artists/useDiscographyLogic";
import { colors, ink } from "@/theme/colors";
import type { Album, Artist, Release } from "@janne6565/rekordo-shared";
import { CONDITION_SHORT } from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Heart,
  Plus,
  Search,
} from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Logic = ReturnType<typeof useDiscographyLogic>;

interface ArtistScreenProps {
  readonly artist: Artist;
  /** The search this artist was opened from, so the header can name what "back" means. */
  readonly fromQuery: string;
  /**
   * Which list the tab that started this is about, carried here from the search.
   *
   * It only decides which of the sheet's two destinations is the button and which is the
   * line under it. Nobody chose it, so the sheet still opens neutral.
   */
  readonly destination: AddDestination;
}

/**
 * Screen 10c — an artist's discography.
 *
 * A route rather than the web's in-modal pane (10d), because a phone has nowhere to put a
 * pane. That works here for the reason it would not on the web: the add screen is itself a
 * route, it stays mounted underneath, and going back lands on the search exactly as it was
 * left — which is the thing the web version uses a pane to protect.
 *
 * Dark chrome throughout, like the add screen it is reached from. Nothing about opening an
 * artist should feel like leaving the flow of adding a record.
 */
export function ArtistScreen({ artist, fromQuery, destination }: ArtistScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const logic = useDiscographyLogic(artist.mbid);

  /**
   * Add pressed on an album row, resolved to the pressing the sheet is about.
   *
   * An album is not an object you can own — "Bitches Brew" is one row here and forty-seven
   * pressings in the archive — so the row cannot write anything by itself. It fetches the
   * pressings and hands the archive's first to the same sheet a search result opens, which
   * is where the other forty-six are one tap away.
   */
  const [sheet, setSheet] = useState<{ release: Release } | null>(null);
  /**
   * An album whose pressings did not arrive, so its row can say so and offer the tap again.
   *
   * The reason is kept with it: an album the archive lists no pressing of is a fact about
   * the record, and a request that did not come back is a fact about the connection. They
   * read the same on a row that only says "nothing happened".
   */

  /*
    Opens on the album itself, immediately.

    This used to fetch the album's pressings and open on the first of them, so a tap on a
    row waited on a paced request -- measured at up to several seconds -- to answer a
    question the sheet can ask perfectly well once it is open, and that most people never
    ask at all. It also meant a tap could fail, which is why this had an error state.
  */
  const openSheet = (album: Album) => {
    setSheet({ release: albumAsRelease(album, Date.now()) });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("artists.backToResults", { query: fromQuery })}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ChevronLeft size={18} color={colors.inkMuted} strokeWidth={1.9} />
        </Pressable>
        <Text style={styles.headerCaption} numberOfLines={1}>
          {t("artists.resultsFor", { query: fromQuery })}
        </Text>
        {/* Balances the back button so the caption sits centred, as the deck draws it. */}
        <View style={styles.backSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ArtistHeader artist={artist} logic={logic} />

        <View style={[styles.filterBox, logic.filtering && styles.filterFocused]}>
          <Search size={15} color={colors.inkMuted} strokeWidth={1.75} />
          <TextInput
            value={logic.filter}
            onChangeText={logic.setFilter}
            placeholder={t("artists.filterPlaceholder", { name: artist.name })}
            placeholderTextColor={colors.inkSubtle}
            style={styles.filterInput}
          />
          {/* The scope, in the field rather than above it (6d): what is being searched is
              this artist's records, and a field that looks like every other search field
              would suggest otherwise. */}
          {logic.filtering && (
            <Text style={styles.filterScope} numberOfLines={1}>
              {artist.name}
            </Text>
          )}
        </View>

        {/*
         * Both chip rows step aside while the field has something in it (6d).
         *
         * Typing is already the narrowest filter on screen, and leaving two rows of
         * competing ones above the results makes a short list look like a filtered one.
         * What replaces them is the count, which is the only thing worth knowing then.
         */}
        {logic.filtering ? (
          <Text style={styles.section}>
            {t("artists.shownOf", { shown: logic.shownCount, total: logic.releaseCount ?? 0 })}
          </Text>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <TypeChip
                label={t("artists.type.Default")}
                count={null}
                active={logic.type === null}
                onPress={() => logic.setType(null)}
              />
              {PRIMARY_TYPES.map((primaryType) => (
                <TypeChip
                  key={primaryType}
                  label={t(`artists.type.${primaryType}`)}
                  count={logic.totals[primaryType]}
                  active={logic.type === primaryType}
                  onPress={() => logic.setType(primaryType)}
                />
              ))}
            </ScrollView>
            {/*
             * The second row, and the one the deck draws: what is yours, what you are
             * hunting, what is left. Kept beside the type chips rather than instead of
             * them — an artist with three hundred release groups needs both, and the deck
             * sketched this screen with an artist who has sixty.
             */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {OWNERSHIP_FILTERS.map((filter) => (
                <TypeChip
                  key={filter}
                  label={t(`artists.own.${filter}`)}
                  count={filter === "ALL" ? null : logic.ownershipCounts[filter]}
                  active={logic.ownership === filter}
                  onPress={() => logic.setOwnership(filter)}
                />
              ))}
            </ScrollView>
          </>
        )}

        <Discography logic={logic} onAdd={(album) => void openSheet(album)} />

        {logic.type === null && <RestDisclosure logic={logic} />}

        {logic.settling && (
          <View style={styles.settling}>
            <ActivityIndicator size="small" color={colors.inkMuted} />
            <Text style={styles.settlingText}>{t("artists.paced")}</Text>
          </View>
        )}
      </ScrollView>

      {sheet !== null && (
        <AddSheet
          release={sheet.release}
          /* Where the sheet starts, not a choice anybody made: the row has one button now,
             and both destinations are offered inside. */
          destination={destination}
          chosen={false}
          /* An album is all that was named; the pressing is chosen in the sheet or not at all. */
          pressingChosen={false}
          onClose={() => setSheet(null)}
        />
      )}
    </SafeAreaView>
  );
}

function ArtistHeader({ artist, logic }: { readonly artist: Artist; readonly logic: Logic }) {
  const { t } = useTranslation();
  const facts = [
    [artist.type, artist.country].filter((part) => part !== null && part !== "").join(" · "),
    artist.beganIn === null
      ? ""
      : `${artist.beganIn.slice(0, 4)} – ${artist.endedIn === null ? t("artists.present") : artist.endedIn.slice(0, 4)}`,
    // Only once the untyped query has answered. A release count that starts at the album
    // count and jumps to ten times it reads as a bug, not as loading.
    logic.releaseCount === null ? "" : t("artists.releaseCount", { count: logic.releaseCount }),
    // 6b: your own marks on this artist, beside the archive's facts about them. Only once
    // there is something to say — "you own 0 · 0 on your wishlist" is a sentence nobody
    // needs on an artist they have just opened for the first time.
    logic.ownershipCounts.OWNED === 0 && logic.ownershipCounts.WISHED === 0
      ? ""
      : t("artists.yourMarks", {
          owned: logic.ownershipCounts.OWNED,
          wished: logic.ownershipCounts.WISHED,
        }),
  ].filter((fact) => fact !== "");

  return (
    <View>
      <View style={styles.identity}>
        <ArtistAvatar name={artist.name} size={64} mbid={artist.mbid} />
        <View style={styles.identityBody}>
          <Text style={styles.name}>{artist.name}</Text>
          {artist.disambiguation !== "" && (
            <Text style={styles.disambiguation}>{artist.disambiguation}</Text>
          )}
        </View>
      </View>
      {facts.length > 0 && (
        <View style={styles.facts}>
          {facts.map((fact, index) => (
            <Text key={fact} style={index === 0 ? styles.factStrong : styles.fact}>
              {fact}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function TypeChip({
  label,
  count,
  active,
  onPress,
}: {
  readonly label: string;
  /** Null until that type has been fetched — the chip shows its name and nothing else. */
  readonly count: number | null;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
        {count === null ? "" : ` ${count}`}
      </Text>
    </Pressable>
  );
}

function Discography({
  logic,
  onAdd,
}: {
  readonly logic: Logic;
  readonly onAdd: (album: Album) => void;
}) {
  const { t } = useTranslation();

  if (logic.failed)
    return (
      <RetryNotice message={t("add.failed")} onRetry={logic.retry} retrying={logic.settling} />
    );
  if (logic.loading) return <AlbumSkeletons />;
  if (logic.sections.length === 0) {
    return (
      <Text style={styles.hint}>
        {logic.filtering ? t("artists.noneMatchFilter") : t("artists.noneOfType")}
      </Text>
    );
  }

  return (
    <View>
      {logic.sections.map((section) => (
        <View key={section.type}>
          <Text style={styles.section}>{t(`artists.type.${section.type}`)}</Text>
          {section.loading ? (
            <AlbumSkeletons />
          ) : section.albums.length === 0 ? (
            <Text style={styles.hint}>{t("artists.noneOfType")}</Text>
          ) : (
            section.albums.map((album) => (
              <AlbumRow key={album.albumId} album={album} logic={logic} onAdd={onAdd} />
            ))
          )}
        </View>
      ))}
    </View>
  );
}

function AlbumRow({
  album,
  logic,
  onAdd,
}: {
  readonly album: Album;
  readonly logic: Logic;
  readonly onAdd: (album: Album) => void;
}) {
  const { t } = useTranslation();
  const mark = logic.markOf(album);
  const grade = logic.gradeOf(album);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${album.title}, ${t("add.add")}`}
        onPress={() => onAdd(album)}
        style={styles.row}
      >
        {/* An album's own cover, from the archive's release-group endpoint — picking one
            of its pressings' covers would be arbitrary. */}
        <View style={styles.albumThumb}>
          <ReleaseArt release={album} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {[album.year, album.primaryType].filter((part) => part !== null).join(" · ")}
          </Text>
        </View>
        {/*
         * What the row offers depends on what you have already said about the record.
         *
         * Owned and wished rows say so and step back — the pressings are still one tap
         * away under the row, which is where a second copy is chosen. Everything else
         * carries a single Add, which raises the sheet without choosing a destination
         * first; the sheet offers both, next to the pressing they apply to.
         */}
        {mark === "OWNED" ? (
          <View style={styles.mark}>
            <Check size={11} color={colors.accentStrong} strokeWidth={2.4} />
            <Text style={styles.markText}>
              {grade === null
                ? t("artists.yours")
                : t("artists.yoursGraded", { grade: CONDITION_SHORT[grade] })}
            </Text>
          </View>
        ) : mark === "WISHED" ? (
          <View style={styles.mark}>
            <Heart size={11} color={colors.accent} strokeWidth={2.4} />
            <Text style={[styles.markText, styles.markWished]}>{t("artists.onWishlist")}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("add.add")}
            onPress={() => onAdd(album)}
            style={styles.destination}
          >
            <Plus size={16} color={colors.onInk} strokeWidth={2} />
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

/** The 312 sessions, broadcasts and remixes the deck folds away on screen 10c. */
function RestDisclosure({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: logic.restExpanded }}
      onPress={logic.toggleRest}
      style={styles.rest}
    >
      <View style={styles.rowBody}>
        <Text style={styles.restTitle}>{t("artists.rest.title")}</Text>
        <Text style={styles.restBody}>
          {logic.restCount === null
            ? t("artists.rest.bodyUncounted")
            : t("artists.rest.body", { count: logic.restCount })}
        </Text>
      </View>
      {logic.restExpanded ? (
        <ChevronUp size={17} color={colors.inkSubtle} strokeWidth={1.75} />
      ) : (
        <ChevronDown size={17} color={colors.inkSubtle} strokeWidth={1.75} />
      )}
    </Pressable>
  );
}

/** The same row shape, while a section is still out (the rule from turn 9). */
function AlbumSkeletons() {
  return (
    <View>
      {(["64%", "48%", "56%"] as const).map((width) => (
        <View key={width} style={styles.row}>
          <Skeleton style={styles.albumThumbSkeleton} />
          <View style={styles.rowBody}>
            <Skeleton style={{ height: 11, width }} />
            <Skeleton tone="soft" style={{ height: 9, width: "34%", marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const HAIRLINE = ink(0.08);
const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    /* The caption row needs air under it. Without this the chips below start immediately
       against it, and on a scrolled list the header reads as a cut rather than an edge. */
    paddingBottom: 12,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  /*
   * The counterweight on the right, and nothing else.
   *
   * It used to borrow the back button's style, which paints a bordered white circle -- so
   * the corner held what looked like a button with its icon missing. It exists only to let
   * the caption sit centred, so it takes the width and none of the paint.
   */
  backSpacer: { width: 34, height: 34 },
  headerCaption: { flex: 1, textAlign: "center", fontSize: 11.5, color: colors.inkMuted },
  body: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 32 },
  identity: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  identityBody: { flex: 1, paddingTop: 2 },
  name: { fontSize: 28, lineHeight: 30, color: colors.ink },
  disambiguation: { fontSize: 12.5, lineHeight: 19, color: colors.inkMuted, marginTop: 6 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  fact: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkMuted,
    backgroundColor: ink(0.05),
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden",
  },
  factStrong: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.ink,
    backgroundColor: colors.line,
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden",
  },
  filterBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 42,
    paddingHorizontal: 14,
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.12),
  },
  filterFocused: { borderWidth: 1.5, borderColor: colors.ink },
  filterInput: { flex: 1, fontSize: 13.5, color: colors.ink },
  /** 6d: the artist's name inside the field, saying what the search is scoped to. */
  filterScope: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  chips: { gap: 7, paddingTop: 12, paddingBottom: 2 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.12),
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 11.5, fontWeight: "500", color: colors.inkMuted },
  chipTextActive: { fontWeight: "600", color: colors.onInk },
  section: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    paddingTop: 22,
    paddingBottom: 4,
  },
  hint: { fontSize: 13, color: colors.inkMuted, paddingVertical: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  albumThumb: { width: 62, height: 52 },
  albumThumbSkeleton: { width: 62, height: 52, borderRadius: 5 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowSubtitle: { fontSize: 11.5, color: colors.inkMuted },
  rowMeta: { fontSize: 10, color: colors.inkSubtle },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ink(0.14),
  },
  addPillText: { fontSize: 11.5, fontWeight: "600", color: colors.inkMuted },
  /* 6b: the two destinations on a row that offers them, and the line on a row that does
     not — an album already yours says so and steps back rather than disappearing. */
  destinations: { flexDirection: "row", gap: 7 },
  destination: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { flexDirection: "row", alignItems: "center", gap: 5 },
  markText: { fontFamily: MONO, fontSize: 10, color: colors.accentStrong },
  markWished: { color: colors.accent },
  pressings: {
    marginBottom: 4,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: ink(0.04),
  },
  pressingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  /** The 2px accent ring, over the row rather than around it, so nothing reflows. */
  markRing: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.accent,
    marginHorizontal: -6,
  },
  pressingTitle: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
  pressingHint: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkMuted,
    paddingVertical: 10,
  },
  rest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    padding: 15,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  restTitle: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
  restBody: { fontSize: 11.5, lineHeight: 17, color: colors.inkMuted, marginTop: 3 },
  settling: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  settlingText: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
});
