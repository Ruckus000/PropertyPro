import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';

const querySchema = z.object({
  q: z.string().trim().min(3).max(200),
  limit: z.coerce.number().int().min(1).max(8).optional(),
});

interface NominatimResult {
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    county?: string;
  };
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
  MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN',
  TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
};

function normalizeStateCode(state: string): string {
  const normalized = state.trim().toUpperCase();
  if (normalized.length === 2) {
    return normalized;
  }
  return STATE_ABBREVIATIONS[normalized] ?? normalized;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get('q'),
    limit: searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid address autocomplete query');
  }

  const params = new URLSearchParams({
    q: parsed.data.q,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'us',
    limit: String(parsed.data.limit ?? 8),
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        'User-Agent': 'PropertyPro/1.0 (address-autocomplete)',
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return NextResponse.json({ data: [] });
  }

  const payload = (await response.json()) as NominatimResult[];
  const suggestions: Array<{
    key: string;
    addressLine1: string;
    city: string;
    state: string;
    zipCode: string;
    county: string;
  }> = [];
  const seen = new Set<string>();

  for (const row of payload) {
    const address = row.address ?? {};
    const street = [address.house_number, address.road].filter(Boolean).join(' ').trim();
    const city = address.city ?? address.town ?? address.village ?? '';
    const state = address.state ?? '';
    const zipCode = address.postcode ?? '';
    const countyRaw = address.county ?? '';
    const countyTrimmed = countyRaw.replace(/\s+county$/i, '').trim();
    const county = countyTrimmed.length > 0 ? countyTrimmed : countyRaw;

    if (!street || !city || !state) {
      continue;
    }

    const key = `${street}|${city}|${state}|${zipCode}|${county}`;
    if (seen.has(key)) {
      continue;
    }

    suggestions.push({
      key,
      addressLine1: street,
      city,
      state: normalizeStateCode(state),
      zipCode,
      county,
    });
    seen.add(key);
  }

  return NextResponse.json({ data: suggestions });
});
