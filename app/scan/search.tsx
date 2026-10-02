import { SearchScreen } from "@/features/scan/SearchScreen";
import { useLocalSearchParams } from "expo-router";

export default function ScanSearchRoute() {
  /** The not-found card hands over the digits its lookup failed on, so they stay in view. */
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  return <SearchScreen barcode={barcode ?? ""} />;
}
