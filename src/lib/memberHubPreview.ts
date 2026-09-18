import type { MemberProfile } from './memberAuth';

export function isMemberHubPreview(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('hubPreview') === '1';
}

export const MEMBER_HUB_PREVIEW_ACCOUNT: MemberProfile = {
  id: 'local-hub-preview',
  email: 'xplorer@preview.local',
  displayName: 'xplorer@preview.local',
  firstName: '',
  lastName: '',
  phone: '',
  avatarUrl: '',
  studies: [],
  jobs: [],
  languages: [],
  skills: [],
  cvUrl: '',
  emailConfirmed: true,
  createdAt: '2026-09-18T00:00:00Z',
};
