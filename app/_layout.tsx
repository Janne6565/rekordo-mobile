import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider } from "react-redux";
import "@/i18n/config";
import { RestoreSession } from "@/features/auth/RestoreSession";
import { SignInConflictSheet } from "@/features/auth/SignInConflictSheet";
import { PushInvite } from "@/features/notifications/PushInvite";
import { UploadRefusalSheet } from "@/features/photos/UploadRefusalSheet";
import { UndoProvider } from "@/features/wishlist/UndoBar";
import { useReducedMotion } from "@/lib/motion";
import { StoreProvider } from "@/local/StoreProvider";
import { store } from "@/store";
import { PendingScans } from "@/sync/PendingScans";
import { SyncProvider } from "@/sync/SyncProvider";

const queryClient = new QueryClient();

/** How round the card's top edge is on Android, in the absence of a system default. */
const SHEET_RADIUS = 28;

/**
 * How a record's sheet is presented — the one place both of them say it.
 *
 * A copy is something you open and close again, not a place you navigate to, and as a
 * sheet the two gestures stop competing: dismissal moves to the vertical axis, where the
 * platform provides it, which leaves the horizontal one entirely to moving between records.
 *
 * The two platforms need different words for the same thing. `modal` is a page sheet on
 * iOS and gets the card, the rounded top and the drag for free; on Android it is an
 * ordinary full-screen destination that happens to slide up, and no amount of styling
 * inside the screen would add the drag. `formSheet` is the presentation Android backs with
 * a real bottom sheet, and there the card has to be described rather than inherited.
 */
function sheet(reduced: boolean) {
  return {
    ...Platform.select({
      ios: { presentation: "modal" } as const,
      // A single full-height detent, which stops short of the status bar rather than
      // under it: `sheetShouldOverflowTopInset` is false, so the card is measured inside
      // the top inset and the shelf stays visible above it, as it is on iOS.
      default: {
        presentation: "formSheet",
        sheetAllowedDetents: [1] as number[],
        sheetCornerRadius: SHEET_RADIUS,
      } as const,
    }),
    animation: reduced ? "none" : "slide_from_bottom",
  } as const;
}

export default function RootLayout() {
  const reduced = useReducedMotion();

  return (
    /* One gesture root over the whole app.
     *
     * Two screens carry the arranging gesture — the shelf and the wishlist — and every
     * gesture-handler view has to sit under a root of some kind. Here rather than on each
     * screen because a per-screen root is a handler tree that ends at that screen's edge,
     * which is the wrong shape for a drag that scrolls the list it is inside. The framing
     * screen still has its own; a nested root is harmless and it predates this. */
    <GestureHandlerRootView style={styles.root}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <StoreProvider>
              {/* The session comes back from the keychain here, above the tabs: a tab is not
                mounted until it is opened, and Friends must not have to guess. */}
              <RestoreSession />
              {/* 22b, for the half of a friendship that never taps Accept: offered once on
                launch, and only ever the explaining screen, never the OS dialog. */}
              <PushInvite />
              {/* The scans that were kept before anything could be looked up. Above the
                tabs and outside SyncProvider on purpose: sync needs an account, and
                somebody can fill a crate having never signed in. */}
              <PendingScans />
              {/* The sync loop belongs here for the same reason: a tab is not mounted until
                it is opened, so hanging it off the account screen meant a cold launch into
                the shelf never synced at all. */}
              <SyncProvider>
                {/* 28d, above the tabs for the same reason the sync loop is: the refusal is
                learned during a sync, which lands long after the sheet that saved the copy
                is gone. Hung off the editor it would reach nobody. */}
                <UploadRefusalSheet />
                {/* 29, above the tabs for the same reason: the question is about the library,
                and asked from the You tab it walked away with whoever left that tab. */}
                <SignInConflictSheet />
                {/* Screen 16e's line lives above the stack: the entry that leaves on its own
                does so wherever a record gets filed, which is rarely the wishlist. */}
                <UndoProvider>
                  {/*
                   * The platform push, untouched — 350ms slide with the interactive back-swipe
                   * intact. This is the one place the web's Cross is deliberately *not*
                   * mirrored: on a phone the stack is the mental model, and a cross-fade throws
                   * away the swipe. Do not customise it.
                   *
                   * The exception is a reader who has asked for less movement, where the slide
                   * goes and the screens simply replace one another.
                   */}
                  <Stack
                    screenOptions={{ headerShown: false, animation: reduced ? "none" : "default" }}
                  >
                    {/* Your own copy. As an ordinary page in the stack every sideways swipe
                    was fighting the interactive back gesture, and that is not something you
                    can tune your way out of. */}
                    <Stack.Screen name="copies/[copyId]" options={sheet(reduced)} />
                    {/*
                     * A record on somebody else's shelf, presented exactly the same way.
                     *
                     * It used to be an RN `<Modal presentationStyle="pageSheet">` drawn inside
                     * the profile, and it dismissed badly: the native card ran its own drag,
                     * cancelled it on release, and React tore the modal window down underneath
                     * — the sheet sprang back up and then disappeared without an animation.
                     * A sheet the navigator presents is dragged and dismissed by the navigator,
                     * which is the only place those two can be one motion. The two record
                     * sheets now share this, `CoverSheet` and `usePageFlip`; what differs is
                     * only what is inside them, which is the part that genuinely differs.
                     */}
                    <Stack.Screen name="profiles/[handle]/[open]" options={sheet(reduced)} />
                  </Stack>
                </UndoProvider>
              </SyncProvider>
            </StoreProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
