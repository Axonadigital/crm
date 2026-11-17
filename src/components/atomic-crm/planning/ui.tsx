import { useGetList } from "ra-core";
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Option {
  id: string;
  name: string;
}

const NONE = "__none__";

interface SimpleSelectProps {
  value: string | null | undefined;
  options: ReadonlyArray<Option>;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
}

export const SimpleSelect = ({
  value,
  options,
  onChange,
  placeholder = "Välj…",
  allowEmpty = false,
  className,
}: SimpleSelectProps) => (
  <Select
    value={value ?? (allowEmpty ? NONE : undefined)}
    onValueChange={(v) => onChange(v === NONE ? null : v)}
  >
    <SelectTrigger className={className ?? "h-9 w-full sm:w-[150px]"}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {allowEmpty && <SelectItem value={NONE}>{placeholder}</SelectItem>}
      {options.map((o) => (
        <SelectItem key={o.id} value={o.id}>
          {o.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export interface SalesPerson {
  id: number;
  first_name: string;
  last_name: string;
}

/** Teamets medlemmar som select-alternativ + id→namn-uppslag. */
export const useTeam = () => {
  const { data } = useGetList<SalesPerson>("sales", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "first_name", order: "ASC" },
  });
  return useMemo(() => {
    const people = data ?? [];
    return {
      options: people.map((p) => ({
        id: String(p.id),
        name: p.first_name,
      })),
      nameOf: (id: number | null | undefined): string =>
        people.find((p) => p.id === id)?.first_name ?? "–",
    };
  }, [data]);
};

/** Hämtar hela listan för en planeringsresurs (små volymer, ingen paginering). */
export const usePlanningList = <T extends { id: number }>(
  resource: string,
  sortField = "created_at",
) =>
  useGetList<T>(resource, {
    pagination: { page: 1, perPage: 500 },
    sort: { field: sortField, order: "DESC" },
  });

export const formatHours = (hours: number): string =>
  `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
