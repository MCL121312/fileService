import puppeteer, { Browser } from 'puppeteer';
import genericPool, { Pool } from 'generic-pool';

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
}

/** 浏览器池实例接口 */
export interface BrowserPool {
  /** 获取浏览器实例 */
  acquire(): Promise<Browser>;
  /** 释放浏览器实例 */
  release(browser: Browser): Promise<void>;
  /** 执行操作 (自动获取和释放浏览器) */
  use<T>(fn: (browser: Browser) => Promise<T>): Promise<T>;
  /** 获取池状态 */
  getStatus(): { size: number; available: number; borrowed: number; pending: number };
  /** 关闭浏览器池 */
  shutdown(): Promise<void>;
}

const defaultConfig: BrowserPoolConfig = {
  min: 1,
  max: 5,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 10000,
};

/** 创建浏览器池 */
export function createBrowserPool(config: Partial<BrowserPoolConfig> = {}): BrowserPool {
  const finalConfig = { ...defaultConfig, ...config };
  let isShuttingDown = false;

  const factory = {
    create: async (): Promise<Browser> => {
      console.log('🌐 创建新的浏览器实例...');
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      return browser;
    },

    destroy: async (browser: Browser): Promise<void> => {
      console.log('🔴 销毁浏览器实例...');
      await browser.close();
    },

    validate: async (browser: Browser): Promise<boolean> => {
      try {
        // 检查浏览器是否仍然可用
        await browser.version();
        return true;
      } catch {
        return false;
      }
    },
  };

  const pool: Pool<Browser> = genericPool.createPool(factory, {
    min: finalConfig.min,
    max: finalConfig.max,
    idleTimeoutMillis: finalConfig.idleTimeoutMillis,
    acquireTimeoutMillis: finalConfig.acquireTimeoutMillis,
    testOnBorrow: true,
  });

  console.log(`🚀 浏览器池已初始化 (min: ${finalConfig.min}, max: ${finalConfig.max})`);

  /** 获取浏览器实例 */
  async function acquire(): Promise<Browser> {
    if (isShuttingDown) {
      throw new Error('浏览器池正在关闭');
    }
    return pool.acquire();
  }

  /** 释放浏览器实例 */
  async function release(browser: Browser): Promise<void> {
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
      size: pool.size,
      available: pool.available,
      borrowed: pool.borrowed,
      pending: pool.pending,
    };
  }

  /** 关闭浏览器池 */
  async function shutdown(): Promise<void> {
    isShuttingDown = true;
    console.log('🛑 正在关闭浏览器池...');
    await pool.drain();
    await pool.clear();
    console.log('✓ 浏览器池已关闭');
  }

  return {
    acquire,
    release,
    use,
    getStatus,
    shutdown,
  };
}

/** 全局浏览器池实例 */
export const browserPool = createBrowserPool();

