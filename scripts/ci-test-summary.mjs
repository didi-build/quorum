import { existsSync, readFileSync } from "node:fs";

const marker = "<!-- launchpad-vitest-results -->";
const checkOutcome = process.env.CHECK_OUTCOME ?? "unknown";
const installOutcome = process.env.INSTALL_OUTCOME ?? "unknown";
const nodriftOutcome = process.env.NODRIFT_OUTCOME ?? "unknown";
const workerTestsOutcome = process.env.WORKER_TESTS_OUTCOME ?? "unknown";
const sha = (process.env.PR_HEAD_SHA ?? "").slice(0, 7);

function vitestLine(label, junitPath) {
  if (!existsSync(junitPath)) {
    return `_${label}: JUnit output missing._`;
  }
  const xml = readFileSync(junitPath, "utf8");
  const tests = Number(xml.match(/tests="(\d+)"/)?.[1] ?? 0);
  const failures = Number(xml.match(/failures="(\d+)"/)?.[1] ?? 0);
  const errors = Number(xml.match(/errors="(\d+)"/)?.[1] ?? 0);
  const failed = failures + errors;
  const passed = Math.max(0, tests - failed);
  const icon = failed === 0 ? "✅" : "❌";
  return `${icon} **${label}**: ${passed}/${tests} passed (${failed} failed)`;
}

function stepLine(label, outcome, detail) {
  const icon = outcome === "success" ? "✅" : "❌";
  return `${icon} **${label}**: \`${outcome}\`${detail ? ` (${detail})` : ""}`;
}

const lines = [];

if (installOutcome !== "success") {
  lines.push(
    `❌ **npm ci**: \`${installOutcome}\` (dependency install failed; tests and check did not run)`,
  );
  lines.push(
    "_Common on major Dependabot bumps: peer dependency conflicts. Review the workflow log for the npm ci step._",
  );
} else {
  lines.push(vitestLine("Vitest (unit)", "test-results/junit.xml"));
  lines.push(
    vitestLine("Vitest (Worker, vitest-pool-workers)", "test-results/worker-junit.xml"),
  );
  lines.push(stepLine("nodrift check", nodriftOutcome, "`npx nodrift check` in CI"));
  lines.push(
    stepLine("Worker tests", workerTestsOutcome, "`npm run test:worker` in CI"),
  );
  lines.push(
    stepLine(
      "npm run check",
      checkOutcome,
      "format, lint, typecheck, test, secrets, placeholders, attribution, nodrift",
    ),
  );
}

const body = `${marker}
${lines.join("\n\n")}

Commit: \`${sha}\``;

if (process.env.OUTPUT_MODE === "body") {
  console.log(body);
} else {
  console.log(`body<<EOF\n${body}\nEOF`);
}
