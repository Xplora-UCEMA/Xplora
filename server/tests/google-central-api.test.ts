import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express, { type ErrorRequestHandler } from 'express';
import { getAppConfig } from '../src/config/env.js';
import { registerGoogleCentralRoutes } from '../src/http/controllers/google-central.controller.js';
import { scopes } from '../src/services/google-central/oauth.js';

test('OAuth callback requires the browser cookie, consumes state once and only stores an encrypted refresh token', async () => {
  const config={...getAppConfig(),supabaseUrl:'https://oauth-callback.invalid',supabaseServiceRoleKey:'fixture-role',googleForms:{
    clientId:'fixture',clientSecret:'private-fixture',redirectUri:'http://127.0.0.1:8788/api/integrations/points/google/callback',
    encryptionKey:Buffer.alloc(32,7).toString('base64'),accountEmail:'owner@example.test',workerEnabled:true}};
  const native=globalThis.fetch; let state:Record<string,unknown>|null=null, persisted:Record<string,unknown>|null=null;
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init),url=new URL(req.url);
    if(url.origin===config.supabaseUrl){
      if(url.pathname.endsWith('xp_google_account')){persisted=await req.json() as Record<string,unknown>;return new Response(null,{status:201});}
      if(req.method==='POST'){state=await req.json() as Record<string,unknown>;return new Response(null,{status:201});}
      if(req.method==='PATCH'&&state){const data=await req.json() as Record<string,unknown>;state={...state,...data};return Response.json({verifier_cipher:state.verifier_cipher});}
      if(req.method==='DELETE'&&url.searchParams.has('state_hash')){
        if(state&&url.searchParams.get('browser_hash')===`eq.${state.browser_hash}`){const old=state;state=null;return Response.json({verifier_cipher:old.verifier_cipher});}
        return Response.json(null);
      }
      return new Response(null,{status:204});
    }
    if(url.origin==='https://oauth2.googleapis.com')return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',scope:scopes.join(' ')});
    if(url.origin==='https://www.googleapis.com')return Response.json({email:'owner@example.test',verified_email:true});
    return native(input,init);
  };
  const app=express();app.use(express.json());registerGoogleCentralRoutes(app,config,[]);
  const server=app.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr!=='string');const root=`http://127.0.0.1:${addr.port}`;
    const begin=await (await native(root+'/api/admin/points/google/connect',{method:'POST'})).json() as {url:string};
    const ticket=new URL(begin.url).searchParams.get('ticket');
    const start=await native(root+'/api/integrations/points/google/start?ticket='+ticket,{redirect:'manual'});
    assert.equal(start.status,302);const cookie=start.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
    assert.match(start.headers.get('set-cookie')??'',/HttpOnly/);assert.match(start.headers.get('set-cookie')??'',/SameSite=Lax/);
    const callback=root+'/api/integrations/points/google/callback?state='+ticket+'&code=fixture-code';
    assert.equal((await native(callback)).status,400);assert.equal(persisted,null);
    assert.equal((await native(callback,{headers:{cookie}})).status,200);
    assert.ok(persisted);assert.ok(!JSON.stringify(persisted).includes('refresh-fixture'));
    assert.equal((await native(callback,{headers:{cookie}})).status,400);
  }finally{globalThis.fetch=native;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('OAuth uses a one-time backend start link so localhost never has to share cookies with production', async () => {
  const config={...getAppConfig(),supabaseUrl:'https://oauth-fixture.invalid',supabaseServiceRoleKey:'fixture-key',googleForms:{
    clientId:'test-client',clientSecret:'secret-not-public',redirectUri:'https://api.example.test/api/integrations/points/google/callback',
    encryptionKey:Buffer.alloc(32,7).toString('base64'),accountEmail:'owner@example.test',workerEnabled:true}};
  const native=globalThis.fetch; let saved:Record<string,unknown>|null=null;
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init); if (!req.url.startsWith(config.supabaseUrl)) return native(input,init);
    if (req.method==='POST') {saved=await req.json() as Record<string,unknown>;return new Response(null,{status:201});}
    if (req.method==='DELETE') return new Response(null,{status:204});
    throw new Error('Unexpected fixture request');
  };
  const app=express();app.use(express.json());
  registerGoogleCentralRoutes(app,config,[(req,res,next)=>{if(req.headers.authorization!=='Bearer staff')res.sendStatus(401);else next();}]);
  const errors:ErrorRequestHandler=(_e,_q,res,_n)=>{res.sendStatus(400);};app.use(errors);
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening'); const addr=server.address();assert.ok(addr&&typeof addr!=='string');
    const root=`http://127.0.0.1:${addr.port}`;
    assert.equal((await native(root+'/api/admin/points/google/connect',{method:'POST'})).status,401);
    const response=await native(root+'/api/admin/points/google/connect',{method:'POST',headers:{authorization:'Bearer staff'}});
    assert.equal(response.status,200);
    const body=await response.json() as {url:string}; const url=new URL(body.url);
    assert.equal(url.origin,'https://api.example.test');
    assert.equal(url.pathname,'/api/integrations/points/google/start');
    assert.ok(saved); assert.equal(response.headers.get('set-cookie'),null);
    assert.ok(!JSON.stringify(body).includes('secret-not-public'));
  } finally {globalThis.fetch=native;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
