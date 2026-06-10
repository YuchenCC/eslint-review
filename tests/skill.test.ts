import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = path.join(repoRoot, "skills/eslint-governance-report/SKILL.md");

describe("ESLint governance report skill template", () => {
  test("defines Markdown delivery, aggregation key data, and fixed report chapters", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain(".eslint-checker/key-data.json");
    expect(skill).toContain(".eslint-checker/eslint-governance-report.md");
    expect(skill).not.toMatch(/PDF|\.pdf|DOCX|\.docx/);
    expect(skill).not.toMatch(/iflycode/i);
    expect(skill).not.toContain("--for-iflycode");

    for (const heading of [
      "0. 封面",
      "1. 执行摘要",
      "2. 项目与环境概况",
      "3. ESLint 接入状态",
      "4. Config 质量分析",
      "5. Disable 使用分析",
      "6. Lint 执行结果",
      "7. 代表性问题与风险",
      "8. 治理建议与优先级",
      "9. 附录"
    ]) {
      expect(skill).toContain(heading);
    }
  });

  test("requires interactive completion for unknown report fields before output", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("## Unknown Field Completion");
    expect(skill).toContain("在生成 `.eslint-checker/key-data.json` 和 `.eslint-checker/eslint-governance-report.md` 前");
    expect(skill).toContain("必须先识别会输出为 `unknown` 的字段");
    expect(skill).toContain("逐项通过交互式输入引导用户填写");
    expect(skill).toContain("用户提供的值必须同时写入 key data 和 Markdown report");
  });

  test("requires Chinese presentation for non-technical report text", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("## Report Localization Rules");
    expect(skill).toContain("报告展示层必须将 `report.json` 中的英文枚举、原因和建议转换为中文表达");
    expect(skill).toContain("`partial` -> `部分接入`");
    expect(skill).toContain("`success` -> `成功`");
    expect(skill).toContain("`low` -> `低`");
    expect(skill).toContain("`ESLint access is partial` -> `ESLint 接入不完整`");
    expect(skill).toContain("`Complete ESLint config and lint script setup` -> `补齐 ESLint config 与 lint script 配置`");
    expect(skill).toContain("`Delete <code>` -> `删除 <code>`");
    expect(skill).toContain("`Replace <from> with <to>` -> `将 <from> 替换为 <to>`");
    expect(skill).toContain("允许保留英文的内容仅限");
  });

  test("defines a fixed checker output directory handled by the CLI", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("checker 输出工程目录：`checkerOutputDir`，默认且当前唯一允许值为 `.eslint-checker`。");
    expect(skill).toContain("## Checker Output Directory");
    expect(skill).toContain("本 workflow 的 checker 输出目录固定为 `.eslint-checker`");
    expect(skill).toContain("输出目录清理由 `@sunny/eslint-checker` CLI 在 Node 层负责");
    expect(skill).toContain("如果 `.eslint-checker` 已存在，CLI 会删除整个目录后重新生成");
    expect(skill).toContain("CLI 拒绝 `.eslint-checker` 之外的输出目录");
  });

  test("does not ask the model to detect terminals or delete checker output with shell commands", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).not.toContain("ACTIVE_TERMINAL");
    expect(skill).not.toContain("ActiveTerminal");
    expect(skill).not.toContain("Remove-Item");
    expect(skill).not.toContain("rm -rf");
    expect(skill).not.toContain("Test-Path");
    expect(skill).not.toContain("使用现有结果");
    expect(skill).not.toContain("必须先让用户选择本次数据来源");
    expect(skill).toContain("skill 不执行任何 shell 删除命令，不判断终端类型，不提供复用旧产物分支");
  });

  test("requires Beijing time for displayed report check time", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("## Report Time Rules");
    expect(skill).toContain("检查时间在 Markdown report 中必须使用北京时间");
    expect(skill).toContain("UTC+8");
    expect(skill).toContain("Asia/Shanghai");
    expect(skill).toContain("如果 `report.json` 中是 UTC 时间，展示前必须转换为北京时间");
  });

  test("tracks current report.json governance fields in generated outputs", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("`report.json.schemaVersion` 当前为 `0.2.0`");
    expect(skill).toContain("`checkerVersion`");
    expect(skill).toContain("disabledFormatRules");
    expect(skill).toContain("disabledQualityRules");
    expect(skill).toContain("disabledStackRules");
    expect(skill).toContain("disabledOtherRules");
    expect(skill).toContain("eslintIgnorePatterns");
    expect(skill).toContain("effectiveIgnorePatterns");
    expect(skill).toContain("disableWithoutRuleCount");
    expect(skill).toContain("summaryMarkdown");
    expect(skill).toContain("lintLog");
  });
});
