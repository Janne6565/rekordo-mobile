import { useStore } from "@/local/StoreProvider";
import { colors, fonts } from "@/theme/colors";
import { UNDO_HOLD, restoreWishlistItem } from "@janne6565/rekordo-shared";
import { useQueryClient } from "@tanstack/react-query";
import { HeartOff, Trash2 } from "lucide-react-native";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

/** A wishlist entry that has just left on its own, and the seconds in which it can come back. */
export interface WishUndo {
  readonly wishId: string;
  readonly title: string;
  readonly wantedSince: number;
}

/** Something the person removed themselves (3a-x-e, 16b-x-c), and how to bring it back. */
export interface RemovalUndo {
  readonly kind: "COPY" | "WISH";
  readonly title: string;
  readonly line: string;
  readonly undo: () => Promise<void>;
}

type Pending =
  | { readonly type: "WISH"; readonly wish: WishUndo }
  | {
      readonly type: "REMOVAL";
      readonly removal: RemovalUndo;
    };

interface UndoControls {
  readonly offer: (undo: WishUndo) => void;
  readonly offerRemoval: (removal: RemovalUndo) => void;
}

const UndoContext = createContext<UndoControls | null>(null);

export function useUndo(): UndoControls {
  return useContext(UndoContext) ?? { offer: () => undefined, offerRemoval: () => undefined };
}

/**
 * Screen 16e — the one line that stands between an automatic removal and a lost entry.
 *
 * Above the tabs rather than on the wishlist screen: the removal happens wherever a record
 * gets filed, which is usually the library or the add flow, and a message on the screen
 * nobody is looking at is not a message.
 */
export function UndoProvider({ children }: { readonly children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((next: Pending) => {
    setPending(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPending(null), UNDO_HOLD);
  }, []);

  const offer = useCallback((wish: WishUndo) => show({ type: "WISH", wish }), [show]);
  const offerRemoval = useCallback(
    (removal: RemovalUndo) => show({ type: "REMOVAL", removal }),
    [show],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const done = () => {
    clearTimeout(timer.current);
    setPending(null);
  };

  return (
    <UndoContext.Provider value={{ offer, offerRemoval }}>
      {children}
      {pending?.type === "WISH" && <UndoLine undo={pending.wish} onDone={done} />}
      {pending?.type === "REMOVAL" && <RemovalLine removal={pending.removal} onUndone={done} />}
    </UndoContext.Provider>
  );
}

/**
 * 3a-x-e and 16b-x-c: the 16e bar, with Undo as its action because here the person chose
 * the removal. The second line repeats what went, so Undo is pressed knowing what it brings
 * back.
 */
function RemovalLine({
  removal,
  onUndone,
}: {
  readonly removal: RemovalUndo;
  readonly onUndone: () => void;
}) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const Icon = removal.kind === "COPY" ? Trash2 : HeartOff;

  const undo = async () => {
    if (working) return;
    setWorking(true);
    await removal.undo();
    onUndone();
  };

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite" pointerEvents="box-none">
      <View style={[styles.card, styles.removalCard]}>
        <Icon size={17} color="rgba(255,255,255,0.6)" strokeWidth={1.75} />
        <View style={styles.body}>
          <Text style={styles.title}>{removal.title}</Text>
          <Text style={styles.removalLine} numberOfLines={1}>
            {removal.line}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={undo}
          disabled={working}
          hitSlop={8}
          style={styles.undo}
        >
          <Text style={styles.undoText}>{t("remove.undo")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UndoLine({ undo, onDone }: { readonly undo: WishUndo; readonly onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const { store, clock } = useStore();
  const queryClient = useQueryClient();

  const keepIt = async () => {
    const item = await store.getWishlistItemIncludingDeleted(undo.wishId);
    if (item === undefined) return;
    await store.putWishlistItem(restoreWishlistItem(item, clock));
    await queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    onDone();
  };

  const since = new Intl.DateTimeFormat(i18n.language, {
    month: "short",
    year: "numeric",
  }).format(undo.wantedSince);

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite" pointerEvents="box-none">
      <View style={styles.card}>
        <HeartOff size={16} color={colors.nightMuted} strokeWidth={1.75} />
        <View style={styles.body}>
          <Text style={styles.title}>{t("undo.wishSatisfied")}</Text>
          <Text style={styles.since} numberOfLines={1}>
            {t("undo.wishSince", { title: undo.title, since })}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={keepIt} style={styles.action}>
          <Text style={styles.actionText}>{t("undo.keepIt")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The deck's Undo on the ink bar: the accent lifted until it reads on near-black. */
const UNDO_INK = "#e0b79f";

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 96, paddingHorizontal: 18 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.nightInk },
  since: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.nightMuted, marginTop: 1 },
  action: {
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: { fontFamily: fonts.sans, fontSize: 12, fontWeight: "600", color: colors.nightInk },
  removalCard: {
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 13,
    shadowColor: colors.ink,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  removalLine: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.nightMuted,
    marginTop: 2,
  },
  undo: { paddingVertical: 8, paddingLeft: 8 },
  undoText: { fontFamily: fonts.sans, fontSize: 12.5, fontWeight: "600", color: UNDO_INK },
});
