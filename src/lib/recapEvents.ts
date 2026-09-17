import { getEventDate } from './eventDate';

export type RecapEvent = {
  id: string;
  title: string;
  date: string;
  speaker: string;
  image?: string;
  href?: string;
  location?: string;
  kind: 'upcoming' | 'archive';
};

export type RecapCatalogRequest = (path: string, options: { signal: AbortSignal }) => Promise<Response>;

type CatalogRow = Record<string, unknown> & { id: string; title: string };
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const COMPLETED_STARTUP_DAY_ID = '95b3d91e-f68b-4c73-a28d-7b739f491867';
const FEATURED_ARCHIVE_IDS = [
  '25b2d0e2-0e74-417c-8c20-687d8837f739',
  'b9f08b6d-b81a-4dfe-9845-0cde21eb0c83',
  '6a2735d7-c992-4b46-8940-47c3f3e1581e',
];

/** Keep Drive/Docs out of public recap links, including CMS-provided destinations. */
export function recapEventUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(url.protocol)
      || ['drive.google.com', 'docs.google.com'].some(host => hostname === host || hostname.endsWith(`.${host}`))) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function rows(data: unknown): CatalogRow[] {
  if (!Array.isArray(data)) throw new Error('Unexpected event catalog response');
  return data.filter((row): row is CatalogRow => (
    row && typeof row.id === 'string' && typeof row.title === 'string'
  ));
}

function eventDate(row: CatalogRow, now: Date): Date | null {
  const label = text(row.date_display);
  const iso = label.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const numeric = label.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](20\d{2}))?\b/);
  if (numeric) return new Date(numeric[3] ? Number(numeric[3]) : now.getFullYear(), Number(numeric[2]) - 1, Number(numeric[1]));
  // Unlike the general catalog helper, the recap must never roll a past date into next year.
  return getEventDate({
    date: /\b20\d{2}\b/.test(label) ? label : `${label} ${now.getFullYear()}`,
    day: text(row.day),
    month: text(row.month),
  });
}

export async function loadRecapEvents(request: RecapCatalogRequest, signal: AbortSignal, now = new Date()): Promise<RecapEvent[]> {
  const response = await request('/api/public/eventos', { signal });
  if (!response.ok) throw new Error('Unable to load upcoming events');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingIds = new Set<string>();
  const upcoming: RecapEvent[] = rows(await response.json())
    .filter(row => row.realizado !== true && row.id !== COMPLETED_STARTUP_DAY_ID)
    .filter(row => { const date = eventDate(row, now); return !date || date >= today; })
    .sort((a, b) => (eventDate(a, now)?.getTime() ?? Infinity) - (eventDate(b, now)?.getTime() ?? Infinity))
    .filter(row => { if (upcomingIds.has(row.id)) return false; upcomingIds.add(row.id); return true; })
    .map(row => ({
      id: row.id,
      title: row.title,
      date: text(row.date_display),
      speaker: text(row.speaker_name),
      location: text(row.location),
      image: text(row.thumbnail_url) || text(row.home_poster_url) || undefined,
      href: recapEventUrl(row.registration_link),
      kind: 'upcoming',
    }));
  if (upcoming.length) return upcoming;

  const archiveResponse = await request('/api/public/charlas', { signal });
  if (!archiveResponse.ok) throw new Error('Unable to load the event archive');
  const rank = (id: string) => {
    const index = FEATURED_ARCHIVE_IDS.indexOf(id);
    return index < 0 ? FEATURED_ARCHIVE_IDS.length : index;
  };
  const seen = new Set<string>();
  return rows(await archiveResponse.json())
    .filter(row => !/startup[\s-]*day/i.test(row.title) && recapEventUrl(row.recording_link))
    .sort((a, b) => rank(a.id) - rank(b.id))
    .filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; })
    .slice(0, 3)
    .map(row => ({
      id: row.id,
      title: row.title,
      date: text(row.date_display),
      speaker: text(row.speaker_name),
      image: text(row.thumbnail_url) || undefined,
      href: recapEventUrl(row.recording_link),
      kind: 'archive',
    }));
}
