import { KeyboardLift } from "@/components/KeyboardLift";
import { RisingSheet, useSheetBottom } from "@/components/RisingSheet";
import { isDeletionConfirmed } from "@/features/legal/confirmDeletion";
import { colors, fonts } from "@/theme/colors";
import { Download } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface DeleteAccountSheetProps {
  readonly copyCount: number | undefined;
  readonly onExport: () => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel: () => void;
  readonly deleting: boolean;
}

/** Screen 17h — the confirm, with the export offered on the way out. */
export function DeleteAccountSheet({
  copyCount,
  onExport,
  onConfirm,
  onCancel,
  deleting,
}: DeleteAccountSheetProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const confirmed = isDeletionConfirmed(typed);
  const bottom = useSheetBottom(SHEET_PAD);

  return (
    <Modal animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
        onPress={onCancel}
        style={styles.scrim}
      />
      <KeyboardLift style={styles.sheetHolder}>
        <RisingSheet style={[styles.sheet, { paddingBottom: bottom }]} onDismiss={onCancel}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{t("legal.delete.title")}</Text>
          <Text style={styles.body}>{t("legal.delete.body", { count: copyCount ?? 0 })}</Text>

          {/* The offer, not a warning: somebody who wanted a copy is one tap from it rather
              than having to cancel, find the export and come back. */}
          <View style={styles.exportRow}>
            <Download size={15} color={colors.inkSubtle} strokeWidth={1.75} />
            <Text style={styles.exportLabel}>{t("legal.delete.exportFirst")}</Text>
            <Pressable accessibilityRole="button" onPress={onExport}>
              <Text style={styles.exportAction}>{t("legal.delete.exportAction")}</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>{t("legal.delete.typeToConfirm")}</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={t("legal.delete.typeToConfirm")}
            style={styles.field}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => void onConfirm()}
            disabled={!confirmed || deleting}
            style={[styles.confirm, (!confirmed || deleting) && styles.confirmDim]}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.paper} />
            ) : (
              <Text style={styles.confirmText}>{t("legal.delete.confirm")}</Text>
            )}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.keep}>
            <Text style={styles.keepText}>{t("legal.delete.keep")}</Text>
          </Pressable>
        </RisingSheet>
      </KeyboardLift>
    </Modal>
  );
}

/** What the sheet sits on when the system asks for nothing; see `useSheetBottom`. */
const SHEET_PAD = 38;

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(25,23,19,0.32)" },
  sheetHolder: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: SHEET_PAD,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(25,23,19,0.16)",
    alignSelf: "center",
    marginBottom: 18,
  },
  title: { fontFamily: fonts.serif, fontSize: 25, color: colors.ink },
  body: { fontSize: 13, lineHeight: 21, color: colors.inkMuted, marginTop: 9 },
  exportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(25,23,19,0.12)",
  },
  exportLabel: { flex: 1, fontSize: 12.5, fontWeight: "500", color: colors.ink },
  exportAction: { fontSize: 11.5, fontWeight: "600", color: colors.accent },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    marginTop: 18,
  },
  field: {
    height: 48,
    marginTop: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.ink,
  },
  confirm: {
    height: 50,
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.accentStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDim: { backgroundColor: "rgba(140,69,48,0.25)" },
  confirmText: { fontSize: 15, fontWeight: "600", color: colors.paper },
  keep: { marginTop: 16, alignItems: "center" },
  keepText: { fontSize: 13, fontWeight: "600", color: colors.inkMuted },
});
