// Demo agent used by the Pathlight landing-page screenshots.
// Intentionally contains the bug shown in trace duGwFI_t1sS9WF1tlmV3V:
// the model is asked to "Return the JSON" but no parser enforces the shape,
// so prose responses sneak through and crash JSON.parse on line 91.

import Anthropic from "@anthropic-ai/sdk";

interface Job {
  jobId: string;
  customer: string;
  lineItems: number;
}

interface Estimate {
  lineItems: Array<{ description: string; price: number }>;
  total: number;
}

const client = new Anthropic();

export async function planQuote(job: Job) {
  return {
    steps: ["fetch_pricing", "compose_estimate"],
    jobId: job.jobId,
  };
}

export async function composeEstimate(job: Job): Promise<Estimate> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: "You compose roofing estimates. Return strict JSON: { lineItems: [...], total: number }.",
    messages: [
      {
        role: "user",
        content: `Job ${job.jobId}: tear-off + 30sq architectural shingles + 2 skylights. Return the JSON.`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // BUG: model often replies in prose ("The total comes out to about $14,200...")
  // instead of JSON. JSON.parse then throws SyntaxError and crashes the agent.
  const estimate = JSON.parse(text) as Estimate;
  return estimate;
}
