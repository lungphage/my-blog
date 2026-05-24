// Cloudflare Worker — 访客记录 API（增强版）
// 功能：记录访客 + 统计分析 + 回头访客追踪

const ADMIN_PASSWORD = "zzqliu1995"; // 管理密码
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
};

function parseUserAgent(ua) {
  if (!ua) return { browser: "未知", os: "未知", device: "未知" };
  let browser = "未知", os = "未知", device = "PC";
  if (ua.includes("Edg/")) browser = "Edge " + ua.split("Edg/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome " + ua.split("Chrome/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Firefox/")) browser = "Firefox " + ua.split("Firefox/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari " + ua.split("Version/")[1]?.split(/[.\s]/)[0];
  else if (ua.includes("OPR|Opera")) browser = "Opera";
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows NT 6.1")) os = "Windows 7";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS " + ua.split("Mac OS X ")[1]?.split(/[;\s]/)[0]?.replace(/_/g, ".");
  else if (ua.includes("Android")) os = "Android " + ua.split("Android ")[1]?.split(/[;\s]/)[0];
  else if (ua.includes("iPhone|iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  if (ua.includes("Mobile") || (ua.includes("Android") && !ua.includes("Tablet"))) device = "手机";
  else if (ua.includes("Tablet") || ua.includes("iPad")) device = "平板";
  return { browser, os, device };
}

async function handleLog(request, env) {
  const { page, referrer } = await request.json();
  const ip = request.headers.get("CF-Connecting-IP") || "未知";
  const ua = request.headers.get("User-Agent") || "";
  const country = request.headers.get("CF-IPCountry") || "未知";
  const parsed = parseUserAgent(ua);

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    time: new Date().toISOString(),
    ip, country,
    page: page || "/",
    referrer: referrer || "",
    ...parsed,
  };

  await env.VISITOR_KV.put(entry.id, JSON.stringify(entry), { expirationTtl: 2592000 });

  let recent = [];
  try { const raw = await env.VISITOR_KV.get("__recent__"); if (raw) recent = JSON.parse(raw); } catch {}
  recent.unshift(entry.id);
  if (recent.length > 1000) recent = recent.slice(0, 1000);
  await env.VISITOR_KV.put("__recent__", JSON.stringify(recent));

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

async function getAllLogs(env) {
  let recent = [];
  try { const raw = await env.VISITOR_KV.get("__recent__"); if (raw) recent = JSON.parse(raw); } catch {}
  const logs = [];
  for (const id of recent.slice(0, 500)) {
    try { const entry = await env.VISITOR_KV.get(id, "json"); if (entry) logs.push(entry); } catch {}
  }
  return logs;
}

function buildStats(logs) {
  // Daily trend
  const daily = {};
  logs.forEach(l => {
    const d = l.time?.slice(0, 10) || "未知";
    daily[d] = (daily[d] || 0) + 1;
  });

  // Top pages
  const pages = {};
  logs.forEach(l => { pages[l.page || "/"] = (pages[l.page || "/"] || 0) + 1; });

  // Device breakdown
  const devices = {};
  logs.forEach(l => { devices[l.device || "未知"] = (devices[l.device || "未知"] || 0) + 1; });

  // Browser breakdown
  const browsers = {};
  logs.forEach(l => {
    const b = (l.browser || "未知").split(" ")[0];
    browsers[b] = (browsers[b] || 0) + 1;
  });

  // OS breakdown
  const oses = {};
  logs.forEach(l => {
    const o = (l.os || "未知").split(" ")[0];
    oses[o] = (oses[o] || 0) + 1;
  });

  // Referrer sources
  const referrers = {};
  logs.forEach(l => {
    let ref = l.referrer || "";
    if (!ref || ref === "") { referrers["直接访问"] = (referrers["直接访问"] || 0) + 1; return; }
    try { ref = new URL(ref).hostname; } catch { ref = "其他"; }
    referrers[ref] = (referrers[ref] || 0) + 1;
  });

  // Repeat visitors (by IP)
  const ipVisits = {};
  logs.forEach(l => {
    if (!ipVisits[l.ip]) ipVisits[l.ip] = { count: 0, pages: new Set(), first: l.time, last: l.time, country: l.country, device: l.device, browser: l.browser, os: l.os };
    ipVisits[l.ip].count++;
    ipVisits[l.ip].pages.add(l.page);
    if (l.time < ipVisits[l.ip].first) ipVisits[l.ip].first = l.time;
    if (l.time > ipVisits[l.ip].last) ipVisits[l.ip].last = l.time;
  });
  const repeatVisitors = Object.entries(ipVisits)
    .map(([ip, v]) => ({ ip, count: v.count, pages: [...v.pages], first: v.first, last: v.last, country: v.country, device: v.device, browser: v.browser, os: v.os }))
    .filter(v => v.count >= 2)
    .sort((a, b) => b.count - a.count);

  // Unique IPs today
  const today = new Date().toISOString().slice(0, 10);
  const todayIPs = new Set(logs.filter(l => l.time?.startsWith(today)).map(l => l.ip)).size;

  return {
    total: logs.length,
    uniqueIPs: new Set(logs.map(l => l.ip)).size,
    todayCount: logs.filter(l => l.time?.startsWith(today)).length,
    todayIPs,
    daily: Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])),
    pages: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 20),
    devices: Object.entries(devices),
    browsers: Object.entries(browsers).sort((a, b) => b[1] - a[1]),
    oses: Object.entries(oses).sort((a, b) => b[1] - a[1]),
    referrers: Object.entries(referrers).sort((a, b) => b[1] - a[1]).slice(0, 15),
    repeatVisitors: repeatVisitors.slice(0, 50),
  };
}

