import { config as loadDotenv } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { GoogleConfig } from '../services/google-central/oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Sube directorios hasta encontrar el package.json del front (raíz del repo). */
function findProjectRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 16; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === 'xplora-landing') return dir;
      } catch {
        /* ignorar JSON inválido */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Carga .env desde la raíz (válido con tsx server/src/… y con node dist-server/…). */
export function loadEnvFromProjectRoot(): void {
  const root = findProjectRoot(__dirname);
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    loadDotenv({ path: envPath, override: true });
  } else {
    loadDotenv({ override: true });
  }
}

function firstNonEmpty(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== '') return v.trim();
  }
  return '';
}

export interface AppConfig {
  readonly googleForms?: GoogleConfig | null;
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly port: number;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  /** Opcional: escrituras admin sin depender de RLS (recomendado en producción). */
  readonly supabaseServiceRoleKey: string | null;
  readonly cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  } | null;
  /**
   * Resend: único canal de envío de campañas (`dispatch`). Requiere `RESEND_API_KEY` (o `RESEND_KEY`) en `.env` en la raíz del repo.
   * Remitente: `RESEND_FROM` o `MAIL_FROM` (default `onboarding@resend.dev` para pruebas).
   */
  readonly resend: {
    apiKey: string;
    from: string;
    fromName: string | null;
  } | null;
  /**
   * Integración Meta Graph API (Instagram). Solo en server; no exponer en el front.
   */
  readonly meta: {
    /** Ej: 'v20.0'. */
    graphApiVersion: string;
    /** IG User ID (cuenta profesional conectada). */
    instagramUserId: string;
    /**
     * Access token (ideal: long-lived). Debe incluir permisos para leer media/insights.
     * Guardar en `.env` como secreto.
     */
    accessToken: string;
  } | null;
  /** Origen público del front (links de confirmación de cuenta). */
  readonly publicSiteUrl: string;
  /** Desactivar para probar sólo acceso antes de instalar la migración de Points. */
  readonly pointsEnabled: boolean;
  /** Secreto HS256 para JWT de miembros (cuenta / bolsa). */
  readonly memberJwtSecret: string | null;
  /** Secreto HS256 para enlaces individuales de eliminación de contactos. */
  readonly unsubscribeTokenSecret: string | null;
  readonly paths: {
    /** Carpeta `dist` del front (Vite) */
    webDist: string;
  };
}

function resolveWebDist(): string {
  const fromCwd = path.join(process.cwd(), 'dist');
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.join(findProjectRoot(__dirname), 'dist');
}

/**
 * Única lectura de process.env (inyectable en tests con env mock).
 * Open/closed: nuevas keys → ampliar AppConfig, no tocar servicios a boleo.
 */
export function getAppConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV as AppConfig['nodeEnv']) || 'development';
  const port = Number(process.env.PORT || process.env.API_PORT || 8787);

  const supabaseUrl = firstNonEmpty('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseAnonKey = firstNonEmpty('SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY');
  const supabaseServiceRoleKey = firstNonEmpty('SUPABASE_SERVICE_ROLE_KEY') || null;

  const cName = firstNonEmpty('CLOUDINARY_CLOUD_NAME');
  const cKey = firstNonEmpty('CLOUDINARY_API_KEY');
  const cSecret = firstNonEmpty('CLOUDINARY_API_SECRET', 'CLOUDINARY_CLIENT_SECRET');

  const cloudinary =
    cName && cKey && cSecret
      ? { cloudName: cName, apiKey: cKey, apiSecret: cSecret }
      : null;

  const resendKey = firstNonEmpty('RESEND_API_KEY', 'RESEND_KEY');
  /** Default de Resend para pruebas sin dominio propio. */
  const defaultResendFrom = 'onboarding@resend.dev';
  const resendFrom = firstNonEmpty('RESEND_FROM', 'MAIL_FROM') || defaultResendFrom;
  const resendFromName = firstNonEmpty('RESEND_FROM_NAME', 'MAIL_FROM_NAME') || null;
  const resend =
    resendKey
      ? {
          apiKey: resendKey,
          from: resendFrom,
          fromName: resendFromName,
        }
      : null;

  const igUserId = firstNonEmpty('META_IG_USER_ID', 'IG_USER_ID');
  const metaAccessToken = firstNonEmpty('META_ACCESS_TOKEN', 'IG_ACCESS_TOKEN');
  const metaVersion = firstNonEmpty('META_GRAPH_VERSION') || 'v20.0';
  const meta = igUserId && metaAccessToken ? { instagramUserId: igUserId, accessToken: metaAccessToken, graphApiVersion: metaVersion } : null;

  const publicSiteUrl =
    firstNonEmpty('PUBLIC_SITE_URL', 'SITE_URL', 'VITE_SITE_URL') ||
    (nodeEnv === 'production' ? 'https://xploraucema.com' : 'http://localhost:5173');

  const memberJwtSecret =
    firstNonEmpty('MEMBER_JWT_SECRET', 'JWT_SECRET') ||
    (nodeEnv === 'production' ? null : 'dev-member-jwt-secret-change-me');
  const unsubscribeTokenSecret = firstNonEmpty('UNSUBSCRIBE_TOKEN_SECRET') || memberJwtSecret;

  return {
    googleForms: readGoogleConfig(nodeEnv),
    nodeEnv: nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development',
    port: Number.isFinite(port) && port > 0 ? port : 8787,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    cloudinary,
    resend,
    meta,
    publicSiteUrl,
    pointsEnabled: process.env.XPLORA_POINTS_ENABLED !== 'false',
    memberJwtSecret,
    unsubscribeTokenSecret,
    paths: { webDist: resolveWebDist() },
  };
}

function readGoogleConfig(mode: string): GoogleConfig | null {
  const clientId = firstNonEmpty('GOOGLE_FORMS_CLIENT_ID');
  const clientSecret = firstNonEmpty('GOOGLE_FORMS_CLIENT_SECRET');
  const redirectUri = firstNonEmpty('GOOGLE_FORMS_REDIRECT_URI');
  const encryptionKey = firstNonEmpty('GOOGLE_FORMS_ENCRYPTION_KEY');
  const accountEmail = firstNonEmpty('GOOGLE_FORMS_ACCOUNT_EMAIL').toLowerCase();
  if (![clientId, clientSecret, redirectUri, encryptionKey, accountEmail].some(Boolean)) return null;
  let validUrl = false;
  try {
    const url = new URL(redirectUri);
    validUrl = !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === '/api/integrations/points/google/callback' && (url.protocol === 'https:' ||
        (mode !== 'production' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)));
  } catch { /* Fail closed without printing configuration. */ }
  if (!clientId || !clientSecret || !validUrl || Buffer.from(encryptionKey, 'base64').length !== 32 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail))
    throw new Error('La configuración privada de Google Forms está incompleta o no es válida.');
  return { clientId, clientSecret, redirectUri, encryptionKey, accountEmail,
    workerEnabled: process.env.GOOGLE_FORMS_WORKER_ENABLED === 'true' };
}
