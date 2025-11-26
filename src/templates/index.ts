import { templateManager } from '../core/template-manager.ts';
import { healthReportTemplate } from './health-report/index.ts';
import { guideSheetTemplate } from './guide-sheet/index.ts';

/** 注册所有模板 */
export function registerTemplates(): void {
  console.log('📋 正在注册模板...');
  
  templateManager.register(healthReportTemplate);
  templateManager.register(guideSheetTemplate);
  
  console.log(`✓ 已注册 ${templateManager.list().length} 个模板`);
}

export { templateManager };

