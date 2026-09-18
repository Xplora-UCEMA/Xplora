import { test, expect } from '@playwright/test';

test('event editor imports attendance with an explicit action and preserves Points policy', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sb-xplora-staff-auth', JSON.stringify({
    access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,
    token_type:'bearer',user:{id:'70000000-0000-4000-8000-000000000001',email:'staff@example.test',
      aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()},
  })));
  const eventId='10000000-0000-4000-8000-000000000001';
  await page.route('**/api/**', route => route.fulfill({json:[]}));
  await page.route('**/api/auth/me', route => route.fulfill({json:{nombre:'Equipo',apellido:'Demo',email:'staff@example.test',permissions:['events_edit_delete','points_manage']}}));
  await page.route('**/api/public/config', route => route.fulfill({json:{supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'public-test-key'}}));
  await page.route('**/api/admin/eventos', route => route.fulfill({json:[{id:eventId,title:'Evento de prueba',date_display:'17 septiembre',realizado:true}]}));
  await page.route('**/api/admin/points', route => route.fulfill({json:{events:[{event_id:eventId,starts_at:'2026-09-17T15:00:00Z',tier:'large',base_points:40,closed:false}],catalog:[],actions:[],rewards:[],responses:[]}}));
  let imports=0;
  let saved: Record<string,unknown>|null=null;
  await page.route(`**/api/admin/eventos/${eventId}`, route=>{
    saved={total_inscriptos:2,total_asistieron:1,...route.request().postDataJSON() as Record<string,unknown>};
    return route.fulfill({json:{id:eventId}});
  });
  await page.route(`**/api/admin/eventos/${eventId}/luma-csv`, route => {
    imports++;
    expect(route.request().postDataBuffer()?.toString()).toContain('asistio');
    return route.fulfill({json:{emails_procesados:2,asistieron_marcados:1,total_asistieron_evento:1,total_inscriptos_evento:2,warnings:[]}});
  });
  await page.goto('/panel');
  await page.getByRole('button',{name:'Data',exact:true}).click();
  await page.getByRole('button',{name:'Eventos',exact:true}).click();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Asistencia del evento',exact:true})).toBeVisible();
  await page.getByLabel('Archivo de asistencia',{exact:true}).setInputFiles({name:'asistencia.csv',mimeType:'text/csv',buffer:Buffer.from('email,asistio\nsi@example.test,si\nno@example.test,no')});
  expect(imports).toBe(0);
  await page.getByRole('button',{name:'Importar asistencia',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Asistentes reconocidos: 1'})).toBeVisible();
  expect(imports).toBe(1);
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:950});
    await page.getByRole('heading',{name:'Asistencia del evento',exact:true}).scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`.impeccable/review/attendance-${width}.png`,animations:'disabled'});
  }
  await page.getByLabel('Puntos base',{exact:true}).fill('45');
  await expect(page.getByLabel('Archivo de asistencia',{exact:true})).toBeDisabled();
  await expect(page.getByText('Guardá los cambios de Points y volvé a editar el evento antes de importar.')).toBeVisible();
  await page.getByLabel('Puntos base',{exact:true}).fill('40');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Editar evento',exact:true})).toBeHidden();
  expect(saved).toMatchObject({total_inscriptos:2,total_asistieron:1});
});
