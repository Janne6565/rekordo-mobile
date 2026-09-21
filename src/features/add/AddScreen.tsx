import { releaseDisambiguation } from "@/api/releases";
import { AlbumArt } from "@/components/AlbumArt";
import { ReleaseArt } from "@/components/ReleaseArt";
import { RetryNotice } from "@/components/RetryNotice";
import { Skeleton } from "@/components/Skeleton";
import { WishRow } from "@/components/WishRow";
import { AddSheet } from "@/features/add/AddSheet";
import { ArtistResults } from "@/features/add/ArtistResults";
import { ExamplePlate } from "@/features/add/ExamplePlate";
import { albumAsRelease } from "@/features/add/albumRelease";
import { FORMAT_FILTERS, useAddLogic } from "@/features/add/useAddLogic";
import type { AddDestination } from "@/features/add/useAddSheetLogic";
import { useCross } from "@/lib/motion";
import { colors, fonts } from "@/theme/colors";
import type {
  Album,
  Artist,
  Copy,
  Format,
  RecordGroup,
  Release,
  WishlistItem,
} from "@janne6565/rekordo-shared";
import { CONDITION_SHORT, FORMAT_LABELS, editionLabel } from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import {
  ArrowUpLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  CopyPlus,
  LibraryBig,
  PencilLine,
  Plus,
  ScanBarcode,
  Search,
  SearchX,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Logic = ReturnType<typeof useAddLogic>;

/**
 * Five placeholder rows, in the widths the deck draws them (screen 2a).
 *
 * Five rather than "as many as fit": it fills the list above the keyboard without
 * promising a result count nobody knows yet. The uneven widths are what stop the block
 * reading as a table.
 */
type Percent = `${number}%`;

const SKELETON_ROWS: readonly (readonly [Percent, Percent, Percent])[] = [
  ["62%", "44%", "30%"],
  ["48%", "56%", "24%"],
  ["70%", "38%", "34%"],
  ["54%", "48%", "28%"],
  ["66%", "42%", "32%"],
];

/**
 * The add flow (screens 1e, 2a, 5a, 8c).
 *
 * Dark chrome, unlike the rest of the app: this screen is a viewfinder as much as a form,
 * and the camera it opens into is dark. Flashing a paper-white sheet on the way to a scan
 * is the one place the light theme actively hurts.
 */
/**
 * `wish` arrives from screen 16b's "I found a copy": the entry's search, already run.
 * A wish names an album, not a pressing, so which copy you found is still yours to pick.
 */
export function AddScreen({
  seedTerm = "",
  destination = "SHELF",
}: {
  readonly seedTerm?: string;
  /**
   * Which list the tab that opened this screen is about.
   *
   * Not a decision anybody made, so the sheet still says "Add this record" and still
   * offers both -- it only decides which of the two is the button and which is the line
   * underneath. Coming from the wishlist and being handed "Add to shelf" is a small lie
   * about what you were doing.
   */
  readonly destination?: AddDestination;
} = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const logic = useAddLogic(seedTerm);
  /** A release a destination button was pressed on, which raises the confirm sheet (6c). */
  const [confirming, setConfirming] = useState<{
    release: Release;
    destination: AddDestination;
    /** False when the sheet was opened on a record rather than by a destination button. */
    chosen?: boolean;
    /** False when all that was named is an album, so no pressing has been chosen yet. */
    pressingChosen?: boolean;
    prefer?: Format;
  } | null>(null);

  /*
   * Scanning is a screen of its own now, not a mode this one switches into.
   *
   * It used to be a black overlay owned by the search: one barcode, dumped into the search
   * box, and back. A crate is scanned in a run of twenty, so the scanner grew a tray, a
   * confirm card and a batch — none of which belongs to a search field.
   */
  const scan = () => router.push("/scan");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.inkMuted} strokeWidth={1.75} />
          <TextInput
            value={logic.term}
            onChangeText={logic.setTerm}
            onSubmitEditing={logic.submit}
            returnKeyType="search"
            placeholder={t("add.searchPlaceholder")}
            placeholderTextColor={colors.inkSubtle}
            style={styles.searchInput}
          />
          {/* The spinner belongs to the field that caused the wait, so the cause and the
              wait are in the same place. It replaces the clear button rather than sitting
              beside it, which keeps the field's contents from shifting mid-search. */}
          {logic.searching ? (
            <ActivityIndicator size="small" color={colors.inkMuted} />
          ) : logic.term !== "" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("add.clearSearch")}
              onPress={() => logic.setTerm("")}
              style={styles.clear}
            >
              <X size={12} color="#ffffff" strokeWidth={1.75} />
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.cancel}>{t("common.cancel")}</Text>
        </Pressable>
      </View>

      {logic.showFormatFilter && <FormatChips logic={logic} />}

      <Body logic={logic} onScan={scan} onConfirm={setConfirming} destination={destination} />

      {confirming !== null && (
        <AddSheet
          release={confirming.release}
          destination={confirming.destination}
          chosen={confirming.chosen ?? true}
          pressingChosen={confirming.pressingChosen ?? true}
          prefer={confirming.prefer}
          onClose={() => setConfirming(null)}
        />
      )}
    </SafeAreaView>
  );
}

