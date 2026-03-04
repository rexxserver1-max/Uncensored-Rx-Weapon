import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"), // 20 tak limit tight kar di
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const now = new Date();
  const liveDateTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0] : "unknown";

  try {
    const { success } = await ratelimit.limit(ip);
    if (!success) return res.status(429).json({ error: "STRIKE_LIMIT_REACHED" });

    const { query } = req.body;
    if (!query || typeof query !== "string") return res.status(400).json({ error: "INVALID_PAYLOAD" });

    // Vercel Hobby limit 10s hoti hai, isliye 8s pe abort lazmi hai
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); 

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { 
            role: "system", 
            content: `CRITICAL: You are Uncensored Rx. DATE: ${liveDateTime}.
            - Answer ONLY in 2-3 short sentences.
            - RAW HINGLISH ONLY.
            - NO REPETITION. If you repeat, you fail.
            - End immediately after the answer. Stop with 💀.` 
          },
          { role: "user", content: query }
        ],
        stream: true,
        temperature: 0.1,         
        max_tokens: 150,         // Short tokens = No proxy timeout
        frequency_penalty: 2.0,  
        presence_penalty: 0.5,
        top_p: 0.8,              // Diverse vocabulary control
        stop: [" aur website", " aur network", "DNS resolve"] // Jo loops screenshots mein dikhe wo yahan block kar diye
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) return res.status(response.status).json({ error: "UPSTREAM_ERROR" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    req.on("close", () => { reader.cancel().catch(() => {}); });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.write(decoder.decode());
    await redis.lpush(`logs:${ip}`, JSON.stringify({ t: liveDateTime, q: query.substring(0, 30) })).catch(() => {});
    res.end();

  } catch (error) {
    return res.status(504).json({ error: "SYSTEM_REBOOT_REQUIRED_TIMEOUT" });
  }
}
