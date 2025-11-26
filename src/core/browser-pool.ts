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

const defaultConfig: BrowserPoolConfig = {
  min: 1,
  max: 5,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 10000,
};

/** 浏览器池管理器 */
export class BrowserPool {
  private pool: Pool<Browser>;
  private isShuttingDown = false;

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    const finalConfig = { ...defaultConfig, ...config };

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

    this.pool = genericPool.createPool(factory, {
      min: finalConfig.min,
      max: finalConfig.max,
      idleTimeoutMillis: finalConfig.idleTimeoutMillis,
      acquireTimeoutMillis: finalConfig.acquireTimeoutMillis,
      testOnBorrow: true,
    });

    console.log(`🚀 浏览器池已初始化 (min: ${finalConfig.min}, max: ${finalConfig.max})`);
  }

  /** 获取浏览器实例 */
  async acquire(): Promise<Browser> {
    if (this.isShuttingDown) {
      throw new Error('浏览器池正在关闭');
    }
    return this.pool.acquire();
  }

  /** 释放浏览器实例 */
  async release(browser: Browser): Promise<void> {
    await this.pool.release(browser);
  }

  /** 执行操作 (自动获取和释放浏览器) */
  async use<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    const browser = await this.acquire();
    try {
      return await fn(browser);
    } finally {
      await this.release(browser);
    }
  }

  /** 获取池状态 */
  getStatus() {
    return {
      size: this.pool.size,
      available: this.pool.available,
      borrowed: this.pool.borrowed,
      pending: this.pool.pending,
    };
  }

  /** 关闭浏览器池 */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    console.log('🛑 正在关闭浏览器池...');
    await this.pool.drain();
    await this.pool.clear();
    console.log('✓ 浏览器池已关闭');
  }
}

/** 全局浏览器池实例 */
export const browserPool = new BrowserPool();

