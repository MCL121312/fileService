import puppeteer, { Browser } from "puppeteer";
import genericPool, { Pool } from "generic-pool";
import { execSync } from "child_process";
import fs from "fs";

/** 浏览器池配置 */
export interface BrowserPoolConfig {
  /** 最小浏览器实例数 */
  min: number;
  /** 最大浏览器实例数 */
  max: number;
  /** 空闲超时时间 (ms) */
  idleTimeoutMillis: number;
  /** 获取超时时间 (ms) */
  acquireTimeoutMillis: number;
  /** Chrome 可执行文件路径 (可通过 CHROME_PATH 环境变量设置) */
  executablePath?: string;
}

/** 浏览器池实例接口 */
export interface BrowserPool {
  /** 初始化浏览器池 (检测浏览器可用性) */
  init(): Promise<void>;
  /** 获取浏览器实例 */
  acquire(): Promise<Browser>;
  /** 释放浏览器实例 */
  release(browser: Browser): Promise<void>;
  /** 执行操作 (自动获取和释放浏览器) */
  use<T>(fn: (browser: Browser) => Promise<T>): Promise<T>;
  /** 获取池状态 */
  getStatus(): {
    size: number;
    available: number;
    borrowed: number;
    pending: number;
    executablePath: string | null;
    initialized: boolean;
  };
  /** 关闭浏览器池 */
  shutdown(): Promise<void>;
}

const defaultConfig: BrowserPoolConfig = {
  min: 0,
  max: 5,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 30000
};

/** 常见的 Chrome 路径 */
const CHROME_PATHS = [
  // 环境变量
  process.env.CHROME_PATH,
  // Linux 常见路径
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean) as string[];

/** 查找可用的 Chrome 路径 */
function findChromePath(): string | null {
  // 优先使用环境变量
  if (process.env.CHROME_PATH) {
    if (fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    console.warn(`⚠️ CHROME_PATH 指定的路径不存在: ${process.env.CHROME_PATH}`);
  }

  // 尝试 which 命令
  try {
    const chromium = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      {
        encoding: "utf-8"
      }
    ).trim();
    if (chromium) return chromium;
  } catch {
    // 忽略错误
  }

  // 检查常见路径
  for (const path of CHROME_PATHS) {
    if (fs.existsSync(path)) {
      return path;
    }
  }

  return null;
}

/** 创建浏览器池 */
export function createBrowserPool(
  config: Partial<BrowserPoolConfig> = {}
): BrowserPool {
  const finalConfig = { ...defaultConfig, ...config };
  let isShuttingDown = false;
  let isInitialized = false;
  let executablePath: string | null = null;
  let pool: Pool<Browser> | null = null;

  /** 初始化浏览器池 */
  async function init(): Promise<void> {
    if (isInitialized) return;

    // 查找浏览器路径
    executablePath = finalConfig.executablePath || findChromePath();

    if (!executablePath) {
      console.error("❌ 未找到 Chrome/Chromium 浏览器");
      console.error("");
      console.error(
        "   请安装 Chrome 或 Chromium，或设置 CHROME_PATH 环境变量"
      );
      console.error("");
      console.error("   安装方法:");
      console.error("     Ubuntu/Debian: sudo apt install chromium-browser");
      console.error("     Alpine:        apk add chromium");
      console.error("     Docker:        设置 CHROME_PATH=/usr/bin/chromium");
      console.error("");
      throw new Error("未找到可用的浏览器");
    }

    console.log(`🌐 检测到浏览器: ${executablePath}`);

    // 测试浏览器是否可用
    try {
      const testBrowser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ]
      });
      await testBrowser.close();
      console.log("  ✓ 浏览器可用");
    } catch (error) {
      console.error("❌ 浏览器启动测试失败:", error);
      throw new Error("浏览器无法启动");
    }

    // 创建浏览器池
    const factory = {
      create: async (): Promise<Browser> => {
        const browser = await puppeteer.launch({
          headless: true,
          executablePath: executablePath!,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
          ]
        });
        return browser;
      },
      destroy: async (browser: Browser): Promise<void> => {
        try {
          await browser.close();
        } catch {
          // 忽略关闭错误
        }
      }
    };

    pool = genericPool.createPool(factory, {
      min: finalConfig.min,
      max: finalConfig.max,
      idleTimeoutMillis: finalConfig.idleTimeoutMillis,
      acquireTimeoutMillis: finalConfig.acquireTimeoutMillis
    });

    isInitialized = true;
    console.log(
      `🚀 浏览器池已初始化 (min: ${finalConfig.min}, max: ${finalConfig.max})`
    );
  }

  /** 获取浏览器实例 */
  async function acquire(): Promise<Browser> {
    if (!isInitialized || !pool) {
      throw new Error("浏览器池未初始化，请先调用 init()");
    }
    if (isShuttingDown) {
      throw new Error("浏览器池正在关闭");
    }
    return pool.acquire();
  }

  /** 释放浏览器实例 */
  async function release(browser: Browser): Promise<void> {
    if (!pool) return;
    await pool.release(browser);
  }

  /** 执行操作 (自动获取和释放浏览器) */
  async function use<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    const browser = await acquire();
    try {
      return await fn(browser);
    } finally {
      await release(browser);
    }
  }

  /** 获取池状态 */
  function getStatus() {
    return {
      size: pool?.size ?? 0,
      available: pool?.available ?? 0,
      borrowed: pool?.borrowed ?? 0,
      pending: pool?.pending ?? 0,
      executablePath,
      initialized: isInitialized
    };
  }

  /** 关闭浏览器池 */
  async function shutdown(): Promise<void> {
    if (!pool) return;
    isShuttingDown = true;
    console.log("🛑 正在关闭浏览器池...");
    await pool.drain();
    await pool.clear();
    console.log("✓ 浏览器池已关闭");
  }

  return {
    init,
    acquire,
    release,
    use,
    getStatus,
    shutdown
  };
}

/** 全局浏览器池实例 */
export const browserPool = createBrowserPool();
