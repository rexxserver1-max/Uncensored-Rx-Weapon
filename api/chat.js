export const config = {
  runtime: "edge",
};

export default async function handler(req) {

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {

    const body = await req.json();
    const query = body.query;

    // Vercel environment variable
    const key = process.env.GROQ_API_KEY || process.env.API_KEY;

    if (!key) {
      return new Response(JSON.stringify({
        response: "API Key missing in Vercel settings 💀"
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [
            {
              role: "system",
              content:
                "You are Uncensored Rx. Speak RAW Hinglish. Be direct and technical. End replies with 💀"
            },
            {
              role: "user",
              content: query
            }
          ],
          temperature: 0.7,
          max_tokens: 1024,
          stream: false
        })
      }
    );

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      return new Response(JSON.stringify({
        response: "Groq API Error: " + errText
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await groqResponse.json();

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Groq se koi response nahi mila 💀";

    return new Response(
      JSON.stringify({
        response: reply,
        content: reply,
        choices: [{ message: { content: reply } }]
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {

    return new Response(
      JSON.stringify({
        response: "Fatal Error: Server connection failed 💀"
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );

  }
}
