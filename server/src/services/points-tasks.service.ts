export type EventTaskRow = {
  event_id: string; starts_at: string; base_points: number; closed: boolean;
  eventos: { title: string; registration_link: string | null; realizado: boolean | null } | null;
};
export type AttendanceRow = { evento_id: string; asistio: boolean };
export type SurveyTaskRow = {
  id: string; title: string; kind: string; points: number; event_id: string | null;
  active: boolean; expires_at: string; max_claims: number; xp_claims: { count: number }[];
  xp_google_forms?: { responder_url: string; connected_at: string | null } | null;
};
export type MemberTask = {
  id: string; title: string; kind: 'event' | 'survey' | 'google_form'; points: number;
  date: string; status: 'available' | 'registered' | 'pending' | 'completed'; href: string | null;
};

function registrationUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function buildEventTasks(events: EventTaskRow[], attendance: AttendanceRow[], now: number): MemberTask[] {
  return events.flatMap((event): MemberTask[] => {
    if (!event.eventos) return [];
    const registration = attendance.find(row => row.evento_id === event.event_id);
    const future = new Date(event.starts_at).getTime() > now && !event.closed && !event.eventos.realizado;
    if (!future && !registration) return [];
    return [{
      id: event.event_id, title: event.eventos.title, kind: 'event', points: event.base_points,
      date: event.starts_at,
      status: registration?.asistio ? 'completed' : future ? registration ? 'registered' : 'available' : 'pending',
      href: future && !registration ? registrationUrl(event.eventos.registration_link) : null,
    }];
  });
}

/** Unscoped actions and QR/award capabilities are never published in Tasks. */
export function buildSurveyTasks(actions: SurveyTaskRow[], attendance: AttendanceRow[], claimed: string[], now: number): MemberTask[] {
  return actions.flatMap((action): MemberTask[] => {
    const google = action.kind === 'google_form';
    if (google ? !action.xp_google_forms?.connected_at : action.kind !== 'survey' || !action.event_id) return [];
    if (action.event_id && !attendance.some(row => row.evento_id === action.event_id && row.asistio)) return [];
    const completed = claimed.includes(action.id);
    if (!completed && (!action.active || new Date(action.expires_at).getTime() <= now ||
      action.xp_claims.reduce((total, row) => total + row.count, 0) >= action.max_claims)) return [];
    return [{ id: action.id, title: action.title, kind: google ? 'google_form' : 'survey', points: action.points,
      date: action.expires_at, status: completed ? 'completed' : 'available',
      href: google ? registrationUrl(action.xp_google_forms?.responder_url ?? null) : null }];
  });
}
