import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();

const missing = Object.values(config.vendor).filter((f) => !fs.existsSync(f));
if (missing.length) {
  console.error(`Fehlende Dateien:\n  ${missing.join('\n  ')}\nBitte zuerst «npm install» ausführen.`);
  process.exit(1);
}

fs.mkdirSync(config.dataDir, { recursive: true });
const { app } = createApp({ config });

const server = serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`NetAcad-Fortschritt läuft: http://localhost:${info.port}/`);
  console.log(`Daten: ${config.dataDir}`);
});

server.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} ist bereits belegt (PORT=… setzen).` : `Serverfehler: ${e.message}`);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
