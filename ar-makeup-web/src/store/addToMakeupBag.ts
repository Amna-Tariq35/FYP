const STORAGE_KEY = "ar_makeup_add_to_bag_v1";

export function loadAddToMakeupBag(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

export function saveAddToMakeupBag(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {}
}

export function clearAddToMakeupBag() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
