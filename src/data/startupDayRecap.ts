/** Public aggregate/content only. Source workbook stays outside this repository. */
export type RecapPhoto = { id: string; alt: string; caption: string; category: 'Encuentros' | 'Charlas' | 'Startups' };
export const RECAP_PHOTOS: RecapPhoto[] = [
  { id: 'photo-20', alt: 'Una charla con el aula llena en Startup Day', caption: 'Charlas en UCEMA', category: 'Charlas' },
  { id: 'photo-6', alt: 'Una entrevista entre participantes en el hall', caption: 'Conversaciones en el hall', category: 'Encuentros' },
  { id: 'photo-23', alt: 'Una emprendedora presenta su producto a los visitantes', caption: 'Proyectos, en primera persona', category: 'Startups' },
  { id: 'photo-26', alt: 'Dos participantes conversan durante Startup Day', caption: 'Encuentros entre participantes', category: 'Encuentros' },
  { id: 'photo-30', alt: 'Dos expositores conversan frente a los asistentes', caption: 'Dos voces, una charla', category: 'Charlas' },
  { id: 'photo-44', alt: 'El equipo de Gasti en su stand', caption: 'Gasti', category: 'Startups' },
  { id: 'photo-56', alt: 'Participantes junto al stand de Founders Fit Club', caption: 'Founders Fit Club', category: 'Encuentros' },
  { id: 'photo-17', alt: 'El equipo de Yafu junto al cartel de su startup', caption: 'Yafu', category: 'Startups' },
  { id: 'photo-79', alt: 'Participantes en el stand de Nerdearla', caption: 'Nerdearla', category: 'Startups' },
  { id: 'photo-96', alt: 'El equipo de Pasito reunido en su stand', caption: 'Pasito', category: 'Startups' },
];
export const RECAP_PRESS = [
  { id: 'sla', title: 'SLA', handle: '@slatv_', description: 'Startup Day, desde la mirada de SLA.', href: 'https://x.com/slatv_/status/2099491355667873885', src: '/recap/press-sla.mp4', poster: '/recap/press-sla.webp' },
  { id: 'builders', title: 'Builders off the record', handle: '@buildersofftr', description: 'Conversaciones del evento, fuera del escenario.', href: 'https://x.com/buildersofftr/status/2099500445894865219', src: '/recap/press-builders.mp4', poster: '/recap/press-builders.webp' },
] as const;
export const RECAP_VOICES = [
  { id: 'hubeet', name: 'Gustavo Benítez', company: 'Hubeet', duration: '0:22' },
  { id: 'nerdearla', name: 'Ariel Jolo', company: 'Nerdearla', duration: '0:14' },
  { id: 'resender', name: 'Lorna Suriano', company: 'Resender.dev', duration: '0:19' },
  { id: 'picante', name: 'Federico Ades', company: 'Picante', duration: '0:19' },
] as const;
