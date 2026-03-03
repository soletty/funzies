import { zodToJsonSchema } from "zod-to-json-schema";

// zodToJsonSchema v3 doesn't support zod v4 — produces empty schemas.
// This converts zod v4 schemas to JSON Schema for the Anthropic tool API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToToolSchema(schema: any): Record<string, unknown> {
  const result = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], { target: "jsonSchema7" }) as Record<string, unknown>;
  if (result.type === "object" && result.properties) {
    delete result.$schema;
    return result;
  }
  return zodV4ToJsonSchema(schema);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodV4ToJsonSchema(schema: any): Record<string, unknown> {
  const def = schema?._def;
  if (!def) return { type: "object" };

  // Zod v4 uses _def.type instead of _def.typeName
  const t = def.type;

  if (t === "object") {
    const shape = def.shape || {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodV4ToJsonSchema(val);
      const valType = (val as any)?._def?.type;
      if (valType !== "optional") {
        required.push(key);
      }
    }
    const result: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) result.required = required;
    return result;
  }
  if (t === "string") return { type: "string" };
  if (t === "number") return { type: "number" };
  if (t === "boolean") return { type: "boolean" };
  if (t === "array") return { type: "array", items: zodV4ToJsonSchema(def.element) };
  if (t === "enum") {
    // Zod v4 enum: _def.entries is { a: "a", b: "b" }
    return { type: "string", enum: Object.values(def.entries) };
  }
  if (t === "nullable") {
    const inner = zodV4ToJsonSchema(def.innerType);
    return { ...inner, nullable: true };
  }
  if (t === "optional") return zodV4ToJsonSchema(def.innerType);
  if (t === "default") return zodV4ToJsonSchema(def.innerType);
  if (t === "unknown" || t === "any") return {};
  if (t === "record") return { type: "object", additionalProperties: zodV4ToJsonSchema(def.valueType) };
  if (t === "union" || t === "discriminatedUnion") {
    const options = (def.options || []).map(zodV4ToJsonSchema);
    return { anyOf: options };
  }
  return {};
}
