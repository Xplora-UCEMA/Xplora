import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.API_PORT || '8787';

/** Crawlers do not run the React metadata effect; emit an HTML entry for the event host. */
function startupDayDocument(): Plugin {
  return {
    name: 'startup-day-social-document',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = bundle['index.html'];
      if (!entry || entry.type !== 'asset') throw new Error('The built Xplora index.html is missing.');
      let html = typeof entry.source === 'string' ? entry.source : Buffer.from(entry.source).toString('utf8');
      const title = 'Así fue Startup Day 2026 | Xplora UCEMA';
      const description = 'Reviví Startup Day: las fotos, las charlas, las voces y los encuentros del 11 de septiembre de 2026 en UCEMA. Una experiencia de Xplora.';
      const canonical = 'https://startupday.xploraucema.com/';
      const image = `${canonical}recap/hero-1280.webp`;
      const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const replaceOne = (pattern: RegExp, replacement: string, label: string) => {
        let matches = 0;
        html = html.replace(pattern, () => { matches += 1; return replacement; });
        if (matches !== 1) throw new Error(`Expected one ${label} in the built document, found ${matches}.`);
      };

      replaceOne(/<title>[^<]*<\/title>/gi, `<title>${escape(title)}</title>`, 'title');
      replaceOne(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, `<link rel="canonical" href="${canonical}" />`, 'canonical');
      const metadata: Record<string, string> = {
        description,
        'og:title': title,
        'og:description': description,
        'og:url': canonical,
        'og:image': image,
        'twitter:card': 'summary_large_image',
        'twitter:title': title,
        'twitter:description': description,
        'twitter:image': image,
      };
      for (const [key, value] of Object.entries(metadata)) {
        const attribute = key.startsWith('og:') ? 'property' : 'name';
        const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${key}["'])[^>]*>`, 'gi');
        replaceOne(pattern, `<meta ${attribute}="${key}" content="${escape(value)}" />`, key);
      }
      this.emitFile({ type: 'asset', fileName: 'startup-day.html', source: html });
    },
  };
}

export default defineConfig({
  plugins: [react(), startupDayDocument()],
  publicDir: 'src/public',
  server: {
    proxy: {
      '/api/admin/points/google': {
        target: process.env.GOOGLE_FORMS_API_ORIGIN || `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        /**
         * Forma de función y no objeto: con la forma de array, `scheduler` (dependencia
         * compartida entre react-dom y el reconciler de react-three-fiber) caía dentro
         * del chunk `three` y entonces todo el sitio lo importaba de forma estática,
         * anulando la carga diferida del render 3D.
         */
        manualChunks(id) {
          const m = id.split('node_modules/')[1];
          if (!m) return;
          if (/^(react|react-dom|scheduler)\//.test(m)) return 'vendor';
          if (/^@supabase\//.test(m)) return 'supabase';
          if (/^(three|@react-three|react-reconciler|zustand|its-fine|suspend-react|react-use-measure)\//.test(m)) {
            return 'three';
          }
        },
      },
    },
  },
});
