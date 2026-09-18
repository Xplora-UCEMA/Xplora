import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { getAppConfig, loadEnvFromProjectRoot } from '../server/src/config/env.js';
import { frontendEnvironment } from '../server/src/config/local-ops.js';

const configRoot=process.argv[2];
if (!configRoot) throw new Error('Indicá el directorio de configuración existente del servidor.');
const project=process.cwd();
try {process.chdir(resolve(configRoot));loadEnvFromProjectRoot();} finally {process.chdir(project);}
const config=getAppConfig();
if (!config.supabaseUrl||!config.supabaseAnonKey) throw new Error('Falta la configuración pública de Supabase.');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174','--strictPort'],{
  cwd:project,env:frontendEnvironment(process.env,config.supabaseUrl,config.supabaseAnonKey),stdio:'inherit',windowsHide:true,
});
child.on('exit',code=>{process.exitCode=code??1;});
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>child.kill(signal));
