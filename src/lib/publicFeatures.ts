/** Visibility only, never authorization. /cuenta remains reachable by direct URL. */
export const publicFeatures = {
  memberAccountEntry: import.meta.env.VITE_PUBLIC_MEMBER_ENTRY_ENABLED === 'true',
} as const;
