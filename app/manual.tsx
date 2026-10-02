import { ManualScreen } from "@/features/manual/ManualScreen";
import { useLocalSearchParams } from "expo-router";

export default function ManualRoute() {
  /** Screen 2d hands over the digits its lookup failed on, so nobody retypes them. */
  /** `scan` says the form was opened from the camera, so it files into the tray. */
  const { barcode, scan } = useLocalSearchParams<{ barcode?: string; scan?: string }>();
  return <ManualScreen barcode={barcode ?? ""} inScan={scan === "1"} />;
}
