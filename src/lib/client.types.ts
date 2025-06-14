interface AppFunctionCall {
    name: string
    argumentsJson: string
}

interface AppToolCall {
    id: string
    type: "function"
    function: AppFunctionCall
}

interface AppChatMessage {
    role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL"
    content: string| null;
    toolCalls?: AppToolCall[] | null
    toolCallId?: string | null
    name?: string | null
}

interface AppTool {
    name: string
    description?: string | null
    inputSchema: {
        type: "object"
        properties: Record<string, unknown>
        required?: string
    }
}

export type {
    AppFunctionCall, AppToolCall, AppChatMessage, AppTool
}
