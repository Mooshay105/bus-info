"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { readyDb, queryOne } from "@/lib/db";
import { applyChanges, getBus } from "@/lib/buses";
import { isAdmin } from "@/lib/admin";
import { getAuthorName, getUserId } from "@/lib/auth";
import { notifyAdmin } from "@/lib/notify";
import { COUNTRIES, EDITABLE_FIELDS, FIRST_REGISTERED_PATTERN, STATUSES, type BusChanges, type Country } from "@/lib/types";

export type FormState = { ok: boolean; error?: string };

function describe(changes: BusChanges): string[] {
  return Object.entries(changes).map(([field, value]) => `  ${field}: ${value === "" ? "(cleared)" : value}`);
}

function readChanges(formData: FormData): BusChanges {
  const changes: BusChanges = {};
  for (const field of EDITABLE_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") changes[field] = value.trim().slice(0, 120);
  }
  if (changes.country !== undefined && !COUNTRIES.includes(changes.country as Country)) delete changes.country;
  if (changes.status !== undefined && !STATUSES.includes(changes.status)) delete changes.status;
  if (changes.year_built && !/^\d{4}$/.test(changes.year_built)) delete changes.year_built;
  if (changes.first_registered && !new RegExp(`^${FIRST_REGISTERED_PATTERN}$`).test(changes.first_registered)) delete changes.first_registered;
  return changes;
}

export async function suggestEdit(busId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "auth" };
  const bus = await getBus(busId);
  if (!bus) return { ok: false, error: "missing" };
  const changes = readChanges(formData);
  const diff: BusChanges = {};
  for (const [field, value] of Object.entries(changes) as [keyof BusChanges, string][]) {
    const current = bus[field as keyof typeof bus];
    if ((current == null ? "" : String(current)) !== value) diff[field] = value;
  }
  if (bus.fleet_guessed && bus.fleet_number && formData.get("confirm_fleet") === "on" && !diff.fleet_number) {
    diff.fleet_number = changes.fleet_number || bus.fleet_number;
  }
  if (Object.keys(diff).length === 0) return { ok: true };
  const author = await getAuthorName();
  await (await readyDb()).execute({
    sql: "INSERT INTO edits (bus_id, user_id, author, changes) VALUES (?, ?, ?, ?)",
    args: [busId, userId, author, JSON.stringify(diff)],
  });
  const name = bus.fleet_number ?? bus.plate ?? bus.gtfs_vehicle_id ?? "";
  after(() =>
    notifyAdmin(`Correction for bus #${busId}`, [`${author ?? "Someone"} suggested changes to bus #${busId} ${name}:`, ...describe(diff)]),
  );
  return { ok: true };
}

export async function proposeBus(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "auth" };
  const changes = Object.fromEntries(Object.entries(readChanges(formData)).filter(([, v]) => v !== ""));
  if (!changes.country || (!changes.plate && !changes.fleet_number)) return { ok: false, error: "required" };
  const author = await getAuthorName();
  await (await readyDb()).execute({
    sql: "INSERT INTO edits (bus_id, user_id, author, changes) VALUES (NULL, ?, ?, ?)",
    args: [userId, author, JSON.stringify(changes)],
  });
  after(() => notifyAdmin("New bus proposed", [`${author ?? "Someone"} proposed a new bus:`, ...describe(changes)]));
  return { ok: true };
}

async function requireAdmin(): Promise<void> {
  const userId = await getUserId();
  if (!isAdmin(userId)) throw new Error("Not allowed");
}

export async function reviewEdit(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  const edit = await queryOne<{ bus_id: number | null; changes: string }>({
    sql: "SELECT bus_id, changes FROM edits WHERE id = ? AND status = 'pending'",
    args: [id],
  });
  if (!edit) return;
  if (approve) await applyChanges(edit.bus_id == null ? null : Number(edit.bus_id), JSON.parse(edit.changes) as BusChanges);
  await (await readyDb()).execute({ sql: "UPDATE edits SET status = ? WHERE id = ?", args: [approve ? "approved" : "rejected", id] });
  revalidatePath("/[lang]/admin", "page");
}

export async function reviewPhoto(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  await (await readyDb()).execute({
    sql: "UPDATE photos SET status = ? WHERE id = ? AND status = 'pending'",
    args: [approve ? "approved" : "rejected", id],
  });
  revalidatePath("/[lang]/admin", "page");
}
