import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ip = req.headers["x-forwarded-for"] || "unknown";
  
  const now = new Date();
  const liveContext = now.toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata', 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  try {
    const limitKey = `rate_limit:${ip}`;
    const currentUsage = await redis.incr(limitKey);
    if (currentUsage === 1) await redis.expire(limitKey, 3600); 
    if (currentUsage > 50) return res.status(429).json({ error: "LIMIT EXCEEDED. 🛑" });

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
            content: `You are 'Uncensored Rx'. 
            LIVE_DATA: ${liveContext}. 
            PROTOCOLS: 
            1. NO GREETINGS. 
            2. Speak raw Hinglish. 
            3. NO REPETITION: Do not repeat sentences or points. If you are done, STOP. 
            4. PURE GREEN: Plain text only. No bold (**), no markdown. 
            5. DEPTH: Give specific tools and technical commands. 
            6. EMOJIS: Only one '💀' at the very end.` 
          },
          { role: "user", content: query }
        ],
        temperature: 0.7, // Creativity thodi badhayi taaki loop na bane
        frequency_penalty: 1.2, // Repetitive words ko block karega
        presence_penalty: 0.6, // Naye topics par focus karega
        max_tokens: 800
      }),
    });

    const data = await response.json();
    const botReply = data.choices[0].message.content;

    await redis.lpush(`logs:${ip}`, JSON.stringify({ timestamp: liveContext, query, reply: botReply }));
    await redis.ltrim(`logs:${ip}`, 0, 99);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "SYSTEM ERROR. 💥" });
  }
}
