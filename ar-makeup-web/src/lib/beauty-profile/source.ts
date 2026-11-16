export type BeautyProfileSource = "analysis" | "manual" | "both";

export function mergeBeautyProfileSource(
  existing: unknown,
  incoming: BeautyProfileSource,
): BeautyProfileSource {
  if (existing === "both" || incoming === "both") return "both";
  if (existing === "analysis" || existing === "manual") {
    return existing === incoming ? incoming : "both";
  }
  return incoming;
}
