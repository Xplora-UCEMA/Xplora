/**
 * Permisos del panel CRM (strings estables). `access_total` implica todos los demás.
 */
export const CRM_PERMISSION_KEYS = [
  'points_manage',
  'site_edit',
  'events_create',
  'past_events_create',
  'events_edit_delete',
  'past_events_edit_delete',
  'email_campaigns',
  'email_campaign_sends',
  'analytics',
  'database_full',
  'database_members_only',
  'database_campaign_sends_only',
  'database_event_audience_only',
  'database_export',
  'database_import',
  'database_sql_read',
  'contact_lists_manage',
  'postulaciones_manage',
  'staff_accounts_manage',
  'members_data_delete',
  'access_total',
] as const;

export type CrmPermissionKey = (typeof CRM_PERMISSION_KEYS)[number];

const SET = new Set<string>(CRM_PERMISSION_KEYS);

export function isValidPermissionKey(s: string): s is CrmPermissionKey {
  return SET.has(s);
}

/** Claves antiguas guardadas en `crm_staff.permissions` antes del rename a postulaciones_manage. */
const LEGACY_PERMISSION_KEYS: Record<string, CrmPermissionKey> = {
  candidatos_manage: 'postulaciones_manage',
};

/** Normaliza JSONB: array de strings, solo claves conocidas, sin duplicados. */
export function normalizePermissionList(raw: unknown): CrmPermissionKey[] {
  if (!Array.isArray(raw)) return [];
  const out: CrmPermissionKey[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const mapped = LEGACY_PERMISSION_KEYS[x] ?? x;
    if (!isValidPermissionKey(mapped) || seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}

export function hasPermission(perms: readonly CrmPermissionKey[], key: CrmPermissionKey): boolean {
  if (perms.includes('access_total')) return true;
  return perms.includes(key);
}

export function hasAnyPermission(perms: readonly CrmPermissionKey[], keys: readonly CrmPermissionKey[]): boolean {
  if (perms.includes('access_total')) return true;
  return keys.some(k => perms.includes(k));
}

/** Solo quien tiene access_total puede asignar access_total a otros. */
export function canAssignPermissions(
  actor: readonly CrmPermissionKey[],
  target: readonly CrmPermissionKey[],
): boolean {
  if (target.includes('access_total') && !hasPermission(actor, 'access_total')) {
    return false;
  }
  return true;
}

/** Crear cuentas y asignar permisos a otros (incluye `access_total`). */
export function canManageStaffAccounts(perms: readonly CrmPermissionKey[]): boolean {
  return hasAnyPermission(perms, ['staff_accounts_manage', 'access_total']);
}
