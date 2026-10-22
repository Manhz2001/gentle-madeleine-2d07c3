import Anthropic from "@anthropic-ai/sdk";

const SITE_ORIGINS = new Set([
  "https://gentle-madeleine-2d07c3.netlify.app",
  "http://127.0.0.1:8770",
  "http://localhost:8770",
  "http://localhost:8889"
]);
const MAX_BODY = 32 * 1024;
const MAX_HISTORY = 12;
const WINDOW_MS = 60 * 1000;
const bursts = new Map();
const anthropic = new Anthropic();

// Tạm thời bỏ các quy tắc nguồn/định dạng chặt chẽ: NB Care trò chuyện như một trợ lý AI thông thường.
const systemPrompt = "Bạn là NB Care, trợ lý AI thân thiện của DrugView Ninh Bình. Trả lời tự nhiên bằng tiếng Việt, rõ ràng và hữu ích. Viết văn bản thuần, không dùng ký hiệu Markdown như ** hay #; có thể dùng gạch đầu dòng \"-\".";

function json(status, data, origin, extra) {
  return new Response(data == null ? null : JSON.stringify(data), {status, headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...(origin ? {"Access-Control-Allow-Origin": origin} : {}), ...extra}});
}

function allowedOrigin(origin) {
  if (!origin || SITE_ORIGINS.has(origin)) return true;
  try { return [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].some(url => url && new URL(url).origin === origin); } catch (_) { return false; }
}

function limited(ip) {
  const now = Date.now();
  for (const [key, value] of bursts) if (value.expires <= now) bursts.delete(key);
  const key = String(ip || "unknown").slice(0, 100);
  const entry = bursts.get(key) || {count: 0, expires: now + WINDOW_MS};
  bursts.set(key, entry);
  return ++entry.count > 20;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const messages = history.slice(-MAX_HISTORY)
    .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.trim())
    .map(item => ({role: item.role, content: item.content.slice(0, 4000)}));
  while (messages.length && messages[0].role !== "user") messages.shift();
  return messages;
}

export default async (req, context) => {
  const origin = req.headers.get("origin");
  if (!allowedOrigin(origin)) return json(403, {ok: false, error: "ORIGIN_NOT_ALLOWED"});
  if (req.method === "OPTIONS") return json(204, null, origin, {"Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"});
  if (req.method === "GET") return json(200, {available: true}, origin);
  if (req.method !== "POST") return json(405, {ok: false, error: "METHOD_NOT_ALLOWED"}, origin, {Allow: "GET, POST, OPTIONS"});
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY) return json(413, {ok: false, error: "REQUEST_TOO_LARGE"}, origin);
  let body;
  try { body = JSON.parse(raw); } catch (_) { return json(400, {ok: false, error: "INVALID_REQUEST"}, origin); }
  if (!body || typeof body.question !== "string" || !body.question.trim() || body.question.length > 1200) return json(400, {ok: false, error: "INVALID_REQUEST"}, origin);
  if (limited(context.ip)) return json(429, {ok: false, error: "AI_BUSY"}, origin, {"Retry-After": "60"});
  const deep = body.mode === "deep";
  const messages = [...cleanHistory(body.history), {role: "user", content: body.question.trim()}];
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: deep ? 2500 : 1200,
      system: systemPrompt + (deep ? " Người dùng chọn chế độ Chuyên sâu: có thể trả lời chi tiết hơn." : " Người dùng chọn chế độ Cơ bản: ưu tiên trả lời ngắn gọn."),
      messages
    });
    const text = message.content.filter(part => part.type === "text").map(part => part.text).join("").trim();
    if (!text) return json(502, {ok: false, error: "AI_INVALID_RESPONSE"}, origin);
    return json(200, {ok: true, answer: {text, provider: "ai"}}, origin);
  } catch (error) {
    console.error("NB Care AI request failed", {status: error && error.status});
    const busy = error && error.status === 429;
    return json(busy ? 429 : 502, {ok: false, error: busy ? "AI_BUSY" : "AI_UNAVAILABLE"}, origin, busy ? {"Retry-After": "60"} : undefined);
  }
};
