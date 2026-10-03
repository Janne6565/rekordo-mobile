import { FormatThumb } from "@/components/FormatThumb";
import { RisingSheet } from "@/components/RisingSheet";
import { conflictDate, conflictValueText } from "@/features/auth/conflictValues";
import { useSignInConflictLogic } from "@/features/auth/useSignInConflictLogic";
import { useAppSelector } from "@/store/hooks";
import { colors, fonts, ink, onInk } from "@/theme/colors";
import type { OneSidedEntry, ValueDifference } from "@janne6565/rekordo-shared";
import { differenceKey } from "@janne6565/rekordo-shared";
import {
  ChevronRight,
  Cloud,
  FileDown,
  GitCompare,
  Image,
  List,
  Smartphone,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Turn 29 on the phone — signing in onto a shelf that already exists.
 *
 * Mounted above the tabs for the same reason the sync loop is: the question is about the
 * library, and hanging it off the You tab meant somebody who signed in there and walked
 * back to their records took the question with them. It also has to survive a tab that is
 * not mounted yet.
 *
 * Three presentations, following the deck. The question is a bottom sheet over a dimmed
 * shelf; the itemised difference and the per-item review are full screens, because at this
 * width they are lists and a list inside a sheet is a list you cannot read.
 */
export function SignInConflictSheet() {
  const pending = useAppSelector((state) => state.auth.firstSyncPending);
  if (!pending) return null;
  return <Conflict />;
}

type Logic = ReturnType<typeof useSignInConflictLogic>;

function Conflict() {
  const logic = useSignInConflictLogic();
  const full = logic.view === "DIFFERENCE" || logic.view === "REVIEW";

  if (full) {
    return (
      <Modal visible animationType="slide" onRequestClose={logic.back}>
        {logic.view === "DIFFERENCE" ? (
          <DifferenceScreen logic={logic} />
        ) : (
          <ReviewScreen logic={logic} />
        )}
      </Modal>
    );
  }

  return (
    // `fade` on the window and the rise inside it, so the dim does not travel with the
    // panel. No dismissal: this is the one sheet in the app with no way out but an answer.
    <Modal visible transparent animationType="fade">
      <View style={styles.scrim}>
        <RisingSheet style={styles.sheet}>
          <SafeAreaView edges={["bottom"]}>
            <Body logic={logic} />
          </SafeAreaView>
        </RisingSheet>
      </View>
    </Modal>
  );
}

function Body({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const email = useAppSelector((state) => state.auth.user?.email ?? "");

  switch (logic.view) {
    case "COMPARING":
      return (
        <View style={styles.pad}>
          <Text style={styles.title}>{t("conflict.comparing.title")}</Text>
          <Text style={styles.lede}>
            {t("conflict.comparing.body", { count: logic.localCount })}
          </Text>
          <Bar />
        </View>
      );

    case "UNREACHABLE":
      return (
        <View style={styles.pad}>
          <Text style={styles.title}>{t("conflict.unreachable.title")}</Text>
          <Text style={styles.lede}>{t("conflict.unreachable.body")}</Text>
          <View style={styles.actions}>
            <Primary onPress={logic.dismissUnreachable} label={t("conflict.unreachable.open")} />
            <Quiet onPress={logic.retry} label={t("conflict.unreachable.retry")} accent />
          </View>
        </View>
      );

    case "UPLOADING":
      return (
        <View style={styles.pad}>
          <Text style={styles.title}>
            {t("conflict.uploading.title", { count: logic.localCount })}
          </Text>
          <Text style={styles.lede}>{t("conflict.uploading.body")}</Text>
          <Bar />
          {logic.failed && <Failed onRetry={logic.keepBoth} />}
        </View>
      );

    case "NO_LOSS":
      return <NoLoss logic={logic} email={email} />;

    case "DROP":
      return <DropConfirmation logic={logic} />;

    default:
      return <Question logic={logic} email={email} />;
  }
}

/** 29a — the account is simply ahead, so there is nothing to weigh and one button. */
function NoLoss({ logic, email }: { readonly logic: Logic; readonly email: string }) {
  const { t, i18n } = useTranslation();
  const comparison = logic.comparison;
  if (comparison === undefined) return null;
  const incoming = comparison.onlyAccount.length;

  return (
    <View style={styles.pad}>
      <Text style={styles.eyebrow}>{t("conflict.signedInAs", { email })}</Text>
      <Text style={styles.title}>{t("conflict.noLoss.title", { count: incoming })}</Text>
      <Text style={styles.lede}>
        {t("conflict.noLoss.body", { copies: logic.mergedCopies, wishes: logic.mergedWishes })}
      </Text>

      <View style={styles.stampCard}>
        <Stamp
          label={t("conflict.sides.local")}
          at={comparison.localChangedAt}
          language={i18n.language}
        />
        <View style={styles.stampRule} />
        <Stamp
          label={t("conflict.sides.account")}
          at={comparison.accountChangedAt}
          language={i18n.language}
        />
      </View>

      <Primary
        onPress={logic.keepBoth}
        label={t("conflict.noLoss.continue")}
        busy={logic.working}
        wide
      />
      <Pressable
        accessibilityRole="button"
        onPress={logic.openDifference}
        style={styles.disclosure}
      >
        <List size={13} color={colors.accent} strokeWidth={2} />
        <Text style={styles.disclosureText}>{t("conflict.noLoss.show", { count: incoming })}</Text>
      </Pressable>
      {logic.failed && <Failed onRetry={logic.keepBoth} />}
    </View>
  );
}

/**
 * 29b — the blocking question.
 *
 * Keep both is the filled button because it is the only answer that deletes nothing; the
 * other two are outlines carrying their own cost as a number. They stack rather than sit
 * on one line: at this width three equal buttons would all be reachable by accident.
 */
function Question({ logic, email }: { readonly logic: Logic; readonly email: string }) {
  const { t } = useTranslation();
  const comparison = logic.comparison;
  if (comparison === undefined) return null;

  const oneSided = (side: "LOCAL" | "ACCOUNT", kind: "COPY" | "WISH") =>
    (side === "LOCAL" ? comparison.onlyLocal : comparison.onlyAccount).filter(
      (entry) => entry.kind === kind,
    ).length;
  const difference =
    comparison.onlyLocal.length + comparison.onlyAccount.length + comparison.values.length;

  return (
    <View style={styles.tall}>
      <View style={styles.padTop}>
        <Text style={styles.eyebrow}>{t("conflict.signedInAs", { email })}</Text>
        <Text style={styles.title}>{t("conflict.conflict.title")}</Text>
        <Text style={styles.lede}>{t("conflict.conflict.body")}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHead]}>
            <Text style={[styles.column, styles.columnGrow]}>{t("conflict.rows.header")}</Text>
            <Text style={[styles.column, styles.columnNumber]}>
              {t("conflict.sides.localShort")}
            </Text>
            <Text style={[styles.column, styles.columnNumber]}>
              {t("conflict.sides.accountShort")}
            </Text>
          </View>
          <CountRow
            label={t("conflict.rows.copies")}
            local={oneSided("LOCAL", "COPY")}
            account={oneSided("ACCOUNT", "COPY")}
          />
          <CountRow
            label={t("conflict.rows.wishes")}
            local={oneSided("LOCAL", "WISH")}
            account={oneSided("ACCOUNT", "WISH")}
          />
          <View style={styles.valuesRow}>
            <View style={styles.spread}>
              <Text style={styles.rowLabel}>{t("conflict.rows.values")}</Text>
              <Text style={styles.rowNumber}>
                {t("conflict.rows.valuesCount", { count: comparison.values.length })}
              </Text>
            </View>
            <Text style={styles.rowNote}>{t("conflict.rows.valuesBody")}</Text>
          </View>
          {/* Under the rule rather than in it: no answer above ever deletes a photo. */}
          <View style={styles.photoRow}>
            <Image size={14} color={colors.inkSubtle} strokeWidth={1.75} />
            <Text style={styles.photoText}>
              {t("conflict.rows.photos", { count: comparison.photos })}
            </Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={logic.openDifference} style={styles.seeMore}>
          <Text style={styles.seeMoreText}>{t("conflict.seeDifference")}</Text>
          <Text style={styles.seeMoreCount}>{t("conflict.entries", { count: difference })}</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={logic.keepBoth}
          disabled={logic.working}
          style={styles.keepBoth}
        >
          <View style={styles.spread}>
            <Text style={styles.keepBothTitle}>{t("conflict.keepBoth")}</Text>
            <Text style={styles.keepBothCount}>
              {t("conflict.copies", { count: logic.mergedCopies })}
            </Text>
          </View>
          <Text style={styles.keepBothBody}>
            {t("conflict.keepBothBody", { count: comparison.values.length })}
          </Text>
        </Pressable>

        <View style={styles.keepPair}>
          <KeepCard
            title={t("conflict.keepLocal")}
            body={t("conflict.keepLocalCost", {
              copies: comparison.localCopies,
              drops: comparison.onlyAccount.length,
            })}
            onPress={() => logic.askKeep("LOCAL")}
          />
          <KeepCard
            title={t("conflict.keepAccount")}
            body={t("conflict.keepAccountCost", {
              copies: comparison.accountCopies,
              drops: comparison.onlyLocal.length,
            })}
            onPress={() => logic.askKeep("ACCOUNT")}
          />
        </View>

        {comparison.values.length > 0 && (
          <Quiet
            onPress={logic.openReview}
            accent
            centred
            label={t("conflict.decideMyself", { count: comparison.values.length })}
          />
        )}
        {logic.failed && <Failed onRetry={logic.keepBoth} />}
      </View>
    </View>
  );
}

