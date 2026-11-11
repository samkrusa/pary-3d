const { spawn } = require("node:child_process");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9336;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/samir/AppData/Local/Temp/cdp-prof4", "--hide-scrollbars",
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
  await send("Page.navigate", { url: "http://127.0.0.1:8765/index.html" });
  await wait(3500);
  await ev(`document.querySelector('#groupBtn').click()`);
  await wait(1500);

  const info = await ev(`(() => {
    const out = {};
    const h = document.querySelector('.sheet-head h2');
    const cs = getComputedStyle(h);
    out.h2 = { text: h.textContent, opacity: cs.opacity, color: cs.color, vis: cs.visibility, rect: h.getBoundingClientRect().toJSON() };
    const p = document.querySelector('.sheet-panel');
    out.panel = { opacity: getComputedStyle(p).opacity, transform: getComputedStyle(p).transform, anim: getComputedStyle(p).animationName };
    const row = document.querySelector('.group-row');
    out.row = row ? row.textContent.trim() : 'none';
    out.list = document.querySelector('#groupList').innerHTML.slice(0, 160);
    out.inst = document.querySelector('#statGroups')?.dataset.v;
    return JSON.stringify(out);
  })()`);
  console.log(info);
  ws.close();
  chrome.kill();
})();