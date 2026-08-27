// False-positive benchmark for the AI verifier. Puts a number on the claim
// "the AI acts as a false-positive filter". Precision = of the findings the AI
// calls genuine, how many really are. Needs GEMINI_API_KEY; dry-runs without.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8"));

if (!process.env.GEMINI_API_KEY) {
  console.log(`[dry run] ${cases.length} labeled cases loaded ` +
    `(${cases.filter(c => c.label).length} genuine, ${cases.filter(c => !c.label).length} false positive).`);
  console.log("Set GEMINI_API_KEY to measure the verifier's precision/recall.");
  process.exit(0);
}

const { verifyFinding } = await import("../verifier.mjs");
let tp = 0, fp = 0, fn = 0, tn = 0;
for (const c of cases) {
  const v = await verifyFinding(c.snippet, c.sarif);
  const pred = !!v.is_vulnerability;
  if (c.label && pred) tp++;
  else if (!c.label && pred) fp++;
  else if (c.label && !pred) fn++;
  else tn++;
  console.log(`${c.sarif.rule_id.padEnd(50)} truth=${c.label} ai=${pred}`);
}
const prec = tp / (tp + fp) || 0, rec = tp / (tp + fn) || 0;
console.log(`\nprecision=${prec.toFixed(2)}  recall=${rec.toFixed(2)}  (tp=${tp} fp=${fp} fn=${fn} tn=${tn})`);
