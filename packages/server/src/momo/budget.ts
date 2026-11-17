export type ChatMessage = { role: string; content: string };
export const contextBlock = (text: string) =>
  `<momo-context>${text}</momo-context>`;
export const outputBlock = (text: string) =>
  `<momo-output>${text}</momo-output>`;
/** Approximation, not a tokenizer. Only explicitly removable evidence/context is trimmed. */
export function budgetMessages(
  input: ChatMessage[],
  numCtx = 8192,
  numPredict = 2048,
) {
  const messages = input.map((m) => ({ ...m }));
  const estimate = () =>
    Math.ceil(messages.reduce((n, m) => n + m.content.length + 32, 0) / 3.5) +
    numPredict;
  let trimmed = false;
  for (const kind of ["output", "context"]) {
    for (const m of messages) {
      if (m.role === "system") continue;
      const pattern = new RegExp(
        `<momo-${kind}>([\\s\\S]*?)</momo-${kind}>`,
        "g",
      );
      let match: RegExpExecArray | null;
      while (estimate() > numCtx && (match = pattern.exec(m.content))) {
        const text = match[1];
        const remove = Math.min(
          text.length,
          Math.ceil((estimate() - numCtx) * 3.5) + 64,
        );
        if (remove > 0) trimmed = true;
        const replacement = `<momo-${kind}>${text.slice(remove)}</momo-${kind}>`;
        m.content =
          m.content.slice(0, match.index) +
          replacement +
          m.content.slice(match.index + match[0].length);
        pattern.lastIndex = match.index + replacement.length;
      }
    }
  }
  if (estimate() > numCtx)
    throw new Error(
      "The system prompt and current assignment exceed the context budget. Increase numCtx or shorten the request/instructions.",
    );
  return { messages, trimmed, tokens: estimate() };
}
