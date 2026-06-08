import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = path.join(repoRoot, "skills/iflycode-eslint-report/SKILL.md");

describe("iflycode report skill template", () => {
  test("defines Markdown delivery, aggregation key data, and fixed report chapters", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain(".eslint-checker/iflycode-key-data.json");
    expect(skill).toContain(".eslint-checker/iflycode-eslint-governance-report.md");
    expect(skill).not.toMatch(/PDF|\.pdf|DOCX|\.docx/);

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
    expect(skill).toContain("在生成 `.eslint-checker/iflycode-key-data.json` 和 `.eslint-checker/iflycode-eslint-governance-report.md` 前");
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

  test("requires choosing whether to regenerate or reuse existing checker output", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("## Existing Output Choice");
    expect(skill).toContain("每次准备报告前，必须先检查业务工程根目录下是否存在 `.eslint-checker`");
    expect(skill).toContain("如果 `.eslint-checker` 已存在，必须先让用户选择本次数据来源");
    expect(skill).toContain("重新生成：删除整个 `.eslint-checker` 目录后重新运行 checker");
    expect(skill).toContain("使用现有结果：不删除 `.eslint-checker`，不重新运行 checker");
    expect(skill).toContain("Remove-Item .eslint-checker -Recurse -Force");
  });

  test("requires Beijing time for displayed report check time", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("## Report Time Rules");
    expect(skill).toContain("检查时间在 Markdown report 中必须使用北京时间");
    expect(skill).toContain("UTC+8");
    expect(skill).toContain("Asia/Shanghai");
    expect(skill).toContain("如果 `report.json` 中是 UTC 时间，展示前必须转换为北京时间");
  });
});
