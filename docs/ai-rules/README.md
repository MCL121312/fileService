# AI Rules

这个目录用于存放项目级 AI/Agent 协作规则。

## 设计目标

- 目录名保持中性，不绑定某一个特定工具。
- 规则内容优先服务于团队协作与项目维护，而不是某个插件私有配置。
- 根目录 `AGENTS.md` 负责总则；这里负责细分规则。

## 当前文件说明

- `00-project-context.md`：项目结构、入口与总体修改原则
- `10-backend-api-rules.md`：后端 API、路由、返回结构与 OpenAPI 约束
- `20-template-task-flow.md`：模板、任务流、manager 职责边界
- `30-frontend-and-css.md`：dashboard、前端联动与 CSS 约束
- `40-change-checklist.md`：改动前后的检查清单

## 使用方式

- 先阅读根目录 `AGENTS.md`。
- 涉及具体改动时，再按主题查看这里的细分规则。
- 新增规则时优先补充到最贴近主题的文件，避免重复写相同约束。