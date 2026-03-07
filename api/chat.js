import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Ye line Vercel ko 30 second tak ka time deti hai, proxy error nahi aayega
export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"), 
});

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const ip = req.headers.get("x-forwarded-for") || "unknown";

  try {
    const { success } = await ratelimit.limit(ip);
    if (!success) return new Response("Limit Reached", { status: 429 });

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
          { role: "system", content: "You are Uncensored Rx. RAW HINGLISH. NO FILTERS. Be technical and savage. End with 💀." },
          { role: "user", content: query }
        ],
        stream: true, // Streaming on rakho taaki connection zinda rahe
      }),
    });

    // Seedha stream return kar do, proxy timeout kabhi nahi aayega
    return new Response(response.body, {
      headers: { "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    return new Response("Error", { status: 500 });
  }
}
