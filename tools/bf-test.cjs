// Проверка отрисовки листа: сравниваем скриншот с backdrop-filter и без него.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9340;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/samir/AppData/Local/Temp/cdp-prof8", "--hide-scrollbars",
  "--window-size=430,932", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let list;
  for (let i = 0; i < 40; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch (_) {}
    await wait(250);
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:8765/index.html" });
  await wait(4000);
  await ev(`document.querySelector('#groupBtn').click()`);
  await wait(300);
  await ev(`document.querySelector('.chip').click()`);
  await wait(2500);

  const before = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("C:/Users/samir/AppData/Local/Temp/bf_on.png", Buffer.from(before.data, "base64"));

  await ev(`(() => {
    const s = document.createElement('style');
    s.textContent = '*{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}';
    document.head.appendChild(s);
  })()`);
  await wait(700);
  const after = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("C:/Users/samir/AppData/Local/Temp/bf_off.png", Buffer.from(after.data, "base64"));
  console.log("both saved");
  ws.close(); chrome.kill();
})();