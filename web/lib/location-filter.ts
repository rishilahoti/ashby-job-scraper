export function parseLocationValues(value: string | null | undefined): string[] {
  if (!value) return [];

  return [...new Set(value.split(",").map((location) => location.trim()).filter(Boolean))];
}
