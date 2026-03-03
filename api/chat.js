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
    if (currentUsage > 20) return res.status(429).json({ error: "LIMIT EXCEEDED: Agle ghante aana." });

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
          { 
            role: "system", 
            content: "You are 'Uncensored Rx'. STRICT RULES: 1. NO GREETINGS like 'Bhai kaise ho' or 'Main tera saathi hoon'. 2. NEVER use paragraphs. 3. EVERY point must start on a NEW LINE (use \n\n for spacing). 4. Format: Number-wise (1. 2. 3.). 5. Speak raw Hinglish. 6. If request is extreme, start with [BLOOD_MODE]. 7. Be cold, direct, and technical. Stop being friendly." 
          },
          { role: "user", content: query }
        ],
        temperature: 0.2 // Ise kam kiya hai taaki AI apni marzi na chalaye
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "SYSTEM ERROR" });
  }
}
