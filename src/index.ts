import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { registerTemplates, templateManager } from './templates/index.ts';
import reportRoutes from './routes/report.ts';

// 注册所有模板
registerTemplates();

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors());

// 静态文件服务 - 看板页面
app.use('/dashboard/*', serveStatic({ root: './public', rewriteRequestPath: (path) => path.replace('/dashboard', '') }));
app.get('/dashboard', (c) => c.redirect('/dashboard/'));

// API 信息
app.get('/', (c) => {
  const templates = templateManager.list();
  return c.json({
    name: 'fileService',
    version: '3.0.0',
    description: '报告生成服务 - 支持多模板和任务队列',
    dashboard: '/dashboard/',
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
    })),
    endpoints: {
      'GET /dashboard': '任务看板页面',
      'GET /api/report': '获取所有可用模板',
      'GET /api/report/status': '获取服务状态 (浏览器池、任务队列)',
      'GET /api/report/tasks': '获取任务列表',
      'GET /api/report/tasks/:taskId': '获取任务状态',
      'GET /api/report/tasks/:taskId/download': '下载任务结果',
      'POST /api/report/:templateId/submit?format=pdf|word': '提交生成任务',
    },
  });
});

// 路由
app.route('/api/report', reportRoutes);

export default app;

