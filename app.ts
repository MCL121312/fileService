import { serve } from '@hono/node-server';
import app, { printStartupInfo } from './src/index.ts';
import { browserPool } from './src/core/browserPool.ts';
import { taskManager } from './src/core/taskManager.ts';

const port = Number(process.env.PORT) || 3000;

/** 启动服务 */
async function start() {
  // 初始化任务管理器（连接数据库）
  await taskManager.init();

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
    await taskManager.shutdown();
    await browserPool.shutdown();

    console.log('👋 服务已关闭');
    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('❌ 启动失败:', err);
  process.exit(1);
});
