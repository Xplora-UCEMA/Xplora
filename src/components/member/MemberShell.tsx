import type { ReactNode } from 'react';
import { useSiteMedia } from '../../context/SiteMediaContext';
import { useMemberAuth } from '../../context/MemberAuthContext';
import { DEFAULT_LOGO_URL } from '../../lib/defaultsMedia';
import { MemberIcon } from './MemberIcon';
import '../../styles/memberPremium.css';

export type MemberNavKey = 'overview' | 'perfil' | 'empleo' | 'eventos' | 'propuestas';

type Props = {
  active: MemberNavKey;
  children: ReactNode;
};

type NavIcon = 'home' | 'calendar' | 'gift' | 'briefcase' | 'user' | 'bulb';

const NAV: { key: MemberNavKey | 'beneficios'; label: string; shortLabel: string; href: string; icon: NavIcon }[] = [
  { key: 'overview', label: 'Inicio', shortLabel: 'Inicio', href: '/cuenta', icon: 'home' },
  { key: 'eventos', label: 'Mis eventos', shortLabel: 'Eventos', href: '/cuenta/eventos', icon: 'calendar' },
  { key: 'beneficios', label: 'Points y beneficios', shortLabel: 'Points', href: '/cuenta?vista=recompensas', icon: 'gift' },
  { key: 'empleo', label: 'Bolsa de empleo', shortLabel: 'Empleo', href: '/empleo', icon: 'briefcase' },
  { key: 'perfil', label: 'Mi perfil', shortLabel: 'Perfil', href: '/cuenta/perfil', icon: 'user' },
  { key: 'propuestas', label: 'Propuestas', shortLabel: 'Ideas', href: '/cuenta/propuestas', icon: 'bulb' },
];

export function MemberShell({ active, children }: Props) {
  const { logoUrl } = useSiteMedia();
  const brandLogo = logoUrl || DEFAULT_LOGO_URL;
  const { signOut, account } = useMemberAuth();
  const pointsView = active === 'overview' && Boolean(new URLSearchParams(window.location.search).get('vista'));
  const isActive = (key: (typeof NAV)[number]['key']) =>
    key === 'beneficios' ? pointsView : active === key && !(key === 'overview' && pointsView);
  const initial = (account?.firstName || account?.displayName || account?.email || 'X').slice(0, 1).toUpperCase();
  const accountName = account?.firstName || account?.displayName || 'Mi cuenta';
  const renderLinks = (compact = false) => NAV.map((item) => (
    <a key={item.key} href={item.href} className={isActive(item.key) ? 'is-active' : undefined}
      aria-current={isActive(item.key) ? 'page' : undefined}>
      <MemberIcon name={item.icon} />
      <span>{compact ? item.shortLabel : item.label}</span>
    </a>
  ));

  return (
    <div className="ma-app ma-premium">
      <a className="ma-skip" href="#member-content">Ir al contenido</a>

      <aside className="mh-sidebar" aria-label="Cuenta Xplora">
        <a className="ma-app__brand" href="/" aria-label="Xplora">
          <img src={brandLogo} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL; }} />
          <span>Xplora</span>
        </a>
        <div className="mh-sidebar__account">
          <span className="mh-avatar" aria-hidden="true">{account?.avatarUrl ? <img src={account.avatarUrl} alt="" /> : initial}</span>
          <div><strong>{accountName}</strong><small>{account?.email}</small></div>
        </div>
        <nav className="mh-sidebar__nav" aria-label="Navegación de cuenta">{renderLinks()}</nav>
        <div className="mh-sidebar__footer">
          <a href="/">Volver a Xplora <span aria-hidden="true">↗</span></a>
          <button type="button" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>

      <header className="ma-app__top">
        <a className="ma-app__brand" href="/" aria-label="Xplora">
          <img
            src={brandLogo}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL;
            }}
          />
          <span>Xplora</span><small>Mi cuenta</small>
        </a>

        <details className="ma-app__menu">
          <summary aria-label="Menú de cuenta"><span className="mh-avatar" aria-hidden="true">{account?.avatarUrl ? <img src={account.avatarUrl} alt="" /> : initial}</span></summary>
          <nav className="ma-app__nav" aria-label="Menú de cuenta">
            <div className="mh-menu-account"><strong>{accountName}</strong><small>{account?.email}</small></div>
            {renderLinks()}
            <a href="/">Volver a Xplora</a>
            <button type="button" className="ma-app__out" onClick={signOut}>Cerrar sesión</button>
          </nav>
        </details>
      </header>

      <main className="ma-app__main" id="member-content" tabIndex={-1}>{children}</main>

      <nav className="mh-bottom-nav" aria-label="Navegación principal">
        {renderLinks(true).slice(0, 5)}
      </nav>
    </div>
  );
}
