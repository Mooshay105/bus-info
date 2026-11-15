import type { Dictionary } from "./dictionaries";
import { COUNTRIES, FIRST_REGISTERED_PATTERN, type Bus } from "@/lib/types";

/** Props for the shared set of bus form inputs. */
interface BusFieldsProps {
  /** UI strings. */
  dict: Dictionary;
  /** Current values to prefill, if editing. */
  bus?: Partial<Bus>;
}

export function BusFields({ dict, bus = {} }: BusFieldsProps) {
  const b = dict.bus;
  const text: [keyof Bus, string, string?][] = [
    ["plate", b.plate],
    ["fleet_number", b.fleetNumber],
    ["operator_name", b.operator],
    ["make", b.make],
    ["model", b.model],
    ["body", b.body],
    ["year_built", b.yearBuilt, "\\d{4}"],
    ["first_registered", b.firstRegistered, FIRST_REGISTERED_PATTERN],
    ["fuel", b.fuel],
    ["colour", b.colour],
    ["gtfs_vehicle_id", b.vehicleId],
  ];
  const input = "mt-1 w-full rounded-md border border-rule bg-surface px-3 py-2";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        {b.country}
        <select name="country" defaultValue={bus.country ?? "SE"} className={input}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {dict.countries[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {b.status}
        <select name="status" defaultValue={bus.status ?? "active"} className={input}>
          {Object.entries(b.statuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {bus.fleet_guessed ? (
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="confirm_fleet" className="size-4" />
          {b.confirmFleet}
        </label>
      ) : null}
      {text.map(([name, label, pattern]) => (
        <label key={name} className="block">
          {label}
          <input
            name={name}
            defaultValue={bus[name] == null ? "" : String(bus[name])}
            pattern={pattern}
            placeholder={name === "first_registered" ? "2019-03" : undefined}
            maxLength={120}
            className={input}
          />
        </label>
      ))}
    </div>
  );
}
