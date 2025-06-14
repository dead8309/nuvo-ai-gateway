import { AppChatMessage, AppTool } from "@/lib/client.types";
import { DEFAULT_MODEL, SYSTEM_PROMPT } from "@/lib/constants";
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
