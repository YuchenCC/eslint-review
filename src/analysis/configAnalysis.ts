import { createRequire } from "node:module";
import { realpath } from "node:fs/promises";
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

const DISABLED_TEXT_PATTERN =
  /(?:(?:['"]([^'"]+)['"])|([A-Za-z_$][\w$]*))\s*:\s*(?:['"]off['"]|0|\[\s*(?:['"]off['"]|0))/g;
const REQUIRE_RESOLVE_PATTERN = /require\.resolve\(\s*['"]([^'"]+)['"]\s*\)/g;

export async function analyzeEslintConfig(cwd: string): Promise<EslintConfigAnalysis> {
  const analyzedFiles: string[] = [];
  const limitations: string[] = [];
  const resolvedConfigFiles: string[] = [];
  const disabledRules = new Set<string>();
  const extendedConfigs = new Set<string>();
  let weakenedStandardConfig = false;

  const jsonFiles = await listExistingFiles(cwd, JSON_CONFIG_FILES);
  for (const fileName of jsonFiles) {
    const config = await readJsonFile<EslintConfigObject>(path.join(cwd, fileName));
    if (!config) {
      limitations.push(`Could not parse ${fileName}`);
      continue;
    }
    analyzedFiles.push(fileName);
    collectExtendedConfigsFromConfig(config, extendedConfigs);
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
      collectExtendedConfigsFromConfig(config, extendedConfigs);
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
    collectExtendedConfigsFromConfig(config, extendedConfigs);
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
    collectExtendedConfigsFromText(content, extendedConfigs);
    collectDisabledRulesFromText(content, disabledRules);
    weakenedStandardConfig ||= /extends\s*:\s*[^,\]}]*(standard|airbnb|recommended)/i.test(content);
    const resolvedConfigs = await resolveReferencedConfigs(cwd, content, limitations);
    for (const resolvedConfig of resolvedConfigs) {
      if (analyzedFiles.includes(resolvedConfig.relativePath)) {
        continue;
      }
      analyzedFiles.push(resolvedConfig.relativePath);
      resolvedConfigFiles.push(resolvedConfig.relativePath);
      collectExtendedConfigsFromText(resolvedConfig.content, extendedConfigs);
      if (!resolvedConfig.packageConfig) {
        collectDisabledRulesFromText(resolvedConfig.content, disabledRules);
      }
      weakenedStandardConfig ||= /extends\s*:\s*[^,\]}]*(standard|airbnb|recommended)/i.test(resolvedConfig.content);
    }
  }

  if (analyzedFiles.length === 0) {
    return emptyAnalysis("failed", ["No ESLint config content could be read safely"]);
  }

  const disabledFormatRules = FORMAT_RULES.filter((rule) => disabledRules.has(rule));
  const disabledQualityRules = QUALITY_RULES.filter((rule) => disabledRules.has(rule));
  const disabledStackRules = STACK_RULES.filter((rule) => disabledRules.has(rule));
  const classifiedDisabledRules = new Set([...disabledFormatRules, ...disabledQualityRules, ...disabledStackRules]);
  const disabledOtherRules = [...disabledRules].filter((rule) => !classifiedDisabledRules.has(rule)).sort();
  const disabledRuleCount = disabledRules.size;

  return {
    status: "success",
    analyzedFiles,
    resolvedConfigFiles,
    extendedConfigs: [...extendedConfigs],
    extendedPackages: [...new Set([...extendedConfigs].map(toEslintConfigPackage).filter(isPresent))],
    disabledFormatRules,
    disabledQualityRules,
    disabledStackRules,
    disabledOtherRules,
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

async function resolveReferencedConfigs(
  cwd: string,
  content: string,
  limitations: string[]
): Promise<Array<{ relativePath: string; content: string; packageConfig: boolean }>> {
  const absoluteCwd = await realpath(cwd);
  const requireFromProject = createRequire(path.join(absoluteCwd, "package.json"));
  const resolvedConfigs: Array<{ relativePath: string; content: string; packageConfig: boolean }> = [];

  for (const match of content.matchAll(REQUIRE_RESOLVE_PATTERN)) {
    const request = match[1];
    if (!request || path.isAbsolute(request)) {
      continue;
    }

    let resolvedPath: string;
    try {
      resolvedPath = requireFromProject.resolve(request);
    } catch {
      limitations.push(`Could not resolve ${request}`);
      continue;
    }

    const realResolvedPath = await realpath(resolvedPath);
    const relativePath = normalizePath(path.relative(absoluteCwd, realResolvedPath));
    if (relativePath.startsWith("../") || relativePath === "..") {
      limitations.push(`Resolved config ${request} outside project root`);
      continue;
    }

    const resolvedContent = await readTextFile(realResolvedPath);
    if (!resolvedContent) {
      limitations.push(`Could not read ${relativePath}`);
      continue;
    }

    resolvedConfigs.push({ relativePath, content: resolvedContent, packageConfig: !request.startsWith(".") });
  }

  return resolvedConfigs;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function collectExtendedConfigsFromConfig(config: EslintConfigObject, extendedConfigs: Set<string>): void {
  const values = Array.isArray(config.extends) ? config.extends : [config.extends];
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      extendedConfigs.add(value);
    }
  }
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
    disabledRules.add(match[1] ?? match[2]);
  }
}

function collectExtendedConfigsFromText(content: string, extendedConfigs: Set<string>): void {
  const match = content.match(/extends\s*:\s*(\[[\s\S]*?\]|["'`][^"'`]+["'`])/m);
  if (!match) {
    return;
  }

  for (const valueMatch of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
    extendedConfigs.add(valueMatch[1]);
  }
}

function toEslintConfigPackage(configName: string): string | undefined {
  if (configName.startsWith("eslint:")) {
    return "eslint";
  }

  const pluginMatch = configName.match(/^plugin:([^/]+)\//);
  if (pluginMatch) {
    return toEslintPluginPackage(pluginMatch[1]);
  }

  if (configName.startsWith(".")) {
    return undefined;
  }

  if (configName.startsWith("@")) {
    const [scope, name = ""] = configName.split("/");
    if (name === "eslint-config" || name.startsWith("eslint-config-")) {
      return configName;
    }
    return name.length > 0 ? `${scope}/eslint-config-${name}` : undefined;
  }

  return configName.startsWith("eslint-config-") ? configName : `eslint-config-${configName}`;
}

function toEslintPluginPackage(pluginName: string): string {
  if (pluginName.startsWith("@")) {
    const [scope, name = ""] = pluginName.split("/");
    if (name === "" || name === "eslint-plugin") {
      return `${scope}/eslint-plugin`;
    }
    return name.startsWith("eslint-plugin-") ? pluginName : `${scope}/eslint-plugin-${name}`;
  }

  return pluginName.startsWith("eslint-plugin-") ? pluginName : `eslint-plugin-${pluginName}`;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined;
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
    resolvedConfigFiles: [],
    extendedConfigs: [],
    extendedPackages: [],
    disabledFormatRules: [],
    disabledQualityRules: [],
    disabledStackRules: [],
    disabledOtherRules: [],
    disabledRuleCount: 0,
    weakenedStandardConfig: false,
    limitations,
    findings: []
  };
}
