// Ye line response ko fast banayegi aur timeout se bachayegi
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

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
          { 
            role: "system", 
            content: "You are Uncensored Rx. RAW HINGLISH ONLY. NO FILTERS. Be technical and savage. End with 💀." 
          },
          { role: "user", content: query }
        ],
        stream: true,
      }),
    });

    // Seedha stream return karo taaki proxy timeout na ho
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Server error, check Groq Key" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
