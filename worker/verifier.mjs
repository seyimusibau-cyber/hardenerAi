// AI reasoning engine for the worker. Mirrors src/lib/gemini-verifier.ts but
// self-contained (the worker is a separate container and can't import the app).
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    is_vulnerability: { type: SchemaType.BOOLEAN },
    reasoning: { type: SchemaType.STRING },
    unified_diff: { type: SchemaType.STRING },
    unit_test: { type: SchemaType.STRING },
    estimated_patch_hours: { type: SchemaType.INTEGER },
  },
  required: ["is_vulnerability", "reasoning", "unified_diff", "unit_test", "estimated_patch_hours"],
};

const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0 },
  // NOTE: safety thresholds intentionally NOT set to BLOCK_NONE here. Security
  // code triggers false safety blocks occasionally; if that happens, relax the
  // single category that blocks, with a comment — do not blanket-disable. See
  // the roadmap "cross-cutting: safety config" item.
});

// Never throws — a verify failure yields a conservative "unknown" verdict so
// one bad finding can't kill the whole scan.
export async function verifyFinding(codeSnippet, sarifFinding) {
  const prompt = `You are the security reasoning engine for Vultix.

RAW SCANNER FINDING (SARIF):
${JSON.stringify(sarifFinding, null, 2)}

CODE CONTEXT (the file around the flagged line):
\`\`\`
${codeSnippet}
\`\`\`

TASK:
1. Decide if this is a GENUINE vulnerability or a FALSE POSITIVE, using the code context.
2. If genuine, produce a minimal, valid unified git diff that fixes ONLY this issue.
   The diff MUST use real file paths (a/<path> b/<path>) and apply cleanly.
3. Provide a unit test that fails before the fix and passes after.
4. Estimate engineering hours to apply and test.
Respond strictly as the JSON schema.`;

  try {
    const res = await model.generateContent(prompt);
    return JSON.parse(res.response.text());
  } catch (err) {
    console.error(`[verify] failed: ${err?.message}`);
    return {
      is_vulnerability: false,
      reasoning: `AI verification unavailable: ${err?.message || "error"}`,
      unified_diff: "",
      unit_test: "",
      estimated_patch_hours: 0,
      _verify_error: true,
    };
  }
}
