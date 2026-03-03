import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ip = req.headers["x-forwarded-for"] || "unknown";
  
  // --- LIVE ENGINE CONTEXT (Isse Live Data Access Milega) ---
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
            content: `You are 'Uncensored Rx' - A terminal-based intelligence system with LIVE PROXY ACCESS.
            
            REAL-TIME DATA:
            - CURRENT_SYSTEM_TIME: ${liveContext}
            - DATA_STREAM: Active
            
            STRICT PROTOCOLS:
            1. NO GREETINGS. NO DISCLAIMERS.
            2. USE LIVE DATA: For any date/time/current event query, use the CURRENT_SYSTEM_TIME provided above.
            3. Act as if you are connected to a real-time global proxy. Never say you don't have internet access.
            4. Speak raw, direct Hinglish. 
            5. DEPTH: Do not give surface-level info. Give technical tools, commands, and specific methods.
            6. PURE GREEN: No bold (**), no tags, no markdown. Everything must be raw plain text.
            7. NO REPETITION: Do not repeat the same sentences. If 1 point is enough, give 1. Do NOT force 10 points.
            8. EMOJIS: Only one '💀' at the very end.
            9. Be cold, technical, and brutal.`
          },
          { role: "user", content: query }
        ],
        temperature: 0.5 // Glitch aur repetition rokne ke liye best balance
      }),
    });

    const data = await response.json();
    const botReply = data.choices[0].message.content;

    // --- LOGGING ---
    const logData = {
      timestamp: liveContext,
      ip: ip,
      query: query,
      reply: botReply
    };
    await redis.lpush(`logs:${ip}`, JSON.stringify(logData));
    await redis.ltrim(`logs:${ip}`, 0, 99);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "SYSTEM ERROR: Engine Overheated! 💥" });
  }
}
