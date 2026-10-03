import { ReleaseArt } from "@/components/ReleaseArt";
import { type RemoveRow, RemoveSheet } from "@/components/RemoveSheet";
import type { RemovedWish } from "@/features/wishlist/useWishlistLogic";
import { ink } from "@/theme/colors";
import type { WishlistItem } from "@janne6565/rekordo-shared";
import { FORMAT_LABELS } from "@janne6565/rekordo-shared";
import { HeartOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet } from "react-native";

/**
 * Screen 16b-x: "Remove from your wishlist?", over the paper of 16b.
 *
 * The copy's sheet with a wish inside: the person's own picture takes the cover slot, the
 * wanted format joins the meta line, and the note leads the list because it is the part
 * typed by hand. A bare wish has no list; its date stays as a third meta line instead of a
 * one-row list, matching the sparse copy.
 */
export function RemoveWishSheet({
  open,
  onClose,
  onConfirm,
  entry,
  since,
  coverUri,
  pictureUri,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (summary: RemovedWish) => void;
  readonly entry: WishlistItem;
  /** "12 Aug 2026", formatted the way 16b already shows it. */
  readonly since: string;
  readonly coverUri: string | null;
  /** The person's own picture of this entry, or null when it wears the catalogue's cover. */
  readonly pictureUri: string | null;
}) {
  const { t } = useTranslation();
  const note = entry.note?.trim() ?? "";
  const bare = note === "" && pictureUri === null;

  const rows: RemoveRow[] = [];
  if (!bare) {
    if (note !== "") rows.push({ key: "note", label: t("remove.note"), note });
    if (pictureUri !== null) {
      rows.push({
        key: "picture",
        label: t("remove.picture"),
        value: <Image source={{ uri: pictureUri }} style={styles.thumb} />,
      });
    }
    rows.push({ key: "since", label: t("remove.wantedSince"), value: since });
  }

  const withWhat =
    note !== "" && pictureUri !== null
      ? t("remove.withYourNoteAndPicture")
      : note !== ""
        ? t("remove.withYourNote")
        : pictureUri !== null
          ? t("remove.withYourPicture")
          : null;

  return (
    <RemoveSheet
      open={open}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({
          title: t("remove.offWishlist"),
          line: [entry.title, withWhat ?? entry.artistName]
            .filter((part) => part !== "")
            .join(" · "),
        })
      }
      over="PAPER"
      title={t("remove.wishTitle")}
      art={
        <ReleaseArt
          release={{ coverArtUrl: coverUri }}
          previewUri={pictureUri}
          format={entry.desiredFormat ?? "OTHER"}
          style={styles.art}
        />
      }
      name={entry.title}
      meta={[
        entry.artistName,
        entry.year === null ? null : String(entry.year),
        entry.desiredFormat === null
          ? t("remove.anyFormat")
          : t("remove.wantedOn", { format: FORMAT_LABELS[entry.desiredFormat] }),
      ]
        .filter((part) => part !== null && part !== "")
        .join(" · ")}
      subMeta={bare ? t("remove.wantedSinceLine", { date: since }) : undefined}
      rows={rows}
      confirmLabel={t("remove.removeWish")}
      confirmIcon={HeartOff}
    />
  );
}

const styles = StyleSheet.create({
  art: { width: 72, height: 60 },
  thumb: { width: 30, height: 30, borderRadius: 4, marginVertical: -6, backgroundColor: ink(0.1) },
});
