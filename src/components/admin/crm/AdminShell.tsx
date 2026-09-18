/**
 * Shell del panel admin: marca Xplora, nav de secciones, Ver sitio / Salir.
 */
import type { ReactNode } from 'react';
import { crm } from './crmTheme';

/** Identificador de pestaña; debe coincidir con las rutas internas en `Admin.tsx`. */
export type AdminSectionId =
  | 'points'
  | 'inicio'
  | 'sitio'
  | 'data'
  | 'eventos'
  | 'comunidad'
  | 'campanas_email'
  | 'sponsors'
  | 'leads'
  | 'charlas'
  | 'equipo'
  /** @deprecated alias → comunidad */
  | 'database'
  /** @deprecated alias → leads */
  | 'candidatos';

/** Secciones que viven dentro del hub Data. */
export type AdminDataTabId =
  | 'points'
  | 'eventos'
  | 'comunidad'
  | 'campanas_email'
  | 'sponsors'
  | 'leads'
  | 'charlas'
  | 'equipo';

export interface AdminNavItem {
  id: AdminSectionId;
  title: string;
  desc: string;
}

interface Props {
  section: AdminSectionId;
  onSection: (id: AdminSectionId) => void;
  navItems: AdminNavItem[];
  goToSite: () => void;
  signOut: () => void;
  headerExtra?: ReactNode;
  staffDisplayName?: string;
  children: ReactNode;
}

export default function AdminShell({
  section,
  onSection,
  navItems,
  goToSite,
  signOut,
  headerExtra,
  staffDisplayName,
  children,
}: Props) {
  return (
    <div className="xplora-admin-root" style={crm.layoutRoot}>
      <header className="xplora-admin-header" style={crm.topBar}>
        <div className="xplora-admin-top-inner" style={crm.topBarInner}>
          <button
            type="button"
            className="xplora-admin-brand-wrap"
            title="Ir al inicio del panel"
            aria-label="Ir al inicio del panel"
            style={{
              ...crm.brandCluster,
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
            onClick={() => onSection('inicio')}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <span style={crm.brandMark}>Xplora</span>
            <span style={crm.brandSub}>ops</span>
          </button>

          <nav className="xplora-admin-segment-wrap" style={crm.segmentRail} aria-label="Secciones del panel">
            <div className="xplora-admin-segment-scroll">
              <div className="xplora-admin-segment-track" style={crm.navTrack}>
                {navItems.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={`${item.title} — ${item.desc}`}
                      className={`xplora-admin-seg${active ? ' is-active' : ''}`}
                      style={crm.navBtn(active)}
                      onClick={() => onSection(item.id)}
                    >
                      <span style={crm.segmentLabel}>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="xplora-admin-user-wrap" style={crm.userCluster}>
            {headerExtra}
            {staffDisplayName?.trim() ? (
              <span
                className="xplora-admin-staff-display-name"
                style={crm.staffNameInHeader}
                title={staffDisplayName.trim()}
              >
                {staffDisplayName.trim()}
              </span>
            ) : null}
            <button type="button" className="xplora-admin-top-btn-site" style={crm.topLinkBtn} onClick={goToSite}>
              Ver sitio
            </button>
            <button type="button" className="xplora-admin-top-btn-out" style={crm.topDangerBtn} onClick={signOut}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="xplora-admin-main-stage" style={crm.mainStage}>
        <div className="xplora-admin-content-card" style={crm.contentCard}>
          {children}
        </div>
      </main>
    </div>
  );
}
