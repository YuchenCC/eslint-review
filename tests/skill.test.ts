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
});
