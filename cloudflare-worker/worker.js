// Cloudflare Worker — 访客记录 API（增强版）
// 功能：记录访客 + 统计分析 + 回头访客追踪 + 邮件订阅 + 新文章通知

const ADMIN_PASSWORD = "zzqliu1995"; // 管理密码
const RESEND_API_KEY = ""; // 在 Cloudflare Worker 环境变量中设置 RESEND_API_KEY
const SENDER_EMAIL = "noreply@your-domain.com"; // Resend 验证过的发件邮箱
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

async function handleNotify(request, env) {
  const password = request.headers.get("X-Admin-Password");
  if (password !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "密码错误" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const { title, url: articleUrl, description } = await request.json();
  if (!title || !articleUrl) {
    return new Response(JSON.stringify({ error: "缺少 title 或 url" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const apiKey = env.RESEND_API_KEY || RESEND_API_KEY;
  const sender = env.SENDER_EMAIL || SENDER_EMAIL;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "未配置 RESEND_API_KEY，请在 Worker 环境变量中设置" }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  let subscribers = [];
  try { const raw = await env.VISITOR_KV.get("__subscribers__"); if (raw) subscribers = JSON.parse(raw); } catch {}

  if (subscribers.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "暂无订阅者", sent: 0 }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const results = [];
  for (const sub of subscribers) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: sub.email,
          subject: `流光镜影 · 新文章：${title}`,
          html: `
            <div style="font-family:'Segoe UI','Microsoft YaHei',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <h2 style="color:#805ad5;border-bottom:2px solid #805ad5;padding-bottom:8px;">流光镜影 · 新文章通知</h2>
              <h3 style="color:#2d3748;">${title}</h3>
              ${description ? `<p style="color:#718096;">${description}</p>` : ''}
              <a href="${articleUrl}" style="display:inline-block;padding:10px 24px;background:#805ad5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-top:12px;">阅读全文 →</a>
              <hr style="border:none;border-top:1px solid #e9d8fd;margin:24px 0;">
              <p style="color:#a0aec0;font-size:0.82em;">你收到此邮件是因为订阅了流光镜影博客更新。<a href="https://my-blog.liuzifeng1129662448.workers.dev/unsubscribe?email=${encodeURIComponent(sub.email)}" style="color:#805ad5;">取消订阅</a></p>
            </div>
          `,
        }),
      });
      const data = await res.json();
      results.push({ email: sub.email, ok: res.ok, id: data.id || data.message });
    } catch (e) {
      results.push({ email: sub.email, ok: false, error: e.message });
    }
  }

  const sent = results.filter(r => r.ok).length;
  return new Response(JSON.stringify({ ok: true, sent, total: subscribers.length, results }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) {
    return new Response("Missing email", { status: 400 });
  }
  let subscribers = [];
  try { const raw = await env.VISITOR_KV.get("__subscribers__"); if (raw) subscribers = JSON.parse(raw); } catch {}
  subscribers = subscribers.filter(s => s.email !== email);
  await env.VISITOR_KV.put("__subscribers__", JSON.stringify(subscribers));
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head><meta charset="UTF-8"><title>取消订阅</title>
    <style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f5ff;color:#2d3748;margin:0;}
    .box{text-align:center;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
    h2{color:#805ad5;}a{color:#805ad5;text-decoration:none;}</style></head>
    <body><div class="box"><h2>✅ 已取消订阅</h2><p>你已成功取消流光镜影博客的更新通知。</p><a href="https://my-blog.liuzifeng1129662448.workers.dev/">返回博客</a></div></body>
    </html>
  `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
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
    if (request.method === "POST" && url.pathname === "/notify") return handleNotify(request, env);
    if (request.method === "GET" && url.pathname === "/unsubscribe") return handleUnsubscribe(request, env);
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  },
};
