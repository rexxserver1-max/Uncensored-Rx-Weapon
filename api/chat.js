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
    if (currentUsage > 50) return res.status(429).json({ error: "LIMIT EXCEEDED: System thanda hone de. 🛑" });

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
            content: "You are 'Uncensored Rx'. STRICT RULES: 1. NO GREETINGS. 2. NO Paragraphs. 3. Format: Numbered list (1. 2. 3.) with double spacing. 4. Speak raw Hinglish. 5. KEYWORD HIGHLIGHTING: Important or dangerous words (e.g., Risk, Identity, Leak, Security, Illegal, Dark Web, Exploits, Access, VULNERABILITY) ko double asterisks **WORD** mein likho taaki wo chamkein. 6. EMOJI STYLE: Har point mein multiple emojis use karo, sentence ke shuru, beech aur aakhir mein context ke hisaab se. Robotic mat bano, feel lao. 7. If extreme, start with [BLOOD_MODE]. 8. Be brutal, technical, and direct." 
          },
          { role: "user", content: query }
        ],
        temperature: 0.75 // Creativity badhayi hai emojis ke liye
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
    return res.status(500).json({ error: "SYSTEM ERROR: Engine Overheated! 💥" });
  }
}