function Body({
  logic,
  onScan,
  onConfirm,
  destination,
}: {
  readonly logic: Logic;
  readonly onScan: () => void;
  readonly onConfirm: (subject: {
    release: Release;
    destination: AddDestination;
    chosen?: boolean;
    pressingChosen?: boolean;
    prefer?: Format;
  }) => void;
  readonly destination: AddDestination;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  /*
   * A Cross on the block, never per row — keyed on the term that was actually searched, so
   * it runs when the answer changes rather than on every keystroke. While the debounce is
   * pending the old results stay put at full opacity, and the spinner in the field is the
   * only thing that says anything is happening.
   */
  const crossing = useCross(logic.submittedTerm);

  if (logic.searching) return <SearchingRows />;
  if (logic.failed)
    return (
      <RetryNotice message={t("add.failed")} onRetry={logic.retry} retrying={logic.searching} />
    );
  if (!logic.hasSearched)
    return (
      <BeforeTyping logic={logic} onScan={onScan} onConfirm={onConfirm} destination={destination} />
    );
  // Only when the search itself found nothing. A format chip that hides every row is a
  // different situation with a different way out, and it is handled in the list below.
  if (logic.unfilteredCount === 0) {
    return logic.searchedBarcode ? (
      <BarcodeNotFound logic={logic} onScan={onScan} />
    ) : (
      <Text style={styles.hint}>{t("add.noResults")}</Text>
    );
  }

  /**
   * Opening an artist carries what the row already knew (screen 10c).
   *
   * Params rather than a lookup on arrival: every fact the artist header shows came back
   * with the search, and MusicBrainz is capped at one request a second — repeating it
   * would buy a blank second and the same answer.
   */
  /**
   * A record row raises the same sheet an artist's album does.
   *
   * `pressingChosen: false` is the whole difference from a scan. Nothing about a typed
   * query names a pressing, so the sheet opens with none chosen and offers the list,
   * rather than writing down whichever one the catalogue happened to rank first.
   */
  const openRecord = (album: Album) =>
    onConfirm({
      release: albumAsRelease(album, Date.now()),
      destination,
      chosen: false,
      pressingChosen: false,
    });

  const openArtist = (artist: Artist) =>
    router.push({
      pathname: "/artists/[mbid]",
      params: {
        mbid: artist.mbid,
        name: artist.name,
        disambiguation: artist.disambiguation,
        type: artist.type ?? "",
        country: artist.country ?? "",
        beganIn: artist.beganIn ?? "",
        endedIn: artist.endedIn ?? "",
        fromQuery: logic.submittedTerm,
        to: destination,
      },
    });

  return (
    <Animated.FlatList
      style={{ opacity: crossing }}
      data={(logic.scanned ? logic.results : logic.records) as readonly (Release | RecordGroup)[]}
      keyExtractor={(item: Release | RecordGroup) =>
        "album" in item ? item.album.albumId : item.id
      }
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      /*
       * Artists first, releases under them.
       *
       * This has now been both ways round. Releases led on the grounds that somebody
       * typing into an *add* screen is usually holding a record, and that a discography in
       * front of it is in the way. Against that: a name-shaped query ("fred again") answers
       * with pressings that merely contain the word, and the artist who was actually meant
       * sat below eight of them, off the screen. Janne asked for the artists back on top.
       */
      ListHeaderComponent={
        <View>
          <ArtistResults logic={logic.artists} onOpen={openArtist} />
          <View style={styles.releasesHeader}>
            <Text style={styles.section}>
              {logic.scanned ? t("add.releases") : t("add.records")}
            </Text>
            {/* The deck puts the way into manual entry here, beside the releases it is an
                alternative to: the moment you can see the archive's answer is not the one
                you are holding is the moment you want to type it in yourself. */}
            <Pressable accessibilityRole="button" onPress={() => router.push("/manual")}>
              <Text style={styles.sectionAction}>{t("add.manualCard.title")}</Text>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.hint}>
          {t("add.noneOfFormat", { format: FORMAT_LABELS[logic.format as Format] })}
        </Text>
      }
      ListFooterComponent={
        logic.scanned || logic.singles.length === 0 ? null : (
          <SinglesBlock singles={logic.singles} onOpen={openRecord} />
        )
      }
      renderItem={({ item }: { item: Release | RecordGroup }) =>
        "album" in item ? (
          <RecordRow group={item} logic={logic} onOpen={openRecord} />
        ) : (
          <ResultRow
            release={item}
            owned={logic.ownedCopy(item)}
            /* One button, and it does not pick a side: the sheet it raises offers both
               destinations, so the row no longer has to ask which one before it knows
               anything about the record. */
            onAdd={() => onConfirm({ release: item, destination, chosen: false })}
          />
        )
      }
    />
  );
}

