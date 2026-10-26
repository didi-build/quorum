import { runStepOrExit } from "../../scripts/lib/run-step.mjs";

runStepOrExit("failing", process.execPath, ["-e", "process.exit(2)"]);
