import {
  POINTS_DELIVERY_PREFIX,
  parseQrTicketDelivery,
  type QrTicketDelivery,
} from '../domain/points-delivery.js';

export const REWARD_DELIVERY_PREFIX = POINTS_DELIVERY_PREFIX;
export type RewardQrFormat = QrTicketDelivery['format'];
export type RewardQrDelivery = QrTicketDelivery;

export type ParsedRewardDelivery =
  | { kind: 'qr'; value: RewardQrDelivery }
  | { kind: 'legacy'; text: string }
  | { kind: 'invalid' };

/** Presentation adapter: structured private tickets plus safe legacy text. */
export function parseRewardDelivery(raw: string): ParsedRewardDelivery {
  const value = parseQrTicketDelivery(raw);
  if (value) return { kind: 'qr', value };
  return raw.startsWith(POINTS_DELIVERY_PREFIX)
    ? { kind: 'invalid' }
    : { kind: 'legacy', text: raw };
}

export function rewardQrFileName(value: RewardQrDelivery): string {
  return `entrada-${value.eventSlug}.${value.format === 'jpeg' ? 'jpg' : value.format}`;
}
