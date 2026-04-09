import type { Contact } from "../types";

type ContactNameLike = Partial<Pick<Contact, "first_name" | "last_name">>;

export const getContactDisplayName = (contact?: ContactNameLike | null) =>
  [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();

export const getContactFileNameBase = (contact?: ContactNameLike | null) => {
  const displayName = getContactDisplayName(contact).replace(/\s+/g, "_");

  return displayName || "contact";
};

export const getSuggestedNameFromEmail = (email: string) => {
  if (!email) {
    return { first_name: "", last_name: "" };
  }

  const [first = "", last = ""] = email.split("@")[0].split(".");

  const formatPart = (value: string) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

  return {
    first_name: formatPart(first),
    last_name: formatPart(last),
  };
};
