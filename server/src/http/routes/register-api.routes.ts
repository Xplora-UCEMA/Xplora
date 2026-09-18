/**
 * Registro central de rutas `/api/*`.
 *
 * Orden conceptual: **salud** → **catálogo público** (anon) → **auth** → **admin CRUD** (JWT) → **upload**.
 * Los handlers de admin reciben el JWT ya validado por `requireAuth`.
 */
import type { Express } from 'express';
import { registerPointsRoutes } from '../controllers/points.controller.js';
import rateLimit from 'express-rate-limit';
import type { AppConfig } from '../../config/env.js';
import type { IAuthService } from '../../services/contracts/auth.interface.js';
import type { IImageStorageService } from '../../services/contracts/image-storage.interface.js';
import { createHealthHandler } from '../controllers/health.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { createUploadHandler } from '../controllers/upload.controller.js';
import { createLoginHandler, createLogoutHandler } from '../controllers/auth-login.controller.js';
import {
  createPublicListHandler,
  createPublicSiteMediaHandler,
} from '../controllers/public-catalog.controller.js';
import { createPublicSubscribeHandler } from '../controllers/public-subscribe.controller.js';
import {
  createPublicContactUnsubscribeDeleteHandler,
  createPublicContactUnsubscribePageHandler,
} from '../controllers/public-contact-unsubscribe.controller.js';
import { createPublicCandidatosHandler } from '../controllers/public-candidatos.controller.js';
import { createPublicSponsorsLeadHandler } from '../controllers/public-sponsors.controller.js';
import { createPublicStartupDayWaitlistHandler } from '../controllers/public-startup-day-waitlist.controller.js';
import { createPublicWalletSettlementCheckHandler } from '../controllers/public-wallet-settlement.controller.js';
import { settleWalletCharge } from '../../services/wallet-settlement.service.js';
import { uploadSingleCv } from '../middleware/upload.middleware.js';
import {
  createAdminInsertHandler,
  createAdminUpdateHandler,
  createAdminDeleteHandler,
} from '../controllers/admin-resources.controller.js';
import {
  createAdminMembersListHandler,
  createAdminMemberDeleteHandler,
} from '../controllers/admin-members.controller.js';
import {
  createAdminDbExportUsuariosHandler,
  createAdminDbImportUsuariosCsvHandler,
  createAdminDbSqlSelectHandler,
} from '../controllers/admin-db-tools.controller.js';
import {
  createEmailCampaignInsertHandler,
  createEmailCampaignsListHandler,
  createEmailCampaignLogEnviosHandler,
  createEmailCampaignAudienceHandler,
  createEmailCampaignDispatchStartHandler,
  createEmailCampaignDispatchJobStatusHandler,
} from '../controllers/admin-email-campaigns.controller.js';
import { createSiteMediaUpsertHandler } from '../controllers/site-media-admin.controller.js';
import { createRequireAuthMiddleware } from '../middleware/require-auth.middleware.js';
import { uploadSingleImage, uploadSingleSpreadsheet } from '../middleware/upload.middleware.js';
import { createAdminLumaCsvImportHandler } from '../controllers/admin-luma-csv.controller.js';
import { createAdminEventosListHandler } from '../controllers/admin-eventos-list.controller.js';
import { createAdminEventoInscripcionesHandler } from '../controllers/admin-evento-inscripciones.controller.js';
import { createAdminAnalyticsHandler } from '../controllers/admin-analytics.controller.js';
import { createAdminInstagramReelsAnalyticsHandler, createAdminInstagramReelsHandler } from '../controllers/admin-instagram.controller.js';
import { createAdminCandidatosDeleteHandler, createAdminCandidatosListHandler } from '../controllers/admin-candidatos.controller.js';
import { createAdminSponsorsLeadListHandler } from '../controllers/admin-sponsors.controller.js';
import { createAdminStartupDayWaitlistListHandler } from '../controllers/admin-startup-day-waitlist.controller.js';
import {
  createContactListAppendMembersHandler,
  createContactListCreateHandler,
  createContactListDeleteHandler,
  createContactListDetailHandler,
  createContactListPatchHandler,
  createContactListsListHandler,
  createMyContactListsListHandler,
} from '../controllers/admin-contact-lists.controller.js';
import { createAuthMeHandler } from '../controllers/auth-me.controller.js';
import { createAuthChangePasswordHandler } from '../controllers/auth-change-password.controller.js';
import {
  createAdminCrmStaffCreateHandler,
  createAdminCrmStaffDeleteHandler,
  createAdminCrmStaffListHandler,
  createAdminCrmStaffPatchHandler,
  createAdminCrmStaffResetPasswordHandler,
} from '../controllers/admin-crm-staff.controller.js';
import { createLoadStaffProfileMiddleware } from '../middleware/load-staff.middleware.js';
import { createRequireAnyCrmPermission } from '../middleware/require-crm-permission.middleware.js';
import type { CrmPermissionKey } from '../../permissions/crm-permissions.js';
import { createRequireMemberAuthMiddleware } from '../middleware/require-member-auth.middleware.js';
import {
  createMemberConfirmHandler,
  createMemberLoginRequestHandler,
  createMemberLoginVerifyHandler,
  createMemberRegisterHandler,
} from '../controllers/member-auth.controller.js';
import {
  createMemberAvatarUploadHandler,
  createMemberCvUploadHandler,
  createMemberMeHandler,
  createMemberPatchMeHandler,
} from '../controllers/member-profile.controller.js';
import { createMemberJobsListHandler } from '../controllers/member-jobs.controller.js';
import {
  createMemberProposalCreateHandler,
  createMemberProposalListHandler,
} from '../controllers/member-proposals.controller.js';
import {
  memberConfirmLimiter,
  memberGlobalLimiter,
  memberJsonGuard,
  memberLoginRequestLimiter,
  memberLoginVerifyLimiter,
  memberNoStoreHeaders,
  memberProposalLimiter,
  memberReadLimiter,
  memberRegisterLimiter,
  memberUploadLimiter,
  memberWriteLimiter,
} from '../middleware/member-security.middleware.js';

