import type { ProfileSummary } from "@/api/friends";
import { formatRelativeTime } from "@/domain/relativeTime";
import { ActivityList } from "@/features/friends/ActivityList";
import { Avatar } from "@/features/friends/Avatar";
import { ClaimHandlePanel } from "@/features/friends/ClaimHandlePanel";
import { EmptyPanel } from "@/features/friends/EmptyPanel";
import { Segments } from "@/features/friends/Segments";
import { useFriendsLogic } from "@/features/friends/useFriendsLogic";
import { useSwap } from "@/features/friends/useSwap";
import type { RecentCollector } from "@/local/settings";
import { colors, fonts } from "@/theme/colors";
import { useRouter } from "expo-router";
import { AtSign, ChevronRight, Lock, Search, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Screens 15a, 15b and 24e — one tab holding activity, people, and the way to find them.
 *
 * Two panels behind a segmented control rather than two tabs of their own: they are the
 * same subject looked at two ways, and the phone's tab bar already has four things in it.
 *
 * Looking somebody up is a mode, not a field sitting permanently under the title. At rest
 * it is one round button; opened, it takes the screen — the title goes, the panels go, and
 * what is left is a handle field and the collectors this device has already been to see.
 * That is 24e's whole argument: with nothing typed, the useful thing to offer is people,
 * not the words that once found them.
 */
export function FriendsScreen() {
  const { t } = useTranslation();
  const logic = useFriendsLogic();
  const [panel, setPanel] = useState<"activity" | "people">("activity");
  const [searching, setSearching] = useState(false);
  const field = useRef<TextInput>(null);

  /**
   * The field is open and nothing has been typed — 24e's middle frame.
   *
   * Once there is a query the results are the answer and a list of old visits underneath
   * would be competing with it, so this is the one state where the recents show.
   */
  const showRecent = searching && logic.query.trim() === "";

  /*
   * The header changes height between its two modes — a title over a control, or a single
   * field — so the change is a layout change and cannot ride the native driver. One
   * `LayoutAnimation` covers it: the rows that leave fade out where they stand, the row
   * that arrives fades in, and everything below slides to meet it. Without it the whole
   * page jumps by the difference in one frame.
   *
   * Degrades to that jump rather than to an error where the platform does not implement
   * it, which is the right way round for a transition.
   */
  const setMode = (open: boolean) => {
    LayoutAnimation.configureNext({
      duration: 240,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    setSearching(open);
  };

  const close = () => {
    logic.setQuery("");
    field.current?.blur();
    setMode(false);
  };

  /**
   * Which of the four things the body is, held back until the one before it has faded.
   *
   * One key rather than a fade per branch: going from the remembered collectors to the
   * results of what you just typed is as much a change of content as switching panels is,
   * and it was the one transition that still happened between two frames.
   */
  const body = useSwap(searching ? (showRecent ? "recent" : "results") : panel);

  /*
   * The spinner in the field, faded rather than switched.
   *
   * A search runs on nearly every keystroke, so an indicator that appears and disappears
   * outright flickers the whole time somebody is typing. Fading it, and taking longer to
   * leave than to arrive, keeps a fast answer from registering as a blink.
   */
  const spinner = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(spinner, {
      toValue: logic.searching ? 1 : 0,
      duration: logic.searching ? 120 : 260,
      useNativeDriver: true,
    }).start();
  }, [logic.searching, spinner]);

  if (!logic.signedIn) {
    return <SignedOutFind logic={logic} />;
  }

  // Waiting rather than guessing: flashing the claim form at somebody who already has a
  // handle is worse than a moment of nothing.
  if (logic.needsHandle === undefined) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.inkSubtle} />
        </View>
      </SafeAreaView>
    );
  }

  if (logic.needsHandle) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ClaimHandlePanel />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        {searching ? (
          <View style={styles.searchRow}>
            <View style={[styles.handleField, styles.handleFieldFill]}>
              <AtSign size={16} color={colors.inkMuted} strokeWidth={1.75} />
              <TextInput
                ref={field}
                autoFocus
                value={logic.query}
                onChangeText={(next) => {
                  logic.setQuery(next);
                  // Typing is a request to look at people, whichever panel was open.
                  if (next.trim().length > 0) setPanel("people");
                }}
                placeholder={t("friends.handlePlaceholder")}
                placeholderTextColor={colors.inkSubtle}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={colors.accent}
                onSubmitEditing={() => setPanel("people")}
                style={styles.handleInput}
              />
              <Animated.View style={{ opacity: spinner }} pointerEvents="none">
                <ActivityIndicator size="small" color={colors.inkSubtle} />
              </Animated.View>
            </View>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={CANCEL_SLOP}>
              <Text style={styles.cancel}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t("friends.title")}</Text>
              {/* One button, not a field. A search box under the title claims a permanent
                  strip of every visit for something most of them do not do. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("friends.search")}
                onPress={() => setMode(true)}
                style={styles.searchButton}
              >
                <Search size={19} color={colors.inkMuted} strokeWidth={1.9} />
              </Pressable>
            </View>

            <Segments
              active={panel}
              onChange={(key) => setPanel(key as "activity" | "people")}
              options={[
                { key: "activity", label: t("friends.activity") },
                { key: "people", label: t("friends.people"), count: logic.friends.length },
              ]}
            />
          </>
        )}
      </View>

      {/*
       * One scroll view, whose contents fade between panels. Two of them swapping would
       * take the scroll position with them, and coming back to a feed you had read halfway
       * down only to find it at the top is worse than any transition.
       */}
      <Animated.View style={[styles.bodyWrap, { opacity: body.opacity }]}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={logic.refreshing}
              onRefresh={() => void logic.refetch()}
              tintColor={colors.inkMuted}
            />
          }
        >
          {body.shown === "recent" && (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.sectionLabel}>{t("friends.recent")}</Text>
                {logic.recent.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void logic.forget()}
                    hitSlop={8}
                  >
                    <Text style={styles.recentClear}>{t("friends.recentClear")}</Text>
                  </Pressable>
                )}
              </View>

              {logic.recent.length === 0 ? (
                /*
                 * Nothing has been visited, so there is nothing to offer — and nothing is
                 * invented. The card says what a handle looks like and what collects here.
                 */
                <View style={styles.emptyCard}>
                  <View style={styles.emptyCardIcon}>
                    <AtSign size={17} color={colors.inkMuted} strokeWidth={1.9} />
                  </View>
                  <Text style={styles.emptyCardTitle}>{t("friends.recentEmpty.title")}</Text>
                  <Text style={styles.emptyCardBody}>{t("friends.recentEmpty.body")}</Text>
                </View>
              ) : (
                logic.recent.map((entry) => (
                  <RecentRow key={entry.handle} entry={entry} logic={logic} />
                ))
              )}
            </>
          )}

          {body.shown === "results" && <PeoplePanel logic={logic} />}

          {(body.shown === "activity" || body.shown === "people") && (
            <>
              {logic.incoming.map((invite) => (
                <RequestCard
                  key={invite.id}
                  name={invite.from?.displayName ?? invite.from?.handle ?? ""}
                  avatarUrl={invite.from?.avatarUrl}
                  handle={invite.from?.handle ?? ""}
                  mutual={invite.mutualFriends ?? 0}
                  busy={logic.accept.isPending || logic.decline.isPending}
                  onAccept={() => logic.accept.mutate(invite.id ?? "")}
                  onDecline={() => logic.decline.mutate(invite.id ?? "")}
                />
              ))}

              {body.shown === "people" ? (
                <PeoplePanel logic={logic} />
              ) : (
                <ActivityList entries={logic.entries} loading={logic.loading} />
              )}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

type Logic = ReturnType<typeof useFriendsLogic>;

/**
 * The Friends tab with no account: the search, and nothing else.
 *
 * Looking a collector up is the one social thing that needs no account — a handle is
 * handed out exactly so it can be typed by somebody who has not signed up yet, and a tab
 * that answers that with a wall makes the link useless. What a result leads to is already
 * guest-safe: the profile draws the open shelf or the locked one on the server's verdict.
 *
 * The field sits open rather than behind 24e's round button. There is no title bar, no
 * segmented control and no feed to compete with it here, so the mode this screen would
 * switch into is the only mode it has.
 */
function SignedOutFind({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const router = useRouter();
  const nothingFound = logic.searched && !logic.searching && logic.results.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("friends.signedOut.title")}</Text>
        <Text style={styles.guestLede}>{t("friends.signedOut.body")}</Text>
        <View style={[styles.handleField, styles.guestField]}>
          <AtSign size={16} color={colors.inkMuted} strokeWidth={1.75} />
          <TextInput
            value={logic.query}
            onChangeText={logic.setQuery}
            placeholder={t("friends.handlePlaceholder")}
            placeholderTextColor={colors.inkSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={colors.accent}
            style={styles.handleInput}
          />
          {logic.searching && <ActivityIndicator size="small" color={colors.inkSubtle} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {logic.results.map((person) => (
          <PersonRow key={person.id} person={person} logic={logic} />
        ))}
        {nothingFound && <Text style={styles.guestNote}>{t("friends.signedOut.noMatches")}</Text>}

        {/* The offer as a footnote rather than the screen: what a visitor came here to do
            is above it, and this is what staying would add. */}
        <View style={styles.guestCard}>
          <Text style={styles.emptyCardBody}>{t("friends.signedOut.invitation")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/you")}
            style={styles.guestButton}
          >
            <Text style={styles.addLabel}>{t("friends.signedOut.action")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PeoplePanel({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  return (
    <View>
      {logic.results.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t("friends.results")}</Text>
          {logic.results.map((person) => (
            <PersonRow key={person.id} person={person} logic={logic} />
          ))}
        </>
      )}

      {/*
       * No heading over an empty section. "Your friends · 0" is a label counting nothing,
       * directly above a line that already says there is nobody — the board only ever
       * draws this heading with a list under it.
       */}
      {logic.friends.length === 0 ? (
        <EmptyPanel title={t("friends.noneYet.title")} body={t("friends.noneYet.body")} />
      ) : (
        <>
          <Text style={styles.sectionLabel}>
            {t("friends.yourFriends", { count: logic.friends.length })}
          </Text>
          {logic.friends.map((person) => (
            <PersonRow key={person.id} person={person} logic={logic} />
          ))}
        </>
      )}
    </View>
  );
}

/**
 * One collector this device has been to see — 24e.
 *
 * Their name, their handle, and what was there when you looked: a shelf's size and how long
 * ago, which together are the reason to go back rather than merely the fact that you once
 * did. Both halves are optional and the line shortens — a shelf closed to you reports no
 * count, and rows written before any of this was stored say less rather than being thrown
 * away to gain a subtitle.
 */
function RecentRow({ entry, logic }: { readonly entry: RecentCollector; readonly logic: Logic }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const name = entry.displayName ?? entry.handle;

  const parts: string[] = [];
  if (entry.copyCount !== undefined) parts.push(t("friends.copies", { count: entry.copyCount }));
  if (entry.seenAt !== undefined) {
    parts.push(t("friends.recentSeen", { when: formatRelativeTime(entry.seenAt, i18n.language) }));
  }
  const meta = parts.join(" · ");

  return (
    <View style={styles.recentRow}>
      <Pressable
        accessibilityRole="button"
        // onPressIn, because the blur that closes this list fires first on a plain press
        // and takes the row out from under the finger.
        onPressIn={() =>
          router.push({ pathname: "/profiles/[handle]", params: { handle: entry.handle } })
        }
        style={styles.recentTap}
      >
        <Avatar name={name} uri={entry.avatarUrl} size={44} />
        <View style={styles.rowText}>
          <Text style={styles.recentName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.recentHandle} numberOfLines={1}>
            @{entry.handle}
          </Text>
          {meta !== "" && (
            <Text style={styles.recentMeta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
      </Pressable>

      {/* Forgets this one. Clearing the lot is the header's job; a list you can only empty
          wholesale makes one wrong visit permanent until you throw the rest away too. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("friends.recentForget", { name })}
        onPressIn={() => void logic.forgetOne(entry.handle)}
        hitSlop={8}
        style={styles.recentForget}
      >
        <X size={13} color={colors.inkSubtle} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function PersonRow({ person, logic }: { readonly person: ProfileSummary; readonly logic: Logic }) {
  const { t } = useTranslation();
  const router = useRouter();
  const name = person.displayName ?? person.handle ?? "";

  return (
    <Pressable
      style={styles.row}
      onPress={() => {
        // Recorded on the way in, not on the way out of a search: what makes somebody worth
        // offering again is that you went to look at them.
        void logic.remember({
          handle: person.handle ?? "",
          displayName: person.displayName ?? null,
          // What their shelf held when you went; absent when it is closed to you, which is
          // the same reason the row above it has no count either.
          copyCount: person.copyCount,
          avatarUrl: person.avatarUrl,
        });
        router.push({ pathname: "/profiles/[handle]", params: { handle: person.handle ?? "" } });
      }}
      accessibilityRole="button"
    >
      <Avatar name={name} uri={person.avatarUrl} size={38} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.rowMetaLine}>
          {person.collectionPrivate === true && (
            <Lock size={11} color={colors.inkSubtle} strokeWidth={2} />
          )}
          <Text style={styles.rowMeta} numberOfLines={1}>
            @{person.handle}
            {/* Null rather than undefined when the shelf is closed, and `!== undefined`
                rendered the bare word "copies" for every private collector. */}
            {person.copyCount != null && ` · ${t("friends.copies", { count: person.copyCount })}`}
          </Text>
        </View>
      </View>
      <RelationshipButton person={person} logic={logic} />
    </Pressable>
  );
}

/**
 * One control with four states, driven entirely by the server's verdict. The client works
 * out none of them — who two accounts are to each other is a fact about the accounts.
 */
function RelationshipButton({
  person,
  logic,
}: { readonly person: ProfileSummary; readonly logic: Logic }) {
  const { t } = useTranslation();

  // A stranger gets no verdict to act on — the server answers the same for everybody when
  // nobody is asking — and the row already leads to the shelf, which is the only thing
  // they can do here. The invitation to sign in is under the list, said once.
  if (!logic.signedIn) {
    return null;
  }

  switch (person.relationship) {
    case "FRIENDS":
      return <Text style={styles.flatState}>{t("friends.state.friends")}</Text>;
    case "REQUEST_SENT":
      return <Text style={styles.flatState}>{t("friends.state.requested")}</Text>;
    case "SELF":
      return <Text style={styles.flatState}>{t("friends.state.you")}</Text>;
    case "REQUEST_RECEIVED":
      return <ChevronRight size={16} color={colors.inkSubtle} strokeWidth={1.75} />;
    default:
      return (
        <Pressable
          onPress={() => logic.ask.mutate(person.handle ?? "")}
          disabled={logic.ask.isPending}
          style={styles.addButton}
        >
          <Text style={styles.addLabel}>{t("friends.state.add")}</Text>
        </Pressable>
      );
  }
}

interface RequestCardProps {
  readonly name: string;
  readonly avatarUrl: string | undefined;
  readonly handle: string;
  readonly mutual: number;
  readonly busy: boolean;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

/**
 * Pinned above the feed: a person waiting for an answer outranks any record.
 *
 * A drawn accent edge on the paper surface rather than an accent wash (22d). What separates
 * a request from activity is that it is addressed to you and waits — the card is the same
 * material as everything else, outlined.
 */
function RequestCard({
  name,
  avatarUrl,
  handle,
  mutual,
  busy,
  onAccept,
  onDecline,
}: RequestCardProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.requestCard}>
      <Avatar name={name} uri={avatarUrl} size={38} />
      <View style={styles.rowText}>
        <Text style={styles.requestName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.requestMeta} numberOfLines={1}>
          @{handle}
          {mutual > 0 ? ` · ${t("friends.mutual", { count: mutual })}` : ` · ${t("friends.wants")}`}
        </Text>
      </View>
      <Pressable onPress={onAccept} disabled={busy} style={styles.acceptButton}>
        <Text style={styles.acceptLabel}>{t("friends.accept")}</Text>
      </Pressable>
      <Pressable onPress={onDecline} disabled={busy} hitSlop={6}>
        <Text style={styles.declineLabel}>{t("friends.decline")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centred: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },

  header: { paddingHorizontal: 18, paddingTop: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink },
  searchButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  /*
   * Open, the field is a capsule with a drawn edge. The resting screen has no field at all,
   * so this one is not a box among other things — it is the screen, and says so.
   */
  handleField: {
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
  /*
   * Filling the row is the *caller's* business, not the field's. It used to be `flex: 1`
   * here, which is right beside Cancel and collapses the capsule to a black line on the
   * guest screen, where the field is a child of a column: `flex: 1` there means grow
   * downwards from a basis of zero, and the fixed 44 height loses to it.
   */
  handleFieldFill: { flex: 1 },
  handleInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.ink, padding: 0 },
  cancel: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "500", color: colors.inkMuted },

  bodyWrap: { flex: 1 },
  body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24 },
  sectionLabel: {
    fontFamily: "Menlo",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 24,
    marginBottom: 10,
  },

  recentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recentClear: { fontFamily: fonts.sans, fontSize: 11.5, fontWeight: "600", color: colors.accent },
  /*
   * A rule above each row rather than between them: the first row then separates itself
   * from the header it sits under, which is where the list actually needs the line.
   */
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recentTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  recentName: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "600", color: colors.ink },
  recentHandle: { fontFamily: "Menlo", fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  recentMeta: { fontFamily: fonts.sans, fontSize: 11, color: colors.inkSubtle, marginTop: 2 },
  recentForget: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(25,23,19,0.05)",
  },

  emptyCard: {
    marginTop: 4,
    paddingVertical: 26,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  emptyCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(25,23,19,0.05)",
  },
  emptyCardTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink, marginTop: 12 },
  emptyCardBody: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.inkMuted,
    marginTop: 7,
    textAlign: "center",
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  rowMetaLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  rowMeta: { fontFamily: "Menlo", fontSize: 11, color: colors.inkMuted, flexShrink: 1 },
  flatState: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "500", color: colors.inkSubtle },
  addButton: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  addLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.paper },

  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(162,87,58,0.35)",
    backgroundColor: colors.surface,
  },
  requestName: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  requestMeta: { fontFamily: "Menlo", fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  acceptButton: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  acceptLabel: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.paper },
  declineLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "500",
    color: colors.inkSubtle,
  },

  guestLede: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 8,
  },
  guestField: { marginTop: 16 },
  guestNote: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.inkSubtle,
    marginTop: 4,
  },
  guestCard: {
    marginTop: 24,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  guestButton: {
    height: 34,
    marginTop: 14,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
});

/**
 * The people search's Cancel is 13.5pt text, about 33pt tall with the old slop of 8, under
 * the 44pt a thumb needs. Grown to the side away from the field, so it cannot steal a tap
 * meant for the input -- the same shape as the add screen's Cancel.
 */
const CANCEL_SLOP = { top: 14, bottom: 14, left: 10, right: 18 } as const;
