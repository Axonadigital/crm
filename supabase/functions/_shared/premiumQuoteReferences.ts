export interface PremiumReferenceProject {
  title: string;
  url: string;
  link: string;
  type: string;
  description: string;
}

export function resolveReferenceProjects(
  referenceImages: PremiumReferenceProject[] | null | undefined,
  fallbackReferences: PremiumReferenceProject[],
): PremiumReferenceProject[] {
  return referenceImages && referenceImages.length > 0
    ? referenceImages
    : fallbackReferences;
}
