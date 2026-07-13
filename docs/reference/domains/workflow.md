# 工作流

域名：`workflow`

复合工作流、脚本库与宏编排域，是 built-in 高层编排入口。

## Profile

- workflow
- full

## 典型场景

- 一键 API 采集
- 注册与验证流程
- 批量探测与 bundle 搜索
- 多步宏编排

## 常见组合

- workflow + browser + network

## 工具清单（10）

| 工具 | 说明 |
| --- | --- |
| `page_script_register` | 在脚本库中注册可复用的命名 JavaScript 片段。 |
| `page_script_run` | 在当前页面上下文中执行脚本库里的命名脚本。 |
| `api_probe_batch` | 在浏览器上下文中批量探测多个 API 端点。 |
| `js_bundle_search` | 抓取远程 JavaScript Bundle，并在一次调用中按多个命名正则模式搜索。 |
| `list_extension_workflows` | 列出已安装的扩展工作流。 |
| `run_extension_workflow` | 执行指定的扩展工作流。 |
| `reverse_session` | 创建、检查、列出、预览或运行端到端的逆向工程工作流会话，包含产物根目录、跨域工具调用和证据引用。支持 android、native、web 等平台，按计划步骤依次执行并将结果归入可恢复的会话。 |
| `workflow_run_inspect` | 检视全局工作流运行记录：列出最近的 run_extension_workflow / run_macro 运行；按 runId 获取单次运行的详情；获取某个工作流或宏的上一次成功执行的完整结果（stepResults / spans / metrics）。 |
| `run_macro` | 执行预设的自动化操作序列。 |
| `list_macros` | 列出所有可用宏（内置和用户自定义），包含名称、描述、标签和步骤数。 |