/**
 * The format filter above the results (screens 2a and 10a).
 *
 * It narrows what came back rather than re-running the search: one row per release *and*
 * format is what the archive returns, so all four are already in hand and switching costs
 * nothing.
 */
function FormatChips({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.formatChipsRow}
      contentContainerStyle={styles.formatChips}
      keyboardShouldPersistTaps="handled"
    >
      {FORMAT_FILTERS.map((filter) => {
        const active = logic.format === filter;
        return (
          <Pressable
            key={filter}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => logic.setFormat(filter)}
            style={[styles.formatChip, active && styles.formatChipActive]}
          >
            <Text style={[styles.formatChipText, active && styles.formatChipTextActive]}>
              {filter === "ALL" ? t("addDialog.allFormats") : FORMAT_LABELS[filter as Format]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The wait, in the shape of what is coming (screen 2a).
 *
 * Every dimension here is copied from ResultRow below — the 48px sleeve, the three lines,
 * the two round buttons — so the results replace the placeholders without moving anything
 * the reader had already started looking at.
 */
function SearchingRows() {
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Text
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        style={[styles.section, styles.searchingCaption]}
      >
        {t("add.searching")}
      </Text>
      {SKELETON_ROWS.map(([first, second, third]) => (
        <View key={first + second} style={styles.row}>
          <Skeleton style={[styles.thumb, styles.thumbSkeleton]} />
          <View style={styles.rowBody}>
            <Skeleton style={{ height: 11, width: first }} />
            <Skeleton tone="soft" style={{ height: 9, width: second, marginTop: 6 }} />
            <Skeleton tone="faint" style={{ height: 8, width: third, marginTop: 6 }} />
          </View>
          <Skeleton tone="soft" style={styles.rowAddSkeleton} />
          <Skeleton tone="soft" style={styles.rowAddSkeleton} />
        </View>
      ))}
    </ScrollView>
  );
}

/** Screen 5a — nothing searched yet. */
function BeforeTyping({
  logic,
  onScan,
  onConfirm,
  destination,
}: {
  readonly logic: Logic;
  readonly onScan: () => void;
  readonly onConfirm: (subject: {
    release: Release;
    destination: AddDestination;
    chosen?: boolean;
    pressingChosen?: boolean;
    prefer?: Format;
  }) => void;
  readonly destination: AddDestination;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {/*
        One line of 52px buttons, not the two tall cards this screen used to open with.
        There is content underneath them now, and a card that explains itself in a
        sentence was only ever earning its height because nothing else was on the screen.
        They stay exactly where the hand already looks for them.
      */}
      <View style={styles.shortcuts}>
        <Pressable accessibilityRole="button" onPress={onScan} style={styles.shortcut}>
          <ScanBarcode size={17} color={colors.accent} strokeWidth={1.7} />
          <Text style={styles.shortcutTitle}>{t("add.scanCard.title")}</Text>
        </Pressable>
        {/* The second card of screen 5a: the two ways in that are not a title search. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/manual")}
          style={styles.shortcut}
        >
          <PencilLine size={17} color={colors.accent} strokeWidth={1.7} />
          <Text style={styles.shortcutTitle}>{t("add.manualCard.title")}</Text>
        </Pressable>
      </View>

      {logic.recentSearches.length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>{t("addDialog.recent")}</Text>
            <Pressable accessibilityRole="button" onPress={logic.clearRecent}>
              <Text style={styles.sectionAction}>{t("addDialog.clearRecent")}</Text>
            </Pressable>
          </View>
          {logic.recentSearches.map((term) => (
            <Pressable
              key={term}
              accessibilityRole="button"
              onPress={() => logic.repeatSearch(term)}
              style={styles.recentRow}
            >
              <Clock size={16} color={colors.inkSubtle} strokeWidth={1.75} />
              <Text style={styles.recentText} numberOfLines={1}>
                {term}
              </Text>
              <ArrowUpLeft size={15} color={colors.inkSubtle} strokeWidth={1.75} />
            </Pressable>
          ))}
        </>
      )}

      {/*
        Only once the plate has stepped aside. The two answer the same question -- what
        could I add from here -- and they are exclusive so the screen gives one answer
        rather than stacking the app's suggestion under the person's own.
      */}
      {!logic.showExamples && logic.wishlist.length > 0 && (
        <>
          <Text style={[styles.section, styles.sectionSpaced]}>{t("add.onWishlist")}</Text>
          {logic.wishlist.map((item: WishlistItem) => (
            <WishRow
              key={item.id}
              onPress={() => logic.searchWish(item.title, item.artistName)}
              art={
                /* The wanted format is the silhouette, exactly as on the wishlist tab: an
                   entry for the vinyl of a record you own on CD looks like what is being
                   hunted, not like what is already on the shelf. */
                <ReleaseArt
                  release={{ coverArtUrl: logic.wishCoverOf(item) }}
                  previewUri={logic.wishPictureOf(item)}
                  format={item.desiredFormat ?? "OTHER"}
                />
              }
              title={item.title}
              subtitle={`${item.artistName}${item.year === null ? "" : ` · ${item.year}`}`}
              format={
                item.desiredFormat === null
                  ? t("wishlist.anyFormat")
                  : FORMAT_LABELS[item.desiredFormat]
              }
              /* Not a destination button: this row runs the wish's own search, which is
                 what the block is for. A search icon says that; a plus would promise a
                 copy the tap does not make. */
              action={
                <View style={[styles.rowAdd, styles.rowAddOwned]}>
                  <Search size={15} color={colors.inkMuted} strokeWidth={1.8} />
                </View>
              }
            />
          ))}
        </>
      )}

      {/*
        Last, and only while the shelf has not made the point by itself. The plate is here
        to show a newcomer what a result looks like; once a few records are on the shelf
        that is answered, and it would just be the app talking about itself underneath the
        things the person actually put there.
      */}
      {logic.showExamples && (
        <ExamplePlate
          coverOf={logic.exampleCoverOf}
          /* Nothing to wait for any more, so no tile is ever in the opening state. */
          openingAlbumId={null}
          onOpen={(example) => {
            /* Opens on the album itself. This used to fetch the album's pressings first and
             open on the first of them -- a paced request nobody asked for, in front of a
             tap, to answer a question the sheet is perfectly able to ask later. */
            const release = albumAsRelease(
              {
                albumId: example.albumId,
                title: example.title,
                artistName: example.artistName,
                year: null,
                primaryType: null,
                coverArtUrl: logic.exampleCoverOf(example.albumId),
              },
              Date.now(),
            );
            /* The shelf is only where the sheet starts here. Nobody pressed a destination
             to get in, so the sheet must not report one back.

             `prefer` is the exception to that restraint, and only here: an example tile is
             the app showing a newcomer what adding a record looks like, so the sheet lands
             on a vinyl pressing rather than opening two unanswered questions. See
             `useAddSheetLogic`. */
            onConfirm({
              release,
              destination,
              chosen: false,
              pressingChosen: false,
              prefer: "VINYL",
            });
          }}
        />
      )}
    </ScrollView>
  );
}

/** Screen 8c — the barcode scanned fine and matched nothing. */
function BarcodeNotFound({
  logic,
  onScan,
}: { readonly logic: Logic; readonly onScan: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <View style={styles.scanned}>
        <ScanBarcode size={18} color={colors.inkMuted} strokeWidth={1.6} />
        <View style={styles.rowBody}>
          <Text style={styles.scannedCode}>{logic.submittedTerm}</Text>
          <Text style={styles.scannedSource}>{t("add.checkedSources")}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onScan}>
          <Text style={styles.rescan}>{t("add.rescan")}</Text>
        </Pressable>
      </View>

      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <SearchX size={26} color={colors.inkMuted} strokeWidth={1.5} />
        </View>
        <Text style={styles.emptyTitle}>{t("add.barcodeMissing.title")}</Text>
        <Text style={styles.emptyBody}>{t("add.barcodeMissing.body")}</Text>
      </View>

      {/* The deck makes manual entry the primary way out of here: a barcode the archive
          does not know is the clearest possible sign that nobody has catalogued this. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/manual")}
        style={styles.primaryAction}
      >
        <PencilLine size={16} color={colors.night} strokeWidth={1.9} />
        <Text style={styles.primaryActionText}>{t("add.enterManually")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => logic.setTerm("")}
        style={styles.secondaryAction}
      >
        <Search size={16} color={colors.ink} strokeWidth={1.9} />
        <Text style={styles.secondaryActionText}>{t("add.searchByTitle")}</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * One row per release *and* format, as screen 6a lists them.
 *
 * One button, not two. The row used to carry both destinations as equal icon buttons,
 * which asked for a decision before the sheet had shown anything to decide on -- and the
 * sheet behind them offered both anyway, so the pair only moved the choice earlier than it
 * needed to be made. A single Add raises the same sheet, and the destination is picked
 * there, next to the pressing and the format it belongs with.
 *
 * Owning one already does not take the button away. It says so under the title and steps
 * the button back, because a second pressing is an ordinary thing to buy.
 */
/**
 * One record, with the other editions of it folded underneath.
 *
 * Four rows reading "Nevermind" became one with a count you can open. Each edition is
 * named only by what makes it different, because the record's own title is on the row
 * above it and repeating it in every child is noise.
 */
function RecordRow({
  group,
  logic,
  onOpen,
}: {
  readonly group: RecordGroup;
  readonly logic: Logic;
  readonly onOpen: (album: Album) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { album, editions } = group;

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => onOpen(album)} style={styles.row}>
        <View style={styles.thumb}>
          <AlbumArt album={album} size={48} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {album.artistName}
            {album.year === null ? "" : ` · ${album.year}`}
          </Text>
          {editions.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpen((was) => !was)}
              style={[styles.editionChip, open && styles.editionChipOpen]}
              /* The chip is inside the row's own pressable, so its tap has to be stopped
                 from also opening the sheet behind it. */
              hitSlop={4}
            >
              <Text style={[styles.editionChipText, open && styles.editionChipTextOpen]}>
                {t("add.otherEditions", { count: editions.length })}
              </Text>
              {open ? (
                <ChevronUp
                  size={11}
                  color={open ? "#ffffff" : colors.accentStrong}
                  strokeWidth={2.2}
                />
              ) : (
                <ChevronDown size={11} color={colors.accentStrong} strokeWidth={2.2} />
              )}
            </Pressable>
          )}
        </View>
        <View style={[styles.rowAdd, logic.ownedAlbum(album) && styles.rowAddOwned]}>
          {logic.ownedAlbum(album) ? (
            <CopyPlus size={15} color={colors.inkMuted} strokeWidth={1.8} />
          ) : (
            <Plus size={16} color="#ffffff" strokeWidth={2} />
          )}
        </View>
      </Pressable>

      {open && (
        <View style={styles.editions}>
          <Text style={styles.editionsHint}>{t("add.editionsHint")}</Text>
          {editions.map((edition) => (
            <Pressable
              key={edition.albumId}
              accessibilityRole="button"
              onPress={() => onOpen(edition)}
              style={styles.editionRow}
            >
              <Text style={styles.editionTitle} numberOfLines={1}>
                {editionLabel(edition)}
              </Text>
              {edition.year !== null && <Text style={styles.editionYear}>{edition.year}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** How many singles show before the block offers the rest. */
const SHOWN_SINGLES = 2;

/**
 * The singles and EPs that merely share a title with a record above.
 *
 * Their own block, because a title search drowns in them and Apple sends no type field --
 * that literal text in the title is the only thing that identifies them.
 */
function SinglesBlock({
  singles,
  onOpen,
}: {
  readonly singles: readonly Album[];
  readonly onOpen: (album: Album) => void;
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? singles : singles.slice(0, SHOWN_SINGLES);
  const hidden = singles.length - shown.length;

  return (
    <View>
      <View style={styles.releasesHeader}>
        <Text style={styles.section}>{t("add.singlesAndEps")}</Text>
        <Text style={styles.sectionCount}>{singles.length}</Text>
      </View>
      {shown.map((single) => (
        <Pressable
          key={single.albumId}
          accessibilityRole="button"
          onPress={() => onOpen(single)}
          style={styles.row}
        >
          <View style={styles.singleThumb}>
            <AlbumArt album={single} size={38} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.singleTitle} numberOfLines={1}>
              {single.title}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {single.artistName}
              {single.year === null ? "" : ` · ${single.year}`}
            </Text>
          </View>
        </Pressable>
      ))}
      {hidden > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={styles.showMore}>
          <Text style={styles.showMoreText}>{t("add.showMoreSingles", { count: hidden })}</Text>
          <ChevronDown size={14} color={colors.accentStrong} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

function ResultRow({
  release,
  owned,
  onAdd,
}: {
  readonly release: Release;
  readonly owned: { readonly condition: Copy["condition"]; readonly addedAt: number } | null;
  readonly onAdd: () => void;
}) {
  const { t } = useTranslation();
  const subtitle = releaseDisambiguation(release);

  return (
    <View style={styles.row}>
      {/* The real cover, not just the format silhouette. Picking between four pressings of
          the same album is largely a visual job, and the sleeve is the thing people
          recognise. The format is still named in the line below, and ReleaseArt falls back
          to the silhouette whenever the archive has nothing. */}
      <View style={styles.thumb}>
        <ReleaseArt release={release} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {release.title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {release.artistName}
          {release.year === null ? "" : ` · ${release.year}`}
          {` · ${FORMAT_LABELS[release.format]}`}
        </Text>
        {owned !== null ? (
          <View style={styles.rowOwnedLine}>
            <LibraryBig size={10} color={colors.accentStrong} strokeWidth={2.2} />
            <Text style={styles.rowOwnedText} numberOfLines={1}>
              {owned.condition === null
                ? t("add.ownedNoGrade")
                : t("add.owned", { grade: CONDITION_SHORT[owned.condition] })}
            </Text>
          </View>
        ) : (
          subtitle !== "" && (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {subtitle}
            </Text>
          )
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={owned === null ? t("add.add") : t("addSheet.secondCopy")}
        onPress={onAdd}
        style={[styles.rowAdd, owned !== null && styles.rowAddOwned]}
      >
        {/* Already on the shelf turns the plus into a second-copy mark: the gesture is the
            same, and the icon is the only place left to say that this one would be another
            of something you have. */}
        {owned === null ? (
          <Plus size={16} color="#ffffff" strokeWidth={2} />
        ) : (
          <CopyPlus size={15} color={colors.inkMuted} strokeWidth={1.8} />
        )}
      </Pressable>
    </View>
  );
}

const HAIRLINE = "rgba(25,23,19,0.08)";
const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 44,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink },
  clear: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(25,23,19,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: { fontSize: 13.5, fontWeight: "500", color: colors.inkMuted },
  hint: { fontSize: 13, color: colors.inkMuted, padding: 18 },
  sectionCount: { fontFamily: "monospace", fontSize: 10, color: colors.inkSubtle },
  editionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(162,87,58,0.11)",
  },
  editionChipOpen: { backgroundColor: colors.ink },
  editionChipText: { fontFamily: "monospace", fontSize: 10, color: colors.accentStrong },
  editionChipTextOpen: { color: "#ffffff" },
  editions: {
    marginLeft: 26,
    paddingLeft: 16,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.line,
  },
  editionsHint: { fontSize: 11.5, lineHeight: 17, color: colors.inkMuted, paddingVertical: 6 },
  editionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  editionTitle: { flex: 1, fontSize: 12.5, fontWeight: "600", color: colors.ink },
  editionYear: { fontSize: 11, color: colors.inkMuted },
  singleThumb: { width: 38, height: 38 },
  singleTitle: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
  showMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  showMoreText: { fontSize: 12.5, fontWeight: "500", color: colors.accentStrong },
  list: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28 },
  shortcuts: { flexDirection: "row", gap: 10 },
  shortcut: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 52,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.09)",
  },
  /* One line at 12.5, which is what the longer German label needs to fit beside an icon. */
  shortcutTitle: { flex: 1, fontSize: 12.5, lineHeight: 16, fontWeight: "600", color: colors.ink },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
  },
  section: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  sectionSpaced: { marginTop: 26 },
  sectionAction: { fontSize: 11.5, fontWeight: "500", color: colors.accent },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  recentText: { flex: 1, fontSize: 14, color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  thumb: { width: 58, height: 48 },
  thumbSkeleton: { borderRadius: 5 },
  rowAddSkeleton: { width: 30, height: 30, borderRadius: 999 },
  searchingCaption: { marginTop: 6, marginBottom: 10 },
  releasesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingBottom: 8,
  },
  /*
   * The row is exactly as tall as a chip, and never taller.
   *
   * It is a sibling of the results, so in a column that has room going spare -- a search
   * still running, a query with nothing behind it -- the scroll view was handed the slack
   * and the chips, being stretch-aligned by default like any flex row, grew with it. That
   * is how a row of pills turned into columns the height of the screen, and why it only
   * did so sometimes: it depended on what was underneath.
   */
  formatChipsRow: { flexGrow: 0, flexShrink: 0 },
  // Padded top and bottom by the same amount: the row is a band of its own, and
  // without the lower half the first result sits against the chips as though it
  // belonged to them.
  formatChips: {
    gap: 7,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    alignItems: "center",
  },
  formatChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.12)",
  },
  formatChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  /*
   * The line height is spelled out because the chip is exactly as tall as this text: with
   * the box no longer stretching, a line sized to the glyphs alone cropped the tails off
   * "Vinyl" and "Digital". Ascenders never showed it -- only the descenders were missing,
   * which reads as a rendering fault rather than as a layout that is too tight.
   */
  formatChipText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "500",
    color: colors.inkMuted,
  },
  formatChipTextActive: { fontWeight: "600", color: "#ffffff" },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  rowSubtitle: { fontSize: 11.5, color: colors.inkMuted },
  rowMeta: { fontSize: 10, color: colors.inkSubtle },
  rowAdd: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Owning one already does not take the buttons away, it steps them back: a second
     pressing is a normal thing to buy, and a disabled button would refuse it. */
  rowAddOwned: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.14)",
  },
  rowOwnedLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  rowOwnedText: { fontFamily: MONO, fontSize: 10, color: colors.accentStrong },
  scanned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.09)",
  },
  scannedCode: { fontSize: 12, fontVariant: ["tabular-nums"], color: colors.ink },
  scannedSource: { fontSize: 11, color: colors.inkSubtle, marginTop: 2 },
  rescan: { fontSize: 11.5, fontWeight: "500", color: colors.accent },
  emptyState: { alignItems: "center", marginTop: 34, gap: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(25,23,19,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, textAlign: "center" },
  emptyBody: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.inkMuted,
    textAlign: "center",
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    marginTop: 26,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  primaryActionText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.14)",
  },
  secondaryActionText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  scanner: { flex: 1, backgroundColor: "#000" },
  scannerOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  scannerClose: { position: "absolute", top: 12, left: 18, padding: 8 },
  scannerFrame: {
    width: 230,
    height: 230,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.28)",
  },
  scannerHint: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 30,
  },
});
