import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { AppConfig } from '../config/env.js';

/** Sirve `dist/` del front y fallback SPA (solo producción con build presente). */
export function setupSpaStaticIfProduction(app: Express, config: AppConfig): void {
  const isProd = config.nodeEnv === 'production';
  const distDir = config.paths.webDist;
  const hasDist = fs.existsSync(distDir);

  if (!isProd || !hasDist) {
    return;
  }

  const entryForHost = (hostname: string) => {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    return host === 'startupday.xploraucema.com' || host === 'startupday.localhost'
      ? 'startup-day.html'
      : 'index.html';
  };

  // Run before express.static, whose directory index would otherwise always serve Xplora's HTML.
  app.get('/', (req, res, next) => {
    res.sendFile(path.join(distDir, entryForHost(req.hostname)), err => {
      if (err) next(err);
    });
  });
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Ruta API no encontrada.', code: 'NOT_FOUND' });
      return;
    }
    res.sendFile(path.join(distDir, entryForHost(req.hostname)), err => {
      if (err) next(err);
    });
  });
}
