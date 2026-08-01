/** ForgeFlow-layer tool execution — see FORGEFLOW_V3_SPEC.md §5/§5b.
 * We own this loop rather than delegating to Lyzr's tool_configs (which
 * is shaped for pre-registered enterprise connectors, not arbitrary
 * developer webhooks). The agent emits a TOOL_CALL marker, we intercept
 * it in /api/agent/chat, execute a real HTTP call here, and feed the
 * real result back into the same Lyzr session. */

export type ParamType = "string" | "number" | "boolean";
export type ParamsSchema = Record<string, ParamType>;

export interface ToolDefInput {
  toolName: string;
  description: string;
  paramsSchema: ParamsSchema;
  /** A real webhook URL, or the "builtin:weather" sentinel. */
  endpointUrl: string;
}

export interface ToolDefRow {
  id: string;
  agent_id: string;
  tool_name: string;
  description: string | null;
  params_schema: string | null;
  endpoint_url: string | null;
  created_at: string;
}

export const BUILTIN_WEATHER = "builtin:weather";

export interface ParsedToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** The exact marker contract we teach the agent in its instructions.
 * Parses `TOOL_CALL: {json}` out of a Lyzr response. Tolerates the model
 * wrapping the JSON in a ```json fence or adding leading prose, by
 * slicing from the first `{` after the marker to its matching close. */
export function parseToolCall(response: string): ParsedToolCall | null {
  const markerIdx = response.indexOf("TOOL_CALL:");
  if (markerIdx === -1) return null;
  const after = response.slice(markerIdx + "TOOL_CALL:".length);
  const start = after.indexOf("{");
  if (start === -1) return null;

  // Walk braces to find the matching close, ignoring braces inside strings.
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < after.length; i++) {
    const ch = after[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  try {
    const obj = JSON.parse(after.slice(start, end + 1)) as ParsedToolCall;
    if (!obj || typeof obj.tool !== "string") return null;
    return { tool: obj.tool, args: obj.args ?? {} };
  } catch {
    return null;
  }
}

/** Builds the tool contract appended to agent_instructions at creation
 * and re-forge. This is what makes the LLM actually emit TOOL_CALL —
 * the tool_defs table is only the executable registry read at chat time;
 * without this contract in the instructions, the agent never calls out. */
export function buildToolContract(tools: ToolDefInput[]): string {
  if (tools.length === 0) return "";
  const lines = tools.map((t) => {
    const params = Object.entries(t.paramsSchema)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");
    return `- ${t.toolName}: ${t.description}. Parameters: ${params || "none"}.`;
  });
  return (
    `\n\nYou have access to these tools:\n${lines.join("\n")}\n\n` +
    `When you need a tool to answer, respond with EXACTLY this and nothing else in that turn:\n` +
    `TOOL_CALL: {"tool": "<tool_name>", "args": { ... }}\n` +
    `Use only the parameters listed for that tool. After the tool result is provided back to you, ` +
    `answer the user's original question in natural language using that result.`
  );
}

/** Validates parsed args against the tool's declared param schema.
 * Returns an error string if invalid, or null if OK. Loose type
 * checking — numbers-as-strings are coerced, since LLMs are inconsistent. */
export function validateArgs(
  schema: ParamsSchema,
  args: Record<string, unknown>
): { ok: true; coerced: Record<string, unknown> } | { ok: false; error: string } {
  const coerced: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(schema)) {
    const val = args[key];
    if (val === undefined || val === null || val === "") {
      return { ok: false, error: `missing required parameter "${key}"` };
    }
    if (type === "number") {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isNaN(n)) return { ok: false, error: `parameter "${key}" must be a number` };
      coerced[key] = n;
    } else if (type === "boolean") {
      coerced[key] = val === true || val === "true";
    } else {
      coerced[key] = String(val);
    }
  }
  return { ok: true, coerced };
}

export interface ToolExecutionResult {
  ok: boolean;
  result: unknown;
}

/** Real HTTP execution. Built-in weather hits open-meteo's free,
 * keyless geocoding + forecast APIs (two real GETs). Custom webhooks
 * get a real POST with the validated args as the JSON body. */
export async function executeTool(
  endpointUrl: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  if (endpointUrl === BUILTIN_WEATHER) {
    return executeWeather(args);
  }
  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { ok: res.ok, result: parsed };
}

async function executeWeather(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const city = String(args.city ?? args.location ?? "").trim();
  if (!city) return { ok: false, result: "no city provided" };

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  );
  const geo = (await geoRes.json()) as {
    results?: { latitude: number; longitude: number; name: string; country?: string }[];
  };
  const place = geo.results?.[0];
  if (!place) return { ok: false, result: `no location found for "${city}"` };

  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`
  );
  const wx = (await wxRes.json()) as {
    current?: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      weather_code: number;
    };
    current_units?: Record<string, string>;
  };
  if (!wx.current) return { ok: false, result: "weather lookup failed" };

  return {
    ok: true,
    result: {
      location: `${place.name}${place.country ? ", " + place.country : ""}`,
      observed_at: wx.current.time,
      temperature_c: wx.current.temperature_2m,
      relative_humidity_pct: wx.current.relative_humidity_2m,
      wind_speed_kmh: wx.current.wind_speed_10m,
      weather_code: wx.current.weather_code,
    },
  };
}
