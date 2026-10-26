import { runStepOrExit } from "../../scripts/lib/run-step.mjs";

runStepOrExit("sigterm-child", process.execPath, [
  "-e",
  "process.kill(process.pid, 'SIGTERM')",
]);
