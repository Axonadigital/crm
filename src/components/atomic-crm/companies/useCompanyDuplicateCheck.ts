import { useEffect, useState } from "react";
import { useGetList, useRecordContext } from "ra-core";
import { useWatch } from "react-hook-form";
import type { Company } from "../types";

const SWEDISH_SUFFIXES =
  /\b(ab|hb|kb|aktiebolag|handelsbolag|kommanditbolag|ekonomisk\s+förening|ef|stiftelsen|stiftelse|inc|ltd|llc|gmbh|as|aps|oy|sa|bv|nv|ag|plc|corp|co)\b\.?/gi;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(SWEDISH_SUFFIXES, "")
    .replace(/[^a-zåäö0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns a 0–1 similarity score between two normalized company names. */
function isSimilar(a: string, b: string): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false;

  const noSpaceA = a.replace(/\s/g, "");
  const noSpaceB = b.replace(/\s/g, "");

  // Exact match after normalization
  if (a === b || noSpaceA === noSpaceB) return true;

  // Substring match (one contains the other)
  if (a.includes(b) || b.includes(a)) return true;
  if (noSpaceA.includes(noSpaceB) || noSpaceB.includes(noSpaceA)) return true;

  // Word overlap: if 60%+ of words from either side match
  const wordsA = a.split(" ").filter((w) => w.length > 2);
  const wordsB = b.split(" ").filter((w) => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const matches = wordsA.filter((w) =>
    wordsB.some((wb) => wb.startsWith(w) || w.startsWith(wb)),
  );
  const ratio = matches.length / Math.min(wordsA.length, wordsB.length);
  return ratio >= 0.6;
}

export function useCompanyDuplicateCheck() {
  const record = useRecordContext<Company>();
  const nameValue: string = useWatch({ name: "name", defaultValue: "" });
  const [debouncedName, setDebouncedName] = useState("");

  useEffect(() => {
    const trimmed = (nameValue ?? "").trim();
    if (trimmed.length < 2) {
      setDebouncedName("");
      return;
    }
    const timer = setTimeout(() => setDebouncedName(trimmed), 600);
    return () => clearTimeout(timer);
  }, [nameValue]);

  const normalizedInput = normalizeName(debouncedName);
  // Use the first significant word (3+ chars) as the API search term
  const searchWord =
    normalizedInput.split(" ").find((w) => w.length >= 3) ?? normalizedInput;

  const { data: candidates } = useGetList<Company>(
    "companies",
    {
      pagination: { page: 1, perPage: 20 },
      filter: { "name@ilike": `%${searchWord}%` },
      sort: { field: "name", order: "ASC" },
    },
    { enabled: searchWord.length >= 3 },
  );

  if (!candidates || !debouncedName) return [];

  return candidates.filter((company) => {
    // Exclude the company being edited
    if (record?.id && company.id === record.id) return false;
    return isSimilar(normalizedInput, normalizeName(company.name));
  });
}
