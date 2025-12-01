import { serve } from '@hono/node-server';
import app, { printStartupInfo } from './src/index.ts';
import { browserPool } from './src/core/browserPool.ts';
import { taskManager } from './src/core/taskManager.ts';

const port = Number(process.env.PORT) || 3000;

const server = serve({
  fetch: app.fetch,
  port,
}, () => {
  printStartupInfo();
});

/** 优雅关闭 */
async function gracefulShutdown(signal: string) {
  console.log(`\n📥 收到 ${signal} 信号，正在关闭服务...`);

  server.close();
  taskManager.shutdown();
  await browserPool.shutdown();

  console.log('👋 服务已关闭');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
