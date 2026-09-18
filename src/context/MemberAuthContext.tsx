import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getMemberToken,
  memberLoadMe,
  setMemberToken,
  type MemberEventItem,
  type MemberProfile,
} from '../lib/memberAuth';
import { isMemberHubPreview, MEMBER_HUB_PREVIEW_ACCOUNT } from '../lib/memberHubPreview';

type MemberAuthState = {
  loading: boolean;
  sessionError: string;
  account: MemberProfile | null;
  events: MemberEventItem[];
  refresh: () => Promise<void>;
  signInWithToken: (token: string, account: MemberProfile) => void;
  signOut: () => void;
};

const Ctx = createContext<MemberAuthState | null>(null);

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(!isMemberHubPreview());
  const [sessionError, setSessionError] = useState('');
  const [account, setAccount] = useState<MemberProfile | null>(isMemberHubPreview() ? MEMBER_HUB_PREVIEW_ACCOUNT : null);
  const [events, setEvents] = useState<MemberEventItem[]>([]);

  const refresh = useCallback(async () => {
    if (isMemberHubPreview()) {
      setAccount(MEMBER_HUB_PREVIEW_ACCOUNT);
      setEvents([]);
      setLoading(false);
      return;
    }
    setSessionError('');
    const token = getMemberToken();
    if (!token) {
      setAccount(null);
      setEvents([]);
      setLoading(false);
      return;
    }
    try {
      const me = await memberLoadMe();
      if (getMemberToken() !== token) return;
      if ('error' in me) {
        if (me.status === 401 || me.status === 403) {
          setMemberToken(null); setAccount(null); setEvents([]);
        } else setSessionError('No pudimos conectar con tu cuenta. Tu sesión sigue guardada.');
      } else { setAccount(me.account); setEvents(me.events); }
    } catch {
      setSessionError('No pudimos conectar con tu cuenta. Revisá tu conexión.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signInWithToken = useCallback((token: string, next: MemberProfile) => {
    setMemberToken(token);
    setSessionError('');
    setAccount(next);
  }, []);

  const signOut = useCallback(() => {
    setMemberToken(null);
    setSessionError('');
    setAccount(null);
    setEvents([]);
  }, []);

  const value = useMemo(
    () => ({ loading, sessionError, account, events, refresh, signInWithToken, signOut }),
    [loading, sessionError, account, events, refresh, signInWithToken, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMemberAuth(): MemberAuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMemberAuth fuera de MemberAuthProvider');
  return ctx;
}
