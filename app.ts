import { serve } from "@hono/node-server";
import app, { printStartupInfo } from "./src/index.ts";
import { browserPool } from "./src/core/browserPool.ts";
import { taskManager } from "./src/core/taskManager.ts";
import { createServer } from "net";

const port = Number(process.env.PORT) || 4000;

/** 检查端口是否被占用 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

/** 启动服务 */
async function start() {
  // 检查端口是否被占用
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    console.error(`❌ 端口 ${port} 已被占用`);
    console.error("");
    console.error("   解决方案:");
    console.error(`   1. 使用其他端口: PORT=4001 pnpm dev`);
    console.error(`   2. 杀掉占用进程: lsof -ti:${port} | xargs kill -9`);
    console.error("");
    process.exit(1);
  }

  // 初始化任务管理器（连接数据库）
  await taskManager.init();

  const server = serve(
    {
      fetch: app.fetch,
      port
    },
    () => {
      printStartupInfo();
    }
  );

  /** 优雅关闭 */
  async function gracefulShutdown(signal: string) {
    console.log(`\n📥 收到 ${signal} 信号，正在关闭服务...`);

    server.close();
    await taskManager.shutdown();
    await browserPool.shutdown();

    console.log("👋 服务已关闭");
    process.exit(0);
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

start().catch(err => {
  console.error("❌ 启动失败:", err);
  process.exit(1);
});
