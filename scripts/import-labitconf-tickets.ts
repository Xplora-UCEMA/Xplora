import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppConfig, loadEnvFromProjectRoot } from '../server/src/config/env.js';
import { parseQrTicketDelivery } from '../server/src/domain/points-delivery.js';
import { createServiceSupabase } from '../server/src/infra/supabase-clients.js';
import { PointsTicketStorageService } from '../server/src/services/points-ticket-storage.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_REWARD_TITLE = 'Entrada a LaBitConf';
const EXPECTED_REWARD_COST = 150;

export type LabitconfReward = {
  id: string;
  title: string;
  cost: number;
  active: boolean;
};

export function assertExpectedLabitconfReward(reward: LabitconfReward): void {
  if (reward.title !== EXPECTED_REWARD_TITLE || reward.cost !== EXPECTED_REWARD_COST) {
    throw new Error(
      `La recompensa debe ser exactamente "${EXPECTED_REWARD_TITLE}" y costar ${EXPECTED_REWARD_COST} Points. No se subió nada.`,
    );
  }
  if (reward.active !== false) throw new Error('Desactivá la recompensa antes de cargar el stock QR.');
}

type AcceptedTicket = {
  sourceName: string;
  normalizedFile: string;
  imageSha256: string;
  qrFingerprint: string;
  width: number;
  height: number;
};

type IntakeManifest = {
  version: 1;
  event: { slug: 'labitconf'; title: 'LaBitConf' };
  accepted: AcceptedTicket[];
  manifestSignature: string;
};

function usage(): never {
  throw new Error([
    'Uso:',
    '  npm run tickets:labitconf -- preview --zip /ruta/tickets.zip --out /ruta/preview',
    '  npm run tickets:labitconf -- commit --manifest /ruta/preview/manifest.json --reward UUID',
  ].join('\n'));
}

function args(): { command: 'preview' | 'commit'; values: Map<string, string> } {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'preview' && command !== 'commit') usage();
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) usage();
    values.set(key.slice(2), value);
  }
  return { command, values };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function fingerprintSecret(): string {
  const value = getAppConfig().pointsTicketFingerprintSecret;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error('Configurá POINTS_TICKET_FINGERPRINT_SECRET con al menos 32 bytes antes de procesar tickets.');
  }
  return value;
}

function runPython(inputZip: string, outputDir: string, secret: string): Promise<void> {
  const pythonScript = path.join(scriptDir, 'labitconf_ticket_intake.py');
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [
      pythonScript,
      inputZip,
      '--output', outputDir,
      '--event-slug', 'labitconf',
      '--event-title', 'LaBitConf',
    ], {
      cwd: process.cwd(),
      env: { ...process.env, POINTS_TICKET_FINGERPRINT_SECRET: secret },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`La vista previa falló${signal ? ` (${signal})` : ` (código ${code ?? 'desconocido'})`}.`));
    });
  });
}

function validTicket(value: unknown): value is AcceptedTicket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.sourceName === 'string' && item.sourceName.length > 0 && item.sourceName.length <= 500 &&
    typeof item.normalizedFile === 'string' && item.normalizedFile.length > 0 && item.normalizedFile.length <= 500 &&
    typeof item.imageSha256 === 'string' && HASH.test(item.imageSha256) &&
    typeof item.qrFingerprint === 'string' && HASH.test(item.qrFingerprint) &&
    Number.isSafeInteger(item.width) && Number(item.width) > 0 && Number(item.width) <= 40_000 &&
    Number.isSafeInteger(item.height) && Number(item.height) > 0 && Number(item.height) <= 40_000;
}

function parseManifest(value: unknown): IntakeManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Manifest inválido.');
  const manifest = value as Record<string, unknown>;
  const event = manifest.event as Record<string, unknown> | undefined;
  if (manifest.version !== 1 || !event || event.slug !== 'labitconf' || event.title !== 'LaBitConf' ||
      !Array.isArray(manifest.accepted) || manifest.accepted.length < 1 || manifest.accepted.length > 500 ||
      !manifest.accepted.every(validTicket) || typeof manifest.manifestSignature !== 'string' ||
      !HASH.test(manifest.manifestSignature)) throw new Error('Manifest de tickets inválido.');
  const accepted = manifest.accepted as AcceptedTicket[];
  if (new Set(accepted.map((item) => item.imageSha256)).size !== accepted.length ||
      new Set(accepted.map((item) => item.qrFingerprint)).size !== accepted.length)
    throw new Error('El manifest contiene tickets duplicados.');
  return manifest as unknown as IntakeManifest;
}

