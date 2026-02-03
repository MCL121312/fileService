import { Hono } from "hono";
import { taskManager } from "../core/taskManager.ts";
import type { OutputFormat } from "../types/task.ts";

const reports = new Hono();

/** 生成文件资源路径 */
function getFileUrl(task: { reportId: string; status: string }) {
  if (task.status !== "completed") return null;
  return `/files/${task.reportId}.pdf`;
}

/** POST /generateReport - 生成报告 */
reports.post("/generateReport", async c => {
  try {
    const body = await c.req.json();
    const {
      templateId,
      format = "pdf",
      data
    } = body as {
      templateId: string;
      format?: OutputFormat;
      data: unknown;
    };

    if (!templateId) {
      return c.json({ error: "缺少必填参数 templateId" }, 400);
    }

    if (format !== "pdf") {
      return c.json({ error: "不支持的格式，请使用 pdf" }, 400);
    }

    if (!data) {
      return c.json({ error: "缺少必填参数 data" }, 400);
    }

    const task = await taskManager.create({ templateId, format, data });

    return c.json(
      {
        taskId: task.id,
        status: task.status,
        content: {
          reportId: task.reportId,
          file: getFileUrl(task)
        }
      },
      201
    );
  } catch (error) {
    console.error("创建报告生成任务失败:", error);
    return c.json(
      { error: "创建报告生成任务失败", message: String(error) },
      400
    );
  }
});

/** GET /getReportTask/:reportId - 通过报告ID获取任务详情 */
reports.get("/getReportTask/:reportId", c => {
  const reportId = c.req.param("reportId");
  const task = taskManager.getByReportId(reportId);

  if (!task) {
    return c.json({ error: "报告不存在" }, 404);
  }

  return c.json({
    taskId: task.id,
    status: task.status,
    content: {
      reportId: task.reportId,
      file: getFileUrl(task)
    },
    detail: {
      templateId: task.templateId,
      format: task.format,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      duration:
        task.startedAt && task.completedAt
          ? task.completedAt.getTime() - task.startedAt.getTime()
          : null,
      error: task.error
    }
  });
});

export default reports;
