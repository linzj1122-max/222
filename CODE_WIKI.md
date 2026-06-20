# Trae Agent 项目 Code Wiki

> 本文档系统地分析与解读由 ByteDance 开源的 [Trae Agent](https://github.com/bytedance/trae-agent) 项目。
> Trae Agent 是一个基于 LLM 的通用软件工程 Agent，专为研究与实际应用场景而设计。

---

## 1. 项目概述

### 1.1 项目定位

Trae Agent 是一个 **LLM 驱动的软件工程 Agent**，提供 CLI 入口，可以按照自然语言指令完成代码阅读、编辑、命令执行与测试验证等一系列软件工程任务。与其他 CLI Agent 相比，它具有以下特点：

- **模块化与可扩展的架构**：Agent、工具、模型、执行器全部解耦，便于研究人员替换组件。
- **多模型提供商支持**：支持 OpenAI、Anthropic、Azure、Doubao、OpenRouter、Ollama、Google Gemini 等。
- **丰富的工具生态**：字符串替换编辑工具、Bash 执行、JSON 编辑、顺序思维、任务完成等。
- **MCP (Model Context Protocol) 支持**：可按需挂载外部 MCP 工具（如 Playwright）。
- **轨迹记录**：自动记录每一次 LLM 交互与 Agent 步骤，便于分析与复现。
- **Docker 模式**：支持在 Docker 容器中执行任务，隔离环境。
- **SWE-bench 评测**：内置 SWE-bench / SWE-bench-Live / Multi-SWE-bench 基准评测流水线。

### 1.2 技术栈

| 类别 | 主要依赖 |
| --- | --- |
| 语言 | Python 3.12+ |
| CLI | Click |
| LLM SDK | openai, anthropic, google-genai, ollama |
| 异步 | asyncio |
| 配置 | PyYAML, pydantic, python-dotenv |
| 容器 | docker, pexpect |
| 输出 | rich, textual |
| 协议 | mcp (Model Context Protocol) |
| 代码解析 | tree-sitter-languages |
| 构建与分发 | hatchling, uv, pyinstaller |
| 测试 | pytest |
| Web 服务（实验性） | FastAPI |

### 1.3 项目仓库结构

```
trae-agent/
├── trae_agent/                  # 主 Python 包
│   ├── __init__.py
│   ├── cli.py                   # CLI 入口：run / interactive / show-config
│   ├── agent/                   # Agent 核心
│   │   ├── __init__.py
│   │   ├── agent.py             # Agent 装配与 run 主循环
│   │   ├── base_agent.py        # BaseAgent 抽象基类
│   │   ├── trae_agent.py        # TraeAgent 具体实现
│   │   ├── agent_basics.py      # AgentExecution / AgentState / AgentStep
│   │   └── docker_manager.py    # Docker 容器生命周期管理
│   ├── tools/                   # 工具模块（Tool / ToolExecutor / 具体工具）
│   │   ├── __init__.py          # 含 tools_registry 注册表
│   │   ├── base.py              # Tool / ToolCall / ToolResult / ToolExecutor 基类
│   │   ├── bash_tool.py         # Bash 工具（持久 Shell 会话）
│   │   ├── edit_tool.py         # 字符串替换编辑工具
│   │   ├── json_edit_tool.py    # JSONPath 编辑工具
│   │   ├── sequential_thinking_tool.py  # 顺序思维工具
│   │   ├── task_done_tool.py    # 任务完成工具
│   │   ├── ckg_tool.py          # CKG 工具
│   │   ├── ckg/                 # CKG 数据库相关
│   │   ├── mcp_tool.py          # MCP 工具包装
│   │   ├── docker_tool_executor.py  # Docker 模式下的工具执行器
│   │   ├── run.py               # 简单子进程运行封装
│   │   └── edit_tool_cli.py / json_edit_tool_cli.py  # PyInstaller 打包的 CLI 工具
│   ├── prompt/                  # Prompt 模板
│   │   └── agent_prompt.py      # TraeAgent system prompt
│   └── utils/                   # 工具函数
│       ├── cli/                 # CLI 控制台（简单/富文本）
│       ├── config.py            # 配置数据结构 (Config / TraeAgentConfig / ModelConfig ...)
│       ├── legacy_config.py     # 旧版 JSON 配置兼容层
│       ├── llm_clients/         # LLM 客户端（多供应商）
│       │   ├── llm_client.py    # 路由分发的主 LLM Client
│       │   ├── llm_basics.py    # LLMMessage / LLMResponse / LLMUsage
│       │   ├── base_client.py   # BaseLLMClient 基类
│       │   ├── openai_client.py
│       │   ├── anthropic_client.py
│       │   ├── azure_client.py
│       │   ├── doubao_client.py
│       │   ├── google_client.py
│       │   ├── ollama_client.py
│       │   └── openrouter_client.py
│       ├── mcp_client.py        # MCP 客户端（连接/发现/调用/清理）
│       └── trajectory_recorder.py   # 执行轨迹记录器
├── docs/                         # 文档
│   ├── roadmap.md               # HTTP Server 路线图
│   ├── tools.md                 # 工具说明文档
│   ├── legacy_config.md         # 旧版 JSON 配置说明
│   └── TRAJECTORY_RECORDING.md # 轨迹记录说明
├── evaluation/                   # SWE-bench 基准评测流水线
│   ├── run_evaluation.py        # 评测主入口脚本
│   ├── setup.sh                 # 环境准备脚本
│   └── ...
├── server/                       # 实验性 HTTP Server（基于 FastAPI）
├── tests/                        # 单元/集成测试
├── .github/                      # GitHub Issue/PR 模板、CI
├── .vscode/                      # VS Code 调试配置
├── pyproject.toml                # 项目配置、依赖、pytest、ruff
├── uv.lock                       # uv 依赖锁
├── Makefile                      # 开发辅助
├── trae_config.yaml.example      # 推荐的 YAML 配置示例
├── trae_config.json.example      # 旧版 JSON 配置示例
├── CONTRIBUTING.md               # 贡献指南
└── README.md                     # 项目说明
```

---

## 2. 总体架构

### 2.1 架构分层图

```
                     ┌─────────────────────────────┐
                     │        CLI / Server         │
                     │  (cli.py, server/main.py)   │
                     └────────────┬────────────────┘
                                  │ 任务 / 配置 / 参数
                                  ▼
                     ┌─────────────────────────────┐
                     │          Config             │
                     │   (utils/config.py)         │
                     └────────────┬────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────────┐
                     │           Agent             │
   ┌──────────────────  agent/agent.py (装配)      │
   │                 │  BaseAgent / TraeAgent      │
   │                 └──┬─────────────┬────────────┘
   │                    │             │
   │          ┌─────────┘             └──────────┐
   │          ▼                                  ▼
   │  ┌──────────────────┐          ┌────────────────────┐
   │  │  LLMClient       │          │  ToolExecutor      │
   │  │  (多供应商路由)   │          │  (含 Docker 版本)   │
   │  └──┬───────────────┘          └──┬──────────┬──────┘
   │     │                             │          │
   │     ▼                             ▼          ▼
   │  ┌───────────┐   ┌──────────┐  ┌──────┐   ┌───────┐
   │  │ openai /  │...│ anthropic │..│ bash │..│ edit  │...
   │  └───────────┘   └──────────┘  └──────┘   └───────┘
   │                                                    │
   └───> TrajectoryRecorder (记录 LLM/Step/Tool 轨迹)  │
                                                         │
                     ┌────────────────────────────────────┐
                     │  可选: MCP Client + Docker Manager │
                     └────────────────────────────────────┘
```

### 2.2 核心流程（以 `trae-cli run` 为例）

1. **参数解析** (`cli.py`)：解析任务、provider、model、working-dir、docker 选项、轨迹文件等。
2. **配置加载** (`utils/config.py`)：
   - 从 YAML 读取 `agents / models / model_providers / mcp_servers / lakeview`；
   - 解析 `TraeAgentConfig / ModelConfig / ModelProvider / MCPServerConfig`；
   - CLI 参数覆盖 YAML 配置，YAML 覆盖环境变量。
3. **Agent 装配** (`agent/agent.py`)：
   - 根据 `agent_type` 选择具体实现（目前仅 `trae_agent`）；
   - 实例化 `TraeAgent(config)`；
   - 绑定 `TrajectoryRecorder` 与 `CLIConsole`（Simple 或 Rich）。
4. **主循环** (`agent/base_agent.py: BaseAgent.execute_task`)：
   - 初始化 LLM 消息（含 system prompt）；
   - 循环：调用 LLM → 解析 tool_calls → 通过 `ToolExecutor.parallel_tool_call` 执行 → 把结果注入对话；
   - 若 LLM 返回 `task_done` 工具调用，进入任务完成校验；
   - 超出 `max_steps` 则以失败告终；
   - 每一步调用 `TrajectoryRecorder` 记录状态。
5. **Docker 模式**：若提供 Docker image/container/ Dockerfile，`DockerManager` 会启动/挂载容器，并使用 `DockerToolExecutor` 在容器内执行 bash/edit 工具。
6. **收尾**：写出轨迹、输出最终成功/失败状态，可选地写入 patch 文件。

---

## 3. 配置系统

### 3.1 配置结构（YAML，推荐）

根节点包含：

| 字段 | 含义 |
| --- | --- |
| `agents` | 各 Agent 的配置（目前仅 `trae_agent`），含 tools / model / max_steps / enable_lakeview / allow_mcp_servers |
| `models` | 模型定义，引用 `model_providers` 中的 provider，含 temperature、top_p、max_tokens、parallel_tool_calls 等 |
| `model_providers` | API provider 及其 `api_key` / `base_url` / `api_version` |
| `mcp_servers` | MCP 服务器声明（stdio/sse/http/websocket） |
| `lakeview` | Lakeview 模型配置（可选，用于 Agent 步骤摘要） |

示例（来自 `trae_config.yaml.example`）：

```yaml
agents:
  trae_agent:
    enable_lakeview: true
    model: trae_agent_model
    max_steps: 200
    tools:
      - bash
      - str_replace_based_edit_tool
      - sequentialthinking
      - task_done
    allow_mcp_servers:
      - playwright

mcp_servers:
  playwright:
    command: npx
    args:
      - "@playwright/mcp@0.0.27"

lakeview:
  model: lakeview_model

model_providers:
  anthropic:
    api_key: your_anthropic_api_key
    provider: anthropic

models:
  trae_agent_model:
    model_provider: anthropic
    model: claude-4-sonnet
    max_tokens: 4096
    temperature: 0.5
    top_p: 1
    top_k: 0
    max_retries: 10
    parallel_tool_calls: true
  lakeview_model:
    model_provider: anthropic
    model: claude-3.5-sonnet
    max_tokens: 4096
    temperature: 0.5
```

### 3.2 优先级规则

```
CLI 参数 > 配置文件 (YAML/JSON) > 环境变量（如 OPENAI_API_KEY）> 代码默认值
```

- 环境变量命名约定：`{PROVIDER_NAME_UPPERCASE}_API_KEY` / `{PROVIDER_NAME_UPPERCASE}_BASE_URL`。
- 旧版 JSON 配置仍可通过 `Config.create_from_legacy_config()` 加载，但项目鼓励迁移到 YAML。

### 3.3 关键配置类（`utils/config.py`）

| 类 | 作用 |
| --- | --- |
| `Config` | 顶层配置装配类；`create(config_file=...)` YAML 解析；`create_from_legacy_config(...)` JSON 兼容。 |
| `TraeAgentConfig(AgentConfig)` | TraeAgent 专用配置；含 `tools / max_steps / enable_lakeview / allow_mcp_servers / model`。 |
| `ModelConfig` | 单个模型的生成参数。含 `resolve_config_values(...)` 允许 CLI 覆盖。 |
| `ModelProvider` | API provider 信息：`api_key / provider / base_url / api_version`。 |
| `MCPServerConfig` | MCP 服务器声明（stdio / http / sse / websocket 参数）。 |
| `LakeviewConfig` | Lakeview 摘要使用的模型配置。 |

---

## 4. Agent 模块详解

### 4.1 `agent/__init__.py` 与 `agent/agent.py`

对外暴露：`Agent` / `BaseAgent` / `TraeAgent`。

`Agent`（装配器）：

- 依据 `agent_type` 字符串（仅 `trae_agent` 当前实现）选择具体 Agent 类。
- 创建 `TrajectoryRecorder`，并决定使用 `SimpleCLIConsole` 还是 `RichCLIConsole`。
- 若 Agent 启用 Lakeview，则将 Lakeview 相关信息注入 console。
- 主方法 `async run(task, extra_args, tool_names)`：初始化 MCP → 展示任务信息 → 调用底层 `agent.execute_task()` → 等待控制台结束。

### 4.2 `BaseAgent`（`agent/base_agent.py`）

**状态机**：`AgentState.RUNNING / COMPLETED / ERROR`，每一步用 `AgentStep` 记录。

核心方法：

| 方法 | 职责 |
| --- | --- |
| `execute_task()` | 主循环：调用 `_run_llm_step`，检查任务完成或超过 `max_steps`；最后调用 `_close_tools` 清理资源。 |
| `_run_llm_step()` | 调用 `LLMClient.chat(...)` 获得 `LLMResponse`；若有 `tool_calls` 走工具分支，否则检查完成指示器。 |
| `_tool_call_handler()` | 根据 `parallel_tool_calls` 使用并行或顺序执行工具，把 `ToolResult` 反喂给 LLM。 |
| `_finalize_step()` | 记录轨迹、更新 CLI Console 状态、将 step append 到 `AgentExecution`。 |
| `reflect_on_result(tool_results)` | 默认返回 `None`；子类可覆盖以驱动反思策略。 |
| `llm_indicates_task_completed(response)` | 检查 LLM 是否"声称完成"；可覆写。 |
| `_is_task_completed(response)` | 二次确认任务完成性；可覆写。 |
| `cleanup_mcp_clients()` | MCP 清理钩子，由子类实现。 |
| `_close_tools()` | 调用 `ToolExecutor.close_tools()`，释放 bash 会话等资源。 |

### 4.3 `TraeAgent`（`agent/trae_agent.py`）

ByteDance 实际使用的 Agent 实现。它在 `BaseAgent` 基础上新增：

- **MCP 工具发现**：`discover_mcp_tools()` 会遍历 `mcp_servers_config`，为每个允许的 MCP 服务器启动 `MCPClient`，并将返回的工具包装为 `MCPTool` 加入 `self._tools`。
- **Patch 生成**：`must_patch=True` 时，在任务"完成"时会自动调用 `get_git_diff()` 获取 Git diff，并在 `patch_path` 写出 patch 文件。
- **去除测试目录的补丁**：`remove_patches_to_tests()` 过滤掉 diff 中影响 tests 目录的片段，用于评估场景下"保证不破坏测试"的原则。
- **任务完成判定覆盖**：`llm_indicates_task_completed` 改为仅识别 `task_done` 工具调用；`_is_task_completed` 附加了 patch 非空校验。

### 4.4 Agent 执行数据结构（`agent/agent_basics.py`）

| 类 | 作用 |
| --- | --- |
| `AgentState` (Enum) | RUNNING / COMPLETED / ERROR |
| `AgentStepState` | THINKING / CALLING_TOOL / REFLECTING / COMPLETED / ERROR |
| `AgentStep` | 单个步骤，包含 LLM response、tool_calls、tool_results、reflection、error 等信息 |
| `AgentExecution` | 一次完整任务运行的聚合结果，包含 steps、总 token 使用、执行耗时、成功/失败状态、最终输出 |

---

## 5. 工具（Tools）模块详解

### 5.1 工具基类（`tools/base.py`）

- **`Tool`**（抽象基类）：每个工具需实现：
  - `get_name()` / `get_description()` / `get_parameters() -> list[ToolParameter]`；
  - `async execute(arguments) -> ToolExecResult`；
  - 可选 `async close()` 释放资源；
  - `json_definition()`：自动根据参数生成 JSON Schema（用于 LLM function calling）。
- **`ToolCall`**：LLM 解析出的工具调用，含 `name / arguments / call_id`。
- **`ToolResult`**：工具执行结果，含 `success / result / error / call_id`。
- **`ToolExecutor`**：
  - `execute_tool_call(tool_call)` 路由到对应 `Tool`；
  - `parallel_tool_call(...)` 使用 `asyncio.gather` 并行执行；
  - `sequential_tool_call(...)` 顺序执行；
  - `close_tools()` 集中调用各工具的 `close()`。

### 5.2 工具注册表（`tools_registry`，`tools/__init__.py`）

```python
tools_registry: dict[str, type[Tool]] = {
    "bash": BashTool,
    "str_replace_based_edit_tool": TextEditorTool,
    "json_edit_tool": JSONEditTool,
    "sequentialthinking": SequentialThinkingTool,
    "task_done": TaskDoneTool,
    "ckg": CKGTool,
}
```

配置中 `agents.trae_agent.tools` 列表的字符串会在 `BaseAgent.__init__` 中由此表查找并实例化相应工具，并把 `model_provider` 传入以便生成 provider 特定的 JSON Schema。

### 5.3 具体工具说明

#### 5.3.1 `BashTool`（`tools/bash_tool.py`）

- 维护一个 **持久 Shell 会话**（`_BashSession`），默认用 `asyncio.subprocess` + `/bin/bash`，Windows 下退化为 `cmd.exe /v:on`。
- 每个命令通过：写入命令 → 写入 `echo <error-code-marker>` → 读取 stdout/stderr 直到 marker 出现，解析 exit code。
- 具有 120s 超时能力；支持 `restart: true` 参数重启会话；在任务结束时 `close()` 会 `terminate` 进程。
- Docker 模式下通过 `DockerToolExecutor` 把 bash/edit 工具转交给容器内的预编译工具（PyInstaller 打包的 `edit_tool_cli.py` / `json_edit_tool_cli.py`）。

#### 5.3.2 `TextEditorTool`（`tools/edit_tool.py`）

字符串替换编辑工具，子命令：`view / create / str_replace / insert`。

- `view path [view_range]`：显示文件（或目录树，最深 2 层），支持行号与 `[start, end]` 区间；
- `create path file_text`：新建文件，若已存在报错；
- `str_replace path old_str new_str`：要求 old_str 精确、**唯一**，否则拒绝替换；
- `insert path insert_line new_str`：在 `insert_line` 之后插入文本。

核心约束：**所有 `path` 必须是绝对路径**（与 system prompt 中"必须使用绝对路径"要求一致）。

#### 5.3.3 `JSONEditTool`（`tools/json_edit_tool.py`）

使用 `jsonpath-ng` 解析 JSONPath 表达式，支持 `view / set / add / remove`：

- `view`：读取整个文件或指定路径内容；
- `set`：替换现有值；
- `add`：向对象添加属性或向数组追加元素；
- `remove`：删除元素。

#### 5.3.4 `SequentialThinkingTool`（`tools/sequential_thinking_tool.py`）

"软工具"——不产生副作用，只是在对话中插入结构化思维步骤，让 LLM 显式思考，提高复杂问题解决质量。参数：`thought / thought_number / total_thoughts / next_thought_needed / revision 相关字段`。

#### 5.3.5 `TaskDoneTool`（`tools/task_done_tool.py`）

无副作用，Agent 通过调用 `task_done` 工具显式声明"我认为任务已完成"，供 `TraeAgent` 的完成判定逻辑识别。

#### 5.3.6 `CKGTool`（`tools/ckg_tool.py`）

CKG (Code Knowledge Graph) 工具：用于为大型代码库构建轻量级知识图谱，辅助 LLM 理解上下文。配套 `tools/ckg/` 目录的数据库与清理逻辑（`clear_older_ckg`）。

### 5.4 `DockerToolExecutor`（`tools/docker_tool_executor.py`）

当 Agent 使用 Docker 模式时，对 bash / str_replace_based_edit_tool / json_edit_tool 的调用会被转发到容器内部执行（借助预编译的 CLI 工具 + `docker exec` 实现），其他工具仍在本地执行。

---

## 6. LLM 客户端模块

### 6.1 入口 `LLMClient`（`utils/llm_clients/llm_client.py`）

根据 `ModelConfig.model_provider.provider` 字符串匹配 `LLMProvider` 枚举，动态选择具体的 `*Client`：

```python
class LLMProvider(Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE = "azure"
    OLLAMA = "ollama"
    OPENROUTER = "openrouter"
    DOUBAO = "doubao"
    GOOGLE = "google"
```

对外接口：

- `chat(messages, model_config, tools) -> LLMResponse`：把 `list[LLMMessage]` 和工具定义传给底层实现，拿到统一的 `LLMResponse`；
- `set_trajectory_recorder(recorder)`：底层 client 自行在交互前后记录；
- `set_chat_history(messages)`：历史上下文管理（某些 provider 使用）。

### 6.2 `BaseLLMClient`（`utils/llm_clients/base_client.py`）

定义接口：每个 provider 必须实现：

- 消息格式适配（把统一的 `LLMMessage` 转为该 SDK 的格式）；
- 工具定义序列化（把 `Tool.json_definition()` 转为 provider 的 tool schema）；
- 响应结构统一为 `LLMResponse(content, tool_calls, usage, model, finish_reason)`。

### 6.3 提供商适配

| 文件名 | Provider | 说明 |
| --- | --- | --- |
| `openai_client.py` | OpenAI | 原生函数调用 / 严格 JSON Schema |
| `anthropic_client.py` | Anthropic | Claude tool_use / tool_result 消息 |
| `azure_client.py` | Azure OpenAI | 兼容 Azure 的部署模型 + `api_version` |
| `doubao_client.py` | Doubao | 字节跳动内部大模型，OpenAI 兼容协议 |
| `google_client.py` | Google Gemini | `google-genai` SDK，含 `candidate_count / stop_sequences` |
| `ollama_client.py` | Ollama | 本地运行模型，走 HTTP 协议 |
| `openrouter_client.py` | OpenRouter | 聚合式 provider 路由 |

### 6.4 消息与使用量数据结构（`utils/llm_clients/llm_basics.py`）

- `LLMMessage(role, content=None, tool_call=None, tool_result=None)`：抽象一条消息，兼容 "assistant tool_call" 与 "user tool_result" 风格。
- `LLMUsage(input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, reasoning_tokens)`：汇总 token 使用，支持 Anthropic 提示缓存与推理 token 区分。
- `LLMResponse(content, usage, model, finish_reason, tool_calls)`：统一响应结构，`tool_calls` 被 base_agent 路由到工具执行器。

---

## 7. MCP（Model Context Protocol）支持

### 7.1 `MCPClient`（`utils/mcp_client.py`）

- 以 `mcp` SDK 为底层实现；
- 支持 stdio / http / sse / websocket 四种 transport，从 `MCPServerConfig` 解析参数；
- 主流程：`connect_and_discover(name, config, mcp_tools_container, provider)` → `session.initialize()` → `session.list_tools()` → 把每个远端工具包装为 `MCPTool` 加入容器；
- `call_tool(name, args)` 执行 MCP 工具；
- 状态机：`MCPServerStatus`（DISCONNECTED / CONNECTING / CONNECTED）。

### 7.2 `MCPTool`（`tools/mcp_tool.py`）

把 MCP 工具适配为 Trae Agent 的 `Tool` 接口：

- 从 MCP 服务返回的 JSON Schema 翻译为 `ToolParameter`；
- `execute(arguments)` 实际委托给 `MCPClient.call_tool`，把返回结果序列化。

### 7.3 生命周期

- Agent 初始化时先 `initialise_mcp()` 发现工具；
- 任务结束或出错时调用 `cleanup_mcp_clients()` 断开 stdio 连接，避免子进程泄漏。

---

## 8. 控制台与 Lakeview

### 8.1 CLI Console（`utils/cli/`）

- `ConsoleFactory` 根据配置和运行模式推荐并实例化：
  - `SimpleCLIConsole`：纯文本、逐行输出；
  - `RichCLIConsole`：基于 `rich` 的带色终端，展示任务进度、步骤摘要。
- `ConsoleMode`：RUN / INTERACTIVE 两种生命周期；
- 接口：`print_task_details(...)`、`update_status(step, execution)`、`set_agent_context(agent, config)`、`set_lakeview(...)`、`start()` 异步展示。

### 8.2 Lakeview（`agent_prompt.py` + `utils/cli/rich_console.py`）

Lakeview 是一个 **轻量步骤摘要模型**，把每个 Agent 步骤的 LLM 响应浓缩为 1-2 句自然语言，在 Rich 控制台的侧边栏显示。它不影响决策，仅面向人类可读性。

- 配置：单独的 `lakeview.model` 指向一个已定义的 `ModelConfig`；
- 触发：每完成一个 Agent Step 后异步向 Lakeview 模型提问；
- 轨迹写入：`TrajectoryRecorder.update_lakeview(step_number, summary)`。

---

## 9. 轨迹记录（Trajectory Recorder）

### 9.1 `TrajectoryRecorder`（`utils/trajectory_recorder.py`）

- 每次运行会产出 1 个 JSON 文件，默认为 `trajectories/trajectory_YYYYMMDD_HHMMSS.json`；
- `start_recording(task, provider, model, max_steps)`：写入元信息；
- `record_llm_interaction(messages, response, provider, model, tools)`：记录一次 LLM 请求-响应；
- `record_agent_step(step_number, state, ...)`：记录一次 Agent step 的决策与结果；
- `update_lakeview(step_number, summary)`：追加 Lakeview 摘要；
- `finalize_recording(success, final_result)`：写入最终状态、执行耗时。

### 9.2 JSON Schema 概览

```jsonc
{
  "task": "...",
  "start_time": "2025-06-14T10:00:00",
  "end_time":   "...",
  "provider":   "anthropic",
  "model":      "claude-4-sonnet",
  "max_steps":  200,
  "success":    true,
  "final_result": "...",
  "execution_time": 42.5,
  "llm_interactions": [
    { "timestamp": "...", "input_messages": [...], "response": {...}, "tools_available": [...]}
  ],
  "agent_steps": [
    { "step_number": 1, "state": "COMPLETED", "llm_response": {...},
      "tool_calls": [...], "tool_results": [...], "lakeview_summary": "..." }
  ]
}
```

---

## 10. Docker 模式

### 10.1 `DockerManager`（`agent/docker_manager.py`）

输入四选一：`image` / `container_id` / `dockerfile_path` / `docker_image_file`。

工作流：
1. 构建镜像 / 加载镜像文件（或直接使用 image）；
2. 以 `sleep infinity` 启动容器，挂载 `{workspace_dir} -> /workspace`；
3. 使用 `docker cp` 把本地 `tools_dir`（含 PyInstaller 编译的 edit/json_edit 工具）拷贝到 `/agent_tools`；
4. 使用 `pexpect.spawn("docker exec -it ... /bin/bash")` 启动持久 shell，用于命令执行；
5. `execute(command, timeout)`：把命令写入 shell，读取输出直到 `---CMD_DONE---<exitcode>` 标记；
6. `stop()`：关闭 shell，若是 self-managed 的容器则停止并删除。

### 10.2 Docker 工具流程

1. CLI 首次启用 Docker 时调用 `build_with_pyinstaller()` 把 `edit_tool_cli.py` / `json_edit_tool_cli.py` 编译为可执行文件，复制到 `trae_agent/dist/`；
2. `DockerManager.start()` 把 `dist/` 内容拷贝到容器的 `/agent_tools`；
3. `DockerToolExecutor` 将对 bash、字符串编辑、JSON 编辑三类工具的调用改写为在容器内运行对应可执行文件。

---

## 11. 入口与 CLI 命令

### 11.1 `trae-cli run [OPTIONS] TASK`（`cli.py`）

关键选项：

| 选项 | 说明 |
| --- | --- |
| `--file / -f PATH` | 从文件读取任务描述（替代 TASK 参数） |
| `--provider / -p` | 覆盖配置中的模型 provider |
| `--model / -m` | 覆盖配置中的模型名 |
| `--model-base-url` | 覆盖 base_url（用于代理/OpenRouter 等） |
| `--api-key / -k` | 指定 API key |
| `--max-steps` | 最大步数 |
| `--working-dir / -w` | 工作目录（作为代码仓库根） |
| `--must-patch / -mp` | 完成时必须产出 Git patch |
| `--patch-path / -pp` | patch 输出路径 |
| `--config-file` | 指定 YAML/JSON 配置路径（默认 `trae_config.yaml`） |
| `--trajectory-file / -t` | 轨迹 JSON 输出路径 |
| `--console-type` | `simple` / `rich` |
| `--agent-type` | 目前仅 `trae_agent` |
| `--docker-image` / `--docker-container-id` / `--dockerfile-path` / `--docker-image-file` / `--docker-keep` | Docker 模式参数 |

### 11.2 `trae-cli interactive`

进入对话模式，用户可以逐次输入任务、`status`、`help`、`clear`、`exit`。

### 11.3 `trae-cli show-config`

输出已解析的有效配置，用于调试 API key / 模型选择。

---

## 12. Prompt 设计

### 12.1 `TRAE_AGENT_SYSTEM_PROMPT`（`prompt/agent_prompt.py`）

核心思想："像一位高级软件工程师那样行事"。主要内容：

1. **路径规则**：所有工具都要求绝对路径（与 `TextEditorTool.validate_path` 呼应）；
2. **七步工作法**：
   - 理解问题 → 探索定位 → 复现 Bug → 调试诊断 → 开发并实施修复 → 严谨地测试/回归 → 总结工作；
3. **`sequential_thinking` 鼓励**：引导 LLM 在复杂决策时多次调用思维工具、设置较大的 `total_thoughts`；
4. **任务完成**：完成后通过 `task_done` 工具显式声明，避免只靠自然语言描述。

### 12.2 动态信息

除 system prompt 之外，由 `TraeAgent.new_task` 动态拼接：

- 项目根路径（`[Project root path]`）；
- 用户问题描述（`[Problem statement]`）；
- Docker 模式时使用 `\workspace` 路径。

---

## 13. 关键模块类图与依赖关系

```
 click  ──► cli.py (trae-cli)
              │
              ▼
         Config (YAML/JSON)
              │
   ┌──────────┴────────────┐
   ▼                       ▼
 Agent (装配器)       TrajectoryRecorder
   │                       ▲
   ▼                       │
 BaseAgent ────────────────┘
   │  ├──> LLMClient ──► openai / anthropic / azure / doubao / google / ollama / openrouter
   │  ├──> ToolExecutor ──► BashTool / TextEditorTool / JSONEditTool / SequentialThinkingTool / TaskDoneTool / CKGTool / MCPTool
   │  └──> (DockerToolExecutor + DockerManager) (当启用 Docker 模式)
   ▼
 TraeAgent
   │  ├──> get_git_diff / remove_patches_to_tests (评估流水线)
   │  ├──> MCPClient (MCP 工具发现)
   │  └──> CLIConsole (SimpleCLIConsole / RichCLIConsole + Lakeview)
   ▼
 prompt.agent_prompt
```

---

## 14. 依赖管理与构建

### 14.1 `pyproject.toml`

- 使用 `hatchling` 作为构建后端；
- `project.scripts.trae-cli = "trae_agent.cli:main"` 声明 CLI 入口；
- 依赖区分为 `dependencies`（运行时必需）与 `optional-dependencies`（测试/评测可选）：
  - `test = ["pytest", "pytest-asyncio", "pytest-mock", "pytest-cov", "pre-commit"]`；
  - `evaluation = ["datasets", "docker", "pexpect", "unidiff"]`。
- `tool.ruff` 配置代码风格（行宽 100，启用 `B / SIM / C4 / E4-E9 / F / I` 规则集）。
- `tool.pytest.ini_options` 指定 `tests/` 为测试根。

### 14.2 `uv` 工作流

- `uv venv` 创建虚拟环境；
- `uv sync --all-extras` 同时安装所有 optional 依赖；
- `uv run pytest tests/` 运行测试；
- `uv run pre-commit run --all-files` 进行代码质量检查。

### 14.3 PyInstaller 打包

- `edit_tool_cli.py` / `json_edit_tool_cli.py` 是为 Docker 模式设计的独立可执行文件，由 PyInstaller 打包；
- 产物存放在 `trae_agent/dist/` 并由 `DockerManager` 拷贝到容器内 `/agent_tools`。

---

## 15. 评测流水线（`evaluation/`）

### 15.1 目标

对以下基准执行端到端评测：

- **SWE-bench**（含 Verified / Lite）
- **SWE-bench-Live**（持续更新的 live benchmark）
- **Multi-SWE-bench**（多语言：Java/TS/JS/Go/Rust/C/C++）

### 15.2 流程（`run_evaluation.py` + `setup.sh`）

1. **环境准备**：`setup.sh {benchmark}` clone 对应 benchmark 仓库并创建虚拟环境。
2. **运行**：
   ```bash
   python run_evaluation.py \
     --dataset SWE-bench_Verified \
     --working-dir ./trae-workspace \
     [--instance_ids django__django-12345 ...] \
     [--mode expr | eval | e2e] \
     [--max_workers N]
   ```
3. **expr**：只让 Agent 在每个实例上生成 patch 并保存；
4. **eval**：使用 benchmark harness 对已有 patch 跑测试；
5. **e2e**：默认模式——先生成 patch，再跑测试。

### 15.3 Docker 环境与产物

- 每个实例可以使用不同的 Docker 镜像；
- Trae Agent 产物（`trae-agent.tar` / `uv.tar` / `uv_shared.tar`）会在所有实例间共享；
- 输出目录：
  ```
  results/{benchmark}_{dataset}_{run_id}/
  ├── predictions.json
  ├── results.json
  └── {instance_id}/
      ├── problem_statement.txt
      ├── {instance_id}.patch
      └── {instance_id}.json
  ```

---

## 16. HTTP Server（`server/`，实验性）

- 以 FastAPI 实现，目标是把 Agent 能力暴露为 HTTP API；
- 支持**并发请求**、**流式响应**；
- 可接受具体的 `model` 参数动态选择模型；
- 未来规划：根据 JSON 轨迹复现步骤、支持更多可插拔组件。

路线图位于 `docs/roadmap.md`。

---

## 17. 运行方式

### 17.1 本机安装（开发环境）

```bash
# 1. 克隆仓库
git clone https://github.com/bytedance/trae-agent.git
cd trae-agent

# 2. 创建并激活虚拟环境
uv venv
uv sync --all-extras
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. 准备配置
cp trae_config.yaml.example trae_config.yaml
# 编辑 trae_config.yaml，填入 API Key

# 4. 执行任务
trae-cli run "为 main.py 添加对 Python 3.12 的类型检查" \
  --working-dir /path/to/project

# 5. 查看输出与轨迹
#   默认轨迹: trajectories/trajectory_YYYYMMDD_HHMMSS.json
```

### 17.2 交互式模式

```bash
trae-cli interactive --provider anthropic --model claude-4-sonnet --max-steps 30
```

运行后可输入：

- 任务描述：直接交给 Agent 解决；
- `status`：查看当前 Agent 状态；
- `help`：查看可用命令；
- `clear`：清屏；
- `exit` / `quit`：退出。

### 17.3 Docker 模式

```bash
trae-cli run "升级 requirements 至最新版本" \
  --docker-image python:3.12 \
  --working-dir /path/to/project

# 或使用 Dockerfile
trae-cli run "复现并修复 Dockerfile 中描述的环境问题" \
  --dockerfile-path /abs/path/to/Dockerfile

# 或挂载现有容器
trae-cli run "诊断并修复构建错误" \
  --docker-container-id 91998a56056c \
  --docker-keep false
```

### 17.4 MCP 模式

在 `trae_config.yaml` 中添加：

```yaml
agents:
  trae_agent:
    allow_mcp_servers: [playwright]
mcp_servers:
  playwright:
    command: npx
    args:
      - "@playwright/mcp@0.0.27"
```

然后运行：

```bash
trae-cli run "请打开 example.com 并检查首页的标题"
```

### 17.5 运行测试

```bash
make test            # = SKIP_OLLAMA_TEST=true SKIP_OPENROUTER_TEST=true SKIP_GOOGLE_TEST=true uv run pytest
uv run pytest tests/ -v --tb=short
```

---

## 18. 关键源码阅读路径

为快速掌握项目，建议按以下顺序阅读：

1. **入口**：`trae_agent/cli.py` —— 了解 CLI 如何装配参数、选择 Agent、进入主循环。
2. **配置**：`trae_agent/utils/config.py` —— 理解 `Config / TraeAgentConfig / ModelConfig` 结构与优先级。
3. **Agent 核心**：`trae_agent/agent/base_agent.py` → `trae_agent/agent/trae_agent.py` → `trae_agent/agent/agent.py`。
4. **工具系统**：`trae_agent/tools/base.py` → `tools/__init__.py`（`tools_registry`）→ 某个具体工具（如 `bash_tool.py`、`edit_tool.py`）。
5. **LLM 客户端**：`trae_agent/utils/llm_clients/llm_client.py` + `llm_basics.py` + 一个具体 client。
6. **MCP 与 Docker**：`trae_agent/utils/mcp_client.py`、`trae_agent/agent/docker_manager.py`、`trae_agent/tools/docker_tool_executor.py`。
7. **轨迹与 UI**：`trae_agent/utils/trajectory_recorder.py`、`trae_agent/utils/cli/`。
8. **Prompt**：`trae_agent/prompt/agent_prompt.py`。
9. **评测**：`evaluation/run_evaluation.py` + `evaluation/setup.sh`。
10. **文档**：`README.md`、`CONTRIBUTING.md`、`docs/tools.md`、`docs/roadmap.md`。

---

## 19. 扩展点 / 二次开发建议

1. **新增一个 LLM 提供商**：在 `utils/llm_clients/` 下新增 `xxx_client.py`，实现 `BaseLLMClient` 的协议方法；在 `LLMProvider` / `LLMClient.__init__` 新增分支。
2. **新增一个工具**：继承 `Tool` 实现抽象方法，在 `tools_registry` 中注册字符串名，在配置 `tools` 列表启用即可。
3. **定制 Agent 行为**：继承 `BaseAgent` 覆写 `reflect_on_result / llm_indicates_task_completed / _is_task_completed` 等钩子，在 `agent/agent.py` 扩展 `AgentType` 枚举。
4. **接入新的 MCP 工具**：在配置的 `mcp_servers` 中声明服务器即可；无需修改 Agent 代码。
5. **运行时分析 Agent 决策**：直接解析 `trajectories/*.json` 做数据分析、可视化或训练决策模型。
6. **HTTP Server 对接**：在 `server/` 目录下继续完善 FastAPI 路由，把 `Agent.run` 包装为 HTTP 端点。

---

## 20. 参考资源

- [GitHub 仓库](https://github.com/bytedance/trae-agent)
- [技术报告 (arXiv)](https://arxiv.org/abs/2507.23370)
- `docs/tools.md` —— 工具使用说明
- `docs/legacy_config.md` —— 旧版 JSON 配置说明
- `docs/roadmap.md` —— HTTP Server 路线图
- `docs/TRAJECTORY_RECORDING.md` —— 轨迹记录说明
- `CONTRIBUTING.md` —— 贡献指南
- Anthropic [anthropic-quickstarts](https://github.com/anthropics/anthropic-quickstarts)（Trae Agent 的工具系统设计参考）

---

## 附录 A. 关键函数签名与时序图（源码级补充）

> 本附录基于 `main` 分支源码（截至 2026-02-05 commit `e839e55`）整理。

### A.1 `BaseAgent.execute_task` 主循环伪代码

```python
async def execute_task(self) -> AgentExecution:
    if self.docker_manager:
        self.docker_manager.start()
    execution = AgentExecution(task=self._task, steps=[])
    messages = self._initial_messages
    step_number = 1
    execution.agent_state = AgentState.RUNNING
    try:
        while step_number <= self._max_steps:
            step = AgentStep(step_number=step_number, state=AgentStepState.THINKING)
            try:
                messages = await self._run_llm_step(step, messages, execution)
                await self._finalize_step(step, messages, execution)
                if execution.agent_state == AgentState.COMPLETED:
                    break
                step_number += 1
            except Exception as error:
                execution.agent_state = AgentState.ERROR
                step.state = AgentStepState.ERROR
                step.error = str(error)
                await self._finalize_step(step, messages, execution)
                break
        if step_number > self._max_steps and not execution.success:
            execution.final_result = "Task execution exceeded maximum steps..."
            execution.agent_state = AgentState.ERROR
    finally:
        if self.docker_manager and not self.docker_keep:
            self.docker_manager.stop()
        await self._close_tools()            # 释放 bash 会话等资源
        await self.cleanup_mcp_clients()     # 断开 MCP stdio 连接
    return execution
```

### A.2 一次 LLM 步骤的内部时序

```
BaseAgent._run_llm_step
   │
   ├──► CLIConsole.update_status(THINKING)
   │
   ├──► LLMClient.chat(messages, model_config, tools)
   │       │
   │       └──► {OpenAI/Anthropic/Azure/...}Client.chat(...)
   │              │
   │              ├── parse_messages(LLMMessage[]) → provider 格式
   │              ├── retry_with(...)(...)         # 3-30s 随机退避，最多 max_retries 次
   │              ├── 解析 output blocks → ToolCall[] + content
   │              └── TrajectoryRecorder.record_llm_interaction(...)
   │
   ├──► CLIConsole.update_status(LLM_RESPONSE)
   ├──► execution.total_tokens += response.usage
   │
   ├── if llm_indicates_task_completed(response):
   │       ├── if _is_task_completed(response): → AgentState.COMPLETED
   │       └── else: 注入 task_incomplete_message 返回
   │
   └── else: _tool_call_handler(tool_calls, step)
              │
              ├── parallel_tool_call / sequential_tool_call
              │     │
              │     └── (Docker 模式) DockerToolExecutor._execute_in_docker(...)
              │            ├── _translate_path(host_path) → /workspace/...
              │            └── DockerManager.execute("edit_tool ...") via pexpect
              │
              ├── 把 ToolResult 包装成 LLMMessage(role="user", tool_result=...)
              └── reflect_on_result(...) → 可选 LLMMessage(role="assistant", reflection)
```

### A.3 关键类签名一览

```python
# tools/base.py
class Tool(ABC):
    def __init__(self, model_provider: str | None = None): ...
    @cached_property
    def name(self) -> str: ...
    @cached_property
    def description(self) -> str: ...
    @cached_property
    def parameters(self) -> list[ToolParameter]: ...
    @abstractmethod
    async def execute(self, arguments: ToolCallArguments) -> ToolExecResult: ...
    def get_input_schema(self) -> dict[str, object]: ...   # 自动生成 JSON Schema
    async def close(self) -> None: ...                     # 默认 no-op

class ToolExecutor:
    def __init__(self, tools: list[Tool]): ...
    async def execute_tool_call(self, tool_call: ToolCall) -> ToolResult: ...
    async def parallel_tool_call(self, tool_calls: list[ToolCall]) -> list[ToolResult]: ...
    async def sequential_tool_call(self, tool_calls: list[ToolCall]) -> list[ToolResult]: ...
    async def close_tools(self): ...                       # gather(tool.close() ...)

# utils/llm_clients/base_client.py
class BaseLLMClient(ABC):
    def __init__(self, model_config: ModelConfig): ...
    @abstractmethod
    def chat(self, messages, model_config, tools=None, reuse_history=True) -> LLMResponse: ...
    @abstractmethod
    def set_chat_history(self, messages: list[LLMMessage]) -> None: ...
    def supports_tool_calling(self, model_config: ModelConfig) -> bool: ...
    def set_trajectory_recorder(self, recorder) -> None: ...

# utils/llm_clients/retry_utils.py
def retry_with(func, provider_name="OpenAI", max_retries=3) -> Callable: ...
    # 失败时随机 sleep 3-30 秒；最后一次重抛
```

### A.4 OpenAI Client 的关键实现要点

- 使用 `client.responses.create(...)`（OpenAI Responses API）而非传统 `chat.completions`。
- 工具以 `FunctionToolParam(strict=True)` 注册，自动要求 JSON Schema 顶层 `additionalProperties=False`，所有参数强制进入 `required`（与 `Tool.get_input_schema` 中的 OpenAI 特例呼应）。
- 对 `o3 / o4-mini / gpt-5` 模型自动**屏蔽 `temperature`**（这些 reasoning 模型不接受该参数）。
- 工具调用结果通过 `FunctionCallOutput(type="function_call_output", call_id, output)` 写回历史。
- `LLMUsage` 映射：`cached_tokens → cache_read_input_tokens`、`reasoning_tokens → output_tokens_details.reasoning_tokens`。

### A.5 Anthropic Client 的关键实现要点

- `system` 消息**不进入** `messages` 数组，而是单独传给 `system=...` 参数。
- `str_replace_based_edit_tool` 与 `bash` 两个工具直接映射为 Anthropic 内建类型（`TextEditor20250429` / `ToolBash20250124Param`），其他工具走 `ToolParam` 自定义 input_schema。
- 工具调用块以 `ToolUseBlockParam(type="tool_use", id, name, input=json.dumps(...))` 写入 assistant 消息。
- 工具结果以 `ToolResultBlockParam(tool_use_id, content, is_error)` 写入 user 消息；若失败但无错误信息会自动填入 `"Tool execution failed without providing error details."`。
- `LLMUsage` 映射：`cache_creation_input_tokens` 与 `cache_read_input_tokens` 来自 Anthropic 提示词缓存字段。

### A.6 DockerToolExecutor 路径翻译规则

```python
def _translate_path(self, host_path: str) -> str:
    # 把 host 工作目录下的绝对路径翻译为容器内 /workspace/... 路径
    abs_host_path = os.path.abspath(host_path)
    if os.path.commonpath([abs_host_path, self._host_workspace_dir]) == self._host_workspace_dir:
        rel = os.path.relpath(abs_host_path, self._host_workspace_dir)
        return os.path.normpath(os.path.join(self._container_workspace_dir, rel))
    return host_path   # 不在工作目录内的路径原样返回
```

注意：`parallel_tool_call` 在 Docker 模式下会**退化为顺序执行**（防止持久 shell 串扰）。

### A.7 MCPTool 参数翻译

`MCPTool.get_parameters()` 直接从 MCP 服务的 `inputSchema` 翻译为 `ToolParameter` 列表，依据 MCP schema 的 `required` 数组判断每个字段是否必填；`execute()` 调用 `MCPClient.call_tool(name, args)`，若返回 `isError=True` 则把 `content[0].text` 作为 error 返回。

### A.8 任务完成判定的双段式

`BaseAgent` 提供两层钩子，`TraeAgent` 全部覆盖：

1. `llm_indicates_task_completed(response)`：LLM **声称**已完成。
   - 基类：扫描 content 中是否含 "task completed / done / finished successfully" 等关键词。
   - TraeAgent：仅当 `response.tool_calls` 中存在 `task_done` 才视为完成，避免自然语言误判。
2. `_is_task_completed(response)`：**二次校验**。
   - 基类：恒为 `True`。
   - TraeAgent：若 `must_patch="true"`，则要求 `get_git_diff()` 去除 tests 目录后非空，否则视为未完成并返回 `"ERROR! Your Patch is empty..."`。

---

## 附录 B. 本地克隆验证（环境受限说明）

### B.1 执行尝试

在当前运行环境（Windows + PowerShell 5）尝试执行：

```powershell
where.exe git
where.exe uv
where.exe python
python --version
```

**结果**：四条命令均返回 `exit code 9009`（"INFO: Could not find files for the given pattern(s)"），即 **`git` / `uv` / `python` 在该环境均不可用**。

### B.2 影响评估

| 计划动作 | 是否可执行 | 替代方案 |
| --- | --- | --- |
| `git clone https://github.com/bytedance/trae-agent` | ❌ | 通过 GitHub raw 接口逐文件读取 |
| `uv venv && uv sync --all-extras` | ❌ | — |
| `trae-cli run "..."` 实际跑通 | ❌ | — |
| `make test` / `uv run pytest` | ❌ | — |
| 源码静态分析 | ✅ | 已通过 WebFetch 完成 |

### B.3 已通过源码交叉核对的内容

为弥补"无法本地运行"的缺陷，已通过 GitHub raw 接口拉取并核对以下文件，附录 A 中的所有函数签名、字段映射、行为描述均与源码一致：

- `trae_agent/__init__.py`
- `trae_agent/cli.py`
- `trae_agent/agent/__init__.py` / `agent.py` / `base_agent.py` / `trae_agent.py` / `agent_basics.py` / `docker_manager.py`
- `trae_agent/tools/__init__.py` / `base.py` / `bash_tool.py` / `edit_tool.py` / `mcp_tool.py` / `docker_tool_executor.py`
- `trae_agent/utils/config.py`
- `trae_agent/utils/llm_clients/llm_client.py` / `llm_basics.py` / `base_client.py` / `openai_client.py` / `anthropic_client.py` / `retry_utils.py`
- `trae_agent/utils/mcp_client.py`
- `trae_agent/utils/trajectory_recorder.py`
- `trae_agent/prompt/agent_prompt.py`
- `pyproject.toml` / `Makefile` / `trae_config.yaml.example` / `CONTRIBUTING.md`

### B.4 建议（若需完整 B 任务）

要在本机完成"克隆 + 实际运行"验证，需先：

1. 安装 Git for Windows（提供 `git.exe`）；
2. 安装 Python 3.12+；
3. 安装 uv（`pip install uv` 或 `irm https://astral.sh/uv/install.ps1 | iex`）；
4. 配置至少一个 provider 的 API Key；
5. 执行：
   ```powershell
   git clone https://github.com/bytedance/trae-agent.git
   cd trae-agent
   uv venv
   uv sync --all-extras
   . .venv\Scripts\Activate.ps1
   trae-cli show-config
   trae-cli run "Create a hello world Python script"
   ```

---

## 附录 C. 关于"广告/店铺"任务的说明

### C.1 上下文回顾

根据会话中两段语音摘要：

1. 用户反馈"**广告费用页面的日期筛选功能存在 bug**"，希望生成修复指令；
2. 提到"**店铺的 API 用于抓取数据**"，并希望从项目文档中查找相关归属信息。

> 站点线上地址：`https://ozon-wb-control-center.pages.dev/`，功能模块即"广告费用模块"。

### C.2 现状排查（已更正）

> ⚠️ **更正声明**：本附录前一版本曾误判"当前工作目录无广告/店铺相关代码"。
> 实际复核 `functions/api/[[path]].js`、`scripts/main.js`、`index.html` 后确认：
> **广告/店铺功能完整存在于本工作目录**，前一结论系未细读 `functions/` 目录所致，特此纠正。

| 检查项 | 结果 |
| --- | --- |
| 工作目录 `e:\Codex输出\github-222-ready` | 即 `ozon-wb-control-center` 这个 Cloudflare Pages 项目本体 |
| 广告费用模块代码 | ✅ 已存在：后端 [`fetchOzonAdsDailyProducts`](functions/api/[[path]].js) + 前端 [`scripts/main.js`](scripts/main.js) 的 `renderAds` / `drawAdChart` |
| 店铺数据抓取 API | ✅ 已存在：`/api/orders`、`/api/products`、`/api/analytics/*` 走 Seller API |
| 广告数据接入凭证 | ⚠️ 代码就绪，仅需在 Cloudflare 配置 `OZON_ADS_*` 环境变量（见 C.5） |

### C.3 两套 Ozon API 凭证（关键区分）

本项目同时调用 Ozon 的**两个独立 API**，凭证不能混用：

| 用途 | API 域名 | 鉴权方式 | 需要的环境变量 |
| --- | --- | --- | --- |
| 店铺订单 / 产品 / 自然分析 | `api-seller.ozon.ru` | Header `Client-Id` + `Api-Key` | `OZON_STORE_1_CLIENT_ID` + `OZON_STORE_1_API_KEY` |
| **广告费用数据** | `api-performance.ozon.ru` | **OAuth2 `client_credentials` 换 Bearer Token** | **`OZON_ADS_1_CLIENT_ID` + `OZON_ADS_1_CLIENT_SECRET`** |

广告 API 的 `client_id` 形如 `xxxxxxxx-xxxx@advertising.performance.ozon.ru`（email 样式），
`client_secret` 是一串长字符串——这是 Ozon Performance API 的典型特征，**与店铺 Seller API Key 完全不同**。

### C.4 广告费用模块工作流（代码级）

`fetchOzonAdsDailyProducts` 的拉取优先级（见 [`functions/api/[[path]].js`](functions/api/[[path]].js)）：

1. **内存缓存** `ADS_REPORT_ROWS`：同 `clientId|from|to` key 命中且非 `force=1` → 直接返回；
2. **直接 JSON 统计**：依次尝试 `/api/client/statistics/daily/json`、`/expense/json`、`/campaign/product/json`，命中即写缓存返回；
3. **异步报表**（需 `create=1`）：调 `/api/client/statistics` 创建报表 → 轮询状态 → `/api/client/statistics/report?UUID=...` 下载（支持 ZIP/CSV/JSON，含 windows-1251 编码兜底）。

前端 `scripts/main.js` 的"刷新 API 广告数据"按钮会带 `create=1` 触发首次报表创建。

### C.5 推进广告模块所需的最后一步

代码已全部就绪，**唯一缺的是把 Performance API 凭证加到 Cloudflare 环境变量**：

```text
OZON_ADS_1_NAME=<账号显示名，可选>
OZON_ADS_1_CLIENT_ID=<形如 xxxxxxxx-xxxx@advertising.performance.ozon.ru>
OZON_ADS_1_CLIENT_SECRET=<对应的长字符串 secret>
```

> ⚠️ 安全提示：密钥**不要写进仓库**，只在 Cloudflare Pages → Settings → Environment variables 里配置。
> 配置后在 `/api/debug` 检查 `ads.enabled === true` 即可确认生效。

### C.6 本轮已完成的 bug 修复（2026-06-21）

#### 第一批：前端日期筛选 UI（静态审查）

| Bug | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| **两套日期 UI 打架** | 选日期后数据偶发不刷新 | [`index.html`](index.html) 同时存在原生 `<input type="date">` 与动态注入的自定义双月日历，[`ensureAdDatePicker`](scripts/main.js) 把原生 input 的整个 `<label>` 父元素 `display:none`，但仍残留 `change` 监听与 `.value` 写入，状态不同步 | 删除原生 input，统一只用自定义日历；清理 [`main.js`](scripts/main.js) 里对 `$("adDateFrom")`/`$("adDateTo")` 的所有残留监听与赋值 |
| **预设区间按钮不高亮自定义态** | 选非 7/14/28 天区间时三个按钮全暗，用户误以为筛选坏 | [`updateAdDateInputs`](scripts/main.js) 只在 `daysInclusive === 预设值` 时点亮，无"自定义"视觉反馈 | 新增 `custom-range` class：当区间天数 ∉ {7,14,28} 时给日期面板加橙色边框提示 |

#### 第二批：后端广告数据抓取（线上 API 实测确认）

> 用真实凭证（`OZON_ADS_1_*`）调线上 `ozon-wb-control-center.pages.dev` 实测后确认的问题。

| Bug | 实测现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| **"直接 JSON"端点全部 405** | 6 次尝试（3 端点 × 2 body）全返回 `HTTP 405` | `/statistics/daily/json`、`/expense/json`、`/campaign/product/json` 这 3 个端点在 Ozon Performance API 上**不存在**，是代码早期臆测的路径 | 保留 [`fetchAdsDirectJsonRows`](functions/api/[[path]].js) 作为"碰运气"优化，但因 Ozon 不提供同步统计端点，**异步报表是唯一数据通道**；这是设计事实而非 bug |
| **多 campaign 报表卡死** | 8 个 campaign 的报表等 2 分钟仍 `NOT_STARTED`；单 campaign 报表 13 秒就 `OK` 并成功下载 CSV | [`adsReportCampaignIds`](functions/api/[[path]].js) 一次性塞最多 10 个 campaign（含 INACTIVE），Ozon 对此处理极慢或静默丢弃 | ① [`adsReportCampaignIds`](functions/api/[[path]].js) 优先只返回 RUNNING 的；② 新增 [`fetchAdsCampaignReport`](functions/api/[[path]].js) 按**单个 campaign 独立创建+轮询+下载**，[`fetchOzonAdsDailyProducts`](functions/api/[[path]].js) 用 `Promise.all` 并行拉取后合并 |
| **下载端点大小写敏感** | `report?UUID=` ✅ 200，`report?uuid=` ❌ 404，`/{uuid}/report` ❌ 404 | Ozon 只认大写 `UUID=` 查询参数 | [`fetchAdsStatisticsReport`](functions/api/[[path]].js) 删除两个无效的 404 尝试分支，只保留 `report?UUID=` |
| **轮询缺超时** | 旧代码只查一次状态，不等报表 `OK` 就返回 `REPORT_PENDING` | [`fetchOzonAdsDailyProducts`](functions/api/[[path]].js) 旧版创建报表后单次 `fetchAdsStatisticsStatus`，未循环等待 | 新增 [`pollAdsStatisticsStatus`](functions/api/[[path]].js)：最多 20 次 × 3 秒 = 60 秒轮询，命中 `OK/SUCCESS` 或 `ERROR/TIMEOUT` 才返回 |

#### 第三批：周期对比时区边界（原暂缓项，本轮已修）

| Bug | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| **边界日数据漏/重 1 天** | 周期对比在区间边界日的数据可能丢失或重复 | [`daysInclusive`](scripts/main.js) 用本地时区 `new Date`，[`dateInRange`](scripts/main.js) 用裸字符串比较，对带 `T...Z` 后缀或俄罗斯 `dd.mm.yyyy` 格式的日期比较结果不一致 | 新增 [`normalizeAdDate`](scripts/main.js)：把 `row.date` 归一化成 `YYYY-MM-DD`（支持 ISO、带时间戳、`dd.mm.yyyy` 三种格式），[`dateInRange`](scripts/main.js) 比较前先归一化 |

#### 实测验证记录

用 `OZON_ADS_1_CLIENT_ID` / `OZON_ADS_1_CLIENT_SECRET`（ИП Никитина Н.С.1）在 `ozon-wb-control-center.pages.dev` 上实测：

- `/api/debug` → `ads.enabled: true`，账号 client_id/secret 均已配置 ✅
- `/api/probe/ozon-ads` → token ✅、campaign 列表 ✅（11 个活动，4 个 RUNNING）
- 单 campaign 报表（campaign `29600464` "QB60-灰"，6/14–6/20）→ 13 秒内 `state: OK` → CSV 下载成功，含真实数据：
  `17.06.2026; 4675959653; Показы 693; Клики 18; CTR 2,60%; Расход 184,78 ₽`
- 多 campaign 报表（8 个活动）→ 2 分钟仍 `NOT_STARTED`（即 Bug A 的复现）

**改动文件清单（本次三批合并）**：
- [`index.html`](index.html)：删除广告区原生 `adDateFrom`/`adDateTo` input；
- [`scripts/main.js`](scripts/main.js)：清理 `ensureAdDatePicker` 隐藏逻辑、`updateAdDateInputs` 残留赋值、底部 `change` 监听；新增 `custom-range` 高亮态；新增 `normalizeAdDate` 并改造 `dateInRange`；
- [`styles/main.css`](styles/main.css)：新增 `.custom-range` 橙色边框；
- [`functions/api/[[path]].js`](functions/api/[[path]].js)：`adsReportCampaignIds` 优先 RUNNING；新增 `pollAdsStatisticsStatus` + `fetchAdsCampaignReport`；`fetchAdsStatisticsReport` 只保留大写 `UUID=`；`fetchOzonAdsDailyProducts` 改为按单 campaign 并行拉取；
- [`README_CLOUDFLARE_GITHUB.md`](README_CLOUDFLARE_GITHUB.md)：补全 `OZON_ADS_*` 环境变量说明。

---

*本 Code Wiki 基于 `main` 分支的源码与文档整理而成（附录 A 数据截至 commit `e839e55`）。若项目后续迭代变更较大，建议以官方 README 与源码为准。*
