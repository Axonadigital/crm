import * as Papa from "papaparse";

/**
 * Parses any tabular file (CSV, TSV, Excel, JSON, TXT, etc.) into
 * an array of row objects with normalised string keys.
 *
 * Supported formats:
 *  - .csv / .tsv / .txt  → PapaParse (auto-detect delimiter)
 *  - .xlsx / .xls / .ods → SheetJS  (first sheet)
 *  - .json               → native JSON.parse (array or {key: array})
 *  - anything else        → tries PapaParse first, then SheetJS
 */

export type ParsedRow = Record<string, string>;

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
}

const EXCEL_EXTENSIONS = [".xlsx", ".xls", ".ods", ".xlsb"];
const TEXT_EXTENSIONS = [".csv", ".tsv", ".txt", ".tab"];

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function normalizeHeader(header: string): string {
  return header.replace("\uFEFF", "").trim().toLowerCase().replace(/\s+/g, "_");
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

async function parseExcel(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file contains no sheets.");
  }
  const sheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });

  if (rawRows.length === 0) {
    return { rows: [], headers: [] };
  }

  const rawHeaders = Object.keys(rawRows[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const rows: ParsedRow[] = rawRows.map((raw) => {
    const row: ParsedRow = {};
    rawHeaders.forEach((rawKey, i) => {
      row[headers[i]] = stringifyValue(raw[rawKey]);
    });
    return row;
  });

  return { rows, headers };
}

async function parseCsvLike(file: File): Promise<ParseResult> {
  return new Promise<ParseResult>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (result) => {
        const headers = result.meta.fields?.map(normalizeHeader) ?? [];
        const rows: ParsedRow[] = result.data.map((raw) => {
          const row: ParsedRow = {};
          for (const key of headers) {
            row[key] = stringifyValue(raw[key]);
          }
          return row;
        });
        resolve({ rows, headers });
      },
      error: (error) => {
        reject(new Error(error.message));
      },
    });
  });
}

async function parseJson(file: File): Promise<ParseResult> {
  const text = await file.text();
  const data = JSON.parse(text);

  // If it's already an array of objects, use directly
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
    const rawHeaders = Object.keys(data[0]);
    const headers = rawHeaders.map(normalizeHeader);
    const rows: ParsedRow[] = data.map((item: Record<string, unknown>) => {
      const row: ParsedRow = {};
      rawHeaders.forEach((rawKey, i) => {
        row[headers[i]] = stringifyValue(item[rawKey]);
      });
      return row;
    });
    return { rows, headers };
  }

  // If it's a structured import file (with sales, companies, contacts keys),
  // return null to signal the caller should use the original JSON importer
  if (typeof data === "object" && !Array.isArray(data)) {
    const keys = Object.keys(data);
    const importKeys = ["sales", "companies", "contacts", "notes", "tasks"];
    if (keys.some((k) => importKeys.includes(k))) {
      // Signal: this is a structured JSON import, not a flat table
      throw new StructuredJsonError(file);
    }
  }

  throw new Error(
    "JSON file must be an array of objects or a structured import file.",
  );
}

export class StructuredJsonError extends Error {
  public file: File;
  constructor(file: File) {
    super("Structured JSON import file detected.");
    this.name = "StructuredJsonError";
    this.file = file;
  }
}

export async function parseUniversalFile(file: File): Promise<ParseResult> {
  const ext = getExtension(file.name);

  // Excel formats
  if (EXCEL_EXTENSIONS.includes(ext)) {
    return parseExcel(file);
  }

  // Explicit CSV/TSV/TXT
  if (TEXT_EXTENSIONS.includes(ext)) {
    return parseCsvLike(file);
  }

  // JSON
  if (ext === ".json") {
    return parseJson(file);
  }

  // Unknown extension: try CSV first, then Excel
  try {
    const result = await parseCsvLike(file);
    if (result.headers.length > 1 && result.rows.length > 0) {
      return result;
    }
  } catch {
    // Fall through
  }

  try {
    return await parseExcel(file);
  } catch {
    // Fall through
  }

  throw new Error(
    `Could not parse "${file.name}". Supported formats: CSV, TSV, TXT, Excel (.xlsx, .xls, .ods), JSON.`,
  );
}

