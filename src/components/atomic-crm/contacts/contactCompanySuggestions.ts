import type {
  Company,
  EmailAndType,
  PhoneNumberAndType,
} from "../types";

const isBlank = (value?: string | null) => !value?.trim();

const addMissingWorkEmail = (
  emails: EmailAndType[],
  companyEmail?: string,
): EmailAndType[] => {
  if (isBlank(companyEmail)) return emails;

  const workIndex = emails.findIndex((entry) => entry.type === "Work");
  if (workIndex === -1) {
    return [{ email: companyEmail!, type: "Work" }, ...emails];
  }

  const workEntry = emails[workIndex];
  if (!isBlank(workEntry.email)) {
    return emails;
  }

  return emails.map((entry, index) =>
    index === workIndex ? { ...entry, email: companyEmail! } : entry,
  );
};

const addMissingWorkPhone = (
  phoneNumbers: PhoneNumberAndType[],
  companyPhoneNumber?: string,
): PhoneNumberAndType[] => {
  if (isBlank(companyPhoneNumber)) return phoneNumbers;

  const workIndex = phoneNumbers.findIndex((entry) => entry.type === "Work");
  if (workIndex === -1) {
    return [{ number: companyPhoneNumber!, type: "Work" }, ...phoneNumbers];
  }

  const workEntry = phoneNumbers[workIndex];
  if (!isBlank(workEntry.number)) {
    return phoneNumbers;
  }

  return phoneNumbers.map((entry, index) =>
    index === workIndex ? { ...entry, number: companyPhoneNumber! } : entry,
  );
};

export const applyCompanyContactSuggestions = ({
  company,
  emailJsonb = [],
  phoneJsonb = [],
}: {
  company?: Pick<Company, "email" | "phone_number"> | null;
  emailJsonb?: EmailAndType[];
  phoneJsonb?: PhoneNumberAndType[];
}) => {
  const nextEmailJsonb = addMissingWorkEmail(emailJsonb, company?.email);
  const nextPhoneJsonb = addMissingWorkPhone(
    phoneJsonb,
    company?.phone_number,
  );

  return {
    emailJsonb: nextEmailJsonb,
    phoneJsonb: nextPhoneJsonb,
    hasChanges:
      nextEmailJsonb !== emailJsonb || nextPhoneJsonb !== phoneJsonb,
  };
};
