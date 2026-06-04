#!/usr/bin/env node
import { Command } from "commander";
import { runChecker } from "./index.js";

const program = new Command();

program
  .name("eslint-checker")
  .option("--system <name>", "system name")
  .option("--center <name>", "center name")
  .option("--owner <name>", "owner name")
  .option("--mode <mode>", "check mode: access or full", "full")
  .option("--output <dir>", "output directory", ".eslint-checker")
  .option("--timeout <seconds>", "ESLint timeout seconds", "120")
  .option("--for-iflycode", "emit iflycode-ready artifacts", false)
  .option("--no-recovery", "disable lint recovery")
  .parse(process.argv);

await runChecker({
  cwd: process.cwd(),
  options: program.opts()
});
