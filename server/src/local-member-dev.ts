import { Loly } from "@kyncode/sdk";
import { getAppConfig, loadEnvFromProjectRoot } from "./config/env.js";
import { createLocalMemberConfig } from "./config/local-member.js";
import { createApplication } from "./composition-root.js";
import { startGoogleWorker } from './services/google-central/worker.js';

// The launcher decrypts this local-only key into the child process environment.
const localSecret = process.env.XPLORA_LOCAL_MEMBER_SECRET ?? "";
const configRoot = process.env.XPLORA_CONFIG_ROOT;
delete process.env.XPLORA_LOCAL_MEMBER_SECRET;
delete process.env.XPLORA_CONFIG_ROOT;
if (!configRoot) throw new Error("Iniciá con scripts/start-member-local.ps1 -ConfigRoot <ruta>.");

const projectRoot = process.cwd();
try {
  process.chdir(configRoot);
  loadEnvFromProjectRoot();
} finally {
  process.chdir(projectRoot);
}
const config = createLocalMemberConfig(getAppConfig(), localSecret);
Loly.listenToProcessEvents();
const app = createApplication(config);
startGoogleWorker(config);
await Loly.connect("Express");
app.listen(config.port, "127.0.0.1", () => {
  console.log("[member-local] API en http://127.0.0.1:8788. Cuenta en http://127.0.0.1:5174/cuenta.");
  console.log("[member-local] Base configurada del servidor. Points habilitado; no se ejecutan migraciones al iniciar.");
});
