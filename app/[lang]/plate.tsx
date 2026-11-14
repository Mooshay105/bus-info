import { formatPlate } from "@/lib/normalize";
import type { Country } from "@/lib/types";

/** Props for a number plate drawn in its country's style. */
interface PlateProps {
  /** Plate text as stored. */
  plate: string;
  /** Country whose plate style to use. */
  country: Country;
  /** Smaller variant for lists. */
  small?: boolean;
}

/** Background, text and border colours for each country's plates. */
const STYLES: Record<Country, string> = {
  GB: "bg-[#f7c600] text-black border-black/70",
  SE: "bg-white text-black border-black",
  AU: "bg-white text-black border-black",
  NZ: "bg-white text-black border-black",
};

export function Plate({ plate, country, small = false }: PlateProps) {
  return (
    <span
      className={`inline-flex items-stretch overflow-hidden rounded-[5px] border-2 font-bold leading-none tracking-wide shadow-[0_1px_0_rgb(0_0_0/0.25)] ${STYLES[country]} ${small ? "text-base" : "text-3xl sm:text-4xl"}`}
    >
      {country === "SE" && (
        <span
          aria-hidden
          className={`flex flex-col items-center justify-end bg-[#003399] text-white ${small ? "px-1 pb-0.5 text-[0.5rem]" : "px-1.5 pb-1 text-xs"}`}
        >
          S
        </span>
      )}
      <span className={small ? "px-2 py-1" : "px-4 py-2"}>{formatPlate(plate, country)}</span>
    </span>
  );
}
