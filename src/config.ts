import path from 'node:path';

export const ROOT_DIR = path.resolve(import.meta.dirname, '..');

export type Config = {
  port: number;
  dataDir: string;
  sourceOrigins: string[];
  publicDir: string;
  bookmarkletSrc: string;
  bookmarkletTxt: string;
  vendor: { htmx: string; pico: string };
};

export const VENDOR = {
  htmx: path.join(ROOT_DIR, 'node_modules', 'htmx.org', 'dist', 'htmx.min.js'),
  pico: path.join(ROOT_DIR, 'node_modules', '@picocss', 'pico', 'css', 'pico.min.css'),
} as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Ungültiger PORT: ${env.PORT}`);
  }
  return {
    port,
    dataDir: path.resolve(env.DATA_DIR ?? path.join(ROOT_DIR, 'data')),
    sourceOrigins: (env.SOURCE_ORIGINS ?? 'https://www.netacad.com')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    publicDir: path.join(ROOT_DIR, 'public'),
    bookmarkletSrc: path.join(ROOT_DIR, 'bookmarklet', 'bookmarklet.src.js'),
    bookmarkletTxt: path.join(ROOT_DIR, 'bookmarklet', 'bookmarklet.txt'),
    vendor: { htmx: VENDOR.htmx, pico: VENDOR.pico },
  };
}

export function serverOrigin(port: number): string {
  return `http://localhost:${port}`;
}
