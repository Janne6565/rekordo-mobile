import { ReleaseArt } from "@/components/ReleaseArt";
import { useSaveBatch } from "@/features/scan/useSaveBatch";
import { useStore } from "@/local/StoreProvider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { type KeptScan, scanActions } from "@/store/scanSlice";
import { colors, fonts } from "@/theme/colors";
import type { Copy, Release, WishlistItem } from "@janne6565/rekordo-shared";
import {
  FORMAT_LABELS,
  catalogueKeyOf,
  catalogueKeysOf,
  copyFormat,
  formatBarcode,
  isManualCopy,
  isManualReleaseId,
} from "@janne6565/rekordo-shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Check, CloudOff, Disc3, Heart, LibraryBig } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * What a saved crate looks like: both destinations named plainly, and nothing to fill in.
 *
 * Saving is the end of the transaction, not the middle of a form. Condition and price are
 * offered here and can equally be added months later from any copy — a shop is a bad place
 * to grade a sleeve, and a flow that insists on it at the counter gets abandoned there.
 *
 * Turn 28 of the deck, screen 3b.
 */
export function SavedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { store } = useStore();
  const batch = useAppSelector((state) => state.scan.saved);
  const { undo, undoing } = useSaveBatch();

  /**
   * The records as they were actually written, read back rather than remembered.
   *
   * The tray was emptied by the save, and reading the store is the only account of what
   * exists that cannot be wrong — a pending scan's copy id, in particular, was invented
   * during the write and was never in the tray at all.
   */
  const written = useQuery({
    queryKey: ["scan-batch", batch?.copyIds, batch?.wishIds],
    enabled: batch !== null,
    queryFn: async () => {
      if (batch === null) return { copies: [], wishes: [], releases: new Map<string, Release>() };
      const copies: Copy[] = [];
      for (const id of batch.copyIds) {
        const copy = await store.getCopy(id);
        if (copy !== undefined) copies.push(copy);
      }
      const all = await store.listWishlist();
      const wishes = all.filter((wish) => batch.wishIds.includes(wish.id));
      const releases = await store.getReleases(catalogueKeysOf(copies));
      return { copies, wishes, releases };
    },
  });

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => store.stats() });
  const wishlist = useQuery({ queryKey: ["wishlist"], queryFn: () => store.listWishlist() });

  if (batch === null) {
    // Undone, or arrived at directly. Nothing here has anything to say.
    return null;
  }

  const copies = written.data?.copies ?? [];
  const wishes = written.data?.wishes ?? [];
  const pending = copies.filter((copy) => copy.pendingBarcode !== null).length;
  const detailable = copies.filter((copy) => copy.pendingBarcode === null);

  const finish = () => {
    dispatch(scanActions.cleared());
    router.dismissAll();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.tick}>
          <Check size={26} color="#ffffff" strokeWidth={2} />
        </View>

        <Text style={styles.title}>
          {t("scan.saved.title", { shelf: copies.length, wishlist: wishes.length })}
        </Text>
        {stats.data !== undefined && (
          <Text style={styles.lede}>
            {t("scan.saved.body", {
              copies: stats.data.copyCount,
              releases: stats.data.releaseGroupCount,
              wishlist: wishlist.data?.length ?? 0,
            })}
          </Text>
        )}

        <View style={styles.list}>
          {copies.map((copy) => (
            <SavedRow
              key={copy.id}
              title={
                copy.pendingBarcode === null
                  ? (written.data?.releases.get(catalogueKeyOf(copy) ?? "")?.title ?? "")
                  : formatBarcode(copy.pendingBarcode)
              }
              mono={copy.pendingBarcode !== null}
              meta={
                copy.pendingBarcode !== null
                  ? t("scan.pendingRow")
                  : metaLine(written.data?.releases.get(catalogueKeyOf(copy) ?? ""), copy)
              }
              release={written.data?.releases.get(catalogueKeyOf(copy) ?? "")}
              destination="SHELF"
            />
          ))}
          {wishes.map((wish) => (
            <SavedRow
              key={wish.id}
              title={wish.pendingBarcode === null ? wish.title : formatBarcode(wish.pendingBarcode)}
              mono={wish.pendingBarcode !== null}
              meta={wish.pendingBarcode !== null ? t("scan.pendingRow") : wishMeta(wish)}
              release={undefined}
              destination="WISHLIST"
            />
          ))}
        </View>

        {pending > 0 && (
          <View style={styles.waiting}>
            <CloudOff size={14} color={colors.inkMuted} strokeWidth={1.8} />
            <Text style={styles.waitingText}>
              {t("scan.saved.stillWaiting", { count: pending })}
            </Text>
          </View>
        )}

        {detailable.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/scan/details")}
            style={styles.details}
          >
            <Text style={styles.detailsText}>
              {t("scan.saved.addDetails", { count: detailable.length })}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={undoing}
          onPress={() => {
            void undo(batch, restorable(copies, wishes, written.data?.releases)).then(() =>
              router.back(),
            );
          }}
        >
          <Text style={styles.undo}>{t("scan.undoBatch")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={finish} style={styles.done}>
          <Text style={styles.doneText}>{t("scan.done")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SavedRow({
  title,
  mono,
  meta,
  release,
  destination,
}: {
  readonly title: string;
  readonly mono: boolean;
  readonly meta: string;
  readonly release: Release | undefined;
  readonly destination: "SHELF" | "WISHLIST";
}) {
  const { t } = useTranslation();
  const wished = destination === "WISHLIST";
  return (
    <View style={styles.row}>
      {release === undefined ? (
        <View style={styles.pending}>
          <Disc3 size={18} color="rgba(25,23,19,0.3)" strokeWidth={1.6} />
        </View>
      ) : (
        <ReleaseArt release={release} format={release.format} style={styles.art} />
      )}
      <View style={styles.rowText}>
        <Text style={mono ? styles.rowDigits : styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.tag}>
        {wished ? (
          <Heart size={11} color={colors.accent} strokeWidth={2.4} />
        ) : (
          <LibraryBig size={11} color={colors.accentStrong} strokeWidth={2.2} />
        )}
        <Text style={[styles.tagText, wished && styles.tagTextWished]}>
          {wished ? t("scan.wishlistTag") : t("scan.shelfTag")}
        </Text>
      </View>
    </View>
  );
}

function metaLine(release: Release | undefined, copy: Copy): string {
  if (release === undefined) return "";
  return [
    release.artistName,
    release.year === null ? null : String(release.year),
    FORMAT_LABELS[copyFormat(copy, release)],
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

function wishMeta(wish: WishlistItem): string {
  return [
    wish.artistName,
    wish.year === null ? null : String(wish.year),
    wish.desiredFormat === null ? null : FORMAT_LABELS[wish.desiredFormat],
  ]
    .filter((part) => part !== null && part !== "")
    .join(" · ");
}

/**
 * The tray Undo puts back, rebuilt from what was written.
 *
 * A restored row is the same decision it was — the record, the format, the destination —
 * and rebuilding it from the store rather than from a remembered tray is what makes Undo
 * safe to press after the app has been backgrounded and the slice thrown away.
 *
 * A record typed in by hand goes back as what was typed, not as a release: the release the
 * store answers with for it is the copy describing itself, under an id that dies with the
 * copy. Its cover does not come back — the photo went with the copy it was attached to.
 */
function restorable(
  copies: readonly Copy[],
  wishes: readonly WishlistItem[],
  releases: ReadonlyMap<string, Release> | undefined,
): KeptScan[] {
  return [
    ...copies.map((copy) => {
      const typed = copy.pendingBarcode === null && isManualCopy(copy);
      return {
        key: copy.id,
        barcode: copy.pendingBarcode ?? "",
        release: typed ? null : (releases?.get(catalogueKeyOf(copy) ?? "") ?? null),
        manual: typed
          ? {
              fields: {
                manualTitle: copy.manualTitle,
                manualArtist: copy.manualArtist,
                manualYear: copy.manualYear,
                manualLabel: copy.manualLabel,
                manualCatalogNumber: copy.manualCatalogNumber,
                manualFormat: copy.manualFormat,
              },
              cover: null,
            }
          : null,
        format: copy.manualFormat,
        destination: "SHELF" as const,
        secondCopy: false,
        keptAt: copy.createdAt,
      };
    }),
    ...wishes.map((wish) => ({
      key: wish.id,
      barcode: wish.pendingBarcode ?? "",
      release: null,
      manual:
        wish.pendingBarcode === null && isManualReleaseId(wish.albumId)
          ? {
              fields: {
                manualTitle: wish.title,
                manualArtist: wish.artistName,
                manualYear: wish.year,
                manualLabel: null,
                manualCatalogNumber: null,
                manualFormat: wish.desiredFormat,
              },
              cover: null,
            }
          : null,
      format: wish.desiredFormat,
      destination: "WISHLIST" as const,
      secondCopy: false,
      keptAt: wish.createdAt,
    })),
  ];
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  body: { paddingHorizontal: 18, paddingTop: 40, paddingBottom: 20 },
  tick: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 35,
    color: colors.ink,
    marginTop: 20,
  },
  lede: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 22,
    color: colors.inkMuted,
    marginTop: 8,
  },

  list: { marginTop: 22 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(25,23,19,0.08)",
  },
  art: { width: 53, height: 44 },
  pending: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#eae6de",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.sans, fontSize: 13, fontWeight: "600", color: colors.ink },
  rowDigits: { fontFamily: MONO, fontSize: 12, color: colors.ink },
  rowMeta: { fontFamily: fonts.sans, fontSize: 11.5, color: "rgba(25,23,19,0.5)", marginTop: 2 },
  tag: { flexDirection: "row", alignItems: "center", gap: 5 },
  tagText: { fontFamily: MONO, fontSize: 10, color: colors.accentStrong },
  tagTextWished: { color: colors.accent },

  waiting: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  waitingText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
    flex: 1,
  },

  details: {
    marginTop: 22,
    height: 48,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsText: { fontFamily: fonts.sans, fontSize: 14.5, fontWeight: "600", color: "#ffffff" },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(25,23,19,0.09)",
    backgroundColor: colors.surface,
  },
  undo: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "500", color: colors.accent },
  done: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: "600", color: colors.ink },
});
