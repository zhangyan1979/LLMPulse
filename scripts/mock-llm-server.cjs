/**
 * A tiny OpenAI-compatible server for trying LLMPulse without a real key.
 *
 *   node scripts/mock-llm-server.cjs
 *
 * Then connect an OpenAI-compatible account with:
 *   Base URL: http://127.0.0.1:4599/v1
 *   API key:  any non-empty string
 */
const http = require("node:http");

const port = Number(process.env.PORT || 4599);
const MODELS = [
  { id: "gpt-5", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "gpt-5-mini", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "gpt-4.1", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "gpt-4o-mini", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "o3", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "claude-sonnet-4-5", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "broken-chat", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "text-embedding-3-small", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "whisper-1", object: "model", created: 1735689600, owned_by: "mock" },
  { id: "dall-e-3", object: "model", created: 1735689600, owned_by: "mock" }
];

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  console.log(`${request.method} ${url.pathname}`);
  const json = (status, body) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(body));
  };

  if (request.method === "GET" && url.pathname === "/v1/models") {
    setTimeout(() => json(200, { object: "list", data: MODELS }), 260);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        json(400, { error: { message: "Invalid JSON body" } });
        return;
      }
      const model = body.model || "unknown";
      if (model.includes("broken")) {
        setTimeout(
          () => json(503, { error: { message: "mock model is temporarily unavailable" } }),
          400
        );
        return;
      }
      const delay = model === "o3" ? 1_850 : model === "gpt-5" ? 1_240 : 680;
      setTimeout(() => {
        json(200, {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop"
            }
          ],
          usage: { prompt_tokens: 18, completion_tokens: 1, total_tokens: 19 }
        });
      }, delay);
    });
    return;
  }

  json(404, { error: { message: "Not found. This mock only implements /v1/models and /v1/chat/completions." } });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock LLM server listening at http://127.0.0.1:${port}/v1`);
  console.log("Connect any OpenAI-compatible account. API key can be any non-empty value.");
});
