import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

const samples = [
  {
    name: "jup2",
    projectPath: path.join(repoRoot, "jup", "eslintByJup2"),
    declaredVersion: "2.0.12",
    majorVersion: 2
  },
  {
    name: "jup3",
    projectPath: path.join(repoRoot, "jup", "eslintByJup3"),
    declaredVersion: "3.0.17",
    majorVersion: 3
  }
];

function fail(message) {
  console.error(`[jup-artifact-test] ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(values, expected, message) {
  assert(Array.isArray(values) && values.includes(expected), message);
}

function readReport(projectPath) {
  const reportPath = path.join(projectPath, ".eslint-checker", "report.json");
  assert(existsSync(reportPath), `missing report: ${reportPath}`);
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function verifySample(sample) {
  assert(existsSync(cliPath), `missing built CLI: ${cliPath}`);
  assert(existsSync(sample.projectPath), `missing jup sample: ${sample.projectPath}`);
  assert(
    existsSync(path.join(sample.projectPath, "node_modules", "jupui", "package.json")),
    `missing installed jupui dependency for ${sample.name}`
  );

  console.log(`[jup-artifact-test] running ${sample.name}`);
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "--system",
      "artifact-test",
      "--center",
      "jup",
      "--owner",
      "artifact-test",
      "--timeout",
      "120",
      "--no-recovery"
    ],
    {
      cwd: sample.projectPath,
      stdio: "inherit"
    }
  );

  assert(result.status === 0, `${sample.name} checker exited with ${result.status ?? "unknown"}`);

  const report = readReport(sample.projectPath);
  assert(report.projectInfo?.frameworkProfile?.name === "jupui", `${sample.name} did not detect jupui`);
  assert(
    report.projectInfo.frameworkProfile.declaredVersion === sample.declaredVersion,
    `${sample.name} declared jupui version mismatch`
  );
  assert(
    report.projectInfo.frameworkProfile.installedVersion === sample.declaredVersion,
    `${sample.name} installed jupui version mismatch`
  );
  assert(
    report.projectInfo.frameworkProfile.majorVersion === sample.majorVersion,
    `${sample.name} jupui major version mismatch`
  );
  assert(report.eslintAccess?.accessLevel === "connected", `${sample.name} eslint access is not connected`);
  assert(report.eslintAccess.managedBy === "jupui", `${sample.name} eslint access is not managed by jupui`);
  assertIncludes(
    report.eslintAccess.managedEslintPackages,
    "eslint",
    `${sample.name} managed eslint packages do not include eslint`
  );
  assert(report.eslintConfigAnalysis?.status === "success", `${sample.name} config analysis did not succeed`);
  assertIncludes(
    report.eslintConfigAnalysis.analyzedFiles,
    "node_modules/jupui/.eslintrc.js",
    `${sample.name} did not analyze jupui shared config`
  );
  assert(report.eslintResolvedConfig?.status === "success", `${sample.name} resolved config did not succeed`);
  assert(report.lintExecution?.status === "success", `${sample.name} lint execution did not succeed`);
  assert(report.lintResult?.status === "success", `${sample.name} lint result did not succeed`);
  assert(report.lintResult.fileCount > 0, `${sample.name} lint result did not include files`);
  assert(report.riskAssessment?.level === "low", `${sample.name} risk level is not low`);
  assert(
    Array.isArray(report.riskAssessment.recommendations) && report.riskAssessment.recommendations.length === 0,
    `${sample.name} emitted unexpected recommendations`
  );
}

for (const sample of samples) {
  try {
    verifySample(sample);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("[jup-artifact-test] all samples passed");