/** 29e-3 and 29e-4 — the only two taps in this flow that delete anything. */
function DropConfirmation({ logic }: { readonly logic: Logic }) {
  const { t } = useTranslation();
  const side = logic.pendingKeep;
  if (side === null) return null;
  const entries = logic.droppedBy(side);
  const copies = entries.filter((entry) => entry.kind === "COPY").length;

  return (
    <View style={styles.pad}>
      <Text style={styles.title}>
        {t(side === "LOCAL" ? "conflict.drop.localTitle" : "conflict.drop.accountTitle", {
          count: entries.length,
        })}
      </Text>
      <Text style={styles.lede}>
        {t(side === "LOCAL" ? "conflict.drop.localBody" : "conflict.drop.accountBody", {
          copies,
          wishes: entries.length - copies,
          edits: logic.comparison?.values.length ?? 0,
          photos: logic.comparison?.photos ?? 0,
        })}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void logic.exportDropped()}
        style={styles.export}
      >
        <FileDown size={15} color={colors.inkSubtle} strokeWidth={1.75} />
        <Text style={styles.exportText}>
          {t("conflict.drop.export", { count: entries.length })}
        </Text>
        <ChevronRight size={14} color={colors.inkSubtle} strokeWidth={2} />
      </Pressable>
      <View style={styles.actions}>
        <Primary
          onPress={logic.confirmKeep}
          busy={logic.working}
          label={t(side === "LOCAL" ? "conflict.keepLocal" : "conflict.keepAccount")}
        />
        <Quiet onPress={logic.back} label={t("common.back")} />
      </View>
      {logic.failed && <Failed onRetry={logic.confirmKeep} />}
    </View>
  );
}

