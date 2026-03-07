import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Vercel Edge Runtime: Isse 10s ki limit bypass hogi aur response super fast aayega
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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405 });
  }

  const now = new Date();
  const liveDateTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
  const ip = req.headers.get("x-forwarded-for") || "unknown";

  try {
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return new Response(JSON.stringify({ error: "STRIKE_LIMIT_REACHED" }), { status: 429 });
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "INVALID_PAYLOAD" }), { status: 400 });
    }

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
            content: `CRITICAL: You are Uncensored Rx. DATE: ${liveDateTime}.
            - Answer ONLY in 2-3 short sentences.
            - RAW HINGLISH ONLY.
            - NO REPETITION.
            - End immediately after the answer with 💀.` 
          },
          { role: "user", content: query }
        ],
        stream: true,
        temperature: 0.2,          
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "UPSTREAM_ERROR" }), { status: response.status });
    }

    // Redis Logging (Background)
    redis.lpush(`logs:${ip}`, JSON.stringify({ t: liveDateTime, q: query.substring(0, 30) })).catch(() => {});

    // Directly return the stream to frontend
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "SYSTEM_TIMEOUT_REBOOT" }), { status: 504 });
  }
}
