/**
 * Permisos del panel CRM (alineados con `server/src/permissions/crm-permissions.ts`).
 */
import type { AdminSectionId } from '../components/admin/crm/AdminShell';

export const CRM_PERMISSION_KEYS = [
  'points_manage',
  'site_edit',
  'events_create',
  'past_events_create',
  'events_edit_delete',
  'past_events_edit_delete',
  'email_campaigns',
  'email_campaign_sends',
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

export const CRM_PERMISSION_LABELS: Record<CrmPermissionKey, string> = {
  points_manage: 'Xplora Points: eventos, acciones y recompensas digitales',
  site_edit: 'Editar contenido del sitio (home, fotos, logo)',
  events_create: 'Crear eventos próximos',
  past_events_create: 'Crear contenido del Archivo (charlas)',
  events_edit_delete: 'Editar / eliminar eventos próximos',
  past_events_edit_delete: 'Editar / eliminar contenido del Archivo',
  email_campaigns: 'Email: redactar campañas (y ver envíos si aplica el rol)',
  email_campaign_sends: 'Email: registrar envíos y elegir audiencia (listas / todos)',
  database_full: 'Miembros + listas (vista completa)',
  database_members_only: 'Solo ver miembros (sin listas guardadas)',
  database_campaign_sends_only: 'Solo seguimiento de envíos (pestaña Email)',
  database_event_audience_only: 'Solo inscriptos por evento (pestaña Archivo)',
  database_export: 'Base de datos: exportar (CSV/JSON)',
  database_import: 'Base de datos: importar CSV (normaliza y upsert)',
  database_sql_read: 'Base de datos: consultas SQL (solo lectura)',
  contact_lists_manage: 'Listas de contactos: crear/editar/borrar y ver contactos',
  postulaciones_manage:
    'Postulaciones: ver leads de sponsors/empresas y solicitudes para sumarse a Xplora (incluye borrar registros)',
  staff_accounts_manage: 'Equipo — crear cuentas del panel y asignar permisos (excepto acceso total)',
  members_data_delete: 'Eliminar miembros del club (desde listados y audiencias)',
  access_total: 'Acceso total + otorgar acceso total a otros',
};

export function hasPermission(perms: readonly CrmPermissionKey[], key: CrmPermissionKey): boolean {
  if (perms.includes('access_total')) return true;
  return perms.includes(key);
}

export function hasAnyPermission(perms: readonly CrmPermissionKey[], keys: readonly CrmPermissionKey[]): boolean {
  if (perms.includes('access_total')) return true;
  return keys.some(k => perms.includes(k));
}

export function canSeeAdminSection(section: AdminSectionId, perms: readonly CrmPermissionKey[]): boolean {
  if (hasPermission(perms, 'access_total')) return true;
  switch (section) {
    case 'points':
      return hasPermission(perms, 'points_manage');
    case 'inicio':
      // Cualquier staff con al menos un permiso ve el panorama.
      return perms.length > 0;
    case 'sitio':
      return hasPermission(perms, 'site_edit');
    case 'data':
      return (
        canSeeAdminSection('points', perms) ||
        canSeeAdminSection('eventos', perms) ||
        canSeeAdminSection('comunidad', perms) ||
        canSeeAdminSection('campanas_email', perms) ||
        canSeeAdminSection('sponsors', perms) ||
        canSeeAdminSection('leads', perms) ||
        canSeeAdminSection('charlas', perms) ||
        canSeeAdminSection('equipo', perms)
      );
    case 'eventos':
      return hasAnyPermission(perms, ['events_create', 'events_edit_delete']);
    case 'charlas':
      return hasAnyPermission(perms, [
        'past_events_create',
        'past_events_edit_delete',
        'database_full',
        'database_event_audience_only',
      ]);
    case 'campanas_email':
      return hasAnyPermission(perms, [
        'email_campaigns',
        'email_campaign_sends',
        'database_full',
        'database_campaign_sends_only',
      ]);
    case 'comunidad':
    case 'database':
      return hasAnyPermission(perms, [
        'database_full',
        'database_members_only',
        'database_campaign_sends_only',
        'database_event_audience_only',
        'database_export',
        'database_import',
        'database_sql_read',
        'contact_lists_manage',
      ]);
    case 'equipo':
      return hasAnyPermission(perms, ['staff_accounts_manage']);
    case 'sponsors':
    case 'leads':
    case 'candidatos':
      return hasPermission(perms, 'postulaciones_manage');
    default:
      return false;
  }
}

/** Solo quien puede gestionar cuentas del equipo (incluye asignar acceso total). */
export function canManageStaffAccounts(perms: readonly CrmPermissionKey[]): boolean {
  return hasAnyPermission(perms, ['staff_accounts_manage', 'access_total']);
}

export function canGrantAccessTotal(perms: readonly CrmPermissionKey[]): boolean {
  return hasPermission(perms, 'access_total');
}
