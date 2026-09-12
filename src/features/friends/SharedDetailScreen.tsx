import type { SharedCopy, SharedWish } from "@/api/friends";
import { ReleaseArt } from "@/components/ReleaseArt";
import { formatMoney } from "@/domain/currency";
import { starGlyphs } from "@/domain/rating";
import { CoverSheet } from "@/features/detail/CoverSheet";
import { usePageFlip } from "@/features/detail/usePageFlip";
import { useFriendProfileLogic } from "@/features/friends/useFriendsLogic";
import { useSharedCoverPhotos } from "@/features/friends/useSharedCoverPhotos";
import { Tracklist } from "@/features/tracklist/Tracklist";
import { colors, fonts } from "@/theme/colors";
import type { Format } from "@janne6565/rekordo-shared";
import { CONDITION_SHORT, FORMAT_LABELS, chromeFor } from "@janne6565/rekordo-shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Fact {
  readonly label: string;
  readonly value: string;
}

/**
 * Screen 23e — a record on somebody else's shelf, read only.
 *
 * The phone's form of the same component the web centres on the page: the sleeve at full
 * width, and the facts in two columns beneath it. A close rather than arrows, because
 * flipping here is a swipe.
 *
 * Nothing in it is actionable except closing and flipping. It is somebody else's copy: the
 * things you can do to your own — edit, photograph, rate, delete — are not merely disabled
 * here, they are absent, which is a different statement.
 *
 * Absent facts close the grid up rather than leaving holes, so a hand-entered copy with no
 * year, no grade and no price reads as the same layout with less in it.
 *
 * It is a *screen*, not a sheet drawn inside the profile. Both of this app's record sheets
 * are now presented the same way — a modal route on the root stack — because dismissing one
 * by dragging it down is the platform's gesture, and only the navigator that presented it
 * can run that drag and the unmount as a single motion. Drawn as an RN `<Modal>` inside the
 * profile, the drag ended with the sheet springing back to the top and then vanishing: the
 * native card cancelled its own dismissal while React unmounted the window underneath it.
 *
 * Which record is showing stays an address rather than a piece of state — a sheet somebody
 * is looking at when they decide to pass the link on has to be linkable — so flipping to a
 * neighbour swaps the route's parameter and leaves the screen standing.
 */
