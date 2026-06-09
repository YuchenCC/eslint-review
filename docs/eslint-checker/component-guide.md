# eslint-checker 组件说明

`@sunny/eslint-checker` 是一个 Node CLI 组件，用于检查 JavaScript/TypeScript 工程的 ESLint 接入状态、配置质量、禁用注释、执行结果和治理风险，并把结果写入 `.eslint-checker/`。

## 1. 组件边界

组件只负责事实采集和基础风险评估，不直接生成正式治理报告。

- 输入：业务工程根目录、CLI 参数、业务元数据。
- 输出：`.eslint-checker/report.json`、`summary.md`、`lint-log.txt`，以及可选/条件产物。
- 事实口径：`report.json` 是稳定机器可读产物，后续报告 Skill 必须以它为事实来源。
- 非目标：不修改业务 ESLint 规则；除 recovery 可能安装缺失 ESLint 依赖外，不主动重构业务工程。

## 2. 主流程

入口文件：`src/cli.ts` -> `src/index.ts#runChecker`

主流程固定为 7 步：

1. 初始化检查：解析参数、创建 logger、规范化 timeout。
2. 发现项目与静态 ESLint 上下文：并发采集项目、ESLint 接入、ESLint config 静态分析、源码入口。
3. 采集 resolved ESLint config：对首个源码文件执行 `npx eslint --print-config <file>`。
4. 采集 ESLint 执行结果：full 模式执行 ESLint；access 模式跳过。
5. 解析 ESLint 输出：读取 `eslint-summary.json`，生成问题汇总与证据样例。
6. 评估风险并组装报告：汇总所有采集结果，调用风险评估。
7. 写入产物：校验 schema 后写入 JSON、摘要和日志。

简化流程图：

```text
CLI 参数
  |
  v
runChecker(cwd, options)
  |
  +--> discoverProject
  +--> detectEslintAccess
  +--> analyzeEslintConfig
  +--> discoverSourceEntries
        |
        v
scanEslintDisable
        |
        v
collectResolvedEslintConfig
        |
        v
executeLint -- failed? --> recoverAndRetry --> executeLint
        |
        v
parseEslintSummary
        |
        v
assessRisk
        |
        v
writeArtifacts
```

## 3. 模块职责

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| CLI | `src/cli.ts` | 定义命令名、参数、默认值，并调用 `runChecker`。 |
| 编排 | `src/index.ts` | 组织 7 步主流程，组装 `CheckerReport`。 |
| 项目发现 | `src/discovery/project.ts` | 读取 package、lockfile、Git、Node、包管理器和技术栈信息。 |
| ESLint 接入发现 | `src/discovery/eslintAccess.ts` | 判断 ESLint 依赖、config、`eslintConfig` 和 lint scripts。 |
| 源码入口发现 | `src/discovery/sourceEntries.ts` | 发现 `src`、`apps/*/src`、`apps/*/app`、`packages/*/src`、`packages/*/app`。 |
| Config 静态分析 | `src/analysis/configAnalysis.ts` | 解析 config 中的 extends、禁用规则和弱化标准配置迹象。 |
| Disable 扫描 | `src/analysis/disableScan.ts` | 扫描源码中的 `eslint-disable` 注释并计算风险指标。 |
| Resolved config | `src/analysis/resolvedConfig.ts` | 执行 `eslint --print-config` 并写入 `eslint-config.json`。 |
| ESLint 执行 | `src/lint/execute.ts` | 写入自定义 formatter，执行 ESLint，生成精简 summary。 |
| Recovery | `src/lint/recovery.ts` | 识别缺失 ESLint 依赖，安装后最多重试 2 次。 |
| Summary 解析 | `src/lint/parse.ts` | 读取 formatter 输出并转换为报告字段。 |
| 风险评估 | `src/report/risk.ts` | 基于接入、禁用、lint 问题数计算风险等级和建议。 |
| 产物写入 | `src/report/artifacts.ts` | 校验 schema 并写入 `report.json`、`summary.md`、`lint-log.txt`。 |
| Schema | `src/report/schema.ts` | 使用 zod 校验 `CheckerReport` 结构。 |

## 4. 数据模型

核心类型在 `src/types.ts`：

- `CheckerOptions`：CLI 运行参数。
- `CheckerReport`：最终总报告。
- `EslintAccess`：ESLint 接入状态。
- `EslintConfigAnalysis`：静态 config 分析。
- `EslintResolvedConfig`：`--print-config` 结果状态。
- `EslintDisableAnalysis`：禁用注释统计。
- `LintExecution`：ESLint 执行状态。
- `LintRecovery`：自动恢复状态。
- `LintResult`、`RuleSummaryItem`、`FileSummaryItem`、`LintEvidence`：lint 结果汇总。
- `RiskAssessment`：风险等级、分数、原因和建议。

`CheckerReport.schemaVersion` 当前为 `0.2.0`，写入前由 `checkerReportSchema` 校验。

## 5. 采集规则

源码入口：

- 包含：`src`、`apps/*/src`、`apps/*/app`、`packages/*/src`、`packages/*/app`。
- 排除：`node_modules`、`dist`、`build`、输出目录、任意层级 `public`、`*.min.js`。
- ESLint 执行、disable 扫描、resolved config 使用同一组 source entries。

ESLint 接入等级：

| 等级 | 条件 |
| --- | --- |
| `not_connected` | 未发现 ESLint 依赖、配置和 lint script。 |
| `partial` | 只发现其中一部分。 |
| `connected` | 依赖、配置、lint script 都存在，且 lint script 只有一个。 |
| `well_connected` | 依赖、配置、lint script 都存在，且 lint script 多于一个。 |

ESLint 执行：

- 使用 `npx eslint <source entries> -f <summaryFormatter.cjs> -o <eslint-summary.json>`。
- exit code `0` 和 `1` 都可视为成功，因为 `1` 代表发现 lint 问题而不是命令采集失败。
- timeout、找不到 config/plugin/parser 等阻断性错误视为失败。

## 6. 风险评估口径

`assessRisk` 使用分数累加：

- 未接入 ESLint：+40。
- 部分接入：+20。
- 禁用规则数大于等于 10：+30。
- 存在少量禁用规则：+10。
- 存在文件级 disable：+30。
- 存在其他 disable 注释：+10。
- ESLint error 数大于等于 50：+40。
- 存在 ESLint error：+20。
- warning 数大于等于 100：+20。

等级映射：

- `high`：分数大于等于 70。
- `medium`：分数大于等于 30。
- `low`：分数小于 30。

## 7. 与治理报告 Skill 的关系

`eslint-checker` 负责采集事实，`eslint-governance-report` Skill 负责交付表达。

分工原则：

- checker 不把英文枚举转换为中文报告文本。
- checker 不要求用户补业务字段，只接收 CLI 参数。
- Skill 可以询问并补全人工字段，但不得改写机器采集事实。
- Skill 生成的 `key-data.json` 和 `eslint-governance-report.md` 应保持固定结构，便于多工程汇总。
