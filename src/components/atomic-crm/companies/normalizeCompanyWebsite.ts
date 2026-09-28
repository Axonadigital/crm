export const normalizeCompanyWebsite = <T extends { website?: string | null }>(
  values: T,
) => {
  const website = values.website?.trim();
  if (!website || website.startsWith("http")) {
    return values;
  }

  return {
    ...values,
    website: `https://${website}`,
  };
};
