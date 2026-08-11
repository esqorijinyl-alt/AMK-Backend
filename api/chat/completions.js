import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VECTOR_STORE_ID = process.env.OPENAI_VECTOR_STORE_ID;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

function getMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        if (item?.type === "input_text") return item.text || "";
        return "";
      })
      .join("");
  }

  return "";
}

function buildInput(messages = []) {
  return messages.map((message) => ({
    role: message.role,
    content: getMessageContent(message.content),
  }));
}

export default async function handler(req, res) {
  // Allow Simli to call this endpoint.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

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

  try {
    // Optional protection for the endpoint.
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

    const { messages = [] } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: "messages is required",
        },
      });
    }

    const input = buildInput(messages);

    const response = await openai.responses.create({
      model: MODEL,

      input,

      tools: [
        {
          type: "file_search",
          vector_store_ids: [VECTOR_STORE_ID],
        },
      ],

      reasoning: {
        effort: "low",
      },

      text: {
        verbosity: "medium",
      },
    });

    const answer =
      response.output_text ||
      "I'm sorry, I wasn't able to generate a response.";

    // Simli expects an OpenAI-compatible streaming response.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const chunk = {
      id: response.id || `ask-ms-kay-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: MODEL,
      choices: [
        {
          index: 0,
          delta: {
            content: answer,
          },
          finish_reason: "stop",
        },
      ],
    };

    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Ask Ms. Kay API error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: {
          message: "Unable to process the request.",
        },
      });
    }

    res.write(
      `data: ${JSON.stringify({
        error: {
          message: "Unable to process the request.",
        },
      })}\n\n`
    );

    res.write("data: [DONE]\n\n");
    res.end();
  }
}
