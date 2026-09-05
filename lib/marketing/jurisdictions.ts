/** ISO 3166-2 codes to state names, for the scan's state picker and the public pages. */
export const US_STATE_NAMES: Readonly<Record<string, string>> = {
  'US-AL': 'Alabama', 'US-AK': 'Alaska', 'US-AZ': 'Arizona', 'US-AR': 'Arkansas',
  'US-CA': 'California', 'US-CO': 'Colorado', 'US-CT': 'Connecticut', 'US-DE': 'Delaware',
  'US-DC': 'District of Columbia', 'US-FL': 'Florida', 'US-GA': 'Georgia', 'US-HI': 'Hawaii',
  'US-ID': 'Idaho', 'US-IL': 'Illinois', 'US-IN': 'Indiana', 'US-IA': 'Iowa',
  'US-KS': 'Kansas', 'US-KY': 'Kentucky', 'US-LA': 'Louisiana', 'US-ME': 'Maine',
  'US-MD': 'Maryland', 'US-MA': 'Massachusetts', 'US-MI': 'Michigan', 'US-MN': 'Minnesota',
  'US-MS': 'Mississippi', 'US-MO': 'Missouri', 'US-MT': 'Montana', 'US-NE': 'Nebraska',
  'US-NV': 'Nevada', 'US-NH': 'New Hampshire', 'US-NJ': 'New Jersey', 'US-NM': 'New Mexico',
  'US-NY': 'New York', 'US-NC': 'North Carolina', 'US-ND': 'North Dakota', 'US-OH': 'Ohio',
  'US-OK': 'Oklahoma', 'US-OR': 'Oregon', 'US-PA': 'Pennsylvania', 'US-RI': 'Rhode Island',
  'US-SC': 'South Carolina', 'US-SD': 'South Dakota', 'US-TN': 'Tennessee', 'US-TX': 'Texas',
  'US-UT': 'Utah', 'US-VT': 'Vermont', 'US-VA': 'Virginia', 'US-WA': 'Washington',
  'US-WV': 'West Virginia', 'US-WI': 'Wisconsin', 'US-WY': 'Wyoming',
};

/** URL slugs for the public state pages: US-NY becomes new-york. */
export function stateSlug(jurisdiction: string): string {
  const name = US_STATE_NAMES[jurisdiction];
  if (!name) return jurisdiction.toLowerCase();
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function jurisdictionForSlug(slug: string): string | null {
  const match = Object.keys(US_STATE_NAMES).find((code) => stateSlug(code) === slug);
  return match ?? null;
}

export function stateName(jurisdiction: string): string {
  return US_STATE_NAMES[jurisdiction] ?? jurisdiction;
}

export const ALL_JURISDICTIONS: readonly string[] = Object.keys(US_STATE_NAMES).sort((a, b) =>
  stateName(a).localeCompare(stateName(b)),
);
