// Cloudflare Worker — 访客记录 API
// 用于记录博客访客的 IP、设备、浏览器等信息
// 部署到 Cloudflare Workers（免费）

const ADMIN_PASSWORD = "your_password_here"; // 改成你的密码
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
};

function parseUserAgent(ua) {
  if (!ua) return { browser: "未知", os: "未知", device: "未知" };

  let browser = "未知";
  let os = "未知";
  let device = "PC";

  // Browser
  if (ua.includes("Edg/")) browser = "Edge " + ua.split("Edg/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome " + ua.split("Chrome/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Firefox/")) browser = "Firefox " + ua.split("Firefox/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari " + ua.split("Version/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Opera|OPR")) browser = "Opera";

  // OS
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows NT 6.3")) os = "Windows 8.1";
  else if (ua.includes("Windows NT 6.1")) os = "Windows 7";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS " + ua.split("Mac OS X ")[1]?.split(/[;\s]/)[0]?.replace(/_/g, ".");
  else if (ua.includes("Android")) os = "Android " + ua.split("Android ")[1]?.split(/[;\s]/)[0];
  else if (ua.includes("iPhone|iPad")) os = "iOS " + ua.split("OS ")[1]?.split(" ")[0]?.replace(/_/g, ".");
  else if (ua.includes("Linux")) os = "Linux";

  // Device
  if (ua.includes("Mobile") || ua.includes("Android") && !ua.includes("Tablet")) device = "手机";
  else if (ua.includes("Tablet") || ua.includes("iPad")) device = "平板";

  return { browser, os, device };
}

async function handleLog(request, env) {
  const { page, referrer } = await request.json();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "未知";
  const ua = request.headers.get("User-Agent") || "";
  const country = request.headers.get("CF-IPCountry") || "未知";
  const parsed = parseUserAgent(ua);

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    time: new Date().toISOString(),
    ip,
    country,
    page: page || "/",
    referrer: referrer || "",
    ...parsed,
    rawUa: ua.slice(0, 200),
  };

  // Store in KV (key = timestamp-based ID)
  await env.VISITOR_KV.put(entry.id, JSON.stringify(entry), { expirationTtl: 2592000 }); // 30 days

  // Also add to recent list
  let recent = [];
  try {
    const raw = await env.VISITOR_KV.get("__recent__");
    if (raw) recent = JSON.parse(raw);
  } catch {}
  recent.unshift(entry.id);
  if (recent.length > 500) recent = recent.slice(0, 500);
  await env.VISITOR_KV.put("__recent__", JSON.stringify(recent));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function handleGetLogs(request, env) {
  const password = request.headers.get("X-Admin-Password");
  if (password !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "密码错误" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let recent = [];
  try {
    const raw = await env.VISITOR_KV.get("__recent__");
    if (raw) recent = JSON.parse(raw);
  } catch {}

  const logs = [];
  for (const id of recent.slice(0, 100)) {
    try {
      const entry = await env.VISITOR_KV.get(id, "json");
      if (entry) logs.push(entry);
    } catch {}
  }

  return new Response(JSON.stringify({ ok: true, logs }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === "POST" && url.pathname === "/log") {
      return handleLog(request, env);
    }

    if (request.method === "GET" && url.pathname === "/logs") {
      return handleGetLogs(request, env);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  },
};
