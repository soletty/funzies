export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
};

export async function processAnthropicStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (
        event.type === "content_block_start" &&
        event.content_block?.type === "server_tool_use"
      ) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "searching" })}\n\n`)
        );
      }

      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        const text = event.delta.text;
        fullText += text;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`)
        );
      }
    }
  }

  return fullText;
}
