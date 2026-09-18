const PREFIX = 'xplora-delivery:v1:';
const SHA256 = /^[a-f0-9]{64}$/;
const EVENT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_ID = /^xplora-points\/tickets\/[a-z0-9-]+\/[a-f0-9]{64}$/;

export const POINTS_DELIVERY_PREFIX = PREFIX;

export type QrTicketDelivery = {
  type: 'qr';
  provider: 'cloudinary';
  eventSlug: string;
  eventTitle: string;
  publicId: string;
  version: number;
  format: 'png' | 'jpg' | 'jpeg' | 'webp';
  imageSha256: string;
  /** HMAC-SHA256 del contenido QR. Nunca es el payload ni un hash sin clave. */
  qrFingerprint?: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Decodifica únicamente el formato versionado y privado de tickets.
 * Los códigos legacy siguen siendo texto y retornan `null`.
 */
export function parseQrTicketDelivery(value: unknown): QrTicketDelivery | null {
  if (typeof value !== 'string' || !value.startsWith(PREFIX) || value.length > 4000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.slice(PREFIX.length));
  } catch {
    return null;
  }
  if (!record(parsed)) return null;
  const allowed = new Set([
    'type', 'provider', 'eventSlug', 'eventTitle', 'publicId', 'version', 'format',
    'imageSha256', 'qrFingerprint',
  ]);
  if (Object.keys(parsed).some((key) => !allowed.has(key))) return null;
  if (parsed.type !== 'qr' || parsed.provider !== 'cloudinary') return null;
  if (typeof parsed.eventSlug !== 'string' || !EVENT_SLUG.test(parsed.eventSlug)) return null;
  if (typeof parsed.eventTitle !== 'string' || !parsed.eventTitle.trim() || parsed.eventTitle.length > 160) return null;
  if (typeof parsed.publicId !== 'string' || !PUBLIC_ID.test(parsed.publicId)) return null;
  const expectedFolder = `xplora-points/tickets/${parsed.eventSlug}/`;
  if (!parsed.publicId.startsWith(expectedFolder)) return null;
  if (!Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) return null;
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(String(parsed.format))) return null;
  if (typeof parsed.imageSha256 !== 'string' || !SHA256.test(parsed.imageSha256)) return null;
  if (parsed.qrFingerprint !== undefined &&
      (typeof parsed.qrFingerprint !== 'string' || !SHA256.test(parsed.qrFingerprint))) return null;
  return {
    type: 'qr',
    provider: 'cloudinary',
    eventSlug: parsed.eventSlug,
    eventTitle: parsed.eventTitle.trim(),
    publicId: parsed.publicId,
    version: parsed.version as number,
    format: parsed.format as QrTicketDelivery['format'],
    imageSha256: parsed.imageSha256,
    ...(parsed.qrFingerprint ? { qrFingerprint: parsed.qrFingerprint } : {}),
  };
}

/** Serialización canónica: permite comparar, firmar y reintentar imports de forma estable. */
export function encodeQrTicketDelivery(input: QrTicketDelivery): string {
  const normalized = parseQrTicketDelivery(`${PREFIX}${JSON.stringify({
    type: input.type,
    provider: input.provider,
    eventSlug: input.eventSlug,
    eventTitle: input.eventTitle,
    publicId: input.publicId,
    version: input.version,
    format: input.format,
    imageSha256: input.imageSha256,
    ...(input.qrFingerprint ? { qrFingerprint: input.qrFingerprint } : {}),
  })}`);
  if (!normalized) throw new Error('Descriptor privado de ticket inválido.');
  return `${PREFIX}${JSON.stringify(normalized)}`;
}