function verifyManifest(manifest: IntakeManifest, secret: string): void {
  const signed = stableJson({ version: manifest.version, event: manifest.event, accepted: manifest.accepted });
  const expected = createHmac('sha256', secret).update(signed).digest();
  const actual = Buffer.from(manifest.manifestSignature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('La firma del manifest no coincide. Volvé a generar la vista previa.');
}

function safeTicketPath(manifestPath: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.includes('\\')) throw new Error('Ruta de ticket inválida en el manifest.');
  const base = path.dirname(path.resolve(manifestPath));
  const target = path.resolve(base, relative);
  const rel = path.relative(base, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta de ticket inválida en el manifest.');
  return target;
}

async function preview(values: Map<string, string>): Promise<void> {
  const zip = values.get('zip');
  const out = values.get('out');
  if (!zip || !out || values.size !== 2) usage();
  await runPython(path.resolve(zip), path.resolve(out), fingerprintSecret());
}

async function commit(values: Map<string, string>): Promise<void> {
  const manifestPath = values.get('manifest');
  const rewardId = values.get('reward');
  if (!manifestPath || !rewardId || values.size !== 2 || !UUID.test(rewardId)) usage();
  const secret = fingerprintSecret();
  const manifest = parseManifest(JSON.parse(await readFile(path.resolve(manifestPath), 'utf8')) as unknown);
  verifyManifest(manifest, secret);

  const config = getAppConfig();
  const supabase = createServiceSupabase(config);
  if (!supabase) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY; no se hizo ninguna carga.');
  if (!config.cloudinary) throw new Error('Cloudinary no está configurado; no se hizo ninguna carga.');
  const reward = await supabase.from('xp_rewards').select('id,title,cost,active').eq('id', rewardId)
    .maybeSingle<LabitconfReward>();
  if (reward.error) throw new Error('No se pudo verificar la recompensa.');
  if (!reward.data) throw new Error('La recompensa indicada no existe.');
  assertExpectedLabitconfReward(reward.data);

  type InventoryRow = { reward_id: string; delivery: string; fingerprint: string | null };
  const existingRows: InventoryRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const page = await supabase.from('xp_inventory').select('reward_id,delivery,fingerprint')
      .range(from, from + pageSize - 1).returns<InventoryRow[]>();
    if (page.error) throw new Error('No se pudo verificar el inventario existente. ¿Aplicaste la migración 005?');
    existingRows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < pageSize) break;
    if (from + pageSize >= 100_000) throw new Error('El inventario es demasiado grande para validarlo de forma segura.');
  }
  if (existingRows.some((row) => row.reward_id === rewardId &&
      (!row.fingerprint || !parseQrTicketDelivery(row.delivery))))
    throw new Error('La recompensa ya tiene inventario legacy o inválido. Separalo antes de cargar entradas QR.');
  const fingerprints = new Set(existingRows.map((row) => row.fingerprint).filter(Boolean));
  const imageHashes = new Set(existingRows.map((row) => parseQrTicketDelivery(row.delivery)?.imageSha256).filter(Boolean));
  const repeated = manifest.accepted.filter((ticket) => fingerprints.has(ticket.qrFingerprint) || imageHashes.has(ticket.imageSha256));
  if (repeated.length) throw new Error(`${repeated.length} ticket(s) ya existen en el inventario. No se subió nada.`);

  const storage = new PointsTicketStorageService(config);
  const uploaded: { delivery: string; fingerprint: string }[] = [];
  let rpcAttempted = false;
  try {
    for (const ticket of manifest.accepted) {
      const file = safeTicketPath(manifestPath, ticket.normalizedFile);
      const bytes = await readFile(file);
      const result = await storage.uploadPng({
        bytes,
        eventSlug: manifest.event.slug,
        eventTitle: manifest.event.title,
        imageSha256: ticket.imageSha256,
        qrFingerprint: ticket.qrFingerprint,
      });
      uploaded.push({
        delivery: result.delivery,
        fingerprint: ticket.qrFingerprint,
      });
    }
    rpcAttempted = true;
    const imported = await supabase.rpc('xp_import_ticket_inventory', {
      p_reward: rewardId,
      p_items: uploaded.map(({ delivery, fingerprint }) => ({ delivery, fingerprint })),
    });
    if (imported.error) throw new Error('La base rechazó el lote; no se activó la recompensa.');
    process.stdout.write(`${JSON.stringify({ ok: true, imported: uploaded.length, reward: reward.data.title })}\n`);
  } catch (error) {
    if (rpcAttempted && uploaded.length) {
      const reconciliation = await supabase.from('xp_inventory').select('delivery,fingerprint')
        .eq('reward_id', rewardId).in('fingerprint', uploaded.map((item) => item.fingerprint))
        .returns<{ delivery: string; fingerprint: string }[]>();
      if (!reconciliation.error && uploaded.every((item) =>
        reconciliation.data?.some((row) => row.delivery === item.delivery && row.fingerprint === item.fingerprint))) {
        process.stdout.write(`${JSON.stringify({ ok: true, imported: uploaded.length, reward: reward.data.title, reconciled: true })}\n`);
        return;
      }
    }
    if (uploaded.length)
      process.stderr.write('No se borraron assets privados automáticamente; revisalos antes de reintentar para no afectar otro import concurrente.\n');
    throw error;
  }
}

async function main(): Promise<void> {
  loadEnvFromProjectRoot();
  try {
    const input = args();
    if (input.command === 'preview') await preview(input.values);
    else await commit(input.values);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) await main();
