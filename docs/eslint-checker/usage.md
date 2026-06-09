# eslint-checker 使用说明

本文说明如何在业务工程中从引入 Skill 开始使用 `@sunny/eslint-checker`，并产出 ESLint 治理交付物。

## 1. 引入 Skill

`eslint-checker` 的直接产物是 `.eslint-checker/report.json`、`summary.md` 等机器采集结果。正式治理报告由 Skill 基于这些产物生成。

推荐把本仓库的 Skill 目录引入到 Codex 可用技能目录：

```bash
cp -R skills/eslint-governance-report "$CODEX_HOME/skills/"
```

也可以在当前仓库内直接引用：

```text
使用 skills/eslint-governance-report/SKILL.md，为 <业务工程路径> 生成 ESLint 治理检查报告。
```

Skill 的职责：

- 判断是否复用或重新生成业务工程下的 `.eslint-checker`。
- 运行 `@sunny/eslint-checker` 采集 ESLint 接入、配置、禁用注释、执行结果和风险数据。
- 基于 `.eslint-checker/report.json` 生成正式 Markdown 报告和 `key-data.json`。
- 对 `system`、`center`、`owner` 等人工字段进行补全，不编造机器采集事实。

## 2. 在业务工程中运行

进入业务工程根目录后运行：

```bash
npx @sunny/eslint-checker --mode full
```

如果当前 registry 无法直接执行 scoped package，先安装后执行：

```bash
npm install -D @sunny/eslint-checker
npx eslint-checker --mode full
```

如果使用本地包：

```bash
npm install -D "<eslint-checker 本地路径或 tgz 路径>"
npx eslint-checker --mode full
```

## 3. 常用参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--mode full` | `full` | 完整采集，包含 ESLint 执行结果。 |
| `--mode access` | `full` | 只采集项目、接入、配置和静态信息，不执行 ESLint。 |
| `--output <dir>` | `.eslint-checker` | 指定产物目录。 |
| `--timeout <seconds>` | `120` | ESLint 和相关命令的超时时间。 |
| `--no-recovery` | 开启 recovery | 关闭缺失 ESLint 依赖的有限自动恢复。 |
| `--raw-eslint-report` | 关闭 | 额外生成完整 ESLint JSON，体积可能较大。 |
| `--system <name>` | `unknown` | 写入报告元数据：系统。 |
| `--center <name>` | `unknown` | 写入报告元数据：中心。 |
| `--owner <name>` | `unknown` | 写入报告元数据：负责人。 |

注意：当前源码 `src/cli.ts` 未提供 `--for-iflycode`。如果使用的是 `eslint-checker/` 下的历史打包目录，可能仍能看到该参数；研发和新文档以当前源码为准。

## 4. 产物说明

默认输出目录为 `.eslint-checker/`：

| 文件 | 生成条件 | 用途 |
| --- | --- | --- |
| `report.json` | 默认生成 | 稳定机器可读总报告，是后续报告生成的事实来源。 |
| `summary.md` | 默认生成 | 面向研发阅读的简要摘要。 |
| `eslint-summary.json` | full 模式且 ESLint 执行成功 | 精简 ESLint formatter 输出，汇总问题数、规则、文件和证据。 |
| `eslint-config.json` | `--print-config` 成功 | ESLint effective config。 |
| `lint-log.txt` | 默认生成 | checker 执行日志和命令日志。 |
| `eslint-report.json` | 使用 `--raw-eslint-report` | 完整 ESLint JSON，主要用于调试。 |

Skill 生成治理报告时还会追加：

| 文件 | 用途 |
| --- | --- |
| `key-data.json` | 多工程汇总用关键字段。 |
| `eslint-governance-report.md` | 正式交付 Markdown 报告。 |

## 5. 推荐使用流程

1. 在 Codex 中引入或指定 `eslint-governance-report` Skill。
2. 指定业务工程根目录。
3. 如果业务工程已有 `.eslint-checker`，按 Skill 提示选择重新生成或复用现有结果。
4. 运行 `npx @sunny/eslint-checker --mode full`。
5. 检查 `.eslint-checker/report.json` 是否生成。
6. 根据 Skill 提示补全 `system`、`center`、`owner` 等人工字段。
7. 交付 `.eslint-checker/key-data.json` 和 `.eslint-checker/eslint-governance-report.md`。

## 6. 失败处理

- `npx @sunny/eslint-checker` 失败且提示认证：先完成当前 registry 的 `npm login`。
- 包不存在或私有源不可访问：使用本地工程目录或 `.tgz` 路径安装。
- ESLint 执行失败但 `report.json` 已生成：报告仍以 `report.json` 为准，失败原因写入对应章节。
- `report.json` 缺失：Skill 仍按固定结构生成 `key-data.json` 和 Markdown 报告，但机器采集字段标记为未采集。
- 依赖缺失导致 ESLint 失败：默认 recovery 会尝试识别缺失的 ESLint plugin/config/parser 并安装后重试，最多 2 次；可用 `--no-recovery` 关闭。
