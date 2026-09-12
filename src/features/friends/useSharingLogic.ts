import { type SharingSettings, type Visibility, friendsApi } from "@/api/friends";
import { sharingPayload } from "@/features/friends/sharingPayload";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

/** The Sharing screen, 15f. Three lists, three separate answers, plus the handle. */
export function useSharingLogic() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["sharing"], queryFn: friendsApi.sharing });

  const save = useMutation({
    mutationFn: (next: SharingSettings) => friendsApi.updateSharing(sharingPayload(next)),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["sharing"], saved);
      // A shelf that just closed has to stop showing on every profile already cached.
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  /**
   * Saved on change rather than behind a Save button.
   *
   * Every control is one answer to one question, and a privacy screen with unsaved state
   * is one somebody can leave believing they turned something off.
   */
  const set = useCallback(
    (patch: Partial<SharingSettings>) => {
      if (settings.data === undefined) return;
      save.mutate({ ...settings.data, ...patch });
    },
    [settings.data, save],
  );

  return {
    settings: settings.data,
    loading: settings.isLoading,
    saving: save.isPending,
    set,
    setCollection: (value: Visibility) => set({ collectionVisibility: value }),
    setWishlist: (value: Visibility) => set({ wishlistVisibility: value }),
  };
}

/**
 * The claim field of 15e, checked while it is being typed.
 *
 * Debounced, and the answer is a code the screen translates — so "taken", "reserved" and
 * "malformed" read as three different sentences rather than one shrug.
 */
export function useHandleClaimLogic() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const cleaned = value.trim().replace(/^@/, "").toLowerCase();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(cleaned), 300);
    return () => clearTimeout(timer);
  }, [cleaned]);

  const check = useQuery({
    queryKey: ["handle", "availability", debounced],
    queryFn: () => friendsApi.handleAvailability(debounced),
    enabled: debounced.length > 0,
  });

  const claim = useMutation({
    mutationFn: () => friendsApi.claimHandle(debounced),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["sharing"], saved);
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  return {
    value,
    setValue,
    cleaned,
    /** Undefined until the debounce settles, so the field is not judged mid-word. */
    check: debounced.length > 0 && debounced === cleaned ? check.data : undefined,
    checking: check.isFetching,
    claim,
    canClaim: check.data?.available === true && !claim.isPending,
  };
}
