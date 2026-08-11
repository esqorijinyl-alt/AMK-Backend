import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VECTOR_STORE_ID = process.env.OPENAI_VECTOR_STORE_ID;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  // Handle browser preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        message: "Method not allowed",
      },
    });
  }
const expectedKey = process.env.SIMLI_LLM_API_KEY;

if (expectedKey) {
  const authorization = req.headers.authorization || "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.substring(7)
    : "";

  if (suppliedKey !== expectedKey) {
    return res.status(401).json({
      error: {
        message: "Unauthorized",
      },
    });
  }
}
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    if (!VECTOR_STORE_ID) {
      throw new Error("OPENAI_VECTOR_STORE_ID is not configured.");
    }

    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return res.status(400).json({
        error: {
          message: "messages is required.",
        },
      });
    }

    /*
     * Simli sends OpenAI-style messages:
     *
     * [
     *   { role: "system", content: "..." },
     *   { role: "user", content: "..." }
     * ]
     *
     * We pass those messages to the OpenAI Responses API.
     */
    const input = messages.map((message) => ({
      role: message.role,
      content:
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
    }));

    /*
     * Ask OpenAI to use the Ask Ms. Kay Vector Store.
     */
    const stream = await openai.responses.create({
      model: MODEL,
      input,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [VECTOR_STORE_ID],
          max_num_results: 5,
        },
      ],
      reasoning: {
        effort: "low",
      },
      text: {
        verbosity: "medium",
      },
      stream: true,
    });

    /*
     * Simli expects Server-Sent Events (SSE)
     * using the OpenAI Chat Completions format.
     */
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const event of stream) {
      /*
       * Responses API text streaming event.
       */
      if (event.type === "response.output_text.delta") {
        const chunk = {
          id: event.response_id || `askmskay-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: MODEL,
          choices: [
            {
              index: 0,
              delta: {
                content: event.delta,
              },
              finish_reason: null,
            },
          ],
        };

        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }

    /*
     * Tell Simli the response is finished.
     */
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Ask Ms. Kay error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: {
          message: "Unable to process the request.",
        },
      });
    }

    const errorChunk = {
      error: {
        message: "Unable to process the request.",
      },
    };

    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
}
