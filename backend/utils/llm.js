// LLM client for the contribution agent.
//
// OpenAI-compatible chat completions over fetch (no SDK dependency), so the same
// code works against OpenAI, Groq, OpenRouter, Together, or a local Ollama by
// changing LLM_BASE_URL. The model is OPTIONAL: with no LLM_API_KEY every call
// returns null immediately and the deterministic stages stand alone. The agent
// must remain fully functional and testable without a key, so no caller may
// depend on a non-null result.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 20000;

export function isLlmEnabled() {
  return Boolean(process.env.LLM_API_KEY);
}

function config() {
  return {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10),
  };
}

// Strip markdown fences and surrounding prose so a model that ignores the
// "JSON only" instruction still yields parseable output.
function extractJson(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to brace slicing */
  }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Single-shot completion. Returns the parsed JSON object, or null when the LLM
// is disabled, unreachable, slow, or produced unparseable output. Callers treat
// null as "no enrichment available" and carry on deterministically.
export async function completeJson({ system, user, maxTokens = 900, temperature = 0.2 }) {
  if (!isLlmEnabled()) return null;

  const { apiKey, baseUrl, model, timeoutMs } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        // Groq deprecates `max_tokens` in favour of this; OpenAI accepts both.
        // Reasoning models (gpt-oss, qwen3) spend part of this budget on hidden
        // reasoning tokens, so it must be generous or the JSON arrives truncated.
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[llm] request failed (${response.status}) for model "${model}" at ${baseUrl}: ${detail.slice(0, 300)}`
      );
      return null;
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    const parsed = extractJson(text);
    if (!parsed) {
      console.warn(
        `[llm] response was not valid JSON (model "${model}"); using deterministic result`
      );
    }
    return parsed;
  } catch (err) {
    // Timeouts and network failures are expected when the provider is down or
    // the deployment simply has no egress; the deterministic path covers it.
    const reason = err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message;
    console.warn(`[llm] call unavailable (${reason}); using deterministic result`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function llmConfigSummary() {
  const { baseUrl, model } = config();
  return { baseUrl, model, enabled: isLlmEnabled() };
}
