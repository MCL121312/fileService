import { serve } from '@hono/node-server';
import app from './src/index.ts';

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 体检报告生成服务启动中...`);
console.log(`📍 服务地址: http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