export interface ApiRoutesDeps {
  config: AppConfig;
  auth: IAuthService;
  imageStorage: IImageStorageService | null;
}

/** Monta todas las rutas `/api/*`. */
export function registerApiRoutes(app: Express, deps: ApiRoutesDeps): void {
  const requireAuth = createRequireAuthMiddleware(deps.auth);
  const loadStaff = createLoadStaffProfileMiddleware(deps.config);
  const perm = (keys: readonly CrmPermissionKey[]) => createRequireAnyCrmPermission(keys);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const emailDispatchLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 24,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get('/api/health', createHealthHandler(deps.config));

  // Endpoints de probe KYNCODE: errores de runtime intencionales para validar captura en prod.
  // Remover cuando el agente termine de validar.
  app.get(
    '/api/__kyncode-probe/:n',
    asyncHandler(async (req) => {
      const n = Number(req.params.n);
      switch (n) {
        case 1: {
          const err = new Error(
            'KYNCODE probe #1: unhandled async failure in public waitlist enqueue — job accepted but worker never persisted the row.',
          );
          err.name = 'WaitlistEnqueueError';
          Object.assign(err, { code: 'WAITLIST_ENQUEUE_FAILED', severity: 'error', requiresAgentFix: true });
          throw err;
        }
        case 2: {
          // Bug de producción: se asume que el lead siempre trae billing.
          const lead = null as { billing: { planId: string } } | null;
          const planId = lead!.billing.planId;
          void planId;
          return;
        }
        case 3: {
          // Usa el servicio real de settlement (roto a propósito hasta que el agente lo arregle).
          settleWalletCharge({
            chargeId: 'chg_live_xplora_settlement',
            amountCents: 14_900,
            currency: 'ARS',
            walletBalanceCents: 20_000,
          });
          return;
        }
        case 4: {
          // Fallo grave: token de sesión de miembro firmado con secreto vacío → auth rota en runtime.
          const memberJwtSecret = '';
          if (memberJwtSecret.length < 32) {
            const err = new Error(
              'CRITICAL: MEMBER_JWT_SECRET missing/too short at runtime while issuing member session. Auth signing path is broken and must be fixed before traffic can resume.',
            );
            err.name = 'MemberAuthConfigError';
            Object.assign(err, {
              code: 'MEMBER_JWT_SECRET_INVALID',
              severity: 'critical',
              requiresAgentFix: true,
            });
            throw err;
          }
          return;
        }
        default:
          throw new Error(`KYNCODE probe: índice inválido (${String(req.params.n)})`);
      }
    }),
  );

  const subscribeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const unsubscribeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ── Público (lecturas para el sitio; anon Supabase) ─────────────────────
  app.post('/api/public/subscribe', subscribeLimiter, createPublicSubscribeHandler(deps.config));
  app.get(
    '/api/public/unsubscribe',
    unsubscribeLimiter,
    createPublicContactUnsubscribePageHandler(deps.config),
  );
  app.post(
    '/api/public/unsubscribe',
    unsubscribeLimiter,
    createPublicContactUnsubscribeDeleteHandler(deps.config),
  );
  app.post('/api/public/candidatos', subscribeLimiter, uploadSingleCv, createPublicCandidatosHandler(deps.config));
  app.post('/api/public/sponsors', subscribeLimiter, createPublicSponsorsLeadHandler(deps.config));
  app.post(
    '/api/public/startup-day/waitlist',
    subscribeLimiter,
    createPublicStartupDayWaitlistHandler(deps.config),
  );
  app.get('/api/public/wallet/settlement-check', createPublicWalletSettlementCheckHandler());

  app.get('/api/public/eventos', createPublicListHandler(deps.config, 'eventos'));
  app.get('/api/public/charlas', createPublicListHandler(deps.config, 'charlas'));
  app.get('/api/public/site-media', createPublicSiteMediaHandler(deps.config));

  // ── Miembros (cuenta comunidad: registro / código / JWT propio) ─────────
  const requireMember = createRequireMemberAuthMiddleware(deps.config);

  app.use('/api/member', memberGlobalLimiter, memberNoStoreHeaders, memberJsonGuard);
  registerPointsRoutes(app, deps.config, [requireAuth, loadStaff, perm(['points_manage'])]);

  app.post('/api/member/register', memberRegisterLimiter, createMemberRegisterHandler(deps.config));
  app.post('/api/member/confirm', memberConfirmLimiter, createMemberConfirmHandler(deps.config));
  app.post(
    '/api/member/login/request',
    memberLoginRequestLimiter,
    createMemberLoginRequestHandler(deps.config),
  );
  app.post(
    '/api/member/login/verify',
    memberLoginVerifyLimiter,
    createMemberLoginVerifyHandler(deps.config),
  );
  app.get('/api/member/me', memberReadLimiter, requireMember, createMemberMeHandler(deps.config));
  app.patch(
    '/api/member/me',
    memberWriteLimiter,
    requireMember,
    createMemberPatchMeHandler(deps.config),
  );
  app.post(
    '/api/member/me/avatar',
    memberUploadLimiter,
    requireMember,
    uploadSingleImage,
    createMemberAvatarUploadHandler(deps.config),
  );
  app.post(
    '/api/member/me/cv',
    memberUploadLimiter,
    requireMember,
    uploadSingleCv,
    createMemberCvUploadHandler(deps.config),
  );
  app.get(
    '/api/member/jobs',
    memberReadLimiter,
    requireMember,
    createMemberJobsListHandler(deps.config),
  );
  app.get(
    '/api/member/proposals',
    memberReadLimiter,
    requireMember,
    createMemberProposalListHandler(deps.config),
  );
  app.post(
    '/api/member/proposals',
    memberWriteLimiter,
    memberProposalLimiter,
    requireMember,
    createMemberProposalCreateHandler(deps.config),
  );

  // ── Auth CRM (login sin Bearer; logout valida sesión) ───────────────────
  app.post('/api/auth/login', loginLimiter, createLoginHandler(deps.config));
  app.post('/api/auth/logout', requireAuth, createLogoutHandler());
  app.get('/api/auth/me', requireAuth, createAuthMeHandler(deps.config));
  app.post(
    '/api/auth/change-password',
    loginLimiter,
    requireAuth,
    loadStaff,
    createAuthChangePasswordHandler(deps.config),
  );

  // ── Permisos CRM (middleware compuesto: auth → staff → permiso concreto) ─
  const evCatalog = perm([
    'events_create',
    'events_edit_delete',
    'past_events_create',
    'past_events_edit_delete',
  ]);
  const eventsCreate = perm(['events_create']);
  const eventsMutate = perm(['events_edit_delete']);
  const pastCreate = perm(['past_events_create']);
  const pastMutate = perm(['past_events_edit_delete']);
  const siteEdit = perm(['site_edit']);
  const campaigns = perm(['email_campaigns']);
  /** Listar campañas y registrar envíos: marketing o rol “solo envíos” (nuevo o legacy). */
  const campaignListOrLog = perm([
    'email_campaigns',
    'email_campaign_sends',
    'database_full',
    'database_campaign_sends_only',
  ]);
  const analyticsPerm = perm(['analytics']);
  const dbMembersList = perm([
    'database_full',
    'database_members_only',
    'database_campaign_sends_only',
    'database_event_audience_only',
  ]);
  const dbAudience = perm(['database_full', 'database_event_audience_only']);
  /** Audiencia de una campaña (mails): marketing o rol de envíos. */
  const emailCampaignAudience = perm([
    'email_campaigns',
    'email_campaign_sends',
    'database_full',
    'database_campaign_sends_only',
  ]);
  const memberDelete = perm(['members_data_delete']);
  const cloudUpload = perm([
    'site_edit',
    'events_edit_delete',
    'past_events_edit_delete',
  ]);
  const staffManage = perm(['staff_accounts_manage', 'access_total']);
  const postulacionesManage = perm(['postulaciones_manage', 'access_total']);
  const contactLists = perm(['database_full', 'contact_lists_manage']);
  const dbExport = perm(['database_full', 'database_export']);
  const dbImport = perm(['database_full', 'database_import']);
  const dbSqlRead = perm(['database_full', 'database_sql_read']);

  // ── Admin CRUD (JWT del usuario; respeta RLS) ──────────────────────────
  app.get('/api/admin/eventos', requireAuth, loadStaff, evCatalog, createAdminEventosListHandler(deps.config));
  app.get(
    '/api/admin/eventos/:eventoId/inscripciones',
    requireAuth,
    loadStaff,
    dbAudience,
    createAdminEventoInscripcionesHandler(deps.config),
  );
  app.post('/api/admin/eventos', requireAuth, loadStaff, eventsCreate, createAdminInsertHandler(deps.config, 'eventos'));
  app.patch('/api/admin/eventos/:id', requireAuth, loadStaff, eventsMutate, createAdminUpdateHandler(deps.config, 'eventos'));
  app.delete('/api/admin/eventos/:id', requireAuth, loadStaff, eventsMutate, createAdminDeleteHandler(deps.config, 'eventos'));
  app.post(
    '/api/admin/eventos/:eventoId/luma-csv',
    requireAuth,
    loadStaff,
    eventsMutate,
    uploadSingleSpreadsheet,
    createAdminLumaCsvImportHandler(deps.config),
  );

  app.post('/api/admin/charlas', requireAuth, loadStaff, pastCreate, createAdminInsertHandler(deps.config, 'charlas'));
  app.patch('/api/admin/charlas/:id', requireAuth, loadStaff, pastMutate, createAdminUpdateHandler(deps.config, 'charlas'));
  app.delete('/api/admin/charlas/:id', requireAuth, loadStaff, pastMutate, createAdminDeleteHandler(deps.config, 'charlas'));

  app.put('/api/admin/site-media', requireAuth, loadStaff, siteEdit, createSiteMediaUpsertHandler(deps.config));

  app.get('/api/admin/analytics', requireAuth, loadStaff, analyticsPerm, createAdminAnalyticsHandler(deps.config));
  app.get('/api/admin/instagram/reels', requireAuth, loadStaff, analyticsPerm, createAdminInstagramReelsHandler(deps.config));
  app.get('/api/admin/instagram/reels/analytics', requireAuth, loadStaff, analyticsPerm, createAdminInstagramReelsAnalyticsHandler(deps.config));

  app.get('/api/admin/members', requireAuth, loadStaff, dbMembersList, createAdminMembersListHandler(deps.config));
  app.delete('/api/admin/members/:id', requireAuth, loadStaff, memberDelete, createAdminMemberDeleteHandler(deps.config));

  // ── Database tools (export / import / SQL select) ──────────────────────
  app.get(
    '/api/admin/db/export/usuarios',
    requireAuth,
    loadStaff,
    dbExport,
    createAdminDbExportUsuariosHandler(deps.config),
  );
  app.post(
    '/api/admin/db/import/usuarios-csv',
    requireAuth,
    loadStaff,
    dbImport,
    uploadSingleSpreadsheet,
    createAdminDbImportUsuariosCsvHandler(deps.config),
  );
  app.post(
    '/api/admin/db/sql/select',
    requireAuth,
    loadStaff,
    dbSqlRead,
    createAdminDbSqlSelectHandler(deps.config),
  );

  app.get('/api/admin/contact-lists', requireAuth, loadStaff, contactLists, createContactListsListHandler(deps.config));
  // Para campañas: selector de "mis listas" (audiencias guardadas).
  app.get(
    '/api/admin/contact-lists/mine',
    requireAuth,
    loadStaff,
    perm(['email_campaigns', 'email_campaign_sends', 'database_full', 'database_campaign_sends_only']),
    createMyContactListsListHandler(deps.config),
  );
  app.post('/api/admin/contact-lists', requireAuth, loadStaff, contactLists, createContactListCreateHandler(deps.config));
  app.get('/api/admin/contact-lists/:id', requireAuth, loadStaff, contactLists, createContactListDetailHandler(deps.config));
  app.post(
    '/api/admin/contact-lists/:id/members',
    requireAuth,
    loadStaff,
    contactLists,
    createContactListAppendMembersHandler(deps.config),
  );
  app.patch('/api/admin/contact-lists/:id', requireAuth, loadStaff, contactLists, createContactListPatchHandler(deps.config));
  app.delete('/api/admin/contact-lists/:id', requireAuth, loadStaff, contactLists, createContactListDeleteHandler(deps.config));

  app.post('/api/admin/email-campaigns', requireAuth, loadStaff, campaigns, createEmailCampaignInsertHandler(deps.config));
  app.get('/api/admin/email-campaigns', requireAuth, loadStaff, campaignListOrLog, createEmailCampaignsListHandler(deps.config));
  app.post(
    '/api/admin/email-campaigns/:id/envios',
    requireAuth,
    loadStaff,
    campaignListOrLog,
    createEmailCampaignLogEnviosHandler(deps.config),
  );
  app.post(
    '/api/admin/email-campaigns/:id/dispatch/start',
    emailDispatchLimiter,
    requireAuth,
    loadStaff,
    campaignListOrLog,
    createEmailCampaignDispatchStartHandler(deps.config),
  );
  app.get(
    '/api/admin/email-campaign-dispatch/jobs/:jobId',
    requireAuth,
    loadStaff,
    campaignListOrLog,
    createEmailCampaignDispatchJobStatusHandler(deps.config),
  );
  app.get(
    '/api/admin/email-campaigns/:id/audience',
    requireAuth,
    loadStaff,
    emailCampaignAudience,
    createEmailCampaignAudienceHandler(deps.config),
  );

  app.get('/api/admin/crm-staff', requireAuth, loadStaff, createAdminCrmStaffListHandler(deps.config));
  app.post('/api/admin/crm-staff', requireAuth, loadStaff, staffManage, createAdminCrmStaffCreateHandler(deps.config));
  app.patch('/api/admin/crm-staff/:id', requireAuth, loadStaff, createAdminCrmStaffPatchHandler(deps.config));
  app.delete('/api/admin/crm-staff/:id', requireAuth, loadStaff, staffManage, createAdminCrmStaffDeleteHandler(deps.config));
  app.post(
    '/api/admin/crm-staff/:id/reset-password',
    requireAuth,
    loadStaff,
    staffManage,
    createAdminCrmStaffResetPasswordHandler(deps.config),
  );

  app.get('/api/admin/candidatos', requireAuth, loadStaff, postulacionesManage, createAdminCandidatosListHandler(deps.config));
  app.delete(
    '/api/admin/candidatos/:id',
    requireAuth,
    loadStaff,
    postulacionesManage,
    createAdminCandidatosDeleteHandler(deps.config),
  );
  app.get('/api/admin/sponsors', requireAuth, loadStaff, postulacionesManage, createAdminSponsorsLeadListHandler(deps.config));
  app.get(
    '/api/admin/startup-day/waitlist',
    requireAuth,
    loadStaff,
    postulacionesManage,
    createAdminStartupDayWaitlistListHandler(deps.config),
  );

  // ── Subida de imágenes (Cloudinary) ─────────────────────────────────────
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/cloudinary-upload', uploadLimiter);
  app.post(
    '/api/cloudinary-upload',
    requireAuth,
    loadStaff,
    cloudUpload,
    uploadSingleImage,
    createUploadHandler({
      config: deps.config,
      imageStorage: deps.imageStorage,
    }),
  );
}
