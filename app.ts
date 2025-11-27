import { serve } from '@hono/node-server';
import app, { printStartupInfo } from './src/index.ts';

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
}, () => {
  printStartupInfo();
});
