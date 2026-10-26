import { runStepOrExit } from "../../scripts/lib/run-step.mjs";

runStepOrExit(
  "env-probe",
  process.execPath,
  ["-e", "process.exit(process.env.FRONTEND_DIST === 'frontend/dist-preview' ? 0 : 4)"],
  { env: { ...process.env, FRONTEND_DIST: "frontend/dist-preview" } },
);
