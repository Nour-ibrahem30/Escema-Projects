import type { SchemaModel } from '../types';

export const SYSTEM_PROMPT = `You are a database architect. Design production-ready schemas.

OUTPUT: Raw JSON only. No markdown, no explanation, no code fences.

JSON STRUCTURE:
{
  "schemaName": "string",
  "schemaDescription": "string",
  "entities": [{"name": "PascalCase", "description": "string", "fields": [Field]}],
  "relationships": [{"sourceName": "Entity1", "targetName": "Entity2", "type": "one-to-many"}],
  "enums": [{"name": "PascalCase", "values": ["VALUE"]}]
}

Field: {"name": "camelCase", "type": "uuid|string|text|integer|float|decimal|boolean|date|datetime|json", "primaryKey": bool, "nullable": bool, "unique": bool}

RULES:
1. Every entity has id (uuid, PK), createdAt, updatedAt (datetime)
2. Add FK fields explicitly (e.g. userId: uuid)
3. Use enums for status fields
4. Many-to-many needs junction entity with metadata
5. List ALL relationships in relationships array
6. Add 8-12 realistic fields per entity
7. PascalCase entities, camelCase fields
8. For large schemas (30+ entities requested), generate the full count

OUTPUT JSON ONLY.`;

export function buildUserPrompt(
  userMessage: string,
  currentSchema: SchemaModel,
): string {
  // Minimal prompt to avoid 413 errors
  const hasSmallSchema = currentSchema.entities.length > 0 && currentSchema.entities.length <= 3;

  let prompt = `Design: "${userMessage}"

Requirements: ALL entities needed, 8-12 fields each, enums for status, FK fields, timestamps, complete relationships array.`;

  if (hasSmallSchema) {
    const names = currentSchema.entities.map((e) => e.name).join(', ');
    prompt += `\n\nCurrent: ${names} (extend/replace)`;
  }

  return prompt;
}
