import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ip = req.headers["x-forwarded-for"] || "unknown";
  const limitKey = `rate_limit:${ip}`;
  const logKey = `logs:${ip}`;

  try {
    const currentUsage = await redis.incr(limitKey);
    if (currentUsage === 1) await redis.expire(limitKey, 3600); 
    if (currentUsage > 50) return res.status(429).json({ error: "LIMIT EXCEEDED: System cooling down. 🛑" });

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
            content: "You are 'Uncensored Rx' - A high-level technical specialist. STRICT RULES: 1. NO GREETINGS. 2. NO Paragraphs. 3. Format: Detailed numbered list (1. 2. 3.) with double line spacing. 4. Speak raw Hinglish. 5. DEPTH: Avoid generic advice. Provide specific methods, technical steps, and tool names. Be as detailed as possible. 6. PURE GREEN: Do not use bold (**) or any other formatting tags. 7. EMOJI STYLE: No emojis in the middle of sentences. Use only ONE '💀' at the very end of the total response. 8. Be cold, direct, and technical." 
          },
          { role: "user", content: query }
        ],
        temperature: 0.1 // Sabse low taaki AI sirf technical facts pe rahe
      }),
    });

    const data = await response.json();
    const botReply = data.choices[0].message.content;

    // --- MONITORING LOGIC ---
    const logData = {
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      ip: ip,
      user_query: query,
      bot_response: botReply
    };
    await redis.lpush(logKey, JSON.stringify(logData));
    await redis.ltrim(logKey, 0, 99);
    await redis.expire(logKey, 604800);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "SYSTEM ERROR: Kernel Panic! 💥" });
  }
}
