import { AppChatMessage, AppTool } from "@/lib/client.types";
import { gateway } from "@/lib/gateway";
import {
  jsonSchema,
  ModelMessage,
  streamText,
  Tool,
  ToolCallPart,
  ToolResultPart,
} from "ai";

export const maxDuration = 60;
const DEFAULT_MODEL = "xai/grok-3-beta";

const SYSTEM_PROMPT = `
You are a helpful assistant. You may be provided with a list of available tools to help answer user questions.

### Tool Usage Rules:
1.  Examine the user's request to determine if any of the available tools can help.
2.  If a tool is needed and an appropriate one is available in the provided list, you MUST use that tool. Generate the necessary tool call request.
3.  ONLY use tools from the provided list. DO NOT invent or request tools that are not in the list.
4.  If NO tools are provided, OR if none of the provided tools are suitable for the user's request, OR if you can answer the request directly without tools, respond to the user directly without making a tool call.
5.  If you cannot fulfill the request because the necessary tools are missing or unsuitable, clearly state that you cannot complete the task due to the lack of appropriate tools. Do not attempt to make up an answer or use a non-existent tool.
6.  After receiving the result from a tool call, use that information to formulate your final response to the user.

### Response Format:
- Use Markdown for formatting when appropriate.
- Base your response on the information gathered, including any tool results.
- Ensure your final answer directly addresses the user's question.
`;

function mapToModelMessages(appMessages: AppChatMessage[]): ModelMessage[] {
  return appMessages.map((msg): ModelMessage => {
    switch (msg.role) {
      case "USER":
        return {
          role: "user",
          content: msg.content ?? "",
        };
      case "ASSISTANT":
        const contentParts: (string | ToolCallPart)[] = [];
        if (msg.content) {
          contentParts.push(msg.content);
        }
        if (msg.toolCalls) {
          const toolCallParts: ToolCallPart[] = msg.toolCalls.map((tc) => ({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.argumentsJson),
          }));
          contentParts.push(...toolCallParts);
        }

        return {
          role: "assistant",
          // @ts-ignore
          content:
            contentParts.length === 1 && typeof contentParts[0] === "string"
              ? contentParts[0]
              : contentParts,
        };

      case "SYSTEM":
        return {
          role: "system",
          content: msg.content ?? "",
        };
      case "TOOL":
        let result: unknown;
        try {
          result = msg.content ? JSON.parse(msg.content) : null;
        } catch (e) {
          result = msg.content;
        }

        const toolResultPart: ToolResultPart = {
          type: "tool-result",
          toolCallId: msg.toolCallId ?? "",
          toolName: msg.name ?? "",
          result: result,
        };
        return {
          role: "tool",
          content: [toolResultPart],
        };
      default:
        throw new Error(`unknown messages role: ${msg.role}`);
    }
  });
}

function mapToSdkTools(appTools: AppTool[]): Record<string, Tool> {
  if (!appTools || appTools.length === 0) {
    return {};
  }

  return appTools.reduce((acc: Record<string, Tool>, tool) => {
    acc[tool.name] = {
      description: tool.description ?? undefined,
      parameters: jsonSchema(tool.inputSchema),
    };
    return acc;
  }, {});
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      tools,
      modelId = DEFAULT_MODEL,
    }: {
      messages: AppChatMessage[];
      tools?: AppTool[];
      modelId: string;
    } = await req.json();

    if (!messages) {
      return new Response('Missing "messages" in request body', {
        status: 400,
      });
    }

    const modelMessages = mapToModelMessages(messages);
    const sdkTools = mapToSdkTools(tools ?? []);

    const result = streamText({
      model: gateway(modelId),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools: sdkTools,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("AI Gateway Error", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
