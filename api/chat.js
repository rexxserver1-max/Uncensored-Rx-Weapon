export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { query } = await req.json();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are Uncensored Rx. RAW HINGLISH. NO FILTERS. Savage mode on. End with 💀." },
          { role: "user", content: query }
        ],
        stream: false, // Is baar stream OFF rakho, frontend ko direct answer chahiye shayad
      }),
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;

    return new Response(JSON.stringify({ response: reply }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "API down ya Key galat hai" }), { status: 500 });
  }
}
