import type { ReactNode } from 'react';
import { useSiteMedia } from '../../context/SiteMediaContext';
import { useMemberAuth } from '../../context/MemberAuthContext';
import { DEFAULT_LOGO_URL } from '../../lib/defaultsMedia';
import '../../styles/memberPremium.css';

export type MemberNavKey = 'overview' | 'perfil' | 'empleo' | 'eventos' | 'propuestas';

type Props = {
  active: MemberNavKey;
  children: ReactNode;
};

const NAV: { key: MemberNavKey; label: string; href: string }[] = [
  { key: 'overview', label: 'Mis Points', href: '/cuenta' },
  { key: 'perfil', label: 'Mi perfil', href: '/cuenta/perfil' },
  { key: 'empleo', label: 'Bolsa de empleo', href: '/empleo' },
  { key: 'eventos', label: 'Eventos', href: '/cuenta/eventos' },
  { key: 'propuestas', label: 'Propuestas', href: '/cuenta/propuestas' },
];

export function MemberShell({ active, children }: Props) {
  const { logoUrl } = useSiteMedia();
  const brandLogo = logoUrl || DEFAULT_LOGO_URL;
  const { signOut, account } = useMemberAuth();
  const benefits = active === 'overview' && new URLSearchParams(window.location.search).get('vista') === 'recompensas';
  const links = NAV.map((item) => <a key={item.key} href={item.href}
    className={active === item.key ? 'is-active' : undefined}
    aria-current={active === item.key ? 'page' : undefined}>{item.label}</a>);

  return (
    <div className="ma-app ma-premium">
      <a className="ma-skip" href="#member-content">Ir al contenido</a>
      <header className="ma-app__top">
        <a className="ma-app__brand" href="/" aria-label="Xplora">
          <img
            src={brandLogo}
            alt=""
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL;
            }}
          />
          <span>Xplora</span>
        </a>

        <details className="ma-app__menu">
          <summary aria-label="Menú de cuenta"><span aria-hidden="true">{(account?.firstName || account?.displayName || 'X').slice(0, 1).toUpperCase()}</span></summary>
          <nav className="ma-app__nav" aria-label="Menú de cuenta">{links}<button type="button" className="ma-app__out" onClick={signOut}>Cerrar sesión</button></nav>
        </details>

      </header>

      <nav className="ma-primary-nav" aria-label="Navegación principal">
        <a href="/cuenta" aria-current={active === 'overview' && !benefits ? 'page' : undefined}>Inicio</a>
        <a href="/cuenta/eventos" aria-current={active === 'eventos' ? 'page' : undefined}>Eventos</a>
        <a href="/cuenta?vista=recompensas" aria-current={benefits ? 'page' : undefined}>Beneficios</a>
      </nav>
      <main className="ma-app__main" id="member-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
