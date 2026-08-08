/**
 * Recursively convert any Date instances in an object to ISO strings.
 * Use before passing DB rows to Zod .parse() since the OpenAPI-generated
 * schemas expect timestamp fields as strings.
 */
export function serializeDates<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) {
      result[k] = v.toISOString();
    } else if (Array.isArray(v)) {
      result[k] = v.map((item) =>
        item && typeof item === "object" ? serializeDates(item as Record<string, unknown>) : item
      );
    } else {
      result[k] = v;
    }
  }
  return result as T;
}
