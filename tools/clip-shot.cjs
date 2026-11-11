// Скриншот отдельного элемента страницы (для проверки вёрстки в полном масштабе).
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9337;
const url = process.argv[2];
const selector = process.argv[3];
const out = process.argv[4];
const open = process.argv[5] || "";

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/samir/AppData/Local/Temp/cdp-prof5", "--hide-scrollbars",
  "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let list;
  for (let i = 0; i < 40; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (list.length) break;
    } catch (_) {}
    await wait(250);
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  await send("Page.enable");
  await send("Page.navigate", { url });
  await wait(4200);
  if (open) { await ev(open); await wait(1600); }

  const rect = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height });
  })()`);
  if (!rect) { console.log("element not found"); ws.close(); chrome.kill(); return; }
  const clip = JSON.parse(rect);
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 },
  });
  fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("saved", out, clip.width + "x" + clip.height);
  ws.close();
  chrome.kill();
})();