async function handleGetStats(request, env) {
  const password = request.headers.get("X-Admin-Password");
  const isPublic = password === "public";
  if (password !== ADMIN_PASSWORD && !isPublic) {
    return new Response(JSON.stringify({ error: "密码错误" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  const logs = await getAllLogs(env);
  const stats = buildStats(logs);
  if (isPublic) {
    return new Response(JSON.stringify({ ok: true, stats: { total: stats.total, uniqueIPs: stats.uniqueIPs, todayCount: stats.todayCount } }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true, stats, logs: logs.slice(0, 200) }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

async function handleGetIPHistory(request, env) {
  const password = request.headers.get("X-Admin-Password");
  if (password !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "密码错误" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  const url = new URL(request.url);
  const ip = url.searchParams.get("ip");
  if (!ip) return new Response(JSON.stringify({ error: "缺少 ip 参数" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  const logs = await getAllLogs(env);
  const history = logs.filter(l => l.ip === ip).sort((a, b) => b.time.localeCompare(a.time));
  return new Response(JSON.stringify({ ok: true, ip, history }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

async function handleSubscribe(request, env) {
  const { email } = await request.json();
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "无效邮箱" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  let subscribers = [];
  try { const raw = await env.VISITOR_KV.get("__subscribers__"); if (raw) subscribers = JSON.parse(raw); } catch {}
  if (subscribers.find(s => s.email === email)) {
    return new Response(JSON.stringify({ ok: true, message: "已订阅" }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  subscribers.push({ email, time: new Date().toISOString() });
  await env.VISITOR_KV.put("__subscribers__", JSON.stringify(subscribers));
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

async function handleGetSubscribers(request, env) {
  const password = request.headers.get("X-Admin-Password");
  if (password !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "密码错误" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  let subscribers = [];
  try { const raw = await env.VISITOR_KV.get("__subscribers__"); if (raw) subscribers = JSON.parse(raw); } catch {}
  return new Response(JSON.stringify({ ok: true, subscribers }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
    if (request.method === "POST" && url.pathname === "/log") return handleLog(request, env);
    if (request.method === "GET" && url.pathname === "/stats") return handleGetStats(request, env);
    if (request.method === "GET" && url.pathname === "/ip") return handleGetIPHistory(request, env);
    if (request.method === "POST" && url.pathname === "/subscribe") return handleSubscribe(request, env);
    if (request.method === "GET" && url.pathname === "/subscribers") return handleGetSubscribers(request, env);
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  },
};
