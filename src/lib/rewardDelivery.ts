export const REWARD_DELIVERY_PREFIX = "xplora-delivery:v1:";

export const REWARD_QR_FORMATS = ["png", "jpg", "jpeg", "webp"] as const;
export type RewardQrFormat = (typeof REWARD_QR_FORMATS)[number];

export type RewardQrDelivery = {
  type: "qr";
  provider: "cloudinary";
  eventSlug: string;
  eventTitle: string;
  publicId: string;
  version: number;
  format: RewardQrFormat;
  imageSha256: string;
  qrFingerprint?: string;
};

export type ParsedRewardDelivery =
  | { kind: "qr"; value: RewardQrDelivery }
  | { kind: "legacy"; text: string }
  | { kind: "invalid" };

const allowedKeys = new Set([
  "type",
  "provider",
  "eventSlug",
  "eventTitle",
  "publicId",
  "version",
  "format",
  "imageSha256",
  "qrFingerprint",
]);
const sha256 = /^[a-f0-9]{64}$/;
const eventSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicId = /^xplora-points\/tickets\/[a-z0-9-]+\/[a-f0-9]{64}$/;

function validateQrDelivery(value: unknown): RewardQrDelivery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !allowedKeys.has(key))) return null;
  if (row.type !== "qr" || row.provider !== "cloudinary") return null;
  if (typeof row.eventSlug !== "string" || !eventSlug.test(row.eventSlug)) return null;
  if (typeof row.eventTitle !== "string" || !row.eventTitle.trim() || row.eventTitle.length > 160) return null;
  if (typeof row.publicId !== "string" || !publicId.test(row.publicId)) return null;
  if (!row.publicId.startsWith(`xplora-points/tickets/${row.eventSlug}/`)) return null;
  if (!Number.isSafeInteger(row.version) || (row.version as number) < 1) return null;
  if (!REWARD_QR_FORMATS.includes(row.format as RewardQrFormat)) return null;
  if (typeof row.imageSha256 !== "string" || !sha256.test(row.imageSha256)) return null;
  if (row.qrFingerprint !== undefined && (typeof row.qrFingerprint !== "string" || !sha256.test(row.qrFingerprint))) return null;
  return {
    type: "qr",
    provider: "cloudinary",
    eventSlug: row.eventSlug,
    eventTitle: row.eventTitle.trim(),
    publicId: row.publicId,
    version: row.version as number,
    format: row.format as RewardQrFormat,
    imageSha256: row.imageSha256,
    ...(row.qrFingerprint !== undefined ? { qrFingerprint: row.qrFingerprint } : {}),
  };
}

export function parseRewardDelivery(raw: string): ParsedRewardDelivery {
  if (!raw.startsWith(REWARD_DELIVERY_PREFIX)) return { kind: "legacy", text: raw };
  if (raw.length > 4000) return { kind: "invalid" };
  const payload = raw.slice(REWARD_DELIVERY_PREFIX.length);
  if (!payload) return { kind: "invalid" };
  try {
    const value = validateQrDelivery(JSON.parse(payload));
    return value ? { kind: "qr", value } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

export function encodeRewardDelivery(value: RewardQrDelivery): string {
  const valid = validateQrDelivery(value);
  if (!valid) throw new TypeError("Delivery QR inválido.");
  return REWARD_DELIVERY_PREFIX + JSON.stringify(valid);
}

export function rewardQrFileName(value: RewardQrDelivery): string {
  return `entrada-${value.eventSlug}.${value.format === "jpeg" ? "jpg" : value.format}`;
}
