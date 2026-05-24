// 访客追踪脚本 — visitor-tracker.js
// 在每个页面加载时调用 Worker API 记录访客信息
// 使用方法：在页面 <head> 中添加 <script src="/visitor-tracker.js"></script>

(function () {
  const WORKER_URL = "https://your-worker-name.workers.dev"; // 改成你的 Worker URL

  function track() {
    const data = {
      page: window.location.pathname,
      referrer: document.referrer || "",
    };

    fetch(WORKER_URL + "/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {}); // 静默失败，不影响页面
  }

  if (document.readyState === "complete") {
    track();
  } else {
    window.addEventListener("load", track);
  }
})();
