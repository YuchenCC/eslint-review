# eslint-checker 研发文档

本文面向维护 `@sunny/eslint-checker` 的研发同学，说明本地开发、测试、构建和发布注意事项。

## 1. 环境要求

- Node.js：建议使用当前 LTS。
- 包管理器：仓库当前使用 npm 依赖结构。
- TypeScript：源码位于 `src/`，构建产物输出到 `dist/`。

安装依赖：

```bash
npm install
```

常用命令：

```bash
npm test
npm run build
npm run lint
```

## 2. 目录结构

```text
src/
  analysis/      ESLint config、disable、resolved config 分析
  discovery/     项目、ESLint 接入、源码入口发现
  lint/          ESLint 执行、formatter、解析、recovery
  report/        schema、风险评估、产物写入
  utils/         文件和命令工具
  cli.ts         CLI 入口
  index.ts       组件主编排入口
tests/           Vitest 测试
fixtures/        测试夹具工程
skills/          治理报告 Skill
eslint-checker/  历史打包输出目录和 tgz
docs/            设计、计划、验证和组件文档
```

## 3. 开发主线

新增或修改能力时，优先按以下顺序落地：

1. 明确产物字段：如果影响 `report.json`，先更新 `src/types.ts` 和 `src/report/schema.ts`。
2. 增加或调整采集逻辑：按职责修改 `discovery`、`analysis`、`lint` 或 `report` 下的模块。
3. 更新编排：在 `src/index.ts` 中接入新模块或新字段。
4. 补测试：为纯函数、采集行为、CLI 行为和 artifact 写入增加聚焦测试。
5. 更新文档：同步 `README.md`、`eslint-checker/README.md` 和 `docs/eslint-checker/`。
6. 构建并验证：运行 `npm test` 和 `npm run build`。

## 4. 测试策略

测试框架：Vitest。

重点测试文件：

| 测试 | 覆盖范围 |
| --- | --- |
| `tests/discovery.test.ts` | 项目与 ESLint 接入发现。 |
| `tests/sourceEntries.test.ts` | 源码入口发现和忽略规则。 |
| `tests/analysis.test.ts` | config 静态分析和 disable 扫描。 |
| `tests/resolvedConfig.test.ts` | `--print-config` 采集。 |
| `tests/lint.test.ts` | ESLint 执行、失败识别、recovery。 |
| `tests/formatter.test.ts` | 自定义 summary formatter 行为。 |
| `tests/report.test.ts` | artifact 和 report schema。 |
| `tests/commands.test.ts` | 命令执行工具。 |
| `tests/skill.test.ts` | Skill 约束与文档结构。 |

推荐验证命令：

```bash
npm test
npm run build
```

涉及 CLI 参数时，补充：

```bash
node dist/cli.js --mode access --output .eslint-checker-dev
```

## 5. Fixture 约定

`fixtures/` 下存放可复现业务工程场景，避免测试依赖当前仓库自身状态。

已有典型场景：

- `no-package`：缺失 package.json。
- `missing-parser`：缺失 ESLint parser。
- `config-disabled`：存在禁用规则配置。
- `disable-heavy`：存在大量 disable 注释。
- `react-partial-eslint`：React 工程部分接入。
- `vue-eslint`：Vue 工程接入。
- `jupui-managed-*`：Jupui 托管 ESLint 依赖场景。

新增 fixture 时保持最小化，只放测试需要的 `package.json`、config 和源码文件。

## 6. Schema 变更规则

`report.json` 是下游 Skill 和多工程汇总的事实来源，变更要谨慎。

- 新增字段：优先保持向后兼容，允许旧字段继续存在。
- 删除或改名字段：需要提升 `schemaVersion`，并同步 Skill 和文档。
- 状态枚举：新增枚举时同步 `types.ts`、`schema.ts`、报告 Skill 的中文映射和测试。
- 可选产物：字段必须明确是 `null`、路径字符串，还是状态对象，避免下游猜测。

## 7. CLI 参数变更规则

CLI 参数定义在 `src/cli.ts`，真实运行参数来自 `program.opts()`。

变更参数时需要同步：

- `README.md`
- `eslint-checker/README.md`
- `docs/eslint-checker/usage.md`
- CLI 或集成测试
- 如果参数影响 report 字段，同步 `src/types.ts` 和 schema

当前源码参数不包含 `--for-iflycode`。如果需要恢复该能力，应先明确它产出的 artifact 和 schema，再实现源码、测试和文档。

## 8. Recovery 维护规则

Recovery 只处理可明确诊断的 ESLint 依赖缺失：

- parser：如 `@typescript-eslint/parser`。
- plugin：如 `eslint-plugin-vue`、`@typescript-eslint/eslint-plugin`。
- config：如 `eslint-config-standard`、`@scope/eslint-config`。

限制：

- 最多重试 2 次。
- 不安装非 ESLint 相关包。
- 记录 `installedPackages`、`installCommand`、`retryCount` 和 `modifiedFiles`。
- 安装失败时保留原 lint failure 和 recovery failure reason。

## 9. 构建与打包

构建：

```bash
npm run build
```

本地打包验证：

```bash
npm pack
```

在业务 fixture 或临时工程中验证：

```bash
npm install -D "<生成的 tgz 路径>"
npx eslint-checker --mode full --output .eslint-checker-local
```

发布前检查：

- `package.json#name` 为 `@sunny/eslint-checker`。
- `package.json#bin.eslint-checker` 指向 `dist/cli.js`。
- `dist/cli.js` 保留 shebang。
- `dist/` 与源码能力一致。
- README 中的参数、产物和 Skill 名称与源码一致。

## 10. 已知维护风险

- 当前根 `package.json` 版本与 `src/index.ts` 中 `CHECKER_VERSION` 不一致，发布前应确认版本口径。
- `eslint-checker/` 历史打包目录与 `src/` 存在差异，研发应以 `src/` 为准，并在重新打包后替换旧产物。
- `getPackageManagerVersion` 当前在 `process.cwd()` 下执行包管理器版本命令，不是业务工程 `cwd`；如果未来需要严格按业务工程隔离，应调整并补测试。
- Config 静态分析对 JS config 使用文本匹配，适合治理信号采集，不等同于完整 JS AST 解析。
