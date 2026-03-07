import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"), 
});

export default async function handler(req, res) {
  // Method Check
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const now = new Date();
  const liveDateTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
  const ip = req.headers["x-forwarded-for"] || "unknown";

  try {
    // Rate Limiting
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return res.status(429).json({ error: "STRIKE_LIMIT_REACHED" });
    }

    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    // Calling Groq API
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
        stream: false, // Error se bachne ke liye streaming abhi off rakhte hain
        temperature: 0.2,          
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Groq Error:", errorData);
      return res.status(response.status).json({ error: "UPSTREAM_ERROR" });
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;

    // Redis Logging
    redis.lpush(`logs:${ip}`, JSON.stringify({ t: liveDateTime, q: query.substring(0, 30) })).catch(() => {});

    // Send Final Response
    return res.status(200).json({ result: reply });

  } catch (error) {
    console.error("System Error:", error);
    return res.status(500).json({ error: "SYSTEM_FAILURE" });
  }
}
