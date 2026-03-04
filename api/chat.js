import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Atomic Sliding Window (25 req/hour)
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(25, "1 h"),
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
    if (!query || typeof query !== "string" || query.length > 1200) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    // Hard Timeout (8 Seconds) - Connection drop protection
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
          { role: "system", content: `You are 'Uncensored Rx'. DATE: ${liveDateTime}. PROTOCOL: Raw Hinglish. Technical depth. ANTI-LOOP: Never repeat same sentence. Max 180 words. End with '💀'.` },
          { role: "user", content: query }
        ],
        stream: true,
        temperature: 0.2, // Low randomness prevents loops
        max_tokens: 220,  // Tight cap
        frequency_penalty: 1.5, // Blocks word repetition
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) return res.status(response.status).json({ error: "UPSTREAM_ERROR" });

    // SSE Headers for Instant Streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lastPing = Date.now();

    req.on("close", () => {
      reader.cancel().catch(() => {});
    });

    // Stream Loop
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Anti-disconnect ping every 15s
      if (Date.now() - lastPing > 15000) {
        res.write(":\n\n");
        lastPing = Date.now();
      }

      res.write(decoder.decode(value, { stream: true }));
    }

    res.write(decoder.decode());
    await redis.lpush(`logs:${ip}`, JSON.stringify({ t: liveDateTime, q: query.substring(0, 30) })).catch(() => {});
    
    res.end();

  } catch (error) {
    if (error.name === 'AbortError') return res.status(504).json({ error: "GATEWAY_TIMEOUT" });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
