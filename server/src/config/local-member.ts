import type { AppConfig } from "./env.js";

/** Local-only settings; never rotate the signing key of the existing server. */
export function createLocalMemberConfig(source: AppConfig, secret: string): AppConfig {
  if (secret.length < 64) throw new Error("Falta un secreto local seguro para las sesiones.");
  if (!source.supabaseUrl || !source.supabaseServiceRoleKey)
    throw new Error("Falta la configuración de Supabase del servidor.");
  if (!source.resend) throw new Error("Falta la configuración de Resend del servidor.");
  return {
    ...source,
    nodeEnv: "development",
    port: 8788,
    publicSiteUrl: "http://127.0.0.1:5174",
    memberJwtSecret: secret,
    pointsEnabled: true,
  };
}
