import { restGet } from "../rest";

export interface FieldInfo { referenceName: string; name: string }

/** The fields of the Epic work item type (reference name and display name), so settings can be picked instead of typed. */
export async function listTypeFields(project: string, type: string): Promise<FieldInfo[]> {
  const r = await restGet<{ value: { referenceName: string; name: string }[] }>(`wit/workitemtypes/${encodeURIComponent(type)}/fields`, {}, project);
  return (r.value ?? []).map(f => ({ referenceName: f.referenceName, name: f.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Is `ref` one of the fields? (reference names are compared without regard to upper/lower case) */
export const hasField = (fields: FieldInfo[], ref: string) => !ref || !fields.length || fields.some(f => f.referenceName.toLowerCase() === ref.toLowerCase());
