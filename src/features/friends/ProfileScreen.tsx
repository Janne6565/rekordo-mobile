import type { SharedCopy } from "@/api/friends";
import { CopyTile } from "@/components/CopyTile";
import { ReleaseArt } from "@/components/ReleaseArt";
import { WishRow, wishCardStyle } from "@/components/WishRow";
import { Avatar } from "@/features/friends/Avatar";
import { useFriendProfileLogic } from "@/features/friends/useFriendsLogic";
import { useSharedCoverPhotos } from "@/features/friends/useSharedCoverPhotos";
import { colors, fonts } from "@/theme/colors";
import type { Format } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Lock, UserCheck, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Screens 15c and 15d — a friend's shelf, and a stranger's described rather than shown.
 *
 * One screen for both, because the difference is not a different page: it is the same
 * person with a different answer about what you may see, and the server gives the answer.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { handle, tab: initialTab } = useLocalSearchParams<{
    handle: string;
    tab?: string;
  }>();
  const logic = useFriendProfileLogic(handle ?? "");
  /*
   * The tab is state, not an address — the record opened off it is the thing worth linking
   * to. The param only says which one to start on, so that a wishlist line in the feed
   * lands on the wishlist instead of on the shelf beside it.
   */
  const [tab, setTab] = useState<"collection" | "wishlist">(
    initialTab === "wishlist" ? "wishlist" : "collection",
  );

  const photos = useSharedCoverPhotos(logic.copies);
  /*
   * Which record the sheet is showing is an address, not a piece of state — the same
   * reasoning the web's version gives: a sheet somebody is looking at when they decide to
   * pass the link on has to be linkable, and one that only existed in memory is not.
   *
   * It is a *route* rather than a parameter on this one, so that the sheet is presented by
   * the stack and not drawn inside this screen. That is what makes dragging it down feel
   * like the library's: the platform owns the gesture, and the drag and the dismissal are
   * one motion instead of a spring-back followed by an unmount. The tab travels with it,
   * because it says which shelf the record was picked off and so what it flips through.
   */
  const open = (id: string) =>
    router.push({
      pathname: "/profiles/[handle]/[open]",
      params: { handle: handle ?? "", open: id, tab },
    });

  const person = logic.person;
  const name = person?.displayName ?? person?.handle ?? "";
  const showing = tab === "collection" ? person?.canSeeCollection : person?.canSeeWishlist;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <ChevronLeft size={20} color={colors.ink} strokeWidth={1.75} />
        </Pressable>
      </View>

      {logic.loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.inkSubtle} />
        </View>
      ) : person === undefined ? (
        <View style={styles.centred}>
          <Text style={styles.emptyTitle}>{t("friendProfile.notFound.title")}</Text>
          <Text style={styles.emptyBody}>
            {t("friendProfile.notFound.body", { handle: logic.handle })}
          </Text>
        </View>
      ) : (
        <>
          {/*
           * Who this is, and which of their lists you are reading — outside the scroll view,
           * so it stays put. The tabs are the reason: a control that chooses what is below
           * it has to remain reachable while you are down there, or switching list means
           * scrolling all the way back up first.
           */}
          <View style={styles.pinned}>
            <View style={styles.header}>
              <Avatar name={name} uri={person.avatarUrl} size={56} />
              <View style={styles.headerText}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.meta}>
                  @{person.handle}
                  {person.collectingSince !== undefined &&
                    ` · ${t("friendProfile.collectingSince", {
                      year: new Date(person.collectingSince).getFullYear(),
                    })}`}
                </Text>
              </View>
            </View>

            <RelationshipAction logic={logic} />

            {/*
             * One track with two halves, not two loose pills: the pair is a single choice
             * between two lists, and a segmented control says that where separate buttons
             * leave it to be inferred. The count rides alongside its label rather than
             * inside it, so the number reads as a quantity and not as part of the name.
             */}
            <View style={styles.tabs}>
              <Tab
                active={tab === "collection"}
                count={person.copyCount}
                onPress={() => setTab("collection")}
              >
                {t("friendProfile.tab.collection")}
              </Tab>
              <Tab
                active={tab === "wishlist"}
                count={person.wishlistCount}
                onPress={() => setTab("wishlist")}
              >
                {t("friendProfile.tab.wishlist")}
              </Tab>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={
              <RefreshControl
                refreshing={logic.refreshing}
                onRefresh={() => void logic.refetch()}
                tintColor={colors.inkMuted}
              />
            }
          >
            {showing !== true ? (
              <LockedShelf name={name} count={person.copyCount ?? 0} />
            ) : logic.loadingLists ? (
              <View style={styles.centred}>
                <ActivityIndicator color={colors.inkSubtle} />
              </View>
            ) : tab === "collection" ? (
              <>
                <ShelfSummary copies={logic.copies} truncated={logic.truncated} />
                <Grid
                  copies={logic.copies}
                  pricesVisible={person.pricesVisible === true}
                  photos={photos}
                  onOpen={open}
                />
              </>
            ) : (
              <WishRows logic={logic} onOpen={open} />
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

type Logic = ReturnType<typeof useFriendProfileLogic>;

function Tab({
  active,
  count,
  onPress,
  children,
}: {
  readonly active: boolean;
  /** Withheld for a shelf this viewer may not see — the count is itself about a collection. */
  readonly count?: number;
  readonly onPress: () => void;
  readonly children: string;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{children}</Text>
      {count === undefined ? null : <Text style={styles.tabCount}>{count}</Text>}
    </Pressable>
  );
}

function RelationshipAction({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const router = useRouter();

  /*
   * Signed out there is no verdict to act on: the server answers the same for everybody
   * when nobody is asking, so the switch below would fall through to a live Ask button
   * that can only ever come back a 401. Shown and disabled rather than hidden — the button
   * is what the screen is for, and a stranger who cannot see it learns nothing about why.
   * The friends list makes the same point once, under the list.
   */
  if (!logic.signedIn) {
    return (
      <View style={styles.askSignedOut}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.askButton, styles.askButtonOff]}
        >
          <UserPlus size={16} color={colors.paper} strokeWidth={1.9} />
          <Text style={styles.askLabel}>{t("friendProfile.ask")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/you")}
          hitSlop={6}
        >
          <Text style={styles.askHint}>{t("friendProfile.askSignedOut")}</Text>
        </Pressable>
      </View>
    );
  }

  switch (logic.person?.relationship) {
    case "SELF":
      return null;
    case "FRIENDS":
      return (
        <View style={styles.friendsChip}>
          <UserCheck size={14} color={colors.inkMuted} strokeWidth={1.75} />
          <Text style={styles.friendsChipLabel}>{t("friends.state.friends")}</Text>
        </View>
      );
    case "REQUEST_SENT":
      return <Text style={styles.requestedLabel}>{t("friends.state.requested")}</Text>;
    /*
     * They asked first. Without this case the switch fell through to the ask button, which
     * says nothing about the request waiting and, pressed, is refused by the server -- the
     * row is already there. Decline before Accept, the order the request card uses.
     */
    case "REQUEST_RECEIVED": {
      const requestId = logic.person?.pendingRequestId;
      if (requestId === undefined) return null;
      const busy = logic.accept.isPending || logic.decline.isPending;
      return (
        <View style={styles.answerRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => logic.decline.mutate(requestId)}
            disabled={busy}
            hitSlop={6}
          >
            <Text style={styles.declineLabel}>{t("friends.decline")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => logic.accept.mutate(requestId)}
            disabled={busy}
            style={[styles.askButton, styles.answerButton, busy && styles.askButtonOff]}
          >
            <UserCheck size={16} color={colors.paper} strokeWidth={1.9} />
            <Text style={styles.askLabel}>{t("friends.accept")}</Text>
          </Pressable>
        </View>
      );
    }
    default:
      return (
        <Pressable
          onPress={() => logic.ask.mutate()}
          disabled={logic.ask.isPending}
          style={styles.askButton}
        >
          <UserPlus size={16} color={colors.paper} strokeWidth={1.9} />
          <Text style={styles.askLabel}>{t("friendProfile.ask")}</Text>
        </Pressable>
      );
  }
}

/** 15d: the shelf is described, not shown, and the number is the invitation. */
function LockedShelf({ name, count }: { readonly name: string; readonly count: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.locked}>
      <View style={styles.lockBadge}>
        <Lock size={17} color={colors.inkMuted} strokeWidth={1.75} />
      </View>
      <Text style={styles.lockedTitle}>{t("friendProfile.locked.title")}</Text>
      <Text style={styles.lockedBody}>{t("friendProfile.locked.body", { name, count })}</Text>
    </View>
  );
}

function Grid({
  copies,
  pricesVisible,
  photos,
  onOpen,
}: {
  readonly copies: readonly SharedCopy[];
  readonly pricesVisible: boolean;
  /**
   * The owners' own pictures, where they have one and are sharing it. Resolved by the
   * screen rather than here so the detail sheet shows the same one.
   */
  readonly photos: ReadonlyMap<string, string>;
  readonly onOpen: (copyId: string) => void;
}) {
  const { t } = useTranslation();
  if (copies.length === 0) {
    return <Text style={styles.emptyBody}>{t("friendProfile.emptyShelf")}</Text>;
  }
  return (
    <View style={styles.grid}>
      {copies.map((copy) => (
        <CopyTile
          key={copy.id}
          style={styles.tile}
          onPress={copy.id === undefined ? undefined : () => onOpen(copy.id as string)}
          art={
            <ReleaseArt
              release={{ coverArtUrl: copy.coverArtUrl ?? null, format: copy.format as Format }}
              previewUri={copy.id === undefined ? null : (photos.get(copy.id) ?? null)}
            />
          }
          /*
           * The same stars the owner's own shelf draws, and the same silence where there
           * are none. The server has already decided whether this viewer may see them, so
           * there is nothing to weigh up here: a null is a null, whether the copy is
           * unrated or its owner keeps the stars to themselves.
           */
          rating={copy.rating ?? null}
          title={copy.title ?? "—"}
          subtitle={[
            copy.format ? FORMAT_LABELS[copy.format as Format] : undefined,
            copy.year?.toString(),
            /*
             * Only when the owner turned prices on -- sharing a shelf is not sharing what it
             * cost -- and only when there is one. `!== undefined` let a JSON null through,
             * and `null / 100` is 0, so every copy with no price recorded advertised itself
             * at nothing. A real zero is still a price somebody entered and still shows.
             */
            pricesVisible && copy.pricePaidCents != null
              ? `${(copy.pricePaidCents / 100).toFixed(0)} ${copy.currency ?? ""}`.trim()
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ))}
    </View>
  );
}

/**
 * What is above the grid: the order it is in, and what it is made of.
 *
 * Neither is decoration. A shelf of somebody else's records arrives newest first and says
 * nothing about it, so the top of the list looks like a ranking; and the format mix is the
 * one fact about a collection you cannot read off a grid of sleeves.
 *
 * The counts are derived from what came back rather than asked for, which is only honest
 * while the whole shelf came back — the server caps the list and says so. When it was cut
 * short the counts describe the newest N and the line says that instead of implying it
 * counted everything.
 */
function ShelfSummary({
  copies,
  truncated,
}: { readonly copies: readonly SharedCopy[]; readonly truncated: boolean }) {
  const { t } = useTranslation();
  if (copies.length === 0) return null;

  const tally = new Map<string, number>();
  for (const copy of copies) {
    if (copy.format === undefined || copy.format === null) continue;
    tally.set(copy.format, (tally.get(copy.format) ?? 0) + 1);
  }
  const mix = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([format, count]) => `${FORMAT_LABELS[format as Format]} ${count}`)
    .join(" · ");

  return (
    <View style={styles.summary}>
      <Text style={styles.summarySort}>{t("friendProfile.newestFirst")}</Text>
      <Text style={styles.summaryMix} numberOfLines={1}>
        {truncated ? `${mix} — ${t("friendProfile.countsPartial", { count: copies.length })}` : mix}
      </Text>
    </View>
  );
}

function WishRows({
  logic,
  onOpen,
}: { readonly logic: Logic; readonly onOpen: (wishId: string) => void }) {
  const { t } = useTranslation();
  if (logic.wishes.length === 0) {
    return <Text style={styles.emptyBody}>{t("friendProfile.emptyWishlist")}</Text>;
  }
  return (
    <View style={styles.wishes}>
      {logic.wishes.map((wish) => (
        /*
         * The same card your own wishlist uses. It used to be a bare line of text with no
         * artwork, which made one feature look like two depending on whose list it was.
         *
         * No "added" time: when somebody else put a record on their list is not a fact
         * about you, and the deck's own rule for a shared shelf is that it shows sleeves
         * rather than a history.
         */
        <View key={wish.id} style={styles.wishCard}>
          <WishRow
            onPress={wish.id === undefined ? undefined : () => onOpen(wish.id as string)}
            art={
              <ReleaseArt
                release={{ coverArtUrl: logic.wishCoverOf(wish) }}
                format={(wish.desiredFormat as Format | undefined) ?? "OTHER"}
              />
            }
            title={wish.title ?? "—"}
            subtitle={wish.artistName ?? ""}
            format={
              wish.desiredFormat === undefined || wish.desiredFormat === null
                ? t("wishlist.anyFormat")
                : FORMAT_LABELS[wish.desiredFormat as Format]
            }
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  wishes: { gap: 10 },
  wishCard: wishCardStyle,
  bar: { paddingHorizontal: 16, paddingVertical: 8 },
  centred: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 6 },
  pinned: {
    paddingHorizontal: 20,
    // Something has to mark where the fixed part ends, or the list slides under it with no
    // boundary and reads as one thing that scrolled halfway.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  /* The air the list used to inherit from whatever happened to sit above it in the scroll. */
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.inkMuted, marginTop: 3 },
  friendsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  friendsChipLabel: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.inkMuted },
  requestedLabel: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.inkSubtle,
    marginTop: 14,
  },
  answerRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 14 },
  /** The button carries the row's top margin, so it does not add its own on top of it. */
  answerButton: { marginTop: 0 },
  declineLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.inkMuted },
  askButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.ink,
  },
  askLabel: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.paper },
  askSignedOut: { alignSelf: "flex-start", gap: 7 },
  /** Legible, and plainly not pressable. Opacity rather than a second grey palette. */
  askButtonOff: { opacity: 0.35 },
  askHint: { fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: colors.inkMuted },
  /*
   * A track, and the halves live inside it. Two pills with a rule underneath drew the same
   * choice as two separate buttons that happened to sit together; this says they are one
   * control with two positions, which is what it is.
   */
  tabs: {
    flexDirection: "row",
    gap: 2,
    marginTop: 16,
    marginBottom: 12,
    padding: 3,
    borderRadius: 9,
    backgroundColor: "rgba(25,23,19,0.06)",
  },
  tab: {
    flex: 1,
    height: 30,
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: "rgba(25,23,19,1)",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tabLabel: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.inkMuted },
  tabLabelActive: { color: colors.ink, fontWeight: "600" },
  tabCount: { fontFamily: "Menlo", fontSize: 11, color: colors.inkSubtle },
  locked: {
    alignItems: "center",
    marginTop: 28,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    gap: 8,
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas,
  },
  lockedTitle: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: colors.ink },
  lockedBody: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.inkMuted,
    textAlign: "center",
  },
  /*
   * Three equal columns. `width: "30%"` came to roughly the same thing on a phone and to
   * something else on anything wider, because a percentage does not know about the gaps
   * beside it. A basis of nothing plus an equal grow does.
   */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  tile: { flexBasis: "30%", flexGrow: 0, maxWidth: "31%" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summarySort: {
    fontFamily: "Menlo",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  summaryMix: { flexShrink: 1, fontFamily: "Menlo", fontSize: 11, color: colors.inkSubtle },
  rowText: { flex: 1, minWidth: 0 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    textAlign: "center",
    marginTop: 24,
  },
});
