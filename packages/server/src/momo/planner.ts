export const planSchema = (ids: string[]) => ({
  type: "object",
  properties: {
    summary: { type: "string" },
    tasks: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          agentId: { type: "string", enum: ids },
          title: { type: "string", minLength: 1 },
          dependsOn: { type: "array", items: { type: "integer", minimum: 0 } },
        },
        required: ["agentId", "title"],
      },
    },
  },
  required: ["tasks"],
});
export function validatePlan(plan: any, ids: string[]) {
  if (
    !Array.isArray(plan?.tasks) ||
    plan.tasks.length < 1 ||
    plan.tasks.length > 5
  )
    throw new Error("Plan needs one to five tasks.");
  plan.tasks.forEach((t: any, i: number) => {
    if (
      !ids.includes(t.agentId) ||
      typeof t.title !== "string" ||
      !t.title.trim()
    )
      throw new Error("Plan has an unknown teammate or empty title.");
    if (
      t.dependsOn !== undefined &&
      (!Array.isArray(t.dependsOn) ||
        t.dependsOn.some((n: any) => !Number.isInteger(n) || n < 0 || n >= i) ||
        new Set(t.dependsOn).size !== t.dependsOn.length)
    )
      throw new Error("dependsOn must contain unique earlier task indexes.");
  });
  return plan;
}
// Extractive compression: prose is bounded, fenced code remains byte-for-byte intact.
export function summarizeOutput(text: string, limit = 3000) {
  if (text.length <= limit) return text;
  const pieces = text.split(/(```[\s\S]*?```)/g);
  let proseBudget = limit;
  return pieces
    .map((piece) => {
      if (piece.startsWith("```")) return piece;
      const keep = Math.min(proseBudget, piece.length);
      proseBudget -= keep;
      return (
        piece.slice(0, keep) +
        (keep < piece.length
          ? "\n[Older prose omitted; code preserved.]\n"
          : "")
      );
    })
    .join("");
}
