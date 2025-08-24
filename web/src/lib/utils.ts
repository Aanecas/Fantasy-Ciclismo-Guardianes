// web/src/lib/utils.ts
export function normalize(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^\S\r\n]+/g, " ")     // espacios múltiples -> uno
    .trim()
    .toLowerCase();
}
