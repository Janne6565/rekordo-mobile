import { ReleaseArt } from "@/components/ReleaseArt";
import { type RemoveRow, RemoveSheet } from "@/components/RemoveSheet";
import { colors, ink } from "@/theme/colors";
import type { Copy, Photo, Release } from "@janne6565/rekordo-shared";
import { CONDITION_SHORT, FORMAT_LABELS, copyFormat } from "@janne6565/rekordo-shared";
import { Star, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet, View } from "react-native";

/** What the undo bar says once the copy is gone (3a-x-e). */
export interface RemovedCopySummary {
  readonly title: string;
  readonly line: string;
}

/**
 * Screen 3a-x: "Remove this copy?", over the copy's dark cover chrome.
 *
 * Lists what goes with the copy -- grades, price and place, rating, note, photos -- and only
 * the ones that hold something. When other copies of the release exist, the format moves
 * into the button ("Remove this CD") so the copy being removed is named twice, and a block
 * under the list says which ones stay.
 */
export function RemoveCopySheet({
  open,
  onClose,
  onConfirm,
  copy,
  release,
  otherCopies,
  photos,
  uriFor,
  previewUri,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (summary: RemovedCopySummary) => void;
  readonly copy: Copy;
  readonly release: Release | undefined;
  readonly otherCopies: readonly { copy: Copy; release: Release | undefined }[];
  readonly photos: readonly Photo[];
  readonly uriFor: (photo: Photo) => string;
  readonly previewUri: string | null;
}) {
  const { t, i18n } = useTranslation();
  const format = copyFormat(copy, release);
  const name = release?.title ?? "—";
  const note = copy.notes?.trim() ?? "";

  const grade = [
    copy.condition === null ? null : CONDITION_SHORT[copy.condition],
    copy.sleeveCondition === null
      ? null
      : t("remove.sleeve", { grade: CONDITION_SHORT[copy.sleeveCondition] }),
  ].filter((part) => part !== null);
  const paid = [
    copy.pricePaidCents === null
      ? null
      : new Intl.NumberFormat(i18n.language, { style: "currency", currency: copy.currency }).format(
          copy.pricePaidCents / 100,
        ),
    copy.purchasedAt?.trim() || null,
  ].filter((part) => part !== null);

  const rows: RemoveRow[] = [];
  if (grade.length > 0)
    rows.push({ key: "condition", label: t("remove.condition"), value: grade.join(" · ") });
  if (paid.length > 0) rows.push({ key: "paid", label: t("remove.paid"), value: paid.join(" · ") });
  if (copy.rating !== null && copy.rating > 0) {
    rows.push({
      key: "rating",
      label: t("remove.rating"),
      value: (
        <View style={styles.stars}>
          {Array.from({ length: copy.rating }, (_, index) => (
            <Star
              // biome-ignore lint/suspicious/noArrayIndexKey: identical stars, never reordered
              key={index}
              size={13}
              color={colors.accent}
              fill={colors.accent}
              strokeWidth={1.5}
            />
          ))}
        </View>
      ),
    });
  }
  if (note !== "") rows.push({ key: "note", label: t("remove.note"), note });
  if (photos.length > 0) {
    rows.push({
      key: "photos",
      label: t("remove.photos", { count: photos.length }),
      value: (
        <View style={styles.thumbs}>
          {photos.slice(0, 3).map((photo) => (
            <Image key={photo.id} source={{ uri: uriFor(photo) }} style={styles.thumb} />
          ))}
        </View>
      ),
    });
  }

  const others = otherCopies.length;
  const stays =
    others === 0
      ? undefined
      : {
          title: t("remove.othersStay", { count: others }),
          line: otherCopies
            .map(({ copy: sibling, release: siblingRelease }) =>
              [
                `${FORMAT_LABELS[copyFormat(sibling, siblingRelease)]}${
                  siblingRelease?.year == null ? "" : ` ${siblingRelease.year}`
                }`,
                sibling.condition === null ? null : CONDITION_SHORT[sibling.condition],
              ]
                .filter((part) => part !== null)
                .join(" · "),
            )
            .join(" · "),
        };

  const withWhat =
    photos.length > 0 && note !== ""
      ? t("remove.withPhotosAndNote", { count: photos.length })
      : photos.length > 0
        ? t("remove.withPhotos", { count: photos.length })
        : note !== ""
          ? t("remove.withNote")
          : null;

  return (
    <RemoveSheet
      open={open}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({
          title: t("remove.offShelf"),
          line: [name, FORMAT_LABELS[format], withWhat].filter((part) => part !== null).join(" · "),
        })
      }
      over="DARK"
      title={t("remove.copyTitle")}
      art={
        <ReleaseArt
          release={release}
          format={format}
          previewUri={previewUri}
          allowCatalogArt={copy.catalogArt !== "HIDDEN"}
          style={styles.art}
        />
      }
      name={name}
      meta={[
        release?.artistName ?? null,
        release?.year == null ? null : String(release.year),
        FORMAT_LABELS[format],
      ]
        .filter((part) => part !== null && part !== "")
        .join(" · ")}
      rows={rows}
      stays={stays}
      confirmLabel={
        others === 0
          ? t("remove.removeCopy")
          : t("remove.removeThis", { format: FORMAT_LABELS[format] })
      }
      confirmIcon={Trash2}
    />
  );
}

const styles = StyleSheet.create({
  art: { width: 72, height: 60 },
  stars: { flexDirection: "row", gap: 2 },
  thumbs: { flexDirection: "row", gap: 5, marginVertical: -2 },
  thumb: { width: 30, height: 30, borderRadius: 4, backgroundColor: ink(0.08) },
});
