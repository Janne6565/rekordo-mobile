import { ReleaseArt } from "@/components/ReleaseArt";
import { InlineCopyEditor } from "@/features/detail/CopyEditor";
import { useStore } from "@/local/StoreProvider";
import { useAppSelector } from "@/store/hooks";
import { appChromeFor } from "@/theme/chrome";
import { colors, fonts } from "@/theme/colors";
import type { Copy, CopyPatch, Release } from "@janne6565/rekordo-shared";
import {
  FORMAT_LABELS,
  applyCopyPatch,
  catalogueKeyOf,
  catalogueKeysOf,
  copyFormat,
} from "@janne6565/rekordo-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Details, one copy at a time, over the batch that was just saved.
 *
 * The run exists because the copies are already saved: this is an offer, not a gate, and
 * the position in the header is what says so — "Copy 2 of 4" makes leaving after two an
 * obvious and permitted move rather than an abandoned form.
 *
 * Only shelf copies are offered. A record you covet has no condition and no price yet, and
 * a scan still waiting for its name has nothing to grade either.
 *
 * The editor itself is the same one the copy screen uses. Grading a sleeve is grading a
 * sleeve, and a second implementation of that form would be a second set of fields to keep
 * in step with the merge.
 *
 * Turn 28 of the deck, screen 4a.
 */
export function DetailsRunScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { store, clock } = useStore();
  const queryClient = useQueryClient();
  const batch = useAppSelector((state) => state.scan.saved);
  const [at, setAt] = useState(0);

  const run = useQuery({
    queryKey: ["scan-details-run", batch?.copyIds],
    enabled: batch !== null,
    queryFn: async () => {
      const copies: Copy[] = [];
      for (const id of batch?.copyIds ?? []) {
        const copy = await store.getCopy(id);
        // A scan with no name yet has nothing to say about condition, and the editor would
        // be asking about a record neither of us can see.
        if (copy !== undefined && copy.pendingBarcode === null) copies.push(copy);
      }
      const releases = await store.getReleases(catalogueKeysOf(copies));
      return { copies, releases };
    },
  });

  const save = useMutation({
    mutationFn: async ({ copy, patch }: { copy: Copy; patch: CopyPatch }) => {
      await store.putCopy(applyCopyPatch(copy, patch, clock));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["copies"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      next();
    },
  });

  const copies = run.data?.copies ?? [];
  const copy = copies[at];
  const release: Release | undefined =
    copy === undefined ? undefined : run.data?.releases.get(catalogueKeyOf(copy) ?? "");

  function next() {
    if (at + 1 >= copies.length) {
      router.back();
      return;
    }
    setAt(at + 1);
  }

  if (run.isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (copy === undefined) {
    // Everything in the batch was a wish or a pending scan. Nothing to grade.
    router.back();
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.position}>
          {t("scan.details.position", { at: at + 1, of: copies.length })}
        </Text>
        <Pressable accessibilityRole="button" onPress={next}>
          <Text style={styles.skip}>{t("scan.details.skip")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <ReleaseArt release={release} format={copyFormat(copy, release)} style={styles.art} />
          <View style={styles.headText}>
            <Text style={styles.title}>{release?.title ?? ""}</Text>
            <Text style={styles.meta}>
              {[
                release?.artistName,
                release?.year === null || release?.year === undefined ? null : String(release.year),
                FORMAT_LABELS[copyFormat(copy, release)],
                t("scan.details.savedAlready"),
              ]
                .filter((part) => part !== null && part !== undefined)
                .join(" · ")}
            </Text>
          </View>
        </View>

        {/* Keyed on the copy so moving to the next one starts a fresh form rather than
            carrying the last record's grades into it. */}
        <InlineCopyEditor
          key={copy.id}
          copy={copy}
          catalogFormat={release?.format}
          chrome={appChromeFor(null)}
          saving={save.isPending}
          onSave={(patch) => save.mutate({ copy, patch })}
          onCancel={next}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const MONO = "ui-monospace";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  position: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
  },
  skip: { fontFamily: fonts.sans, fontSize: 13.5, fontWeight: "500", color: colors.accent },

  body: { padding: 18 },
  head: { flexDirection: "row", gap: 13, alignItems: "center" },
  art: { width: 72, height: 60 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 25, color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.inkMuted, marginTop: 3 },
});
