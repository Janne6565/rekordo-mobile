import { DetailScreen } from "@/features/detail/DetailScreen";
import { useLocalSearchParams } from "expo-router";

export default function CopyDetailRoute() {
  /** `scanned` is the barcode a duplicate card read, when the scanner opened this copy. */
  const { copyId, fresh, scanned } = useLocalSearchParams<{
    copyId: string;
    fresh?: string;
    scanned?: string;
  }>();
  return <DetailScreen copyId={copyId} startEditing={fresh === "1"} scanned={scanned ?? null} />;
}
