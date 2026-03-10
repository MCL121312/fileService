import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { networkInterfaces } from "os";
import path from "path";
import { loadTemplates, listTemplates } from "./core/templateLoader.ts";
import { browserPool } from "./core/browserPool.ts";
import reportsRoutes from "./routes/reports.ts";
import tasksRoutes from "./routes/tasks.ts";
import filesRoutes, { fileApis } from "./routes/files.ts";
import { openApiSpec } from "./openapi/spec.ts";

const SCALAR_SCRIPT_CDN_URLS = [
  "https://unpkg.com/@scalar/api-reference/dist/browser/standalone.js",
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference/dist/browser/standalone.js"
];

let scalarScriptCache: string | null = null;
let scalarScriptPromise: Promise<string> | null = null;

async function loadScalarScript(): Promise<string> {
  if (scalarScriptCache) return scalarScriptCache;
  if (scalarScriptPromise) return scalarScriptPromise;

  scalarScriptPromise = (async () => {
    for (const url of SCALAR_SCRIPT_CDN_URLS) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const script = await response.text();
        scalarScriptCache = script;
        return script;
      } catch (error) {
        console.warn(`⚠️ 加载 Scalar 脚本失败: ${url}`, error);
      }
    }

    throw new Error("无法加载 Scalar API Reference 脚本");
  })();

  try {
    return await scalarScriptPromise;
  } finally {
    scalarScriptPromise = null;
  }
}

// 初始化浏览器池
await browserPool.init();

// 加载所有模板
const templatesDir = path.join(import.meta.dirname, "templates");
await loadTemplates(templatesDir);

// 服务配置
const PORT = process.env.PORT || 3000;
// const HOST = process.env.HOST || "0.0.0.0";

/** 打印启动信息 */
export function printStartupInfo() {
  const localUrl = `http://localhost:${PORT}`;
  const networkUrl = `http://${getNetworkIP()}:${PORT}`;

  console.log("\n🚀 FileService 已启动\n");
  console.log("📍 访问地址:");
  console.log(`   本地:   ${localUrl}`);
  console.log(`   网络:   ${networkUrl}`);
  console.log("\n📋 快捷链接:");
  console.log(`   看板:   ${localUrl}/dashboard/`);
  console.log(`   文档:   ${localUrl}/docs`);
  console.log(`   API:    ${localUrl}/openapi.json`);
  console.log("");
}

/** 获取本机网络 IP */
function getNetworkIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const app = new Hono();

// 中间件
app.use("*", logger());
app.use("*", cors());

// 静态文件服务 - 看板页面
app.use(
  "/dashboard/*",
  serveStatic({
    root: "./public",
    rewriteRequestPath: path => path.replace("/dashboard", "")
  })
);
app.get("/dashboard", c => c.redirect("/dashboard/"));

// API 信息
app.get("/", c => {
  const templates = listTemplates();
  return c.json({
    name: "fileService",
    version: "3.0.0",
    description: "报告生成服务 - 支持多模板和任务队列",
    docs: "/docs",
    openapi: "/openapi.json",
    dashboard: "/dashboard/",
    templates: templates.map(t => ({
      id: t.id,
      name: t.name
    })),
    endpoints: {
      "GET /docs": "API 文档 (Scalar UI)",
      "GET /openapi.json": "OpenAPI 规范文件",
      "GET /dashboard": "任务看板页面",
      "POST /api/reports/generateReport": "生成报告",
      "GET /api/reports/getReportTask/:reportId": "通过报告ID获取任务详情",
      "GET /api/tasks/getAllTasks": "获取任务列表",
      "GET /api/tasks/getTask/:taskId": "获取单个任务",
      "GET /api/files/getAllFiles": "获取已生成文件列表",
      "DELETE /api/tasks/deleteTask/:taskId": "删除任务记录",
      "GET /files/:filename": "直接访问文件资源",
      "DELETE /files/:filename": "删除文件"
    }
  });
});

// API 路由
app.route("/api/reports", reportsRoutes);
app.route("/api/tasks", tasksRoutes);
app.route("/api/files", fileApis);

// 文件资源路由
app.route("/files", filesRoutes);

// OpenAPI 规范文档
app.get("/openapi.json", c => c.json(openApiSpec));

// Scalar 脚本代理（避免浏览器直接依赖外部 CDN）
app.get("/docs-assets/scalar.js", async c => {
  try {
    const script = await loadScalarScript();
    return c.body(script, 200, {
      "Content-Type": "application/javascript; charset=UTF-8",
      "Cache-Control": "public, max-age=3600"
    });
  } catch (error) {
    console.error("❌ 加载 Scalar 脚本失败", error);
    return c.text("// Failed to load Scalar API Reference", 502, {
      "Content-Type": "application/javascript; charset=UTF-8"
    });
  }
});

// Scalar API 文档 UI
app.get(
  "/docs",
  Scalar({
    pageTitle: "FileService API 文档",
    url: "/openapi.json",
    cdn: "/docs-assets/scalar.js",
    theme: "bluePlanet"
  })
);

export default app;
