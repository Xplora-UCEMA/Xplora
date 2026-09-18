import { createHash } from 'node:crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { AppConfig } from '../config/env.js';
import {
  encodeQrTicketDelivery,
  parseQrTicketDelivery,
  type QrTicketDelivery,
} from '../domain/points-delivery.js';

const MAX_TICKET_BYTES = 2 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

export type TicketImage = {
  bytes: Buffer;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  fileName: string;
  delivery: QrTicketDelivery;
};

type UploadedTicket = {
  publicId: string;
  version: number;
  format: string;
  type: string;
};

export type TicketCloudinaryGateway = {
  uploadPng(bytes: Buffer, publicId: string): Promise<UploadedTicket>;
  privateDownloadUrl(publicId: string, format: string, expiresAt: number): string;
  destroy(publicId: string): Promise<void>;
};

function defaultGateway(config: NonNullable<AppConfig['cloudinary']>): TicketCloudinaryGateway {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });
  return {
    uploadPng(bytes, publicId) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          public_id: publicId,
          resource_type: 'image',
          type: 'authenticated',
          format: 'png',
          overwrite: false,
          unique_filename: false,
          invalidate: false,
        }, (error, result) => {
          if (error || !result) {
            reject(new Error(error?.message || 'Cloudinary no devolvió el ticket.'));
            return;
          }
          const uploaded = result as UploadApiResponse;
          resolve({
            publicId: uploaded.public_id,
            version: uploaded.version,
            format: uploaded.format,
            type: uploaded.type,
          });
        });
        stream.end(bytes);
      });
    },
    privateDownloadUrl(publicId, format, expiresAt) {
      return cloudinary.utils.private_download_url(publicId, format, {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: expiresAt,
        attachment: false,
      });
    },
    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
      });
    },
  };
}

function contentType(format: QrTicketDelivery['format']): TicketImage['contentType'] {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function hasExpectedMagic(bytes: Buffer, format: QrTicketDelivery['format']): boolean {
  if (format === 'png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (format === 'jpg' || format === 'jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

async function boundedBytes(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_TICKET_BYTES) throw new Error('El ticket supera el tamaño permitido.');
  if (!response.body) throw new Error('Cloudinary devolvió un ticket vacío.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TICKET_BYTES) throw new Error('El ticket supera el tamaño permitido.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

/** Almacenamiento privado para tickets. Nunca devuelve la URL firmada al navegador. */
export class PointsTicketStorageService {
  private readonly gateway: TicketCloudinaryGateway;

  constructor(
    config: AppConfig,
    private readonly fetcher: typeof fetch = fetch,
    gateway?: TicketCloudinaryGateway,
  ) {
    if (!config.cloudinary && !gateway) throw new Error('Cloudinary no está configurado para tickets.');
    this.gateway = gateway ?? defaultGateway(config.cloudinary!);
  }

  async uploadPng(input: {
    bytes: Buffer;
    eventSlug: string;
    eventTitle: string;
    imageSha256: string;
    qrFingerprint: string;
  }): Promise<{ delivery: string; descriptor: QrTicketDelivery }> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.eventSlug) ||
        !input.eventTitle.trim() || input.eventTitle !== input.eventTitle.trim() || input.eventTitle.length > 160)
      throw new Error('Los datos del evento del ticket no son válidos.');
    if (input.bytes.length < 8 || input.bytes.length > MAX_TICKET_BYTES ||
        !hasExpectedMagic(input.bytes, 'png')) throw new Error('La imagen normalizada del ticket no es un PNG válido.');
    const actualHash = createHash('sha256').update(input.bytes).digest('hex');
    if (!HASH.test(input.imageSha256) || actualHash !== input.imageSha256 || !HASH.test(input.qrFingerprint))
      throw new Error('La integridad del ticket no coincide con la vista previa.');
    const publicId = `xplora-points/tickets/${input.eventSlug}/${input.imageSha256}`;
    const uploaded = await this.gateway.uploadPng(input.bytes, publicId);
    if (uploaded.publicId !== publicId || uploaded.type !== 'authenticated' || uploaded.format !== 'png' ||
        !Number.isSafeInteger(uploaded.version) || uploaded.version < 1) {
      throw new Error('Cloudinary no confirmó un asset privado válido.');
    }
    const descriptor: QrTicketDelivery = {
      type: 'qr',
      provider: 'cloudinary',
      eventSlug: input.eventSlug,
      eventTitle: input.eventTitle,
      publicId,
      version: uploaded.version,
      format: 'png',
      imageSha256: input.imageSha256,
      qrFingerprint: input.qrFingerprint,
    };
    return { descriptor, delivery: encodeQrTicketDelivery(descriptor) };
  }

  async read(deliveryValue: string): Promise<TicketImage> {
    const delivery = parseQrTicketDelivery(deliveryValue);
    if (!delivery) throw new Error('El canje no contiene un ticket QR válido.');
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    const url = this.gateway.privateDownloadUrl(delivery.publicId, delivery.format, expiresAt);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: contentType(delivery.format) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('No pudimos recuperar el ticket privado.');
    }
    if (!response.ok) throw new Error('No pudimos recuperar el ticket privado.');
    const bytes = await boundedBytes(response);
    if (!hasExpectedMagic(bytes, delivery.format) ||
        createHash('sha256').update(bytes).digest('hex') !== delivery.imageSha256)
      throw new Error('El ticket privado no superó la validación de integridad.');
    return {
      bytes,
      contentType: contentType(delivery.format),
      fileName: `entrada-${delivery.eventSlug}.${delivery.format === 'jpeg' ? 'jpg' : delivery.format}`,
      delivery,
    };
  }

  delete(publicId: string): Promise<void> {
    return this.gateway.destroy(publicId);
  }
}
