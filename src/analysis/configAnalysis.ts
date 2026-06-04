import path from "node:path";
import YAML from "yaml";
import type { EslintConfigAnalysis } from "../types.js";
import { listExistingFiles, readJsonFile, readTextFile } from "../utils/fs.js";

interface PackageJson {
  eslintConfig?: unknown;
}

interface EslintConfigObject {
  extends?: unknown;
  rules?: Record<string, unknown>;
  overrides?: Array<{ rules?: Record<string, unknown> }>;
}

const JSON_CONFIG_FILES = [".eslintrc.json"];
const YAML_CONFIG_FILES = [".eslintrc.yaml", ".eslintrc.yml"];
const TEXT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs"
];

const FORMAT_RULES = ["semi", "quotes", "indent", "comma-dangle", "max-len"];
const QUALITY_RULES = ["no-unused-vars", "no-console", "eqeqeq", "curly"];
const STACK_RULES = [
  "@typescript-eslint/no-unused-vars",
  "vue/multi-word-component-names",
  "react-hooks/rules-of-hooks"
];

const DISABLED_TEXT_PATTERN = /['"]([^'"]+)['"]\s*:\s*(?:['"]off['"]|0|\[\s*(?:['"]off['"]|0))/g;

export async function analyzeEslintConfig(cwd: string): Promise<EslintConfigAnalysis> {
  const analyzedFiles: string[] = [];
  const limitations: string[] = [];
  const disabledRules = new Set<string>();
  let weakenedStandardConfig = false;

  const jsonFiles = await listExistingFiles(cwd, JSON_CONFIG_FILES);
  for (const fileName of jsonFiles) {
    const config = await readJsonFile<EslintConfigObject>(path.join(cwd, fileName));
    if (!config) {
      limitations.push(`Could not parse ${fileName}`);
      continue;
    }
    analyzedFiles.push(fileName);
    collectDisabledRulesFromConfig(config, disabledRules);
    weakenedStandardConfig ||= weakensStandardConfig(config);
  }

  const yamlFiles = await listExistingFiles(cwd, YAML_CONFIG_FILES);
  for (const fileName of yamlFiles) {
    const content = await readTextFile(path.join(cwd, fileName));
    if (!content) {
      limitations.push(`Could not read ${fileName}`);
      continue;
    }

    try {
      const config = YAML.parse(content) as EslintConfigObject;
      analyzedFiles.push(fileName);
      collectDisabledRulesFromConfig(config, disabledRules);
      weakenedStandardConfig ||= weakensStandardConfig(config);
    } catch {
      limitations.push(`Could not parse ${fileName}`);
    }
  }

  const packageJson = await readJsonFile<PackageJson>(path.join(cwd, "package.json"));
  if (packageJson?.eslintConfig) {
    analyzedFiles.push("package.json#eslintConfig");
    const config = packageJson.eslintConfig as EslintConfigObject;
    collectDisabledRulesFromConfig(config, disabledRules);
    weakenedStandardConfig ||= weakensStandardConfig(config);
  }

  const textFiles = await listExistingFiles(cwd, TEXT_CONFIG_FILES);
  for (const fileName of textFiles) {
    const content = await readTextFile(path.join(cwd, fileName));
    if (!content) {
      limitations.push(`Could not read ${fileName}`);
      continue;
    }
    analyzedFiles.push(fileName);
    collectDisabledRulesFromText(content, disabledRules);
    weakenedStandardConfig ||= /extends\s*:\s*[^,\]}]*(standard|airbnb|recommended)/i.test(content);
  }

  if (analyzedFiles.length === 0) {
    return emptyAnalysis("failed", ["No ESLint config content could be read safely"]);
  }

  const disabledFormatRules = FORMAT_RULES.filter((rule) => disabledRules.has(rule));
  const disabledQualityRules = QUALITY_RULES.filter((rule) => disabledRules.has(rule));
  const disabledStackRules = STACK_RULES.filter((rule) => disabledRules.has(rule));
  const disabledRuleCount = disabledRules.size;

  return {
    status: "success",
    analyzedFiles,
    disabledFormatRules,
    disabledQualityRules,
    disabledStackRules,
    disabledRuleCount,
    weakenedStandardConfig: weakenedStandardConfig && disabledRuleCount >= 3,
    limitations,
    findings: buildFindings({
      disabledFormatRules,
      disabledQualityRules,
      disabledStackRules,
      disabledRuleCount,
      weakenedStandardConfig: weakenedStandardConfig && disabledRuleCount >= 3
    })
  };
}

function collectDisabledRulesFromConfig(config: EslintConfigObject, disabledRules: Set<string>): void {
  collectDisabledRulesFromRecord(config.rules, disabledRules);
  for (const override of config.overrides ?? []) {
    collectDisabledRulesFromRecord(override.rules, disabledRules);
  }
}

function collectDisabledRulesFromRecord(
  rules: Record<string, unknown> | undefined,
  disabledRules: Set<string>
): void {
  for (const [ruleName, ruleValue] of Object.entries(rules ?? {})) {
    if (isDisabledRuleValue(ruleValue)) {
      disabledRules.add(ruleName);
    }
  }
}

function collectDisabledRulesFromText(content: string, disabledRules: Set<string>): void {
  for (const match of content.matchAll(DISABLED_TEXT_PATTERN)) {
    disabledRules.add(match[1]);
  }
}

function isDisabledRuleValue(ruleValue: unknown): boolean {
  if (ruleValue === 0 || ruleValue === "off") {
    return true;
  }
  return Array.isArray(ruleValue) && (ruleValue[0] === 0 || ruleValue[0] === "off");
}

function weakensStandardConfig(config: EslintConfigObject): boolean {
  const values = Array.isArray(config.extends) ? config.extends : [config.extends];
  return values.some((value) => typeof value === "string" && /standard|airbnb|recommended/i.test(value));
}

function buildFindings({
  disabledFormatRules,
  disabledQualityRules,
  disabledStackRules,
  disabledRuleCount,
  weakenedStandardConfig
}: Pick<
  EslintConfigAnalysis,
  | "disabledFormatRules"
  | "disabledQualityRules"
  | "disabledStackRules"
  | "disabledRuleCount"
  | "weakenedStandardConfig"
>): string[] {
  const findings: string[] = [];
  if (disabledFormatRules.length > 0) {
    findings.push(`Disabled format rules: ${disabledFormatRules.join(", ")}`);
  }
  if (disabledQualityRules.length > 0) {
    findings.push(`Disabled quality rules: ${disabledQualityRules.join(", ")}`);
  }
  if (disabledStackRules.length > 0) {
    findings.push(`Disabled stack-specific rules: ${disabledStackRules.join(", ")}`);
  }
  if (disabledRuleCount >= 10) {
    findings.push("Large number of disabled ESLint rules");
  }
  if (weakenedStandardConfig) {
    findings.push("Local overrides weaken an extended standard config");
  }
  return findings;
}

function emptyAnalysis(status: EslintConfigAnalysis["status"], limitations: string[]): EslintConfigAnalysis {
  return {
    status,
    analyzedFiles: [],
    disabledFormatRules: [],
    disabledQualityRules: [],
    disabledStackRules: [],
    disabledRuleCount: 0,
    weakenedStandardConfig: false,
    limitations,
    findings: []
  };
}
