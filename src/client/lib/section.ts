export type LaunchSection = "learn" | "add" | "words" | "progress";

export function sectionFromSearch(search: string): LaunchSection {
  const requested = new URLSearchParams(search).get("tab");
  return requested === "add" || requested === "words" || requested === "progress"
    ? requested
    : "learn";
}
