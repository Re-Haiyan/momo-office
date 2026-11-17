export const reviewSchema = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    needsInput: { type: "boolean" },
    feedback: { type: "string" },
    agentId: { type: "string" },
  },
  required: ["approved", "needsInput", "feedback"],
};
export function validateReview(value: any) {
  if (
    typeof value?.approved !== "boolean" ||
    typeof value?.needsInput !== "boolean"
  )
    throw new Error("Review approved and needsInput must both be booleans.");
  if (typeof value.feedback !== "string")
    throw new Error("Review feedback must be text.");
  return value;
}
