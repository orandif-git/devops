import { CapacityRecord } from "../../../src/core/capacity";
import { keyNorm } from "../../../src/core/keys";
import { recordsFromNative, NativeReport } from "../../../src/core/nativeCapacity";
import { readNativeCapacity } from "../../../src/shared/capacityStore";
import { TeamRef } from "../core/types";

export interface Availability {
  records: CapacityRecord[];
  report: NativeReport[];
  /** available hours of a person in a month, or null when that person/month has no capacity entered */
  hours(person: string, month: string): number | null;
  /** the team name(s) the person has capacity in */
  team(person: string): string;
}

/** Available hours per person and month from Azure DevOps team capacity, read with the same code Grid & Rules uses on Server 2020. */
export async function loadAvailability(teams: TeamRef[], force = false): Promise<Availability> {
  if (!teams.length) return { records: [], report: [], hours: () => null, team: () => "" };
  const { teams: native, report } = await readNativeCapacity(teams, force);
  const records = recordsFromNative(native);
  const byKey = new Map(records.map(r => [keyNorm(r.key), r]));
  return {
    records, report,
    hours: (person, month) => { const r = byKey.get(keyNorm(person)); const v = r?.overrides[month]; return v === undefined ? null : v; },
    team: person => byKey.get(keyNorm(person))?.team ?? "",
  };
}
