export const languages = [
  ["en", "English"],
  ["ru", "Russian"],
  ["de", "German"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
] as const;

export function languageName(code: string): string {
  return languages.find(([languageCode]) => languageCode === code)?.[1] ?? code;
}
