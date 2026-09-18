type IconName = 'home' | 'calendar' | 'gift' | 'user' | 'form' | 'check' | 'briefcase' | 'bulb';
const paths: Record<IconName, string> = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  calendar: 'M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  form: 'M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h5',
  check: 'm5 12 4 4L19 6',
  briefcase: 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm-2 5h10',
  bulb: 'M9 18h6m-5 3h4m4-11a6 6 0 1 0-10 4.47c.68.6 1 1.25 1 2.03h6c0-.78.32-1.43 1-2.03A5.98 5.98 0 0 0 18 10Z',
};
export function MemberIcon({ name }: { name: IconName }) {
  return <svg className="ma-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
