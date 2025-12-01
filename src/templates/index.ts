import { templateManager } from '../core/templateManager.ts';
import { useHealthReportTemplate } from './health-report/index.ts';
import { useGuideSheetTemplate } from './guide-sheet/index.ts';

/** 注册所有模板 */
export function registerTemplates(): void {
  console.log('📋 正在注册模板...');

  templateManager.register(useHealthReportTemplate());
  templateManager.register(useGuideSheetTemplate());

  console.log(`✓ 已注册 ${templateManager.list().length} 个模板`);
}

export { templateManager };

