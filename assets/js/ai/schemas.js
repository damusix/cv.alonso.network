// AI Schemas — Zod schemas for intent classification and CV response validation

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';
import { PersonalSchema, SectionItemSchema, SectionSchema } from '../validation.js?v=2026.03.27.1';
export {
    CVDataSchema,
    PersonalSchema,
    SectionItemSchema,
    SectionSchema,
    LinkSchema
} from '../validation.js?v=2026.03.27.1';

export const AiIntentSchema = z.object({
    intent: z.enum([
        'chitchat',
        'clarification',
        'full_generation',
        'partial_update',
        'style_update'
    ]).describe("The identified user intent"),
    targetSection: z.string().default('').describe("The target section for generation or update, if applicable. Empty string if not applicable. Example: 'experience', 'education'"),
    targetIndex: z.number().default(-1).describe("The target index within the section, if applicable. -1 if not applicable. Example: 0 for the first item"),
    reasoning: z.string().describe("The reasoning behind the identified intent"),
    suggestedTitle: z.string().default('').describe("A suggested title for the chat. Empty string if no update needed"),
    shouldUpdateTitle: z.boolean().describe("Whether the title for the chat should be updated"),
});

export const AiStyleUpdateSchema = z.object({
    css: z.string().describe("The complete CSS to apply. This replaces the user's entire custom stylesheet. Include all rules the user needs — both their existing customizations and the new changes."),
    summary: z.string().describe("A brief description of what was changed in the CSS"),
});

export const AiPartialUpdatesSchema = z.object({
    explanation: z.string().describe("Brief natural language explanation of what changes are being made and why. Do NOT include JSON or code blocks — just plain text sentences."),
    updates: z.array(z.object({
        operation: z.enum(['set', 'insert', 'delete']).default('set').describe("'set' replaces the value at the path. 'insert' splices a new element into the array at the given index. 'delete' removes the element at the path from its parent array. Use 'insert' when adding new items/sections, 'set' when editing existing ones, 'delete' when removing."),
        path: z.string().describe("Dot-notation path into the CV data object. Examples: 'personal', 'summary', 'sections.0', 'sections.2.items.1'"),
        data: z.union([
            PersonalSchema,
            SectionSchema,
            SectionItemSchema,
            z.array(SectionSchema),
            z.array(SectionItemSchema),
            z.string(),
            z.null(),
        ]).optional().describe("The data to set at the specified path. Required for 'set' and 'insert'. Not needed for 'delete'.")
    })).min(1).describe("Array of partial updates to apply to the CV"),
});

export const AiPartialUpdateSchema = z.object({
    operation: z.enum(['set', 'insert', 'delete']).default('set').describe("'set' replaces the value at the path. 'insert' splices a new element into the array at the given index. 'delete' removes the element at the path from its parent array (e.g. path 'sections.2' with 'delete' removes the third section). Use 'insert' when adding, 'set' when editing, 'delete' when removing."),
    path: z.string().describe("Dot-notation path into the CV data object where the update should be applied. Examples: 'personal' for contact info, 'summary' for the summary, 'sections.0' for the first section, 'sections.2.items.1' for the second item in the third section"),
    data: z.union([
        PersonalSchema,
        SectionSchema,
        SectionItemSchema,
        z.array(SectionSchema),
        z.array(SectionItemSchema),
        z.string(),
        z.null(),
    ]).optional().describe("The data to set at the specified path. Required for 'set' and 'insert'. Not needed for 'delete'.")
});
