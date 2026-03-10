# FileService 项目上下文（MVP）

- 这是一个基于 `Hono + TypeScript + SQLite` 的文件/报告生成服务。
- 服务入口是 `app.ts`，应用装配入口是 `src/index.ts`。
- 路由主要在 `src/routes/`：
  - `reports.ts`：创建报告生成任务、查询报告任务
  - `tasks.ts`：任务列表、任务详情、删除任务
  - `files.ts`：访问和删除生成后的文件
- 核心能力主要在 `src/core/`：
  - `taskManager.ts`：任务队列、状态流转、结果缓存、清理
  - `templateManager.ts`：模板注册、读取、校验
  - `database.ts`：SQLite 连接与表结构
- 模板入口在 `src/templates/index.ts`，新增模板优先沿用现有注册方式。
- 静态页面在 `public/`，当前主要是 dashboard 页面：`index.html`、`app.js`、`styles.css`。

## 修改原则

- 优先做渐进式修改，不做无关重构。
- 优先复用现有目录、函数和数据流，不平行再造一套结构。
- 如果用户只要求 MVP，先做最小闭环版本，再考虑抽象。
- 如果接口、数据库结构、任务状态流会被改动，先检查上下游调用再修改。
- 如果需要新增依赖、迁移数据库、删除已有能力，先明确说明影响范围。