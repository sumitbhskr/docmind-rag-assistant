// import { z } from 'zod'
// import { createServiceRoleClient } from './supabase/server'

// // ─── Zod Schemas (validate BEFORE executing) ────────────────────────────────

// export const saveTaskSchema = z.object({
//   title: z.string().min(1).max(500),
// })

// export const sendNotificationSchema = z.object({
//   message: z.string().min(1).max(2000),
// })

// // ─── Tool Declarations for Gemini ───────────────────────────────────────────

// export const toolDeclarations = [
//   {
//     name: 'save_task',
//     description:
//       'Save an action item or task derived from the documents into this workspace. Use when the user asks to create a task, to-do, or action item.',
//     parameters: {
//       type: 'object' as const,
//       properties: {
//         title: {
//           type: 'string',
//           description: 'The task title, max 500 characters',
//         },
//       },
//       required: ['title'],
//     },
//   },
//   {
//     name: 'send_notification',
//     description:
//       'Send a summary or notification to the team Discord channel. Use when the user explicitly asks to share or notify the team about something.',
//     parameters: {
//       type: 'object' as const,
//       properties: {
//         message: {
//           type: 'string',
//           description: 'The message to send, max 2000 characters',
//         },
//       },
//       required: ['message'],
//     },
//   },
// ]

// // ─── Tool Executors ──────────────────────────────────────────────────────────

// export type ToolResult =
//   | { success: true; data: unknown }
//   | { success: false; error: string }

// export async function executeSaveTask(
//   args: z.infer<typeof saveTaskSchema>,
//   workspaceId: string
// ): Promise<ToolResult> {
//   const supabase = createServiceRoleClient()
//   const { data, error } = await supabase
//     .from('tasks')
//     .insert({ workspace_id: workspaceId, title: args.title })
//     .select()
//     .single()

//   if (error) return { success: false, error: error.message }
//   return { success: true, data: { task_id: data.id, title: data.title } }
// }

// export async function executeSendNotification(
//   args: z.infer<typeof sendNotificationSchema>
// ): Promise<ToolResult> {
//   const webhookUrl = process.env.DISCORD_WEBHOOK_URL
//   if (!webhookUrl) {
//     return { success: false, error: 'Discord webhook not configured' }
//   }

//   const response = await fetch(webhookUrl, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ content: args.message }),
//   })

//   if (!response.ok) {
//     return { success: false, error: `Discord returned ${response.status}` }
//   }
//   return { success: true, data: { sent: true } }
// }

// // ─── Main dispatcher — call this from chat route ─────────────────────────────

// export async function executeTool(
//   toolName: string,
//   rawArgs: unknown,
//   workspaceId: string
// ): Promise<{ result: ToolResult; status: 'success' | 'error' | 'invalid_args' }> {
//   if (toolName === 'save_task') {
//     const parsed = saveTaskSchema.safeParse(rawArgs)
//     if (!parsed.success) {
//       return {
//         result: { success: false, error: `Invalid args: ${parsed.error.message}` },
//         status: 'invalid_args',
//       }
//     }
//     const result = await executeSaveTask(parsed.data, workspaceId)
//     return { result, status: result.success ? 'success' : 'error' }
//   }

//   if (toolName === 'send_notification') {
//     const parsed = sendNotificationSchema.safeParse(rawArgs)
//     if (!parsed.success) {
//       return {
//         result: { success: false, error: `Invalid args: ${parsed.error.message}` },
//         status: 'invalid_args',
//       }
//     }
//     const result = await executeSendNotification(parsed.data)
//     return { result, status: result.success ? 'success' : 'error' }
//   }

//   // Unknown tool — never crash, return error to model
//   return {
//     result: { success: false, error: `Unknown tool: ${toolName}` },
//     status: 'error',
//   }
// }

import { z } from 'zod'
import { SchemaType, FunctionDeclaration } from '@google/generative-ai'
import { createServiceRoleClient } from './supabase/server'

export const saveTaskSchema = z.object({
  title: z.string().min(1).max(500),
})

export const sendNotificationSchema = z.object({
  message: z.string().min(1).max(2000),
})

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'save_task',
    description: 'Save an action item or task derived from the documents into this workspace. Use when the user asks to create a task, to-do, or action item.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: {
          type: SchemaType.STRING,
          description: 'The task title, max 500 characters',
          nullable: false,
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'send_notification',
    description: 'Send a summary or notification to the team Discord channel. Use when the user explicitly asks to share or notify the team about something.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message: {
          type: SchemaType.STRING,
          description: 'The message to send, max 2000 characters',
          nullable: false,
        },
      },
      required: ['message'],
    },
  },
]
// ─── Tool Executors ──────────────────────────────────────────────────────────

export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

export async function executeSaveTask(
  args: z.infer<typeof saveTaskSchema>,
  workspaceId: string,
): Promise<ToolResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ workspace_id: workspaceId, title: args.title })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { task_id: data.id, title: data.title } };
}

export async function executeSendNotification(
  args: z.infer<typeof sendNotificationSchema>,
): Promise<ToolResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: false, error: "Discord webhook not configured" };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: args.message }),
  });

  if (!response.ok) {
    return { success: false, error: `Discord returned ${response.status}` };
  }
  return { success: true, data: { sent: true } };
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  rawArgs: unknown,
  workspaceId: string,
): Promise<{
  result: ToolResult;
  status: "success" | "error" | "invalid_args";
}> {
  if (toolName === "save_task") {
    const parsed = saveTaskSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        result: {
          success: false,
          error: `Invalid args: ${parsed.error.message}`,
        },
        status: "invalid_args",
      };
    }
    const result = await executeSaveTask(parsed.data, workspaceId);
    return { result, status: result.success ? "success" : "error" };
  }

  if (toolName === "send_notification") {
    const parsed = sendNotificationSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        result: {
          success: false,
          error: `Invalid args: ${parsed.error.message}`,
        },
        status: "invalid_args",
      };
    }
    const result = await executeSendNotification(parsed.data);
    return { result, status: result.success ? "success" : "error" };
  }

  return {
    result: { success: false, error: `Unknown tool: ${toolName}` },
    status: "error",
  };
}