export function SharedDetailScreen({
  handle,
  open,
  tab,
}: {
  readonly handle: string;
  /** Which entry of the shelf below is showing: a copy id, or a wish id on the wishlist. */
  readonly open: string;
  readonly tab: "collection" | "wishlist";
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  /*
   * The profile's own queries, read a second time rather than handed down: everything here
   * is react-query, so arriving from the shelf costs a cache read, and arriving from a cold
   * link — which a sheet that only existed inside the profile could not do at all — fetches
   * what it needs.
   */
  const logic = useFriendProfileLogic(handle);
  const photos = useSharedCoverPhotos(logic.copies);

  const shelf: readonly (SharedCopy | SharedWish)[] =
    tab === "collection" ? logic.copies : logic.wishes;
  const at = shelf.findIndex((entry) => entry.id === open);
  const show = (index: number) => router.setParams({ open: shelf[index]?.id ?? undefined });

  /*
   * The same gesture the library's own sheet leafs with, and the same cross-fade.
   *
   * It is claimed in the capture phase: the body is a scroll view, and a scroll view never
   * declines a touch, so a responder offered the drag only after it had refused would never
   * hear about it. `usePageFlip` takes a clearly sideways drag before the scroller sees it,
   * which is also why it works over the facts and the tracklist rather than only over the
   * sleeve — and leaves every vertical drag to the scroller and to the sheet's own dismiss.
   */
  const { handlers, fade } = usePageFlip({
    onPrev: at > 0 ? () => show(at - 1) : undefined,
    onNext: at >= 0 && at < shelf.length - 1 ? () => show(at + 1) : undefined,
  });

  if (at === -1) {
    return (
      <SafeAreaView style={styles.centred}>
        {logic.loading || logic.loadingLists ? (
          <ActivityIndicator color={colors.inkSubtle} />
        ) : (
          <Text style={styles.missing}>{t("detail.notFound")}</Text>
        )}
      </SafeAreaView>
    );
  }

  const entry = shelf[at];
  const copy = tab === "collection" ? (entry as SharedCopy) : undefined;
  const wish = tab === "wishlist" ? (entry as SharedWish) : undefined;
  const subject = copy ?? wish;
  const pricesVisible = logic.person?.pricesVisible === true;
  /*
   * A copy carries its cover, a wish does not: a wish names an album and a pressing, and the
   * lookups that answer for one are the profile's.
   */
  const coverArtUrl =
    copy !== undefined
      ? (copy.coverArtUrl ?? null)
      : wish === undefined
        ? null
        : logic.wishCoverOf(wish);
  const previewUri = photos.get(open) ?? null;

  const format = copy?.format ?? wish?.desiredFormat;
  const facts: Fact[] = [];
  const add = (label: string, value: string | undefined | null) => {
    if (value !== undefined && value !== null && value !== "") facts.push({ label, value });
  };

  add(t("sharedDetail.year"), subject?.year?.toString());
  add(
    t(wish === undefined ? "sharedDetail.format" : "sharedDetail.wanted"),
    format === undefined ? undefined : FORMAT_LABELS[format as Format],
  );
  if (copy !== undefined) {
    // 23e: two columns hold four cells, so the two grades share a line.
    const grades = [copy.condition, copy.sleeveCondition]
      .filter((code): code is string => code !== undefined && code !== null)
      .map((code) => CONDITION_SHORT[code as keyof typeof CONDITION_SHORT] ?? code)
      .join(" · ");
    add(t("sharedDetail.mediaSleeve"), grades);
    /*
     * Read only, and gone entirely when there are no stars to show — the same rule the
     * tiles follow, and the same one that keeps "unrated" and "not shared" from being told
     * apart. `starGlyphs` returns the run that is lit and the run that is not; the facts
     * grid is one line of type, so they are joined rather than coloured separately.
     */
    const stars = starGlyphs(copy.rating);
    add(t("sharedDetail.rating"), stars === null ? undefined : `${stars.on}${stars.off}`);
    add(
      t("sharedDetail.paid"),
      // Only when the owner shares prices, and only when there is one: a JSON null is not
      // a price of nothing.
      pricesVisible && copy.pricePaidCents != null && copy.currency != null
        ? formatMoney(copy.pricePaidCents, copy.currency, i18n.language)
        : undefined,
    );
  }

  return (
    <View style={styles.screen}>
      <CoverSheet
        chrome={CHROME}
        onClose={() => router.back()}
        fade={fade}
        handlers={handlers}
        art={
          <ReleaseArt
            release={{ coverArtUrl }}
            format={(format as Format | undefined) ?? "OTHER"}
            previewUri={previewUri}
            variant="bleed"
            /*
             * The quiet ground up here, not the empty sleeve the item detail draws. That
             * one says "this record of mine has no picture", which is a thing to say about
             * your own copy; on somebody else's shelf a sleeve rendered the width of the
             * sheet reads as a photograph of *their* copy. The grid directly below names
             * the format in words anyway -- "Vinyl", or "Wanted: Vinyl".
             */
            placeholder="plain"
          />
        }
      >
        <View style={styles.body}>
          <Text style={styles.title}>{subject?.title ?? "—"}</Text>
          <Text style={styles.artist}>{subject?.artistName ?? ""}</Text>

          {facts.length > 0 && (
            <View style={styles.facts}>
              {facts.map((fact) => (
                <View key={fact.label} style={styles.fact}>
                  <Text style={styles.factLabel}>{fact.label}</Text>
                  <Text style={styles.factValue}>{fact.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 26c: catalogue data, so unlike the grades and the money above it this is
              the same for every visitor. Read-only like everything else on this sheet. */}
          <Tracklist releaseId={subject?.releaseId ?? undefined} chrome={CHROME} shared />
        </View>
      </CoverSheet>
    </View>
  );
}

/*
 * Paper, always. The library's version takes its chrome from the cover's own palette,
 * which is sampled from the release the *owner* holds — a viewer has no business being
 * repainted by somebody else's shelf, and a sheet that changed colour per record on a
 * stranger's page would read as a different app each time.
 */
const CHROME = chromeFor(null);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centred: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  missing: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkMuted },
  body: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, marginTop: 16 },
  artist: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkMuted, marginTop: 3 },
  // Two columns, and an absent fact closes the grid up rather than leaving a hole.
  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 20 },
  fact: { width: "50%", paddingBottom: 16 },
  factLabel: {
    fontFamily: fonts.sans,
    fontSize: 9.5,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  factValue: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    marginTop: 4,
  },
});
