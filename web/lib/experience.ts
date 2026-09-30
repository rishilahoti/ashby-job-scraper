const EXPERIENCE_PATTERNS = [
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:to|-|–)?\s*(\d{1,2})?\s*(?:years|year|yrs|yr)\s+of\s+experience/i,
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:to|-|–)?\s*(\d{1,2})?\s*(?:years|year|yrs|yr)\s+experience/i,
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:to|-|–)?\s*(\d{1,2})?\s*(?:years|year|yrs|yr)\s+of\s+(?:industry|professional|relevant)\s+experience/i,
  /minimum of\s+(\d{1,2})\s*(?:\+|plus)?\s*(?:to|-|–)?\s*(\d{1,2})?\s*(?:years|year|yrs|yr)/i,
  /at least\s+(\d{1,2})\s*(?:\+|plus)?\s*(?:years|year|yrs|yr)/i,
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:years|year|yrs|yr)\s+in/i,
  /\((\d{1,2})\s*(?:\+|plus)?\s*(?:years|year|yrs|yr)\)\s+of/i,
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:years|year|yrs|yr)\s+of\s+(?:architecting|building|developing|engineering|operating|supporting|managing|working)/i,
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:years|year|yrs|yr)\s+with\s+(?:aws|gcp|azure|kubernetes|terraform|python|typescript|java|go|distributed|systems|infrastructure|software)/i,
];

function formatExperienceLabel(minYears: string, maxYears?: string): string {
  return maxYears ? `${minYears}-${maxYears} yrs` : `${minYears}+ yrs`;
}

export function getExperienceLabel(title: string, description?: string | null): string | null {
  void title;
  const text = description || "";

  for (const pattern of EXPERIENCE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    return formatExperienceLabel(match[1], match[2]);
  }

  return null;
}