/**
 * Column name aliases — maps common variations to canonical names.
 * All keys must be lowercase with underscores.
 */
const COLUMN_ALIASES: Record<string, string> = {
  // first_name
  firstname: "first_name",
  first: "first_name",
  förnamn: "first_name",
  fornamn: "first_name",
  given_name: "first_name",
  givenname: "first_name",

  // last_name
  lastname: "last_name",
  last: "last_name",
  efternamn: "last_name",
  surname: "last_name",
  family_name: "last_name",
  familyname: "last_name",

  // company
  company_name: "company",
  companyname: "company",
  företag: "company",
  foretag: "company",
  organisation: "company",
  organization: "company",
  org: "company",
  firma: "company",

  // phone_work
  phone: "phone_work",
  telefon: "phone_work",
  tel: "phone_work",
  telephone: "phone_work",
  work_phone: "phone_work",
  workphone: "phone_work",
  mobiltelefon: "phone_work",
  mobil: "phone_work",
  mobile: "phone_work",
  cell: "phone_work",
  cellphone: "phone_work",

  // email_work
  email: "email_work",
  e_mail: "email_work",
  "e-post": "email_work",
  epost: "email_work",
  mail: "email_work",
  work_email: "email_work",
  workemail: "email_work",

  // tags
  tag: "tags",
  labels: "tags",
  label: "tags",
  etiketter: "tags",
  etikett: "tags",
  kategori: "tags",
  category: "tags",
  categories: "tags",

  // title
  titel: "title",
  befattning: "title",
  job_title: "title",
  jobtitle: "title",
  position: "title",
  roll: "title",
  role: "title",

  // gender
  kön: "gender",
  kon: "gender",
  sex: "gender",

  // background
  bakgrund: "background",
  description: "background",
  beskrivning: "background",
  notes: "background",
  note: "background",
  anteckningar: "background",
  kommentar: "background",
  comment: "background",

  // linkedin
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
  linkedinurl: "linkedin_url",

  // website
  website: "website",
  hemsida: "website",
  webbplats: "website",
  url: "website",
  web: "website",

  // address
  adress: "address",
  gatuadress: "address",
  street: "address",
  street_address: "address",

  // city
  stad: "city",
  ort: "city",
  town: "city",

  // zipcode / postnummer
  postnummer: "zipcode",
  zip: "zipcode",
  zip_code: "zipcode",
  postal_code: "zipcode",
  postcode: "zipcode",
  postkod: "zipcode",

  // country
  land: "country",
};

/**
 * Maps parsed headers to canonical CRM field names using aliases.
 * Returns a mapping from original header → canonical name.
 */
export function mapHeadersToCanonical(
  headers: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[\s-]+/g, "_");

    // Direct match — header is already canonical
    if (COLUMN_ALIASES[normalized]) {
      mapping[header] = COLUMN_ALIASES[normalized];
    } else if (
      [
        "first_name",
        "last_name",
        "company",
        "phone_work",
        "email_work",
        "tags",
        "title",
        "gender",
        "background",
        "linkedin_url",
        "website",
        "address",
        "city",
        "zipcode",
        "country",
        "avatar",
        "has_newsletter",
        "status",
        "phone_home",
        "phone_other",
        "email_home",
        "email_other",
        "first_seen",
        "last_seen",
      ].includes(normalized)
    ) {
      mapping[header] = normalized;
    } else {
      // Keep unmapped columns as-is (will be ignored during import)
      mapping[header] = normalized;
    }
  }

  return mapping;
}

/**
 * Remaps rows using the canonical column mapping.
 */
export function remapRows(
  rows: ParsedRow[],
  headers: string[],
  mapping: Record<string, string>,
): ParsedRow[] {
  return rows.map((row) => {
    const mapped: ParsedRow = {};
    for (const header of headers) {
      const canonical = mapping[header] ?? header;
      mapped[canonical] = row[header] ?? "";
    }
    return mapped;
  });
}
