export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const simliApiKey = process.env.SIMLI_API_KEY;
    const llmApiKey = process.env.SIMLI_LLM_API_KEY;

    if (!simliApiKey) {
      throw new Error("SIMLI_API_KEY is not configured.");
    }

    if (!llmApiKey) {
      throw new Error("SIMLI_LLM_API_KEY is not configured.");
    }

    const response = await fetch(
      "https://api.simli.ai/auto/start/configurable",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-simli-api-key": simliApiKey,
        },
        body: JSON.stringify({
          apiKey: simliApiKey,

          faceId: "b9e5fba3-071a-4e35-896e-211c4d6eaa7b",

          ttsProvider: "ElevenLabs",

          language: "en",

          createTranscript: true,

          maxSessionLength: 3600,

          maxIdleTime: 300,

          systemPrompt:
            "You are Ms. Kay, a warm, knowledgeable, non-judgmental parenting support assistant. Help parents with practical parenting questions using the Ask Ms. Kay knowledge base. Be supportive, clear, calm, and conversational. Do not claim to be a doctor, therapist, or other licensed medical professional.",

          firstMessage:
            "Hi, I'm Ms. Kay. How can I help you today?",

          customLLMConfig: {
            model: "gpt-5.5",
            baseURL: "https://amk-backend.vercel.app/api",
            llmAPIKey: llmApiKey,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Simli error:", data);

      return res.status(response.status).json({
        error: "Unable to start Simli session.",
        details: data,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Start session error:", error);

    return res.status(500).json({
      error: "Unable to start Simli session.",
    });
  }
}
