import { networkInterfaces } from "os";

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

/** 生成 OpenAPI 规范 */
export function generateOpenApiSpec() {
  const PORT = process.env.PORT || 3000;
  const networkIP = getNetworkIP();

  return {
    openapi: "3.0.3",
    info: {
      title: "FileService API",
      version: "3.0.0",
      description:
        "报告生成服务 API - 支持多模板和任务队列，可生成 PDF 格式的报告"
    },
    servers: [
      { url: `http://localhost:${PORT}`, description: "本地开发服务器" },
      { url: `http://${networkIP}:${PORT}`, description: "网络访问地址" }
    ],
    tags: [
      { name: "报告管理", description: "报告生成和查询" },
      { name: "任务管理", description: "任务查询" },
      { name: "文件资源", description: "文件直接访问" }
    ],
    paths: {
      "/api/reports/generateReport": {
        post: {
          tags: ["报告管理"],
          summary: "生成报告",
          description: "创建报告生成任务，支持 PDF 格式输出",
          requestBody: {
            required: true,
            description: "报告生成请求",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GenerateReportRequest" },
                examples: {
                  test: {
                    $ref: "#/components/examples/GenerateTestTemplateExample"
                  },
                  "health-report": {
                    $ref: "#/components/examples/GenerateHealthReportExample"
                  }
                }
              }
            }
          },
          responses: {
            "201": {
              description: "报告生成任务已创建",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/GenerateReportResponse"
                  }
                }
              }
            },
            "400": {
              description: "请求参数错误",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/api/reports/getReportTask/{reportId}": {
        get: {
          tags: ["报告管理"],
          summary: "通过报告ID获取任务",
          description: "根据报告 ID 获取关联的任务执行详情",
          parameters: [
            {
              name: "reportId",
              in: "path",
              required: true,
              description: "报告 ID",
              schema: { type: "string", format: "uuid" }
            }
          ],
          responses: {
            "200": {
              description: "任务详情",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ReportTaskResponse" }
                }
              }
            },
            "404": {
              description: "报告不存在",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tasks/getAllTasks": {
        get: {
          tags: ["任务管理"],
          summary: "获取任务列表",
          description: "返回所有任务，支持按状态和时间范围筛选",
          parameters: [
            {
              name: "status",
              in: "query",
              description: "按状态筛选",
              schema: {
                type: "string",
                enum: ["pending", "processing", "completed", "failed"]
              }
            },
            {
              name: "startTime",
              in: "query",
              description: "开始时间 (ISO 格式)",
              schema: { type: "string", format: "date-time" }
            },
            {
              name: "endTime",
              in: "query",
              description: "结束时间 (ISO 格式)",
              schema: { type: "string", format: "date-time" }
            }
          ],
          responses: {
            "200": {
              description: "任务列表",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TasksResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tasks/getTask/{taskId}": {
        get: {
          tags: ["任务管理"],
          summary: "获取单个任务",
          description: "根据任务 ID 获取任务详情",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              description: "任务 ID",
              schema: { type: "string", format: "uuid" }
            }
          ],
          responses: {
            "200": {
              description: "任务详情",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TaskDetailResponse" }
                }
              }
            },
            "404": {
              description: "任务不存在",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tasks/deleteTask/{taskId}": {
        delete: {
          tags: ["任务管理"],
          summary: "删除任务记录",
          description: "根据任务 ID 删除任务记录（不会删除已生成的文件）",
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              description: "任务 ID",
              schema: { type: "string", format: "uuid" }
            }
          ],
          responses: {
            "200": {
              description: "删除成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string" } }
                  }
                }
              }
            },
            "404": {
              description: "任务不存在",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/api/files/getAllFiles": {
        get: {
          tags: ["文件资源"],
          summary: "获取已生成文件列表",
          description: "返回所有已生成完成且可通过 HTTP 地址访问的报告文件列表",
          responses: {
            "200": {
              description: "文件列表",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FileListResponse" }
                }
              }
            }
          }
        }
      },
      "/files/{filename}": {
        get: {
          tags: ["文件资源"],
          summary: "直接访问文件",
          description: "通过文件名直接访问/下载报告文件，格式为 {reportId}.pdf",
          parameters: [
            {
              name: "filename",
              in: "path",
              required: true,
              description: "文件名 (如 xxx.pdf)",
              schema: { type: "string", pattern: "^[a-f0-9-]+\\.pdf$" }
            }
          ],
          responses: {
            "200": {
              description: "文件内容",
              content: {
                "application/pdf": {}
              }
            },
            "202": {
              description: "文件尚未生成完成",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "400": {
              description: "无效的文件名格式",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "404": {
              description: "文件不存在",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        },
        delete: {
          tags: ["文件资源"],
          summary: "删除文件",
          description:
            "删除指定的报告文件及其关联的任务记录，格式为 {reportId}.pdf",
          parameters: [
            {
              name: "filename",
              in: "path",
              required: true,
              description: "文件名 (如 xxx.pdf)",
              schema: { type: "string", pattern: "^[a-f0-9-]+\\.pdf$" }
            }
          ],
          responses: {
            "200": {
              description: "删除成功",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string" } }
                  }
                }
              }
            },
            "400": {
              description: "无效的文件名格式",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "404": {
              description: "文件不存在",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", description: "错误信息" },
            message: { type: "string", description: "详细错误描述" },
            details: { description: "错误详情" }
          },
          required: ["error"]
        },
        TaskError: {
          type: "object",
          properties: {
            code: { type: "string", description: "错误代码" },
            message: { type: "string", description: "错误消息" },
            details: {
              nullable: true,
              description: "错误详情"
            }
          },
          required: ["code", "message"]
        },
        ReportStatus: {
          type: "string",
          enum: ["pending", "processing", "completed", "failed"]
        },
        OutputFormat: { type: "string", enum: ["pdf"] },
        GenerateReportRequest: {
          type: "object",
          description: "生成报告请求",
          properties: {
            templateId: {
              type: "string",
              description: "模板 ID (test, health-report)"
            },
            format: {
              $ref: "#/components/schemas/OutputFormat",
              default: "pdf"
            },
            data: {
              oneOf: [
                { $ref: "#/components/schemas/TestTemplateData" },
                { $ref: "#/components/schemas/HealthReportData" }
              ]
            }
          },
          required: ["templateId", "data"]
        },
        ContentObject: {
          type: "object",
          description: "任务产出内容",
          properties: {
            reportId: {
              type: "string",
              format: "uuid",
              description: "报告 ID"
            },
            file: {
              type: "string",
              nullable: true,
              description: "文件资源链接 (完成后可用，如 /files/{reportId}.pdf)"
            }
          },
          required: ["reportId"]
        },
        TaskDetail: {
          type: "object",
          description: "任务执行详情",
          properties: {
            templateId: { type: "string", description: "模板 ID" },
            format: { $ref: "#/components/schemas/OutputFormat" },
            createdAt: { type: "string", format: "date-time" },
            startedAt: { type: "string", format: "date-time", nullable: true },
            completedAt: {
              type: "string",
              format: "date-time",
              nullable: true
            },
            duration: {
              type: "integer",
              nullable: true,
              description: "执行耗时（毫秒）"
            },
            error: { type: "object", nullable: true, description: "错误信息" }
          },
          required: ["templateId", "format", "createdAt"]
        },
        GenerateReportResponse: {
          type: "object",
          description: "生成报告响应",
          properties: {
            taskId: { type: "string", format: "uuid", description: "任务 ID" },
            status: { $ref: "#/components/schemas/ReportStatus" },
            content: { $ref: "#/components/schemas/ContentObject" }
          },
          required: ["taskId", "status", "content"]
        },
        ReportTaskResponse: {
          type: "object",
          description: "报告关联的任务详情",
          properties: {
            taskId: { type: "string", format: "uuid", description: "任务 ID" },
            status: { $ref: "#/components/schemas/ReportStatus" },
            content: { $ref: "#/components/schemas/ContentObject" },
            detail: { $ref: "#/components/schemas/TaskDetail" }
          },
          required: ["taskId", "status", "content", "detail"]
        },
        FileListItem: {
          type: "object",
          description: "已生成的文件项",
          properties: {
            reportId: {
              type: "string",
              format: "uuid",
              description: "报告 ID"
            },
            taskId: { type: "string", format: "uuid", description: "任务 ID" },
            templateId: { type: "string", description: "模板 ID" },
            filename: { type: "string", description: "输出文件名" },
            file: {
              type: "string",
              format: "uri",
              description: "可通过 HTTP 访问的文件地址"
            },
            status: { $ref: "#/components/schemas/ReportStatus" },
            createdAt: { type: "string", format: "date-time" },
            completedAt: {
              type: "string",
              format: "date-time",
              nullable: true
            }
          },
          required: [
            "reportId",
            "taskId",
            "templateId",
            "filename",
            "file",
            "status",
            "createdAt",
            "completedAt"
          ]
        },
        FileListResponse: {
          type: "object",
          description: "文件列表响应",
          properties: {
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/FileListItem" }
            },
            total: { type: "integer", description: "文件总数" }
          },
          required: ["items", "total"]
        },
        TasksResponse: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/TaskListItem" }
            }
          }
        },
        TaskListItem: {
          type: "object",
          description: "任务列表项",
          properties: {
            taskId: { type: "string", format: "uuid", description: "任务 ID" },
            status: { $ref: "#/components/schemas/ReportStatus" },
            content: { $ref: "#/components/schemas/ContentObject" },
            templateId: { type: "string", description: "模板 ID" },
            format: {
              type: "string",
              enum: ["pdf"],
              description: "输出格式"
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "创建时间"
            },
            startedAt: {
              type: "string",
              format: "date-time",
              description: "开始处理时间"
            },
            completedAt: {
              type: "string",
              format: "date-time",
              description: "完成时间"
            },
            error: { $ref: "#/components/schemas/TaskError" }
          },
          required: [
            "taskId",
            "status",
            "content",
            "templateId",
            "format",
            "createdAt"
          ]
        },
        TaskDetailResponse: {
          type: "object",
          description: "单个任务详情响应",
          properties: {
            taskId: { type: "string", format: "uuid", description: "任务 ID" },
            status: { $ref: "#/components/schemas/ReportStatus" },
            content: { $ref: "#/components/schemas/ContentObject" },
            detail: { $ref: "#/components/schemas/TaskDetail" }
          },
          required: ["taskId", "status", "content", "detail"]
        },
        PatientInfo: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            gender: { type: "string", enum: ["男", "女"] },
            age: { type: "integer", minimum: 0, maximum: 150 },
            idCard: { type: "string" },
            examDate: { type: "string" }
          },
          required: ["name", "gender", "age"]
        },
        ExamItem: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { oneOf: [{ type: "string" }, { type: "number" }] },
            unit: { type: "string" },
            reference: { type: "string" },
            status: { type: "string", enum: ["normal", "high", "low"] }
          },
          required: ["name", "value", "unit", "reference", "status"]
        },
        HealthReportData: {
          type: "object",
          description: "健康体检报告数据",
          properties: {
            patientInfo: {
              allOf: [{ $ref: "#/components/schemas/PatientInfo" }],
              properties: {
                idCard: { type: "string" },
                examDate: { type: "string" }
              },
              required: ["idCard", "examDate"]
            },
            examItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  items: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ExamItem" }
                  }
                }
              }
            },
            summary: {
              type: "object",
              properties: {
                conclusion: { type: "string" },
                suggestions: { type: "array", items: { type: "string" } }
              },
              required: ["conclusion", "suggestions"]
            }
          },
          required: ["patientInfo", "examItems", "summary"]
        },
        TestTemplateData: {
          type: "object",
          description: "测试报告数据",
          properties: {
            hospitalName: {
              type: "string",
              minLength: 1,
              description: "医院名称"
            }
          },
          required: ["hospitalName"]
        }
      },
      examples: {
        GenerateTestTemplateExample: {
          summary: "生成测试报告示例",
          value: {
            templateId: "test",
            format: "pdf",
            data: {
              hospitalName: "某市第一人民医院"
            }
          }
        },
        GenerateHealthReportExample: {
          summary: "生成健康体检报告示例",
          value: {
            templateId: "health-report",
            format: "pdf",
            data: {
              patientInfo: {
                name: "张三",
                gender: "男",
                age: 35,
                idCard: "110101199001011234",
                examDate: "2025-11-27"
              },
              examItems: [
                {
                  category: "血常规",
                  items: [
                    {
                      name: "白细胞计数",
                      value: 6.5,
                      unit: "10^9/L",
                      reference: "4.0-10.0",
                      status: "normal"
                    }
                  ]
                }
              ],
              summary: {
                conclusion: "体检结果基本正常",
                suggestions: ["建议定期复查", "保持良好作息"]
              }
            }
          }
        }
      }
    }
  };
}

/** 导出 OpenAPI 规范实例 */
export const openApiSpec = generateOpenApiSpec();
