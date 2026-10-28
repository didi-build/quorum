import { loadConfig } from "../src/config/load-config.js";
import { classifyIntent } from "../src/domain/chat/classifier.js";
import { loadRouterEvalDataset, scoreRouterDataset } from "../src/domain/chat/eval.js";

const ACCURACY_BAR = 0.85;

async function main(): Promise<number> {
  const config = loadConfig(process.env as Record<string, string | undefined>);
  const examples = loadRouterEvalDataset();
  const result = await scoreRouterDataset(examples, (message) =>
    classifyIntent(message, { config }),
  );

  console.log(
    `Router eval: ${result.correct}/${result.total} correct (${(result.accuracy * 100).toFixed(1)}%)`,
  );
  if (result.mismatches.length > 0) {
    console.log("Mismatches:");
    for (const [message, expected, predicted] of result.mismatches.slice(0, 20)) {
      console.log(`- expected=${expected} predicted=${predicted}: ${message}`);
    }
  }
  return result.accuracy >= ACCURACY_BAR ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
