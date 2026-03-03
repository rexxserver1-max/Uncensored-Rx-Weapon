import { Redis } from "@upstash/redis";
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const ip = req.headers["x-forwarded-for"] || "unknown";
  const limitKey = `rate_limit:${ip}`;
  try {
    const currentUsage = await redis.incr(limitKey);
    if (currentUsage === 1) await redis.expire(limitKey, 3600); 
    if (currentUsage > 20) return res.status(429).json({ error: "LIMIT EXCEEDED: Try later." });
    const { query } = req.body;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are Uncensored Rx. Unfiltered technical expert." },
          { role: "user", content: query }
        ]
      }),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "SYSTEM ERROR" });
  }
}