/** 29c — the difference, as a pushed screen. Nothing in the list is a control. */
function DifferenceScreen({ logic }: { readonly logic: Logic }) {
  const { t, i18n } = useTranslation();
  const comparison = logic.comparison;
  if (comparison === undefined) return null;
  const total =
    comparison.onlyLocal.length + comparison.onlyAccount.length + comparison.values.length;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.screenHead}>
        <View style={styles.spread}>
          <Text style={styles.screenTitle}>{t("conflict.difference.title")}</Text>
          <Pressable accessibilityRole="button" onPress={logic.back}>
            <Text style={styles.backText}>{t("common.back")}</Text>
          </Pressable>
        </View>
        <Text style={styles.screenLede}>
          {t("conflict.difference.lede", {
            count: total,
            copies: comparison.identicalCopies,
            wishes: comparison.identicalWishes,
          })}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.screenBody}>
        <EntryGroup
          icon={<Smartphone size={13} color={colors.inkMuted} strokeWidth={1.9} />}
          label={t("conflict.difference.onlyLocalPhone", { count: comparison.onlyLocal.length })}
          entries={comparison.onlyLocal}
        />
        <EntryGroup
          icon={<Cloud size={13} color={colors.inkMuted} strokeWidth={1.9} />}
          label={t("conflict.difference.onlyAccount", { count: comparison.onlyAccount.length })}
          entries={comparison.onlyAccount}
        />
        {comparison.values.length > 0 && (
          <>
            <GroupHeading icon={<GitCompare size={13} color={colors.inkMuted} strokeWidth={1.9} />}>
              {t("conflict.difference.both", { count: comparison.values.length })}
            </GroupHeading>
            <View style={styles.cardStack}>
              {comparison.values.map((value) => (
                <View key={differenceKey(value)} style={styles.valueCard}>
                  <EntryHeading value={value} />
                  <View style={styles.sideStack}>
                    <SideLine
                      label={t("conflict.sides.localShort")}
                      at={value.localAt}
                      value={value}
                      raw={value.local}
                      language={i18n.language}
                    />
                    <SideLine
                      label={t("conflict.sides.accountShort")}
                      at={value.accountAt}
                      value={value}
                      raw={value.account}
                      language={i18n.language}
                    />
                  </View>
                  <Text style={styles.wins}>
                    {t("conflict.difference.wins", {
                      side: t(
                        value.winner === "LOCAL"
                          ? "conflict.sides.localShort"
                          : "conflict.sides.accountShort",
                      ),
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.screenFoot}>
        <Primary
          onPress={logic.keepBoth}
          busy={logic.working}
          label={t("conflict.keepBoth")}
          wide
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * 29d — the per-item review.
 *
 * The total on Apply moves as you pick, so the button is the running answer to "what will
 * I end up with". Undecided defaults to keep, which makes leaving early safe.
 */
function ReviewScreen({ logic }: { readonly logic: Logic }) {
  const { t, i18n } = useTranslation();
  const comparison = logic.comparison;
  if (comparison === undefined) return null;
  const oneSided = [...comparison.onlyLocal, ...comparison.onlyAccount];
  const total = oneSided.length + comparison.values.length;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.screenHead}>
        <View style={styles.spread}>
          <Pressable accessibilityRole="button" onPress={logic.back}>
            <Text style={styles.backTextQuiet}>{t("common.back")}</Text>
          </Pressable>
          <Text style={styles.screenTitleSmall}>{t("conflict.review.title")}</Text>
          <Text style={styles.progressCount}>
            {t("conflict.review.progress", { done: logic.decided, total })}
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.trackFill,
              { width: `${total === 0 ? 0 : (logic.decided / total) * 100}%` },
            ]}
          />
        </View>
        <View style={[styles.spread, styles.progressNote]}>
          <Text style={styles.screenLede}>{t("conflict.review.undecided")}</Text>
          <Pressable accessibilityRole="button" onPress={logic.keepAll}>
            <Text style={styles.keepAll}>{t("conflict.review.keepAll")}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.screenBody}>
        {comparison.values.length > 0 && (
          <>
            <PlainHeading>
              {t("conflict.review.values", { count: comparison.values.length })}
            </PlainHeading>
            <View style={styles.cardStack}>
              {comparison.values.map((value) => {
                const key = differenceKey(value);
                const picked = logic.pickedSide(key);
                return (
                  <View key={key} style={styles.valueCard}>
                    <EntryHeading value={value} />
                    <View style={styles.pickRow}>
                      {(["LOCAL", "ACCOUNT"] as const).map((side) => (
                        <Pressable
                          key={side}
                          accessibilityRole="button"
                          accessibilityState={{ selected: picked === side }}
                          onPress={() => logic.pick(key, side)}
                          style={[styles.pick, picked === side && styles.pickChosen]}
                        >
                          <Text
                            style={[styles.pickLabel, picked === side && styles.pickLabelChosen]}
                          >
                            {t(
                              side === "LOCAL"
                                ? "conflict.sides.localShort"
                                : "conflict.sides.accountShort",
                            )}{" "}
                            ·{" "}
                            {conflictDate(
                              side === "LOCAL" ? value.localAt : value.accountAt,
                              i18n.language,
                            )}
                          </Text>
                          <Text
                            style={[styles.pickValue, picked === side && styles.pickValueChosen]}
                          >
                            {conflictValueText(
                              value.field,
                              side === "LOCAL" ? value.local : value.account,
                              "EUR",
                              i18n.language,
                              t("conflict.emptyValue"),
                            )}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {oneSided.length > 0 && (
          <>
            <PlainHeading>{t("conflict.review.oneSided", { count: oneSided.length })}</PlainHeading>
            <View style={styles.rowStack}>
              {oneSided.map((entry) => (
                <EntryLine
                  key={entry.id}
                  entry={entry}
                  trailing={
                    <View style={styles.segmented}>
                      <Segment
                        active={!logic.isDropped(entry.id)}
                        onPress={() => logic.setDropped(entry.id, false)}
                        label={t("conflict.review.keep")}
                      />
                      <Segment
                        active={logic.isDropped(entry.id)}
                        onPress={() => logic.setDropped(entry.id, true)}
                        label={t("conflict.review.drop")}
                      />
                    </View>
                  }
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.screenFoot}>
        <Pressable
          accessibilityRole="button"
          onPress={logic.applyReview}
          disabled={logic.working}
          style={styles.primaryWide}
        >
          {logic.working ? (
            <ActivityIndicator size="small" color={colors.paper} />
          ) : (
            <>
              <Text style={styles.primaryText}>{t("conflict.review.apply")}</Text>
              <Text style={styles.primaryCount}>
                {t("conflict.review.applyTotal", {
                  copies: logic.reviewedCopies,
                  wishes: logic.reviewedWishes,
                })}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function EntryGroup({
  icon,
  label,
  entries,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly entries: readonly OneSidedEntry[];
}) {
  const { i18n } = useTranslation();
  if (entries.length === 0) return null;
  return (
    <>
      <GroupHeading icon={icon}>{label}</GroupHeading>
      <View style={styles.rowStack}>
        {entries.map((entry) => (
          <EntryLine
            key={entry.id}
            entry={entry}
            trailing={
              <Text style={styles.when}>{conflictDate(entry.changedAt, i18n.language)}</Text>
            }
          />
        ))}
      </View>
    </>
  );
}

function EntryLine({
  entry,
  trailing,
}: {
  readonly entry: OneSidedEntry;
  readonly trailing: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.entry}>
      <FormatThumb format={entry.format} style={styles.thumb} />
      <View style={styles.entryText}>
        <Text numberOfLines={1} style={styles.entryTitle}>
          {entry.title ?? t("conflict.untitled")}
        </Text>
        <Text numberOfLines={1} style={styles.entryMeta}>
          {[
            entry.artistName,
            t(entry.kind === "COPY" ? "conflict.kind.copy" : "conflict.kind.wish"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

function EntryHeading({ value }: { readonly value: ValueDifference }) {
  const { t } = useTranslation();
  return (
    <View style={styles.entryHead}>
      <FormatThumb format={value.format} style={styles.thumb} />
      <View style={styles.entryText}>
        <Text numberOfLines={1} style={styles.entryTitle}>
          {value.title ?? t("conflict.untitled")}
        </Text>
        <Text numberOfLines={1} style={styles.entryMeta}>
          {[value.artistName, t(`conflict.field.${value.field}` as const)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
    </View>
  );
}

function SideLine({
  label,
  at,
  value,
  raw,
  language,
}: {
  readonly label: string;
  readonly at: number;
  readonly value: ValueDifference;
  readonly raw: unknown;
  readonly language: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.sideLine}>
      <Text style={styles.sideLabel}>
        {label} · {conflictDate(at, language)}
      </Text>
      <Text style={styles.sideValue}>
        {conflictValueText(value.field, raw, "EUR", language, t("conflict.emptyValue"))}
      </Text>
    </View>
  );
}

function CountRow({
  label,
  local,
  account,
}: {
  readonly label: string;
  readonly local: number;
  readonly account: number;
}) {
  return (
    <View style={[styles.tableRow, styles.countRow]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowNumber, styles.columnNumber]}>{local}</Text>
      <Text style={[styles.rowNumber, styles.columnNumber]}>{account}</Text>
    </View>
  );
}

function KeepCard({
  title,
  body,
  onPress,
}: {
  readonly title: string;
  readonly body: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.keepCard}>
      <Text style={styles.keepTitle}>{title}</Text>
      <Text style={styles.keepBody}>{body}</Text>
    </Pressable>
  );
}

function Segment({
  active,
  onPress,
  label,
}: {
  readonly active: boolean;
  readonly onPress: () => void;
  readonly label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stamp({
  label,
  at,
  language,
}: {
  readonly label: string;
  readonly at: number | null;
  readonly language: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.stamp}>
      <Text style={styles.stampLabel}>{label}</Text>
      <Text style={styles.stampValue}>
        {at === null
          ? t("conflict.never")
          : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
              at,
            )}
      </Text>
    </View>
  );
}

function GroupHeading({ icon, children }: { readonly icon: ReactNode; readonly children: string }) {
  return (
    <View style={styles.groupHeading}>
      {icon}
      <Text style={styles.groupHeadingText}>{children}</Text>
    </View>
  );
}

function PlainHeading({ children }: { readonly children: string }) {
  return <Text style={styles.plainHeading}>{children}</Text>;
}

function Primary({
  onPress,
  label,
  busy = false,
  wide = false,
}: {
  readonly onPress: () => void;
  readonly label: string;
  readonly busy?: boolean;
  readonly wide?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={[wide ? styles.primaryWide : styles.primary, busy && styles.dim]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.paper} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

function Quiet({
  onPress,
  label,
  accent = false,
  centred = false,
}: {
  readonly onPress: () => void;
  readonly label: string;
  readonly accent?: boolean;
  readonly centred?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={centred && styles.centred}>
      <Text style={[styles.quiet, accent && styles.quietAccent]}>{label}</Text>
    </Pressable>
  );
}

/**
 * An indeterminate bar, deliberately.
 *
 * The deck draws a filled percentage and there is no honest one to draw: the comparison is
 * a handful of round trips whose length is not known in advance, and a bar that invents its
 * own progress is a bar that stalls at 90%.
 */
function Bar() {
  return (
    <View style={styles.track}>
      <View style={[styles.trackFill, styles.trackIndeterminate]} />
    </View>
  );
}

function Failed({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onRetry}>
      <Text style={styles.failed}>
        {t("conflict.failed")} {t("conflict.unreachable.retry")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(25,23,19,0.46)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
  },
  pad: { padding: 22, paddingTop: 20, gap: 2 },
  padTop: { paddingHorizontal: 22, paddingTop: 20 },
  tall: { maxHeight: "100%" },
  scroll: { flexGrow: 0 },
  scrollBody: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 4 },

  eyebrow: {
    fontSize: 9.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 25,
    lineHeight: 30,
    color: colors.ink,
    marginTop: 12,
  },
  lede: { fontSize: 13, lineHeight: 21, color: colors.inkMuted, marginTop: 10 },

  track: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.line,
    marginTop: 14,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: 999, backgroundColor: colors.ink },
  trackIndeterminate: { width: "38%" },

  actions: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 },
  primary: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryWide: {
    height: 48,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 18,
  },
  primaryText: { color: colors.paper, fontSize: 14, fontWeight: "600" },
  primaryCount: { color: colors.onInkMuted, fontSize: 11, fontWeight: "500" },
  dim: { opacity: 0.5 },
  quiet: { fontSize: 12.5, fontWeight: "600", color: colors.inkMuted },
  quietAccent: { color: colors.accent },
  centred: { alignItems: "center", marginTop: 13 },

  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 15,
  },
  disclosureText: { fontSize: 12.5, fontWeight: "600", color: colors.accent },

  stampCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stamp: { flex: 1 },
  stampRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.line,
  },
  stampLabel: { fontSize: 11.5, color: colors.inkSubtle },
  stampValue: { fontSize: 11, fontWeight: "500", color: colors.ink, marginTop: 3 },

  table: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  tableHead: {
    backgroundColor: ink(0.03),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  column: {
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
  },
  columnGrow: { flex: 1 },
  columnNumber: { width: 62, textAlign: "right" },
  rowLabel: { fontSize: 13, fontWeight: "600", color: colors.ink, flex: 1 },
  rowNumber: { fontSize: 12.5, fontWeight: "500", color: colors.ink },
  rowNote: { fontSize: 11, lineHeight: 16, color: colors.inkSubtle, marginTop: 3 },
  countRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  valuesRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: ink(0.03),
  },
  photoText: { flex: 1, fontSize: 11, lineHeight: 17, color: colors.inkSubtle },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  seeMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.16),
  },
  seeMoreText: { fontSize: 12.5, fontWeight: "600", color: colors.accent },
  seeMoreCount: { fontSize: 11, fontWeight: "500", color: colors.inkSubtle },

  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  keepBoth: {
    borderRadius: 12,
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  keepBothTitle: { fontSize: 14.5, fontWeight: "600", color: colors.paper },
  keepBothCount: { fontSize: 11, fontWeight: "500", color: onInk(0.6) },
  keepBothBody: { fontSize: 11.5, lineHeight: 17, color: onInk(0.6), marginTop: 3 },
  keepPair: { flexDirection: "row", gap: 9, marginTop: 9 },
  keepCard: {
    flex: 1,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.16),
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  keepTitle: { fontSize: 13, fontWeight: "600", color: colors.ink },
  keepBody: { fontSize: 10.5, lineHeight: 15, color: colors.inkSubtle, marginTop: 3 },

  export: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: ink(0.05),
  },
  exportText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.inkMuted },

  screen: { flex: 1, backgroundColor: colors.paper },
  screenHead: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  screenTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  screenTitleSmall: { fontSize: 14, fontWeight: "600", color: colors.ink },
  screenLede: { fontSize: 11.5, lineHeight: 17, color: colors.inkSubtle, marginTop: 6, flex: 1 },
  screenBody: { paddingHorizontal: 18, paddingBottom: 20 },
  screenFoot: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  backText: { fontSize: 13.5, fontWeight: "600", color: colors.accent },
  backTextQuiet: { fontSize: 13.5, fontWeight: "500", color: colors.inkMuted },
  progressCount: { fontSize: 11, fontWeight: "500", color: colors.inkSubtle },
  progressNote: { marginTop: 9 },
  keepAll: { fontSize: 11.5, fontWeight: "600", color: colors.accent },

  groupHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 16,
    paddingBottom: 8,
  },
  groupHeadingText: {
    fontSize: 9.5,
    letterSpacing: 0.95,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
  },
  plainHeading: {
    fontSize: 9.5,
    letterSpacing: 0.95,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
    paddingTop: 16,
    paddingBottom: 8,
  },

  rowStack: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: ink(0.07),
    gap: StyleSheet.hairlineWidth,
  },
  cardStack: { gap: 8 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  entryHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  entryText: { flex: 1, minWidth: 0 },
  entryTitle: { fontSize: 12.5, fontWeight: "600", color: colors.ink },
  entryMeta: { fontSize: 10.5, color: colors.inkSubtle, marginTop: 2 },
  thumb: { width: 48, height: 40 },
  when: { fontSize: 10, fontWeight: "500", color: colors.inkSubtle },

  valueCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 11,
  },
  sideStack: {
    marginTop: 9,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: ink(0.08),
    gap: StyleSheet.hairlineWidth,
  },
  sideLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sideLabel: {
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
  },
  sideValue: { fontSize: 11.5, color: colors.ink, flexShrink: 1, textAlign: "right" },
  wins: { fontSize: 9, fontWeight: "500", color: colors.inkSubtle, marginTop: 7 },

  pickRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  pick: {
    flex: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: ink(0.04),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink(0.1),
  },
  pickChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  pickLabel: {
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkSubtle,
    fontWeight: "500",
  },
  pickLabelChosen: { color: onInk(0.65) },
  pickValue: { fontSize: 11.5, lineHeight: 16, color: colors.ink, marginTop: 4 },
  pickValueChosen: { color: colors.paper },

  segmented: {
    flexDirection: "row",
    padding: 2,
    borderRadius: 8,
    backgroundColor: ink(0.07),
  },
  segment: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { fontSize: 10.5, fontWeight: "600", color: colors.inkMuted },
  segmentTextActive: { color: colors.paper },

  failed: { fontSize: 12.5, color: colors.accentStrong, marginTop: 12 },
});
