const assert = require("node:assert/strict");
const http = require("node:http");
const { detectModels, testModel } = require("../dist-electron/electron/providers.js");

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body ? JSON.parse(body) : null));
  });
}

async function testOpenAiCompatible() {
  const seen = [];
  const { server, baseUrl } = await startServer(async (request, response) => {
    seen.push({
      method: request.method,
      url: request.url,
      auth: request.headers.authorization,
      body: await readBody(request)
    });
    if (request.url === "/v1/models") {
      sendJson(response, 200, {
        object: "list",
        data: [
          { id: "text-embedding-3-small", object: "model" },
          { id: "gpt-test", object: "model", owned_by: "test" }
        ]
      });
      return;
    }
    if (request.url === "/v1/chat/completions") {
      sendJson(response, 200, {
        id: "chatcmpl-test",
        choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }]
      });
      return;
    }
    sendJson(response, 404, { error: { message: "not found" } });
  });
  try {
    const account = {
      id: "openai-account",
      name: "OpenAI test",
      kind: "openai",
      baseUrl: `${baseUrl}/v1`,
      apiKey: "sk-smoke-test"
    };
    const detection = await detectModels(account);
    assert.equal(detection.models.length, 2);
    assert.equal(detection.models[0].id, "gpt-test", "chat models should sort before embeddings");
    assert.equal(seen[0].auth, "Bearer sk-smoke-test");

    const result = await testModel(account, "gpt-test");
    assert.equal(result.ok, true);
    assert.equal(result.responseText, "OK");
    assert.equal(result.statusCode, 200);
    assert.equal(seen[1].body.model, "gpt-test");
    assert.equal(seen[1].body.stream, false);
  } finally {
    server.close();
  }
}

async function testAnthropic() {
  const seen = [];
  const { server, baseUrl } = await startServer(async (request, response) => {
    seen.push({
      method: request.method,
      url: request.url,
      apiKey: request.headers["x-api-key"],
      version: request.headers["anthropic-version"],
      body: await readBody(request)
    });
    if (request.url.startsWith("/v1/models")) {
      sendJson(response, 200, {
        data: [{ id: "claude-test", display_name: "Claude Test", type: "model" }],
        has_more: false,
        last_id: null
      });
      return;
    }
    if (request.url === "/v1/messages") {
      sendJson(response, 200, {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "OK" }],
        stop_reason: "end_turn"
      });
      return;
    }
    sendJson(response, 404, { error: { message: "not found" } });
  });
  try {
    const account = {
      id: "anthropic-account",
      name: "Anthropic test",
      kind: "anthropic",
      baseUrl,
      apiKey: "sk-ant-smoke"
    };
    const detection = await detectModels(account);
    assert.equal(detection.models[0].id, "claude-test");
    assert.equal(seen[0].apiKey, "sk-ant-smoke");
    assert.equal(seen[0].version, "2023-06-01");
    const result = await testModel(account, "claude-test");
    assert.equal(result.ok, true);
    assert.equal(result.responseText, "OK");
    assert.equal(seen[1].body.max_tokens, 64);
  } finally {
    server.close();
  }
}

async function testGemini() {
  const seen = [];
  const { server, baseUrl } = await startServer(async (request, response) => {
    seen.push({
      method: request.method,
      url: request.url,
      apiKey: request.headers["x-goog-api-key"],
      body: await readBody(request)
    });
    if (request.url.startsWith("/v1beta/models?")) {
      sendJson(response, 200, {
        models: [
          { name: "models/gemini-test", displayName: "Gemini Test", supportedGenerationMethods: ["generateContent"] },
          { name: "models/text-embedding-test", supportedGenerationMethods: ["embedContent"] }
        ]
      });
      return;
    }
    if (request.url === "/v1beta/models/gemini-test:generateContent") {
      sendJson(response, 200, {
        candidates: [{ content: { role: "model", parts: [{ text: "OK" }] }, finishReason: "STOP" }]
      });
      return;
    }
    sendJson(response, 404, { error: { message: "not found" } });
  });
  try {
    const account = {
      id: "gemini-account",
      name: "Gemini test",
      kind: "gemini",
      baseUrl: `${baseUrl}/v1beta`,
      apiKey: "AIza-smoke"
    };
    const detection = await detectModels(account);
    assert.deepEqual(detection.models.map((model) => model.id), ["gemini-test"]);
    const result = await testModel(account, "gemini-test");
    assert.equal(result.ok, true);
    assert.equal(result.responseText, "OK");
    assert.equal(seen[0].apiKey, "AIza-smoke");
  } finally {
    server.close();
  }
}

async function testProviderFailure() {
  const { server, baseUrl } = await startServer((request, response) => {
    sendJson(response, 401, { error: { message: "Incorrect API key provided: sk-secret-value" } });
  });
  try {
    const account = {
      id: "bad-account",
      name: "Bad key",
      kind: "openai",
      baseUrl: `${baseUrl}/v1`,
      apiKey: "sk-secret-value"
    };
    const result = await testModel(account, "gpt-test");
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.error, /Authentication failed/);
    assert.doesNotMatch(result.error, /sk-secret-value/, "the API key must be redacted");
  } finally {
    server.close();
  }
}

(async () => {
  await testOpenAiCompatible();
  await testAnthropic();
  await testGemini();
  await testProviderFailure();
  console.log("Provider smoke tests passed (OpenAI-compatible, Anthropic, Gemini, error redaction).");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
