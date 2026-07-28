import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Schema, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    is_vulnerability: {
      type: SchemaType.BOOLEAN,
      description: "True if this is a genuine vulnerability, False if it is a false positive.",
    },
    reasoning: {
      type: SchemaType.STRING,
      description: "Detailed explanation of why this is or isn't a vulnerability.",
    },
    unified_diff: {
      type: SchemaType.STRING,
      description: "A valid unified git diff to patch the vulnerability. Leave empty if false positive.",
    },
    unit_test: {
      type: SchemaType.STRING,
      description: "A unit test confirming the fix works. Leave empty if false positive.",
    },
    estimated_patch_hours: {
      type: SchemaType.INTEGER,
      description: "Estimated engineering hours required to apply and test this patch.",
    }
  },
  required: ["is_vulnerability", "reasoning", "unified_diff", "unit_test", "estimated_patch_hours"],
};

export async function verifyAndPatchFinding(codeSnippet: string, sarifFinding: object) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const prompt = `
  You are the lead security reasoning engine for Hardener AI.
  
  RAW SCANNER FINDING (SARIF Format):
  ${JSON.stringify(sarifFinding, null, 2)}
  
  CODE CONTEXT:
  \`\`\`
  ${codeSnippet}
  \`\`\`
  
  TASK:
  1. Verify if this is a genuine vulnerability or a false positive based on the provided code context.
  2. If valid, generate a precise unified git diff patch to fix it.
  3. Provide a unit test confirming the fix works.
  4. Estimate the engineering hours to patch.
  
  Respond strictly following the defined JSON schema.
  `;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to verify finding with AI reasoning engine.");
  }
}
