import { restGet } from "../rest";

export interface FieldInfo { referenceName: string; name: string; /** "dateTime", "plainText", "html", "string"… (empty when the type could not be read) */ type: string }

/**
 * The fields of the Epic work item type with their types. The type list gives the names; the organization's field list gives the types.
 * If the types cannot be read the fields still come back (type empty), so the pickers show every field.
 */
export async function listTypeFields(project: string, type: string): Promise<FieldInfo[]> {
  const r = await restGet<{ value: { referenceName: string; name: string }[] }>(`wit/workitemtypes/${encodeURIComponent(type)}/fields`, {}, project);
  let types = new Map<string, string>();
  try {
    const all = await restGet<{ value: { referenceName: string; type?: string }[] }>("wit/fields", {});
    types = new Map((all.value ?? []).map(f => [f.referenceName.toLowerCase(), String(f.type ?? "")]));
  } catch { /* types stay unknown */ }
  return (r.value ?? []).map(f => ({ referenceName: f.referenceName, name: f.name, type: types.get(f.referenceName.toLowerCase()) ?? "" })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Is `ref` one of the fields? (reference names are compared without regard to upper/lower case) */
export const hasField = (fields: FieldInfo[], ref: string) => !ref || !fields.length || fields.some(f => f.referenceName.toLowerCase() === ref.toLowerCase());
