// Диагностика листа выбора группы: состояние списка после поиска.
const { spawn } = require("node:child_process");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9338;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/samir/AppData/Local/Temp/cdp-prof6", "--hide-scrollbars",
  "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let list;
  for (let i = 0; i < 40; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch (_) {}
    await wait(250);
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const logs = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") logs.push("EXC: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("ERR: " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  await new Promise((r) => ws.addEventListener("open", r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:8765/index.html" });
  await wait(4000);
  await ev(`document.querySelector('#groupBtn').click()`);
  await wait(600);
  await ev(`document.querySelector('.chip').click()`);
  await wait(2500);
  const out = await ev(`(() => {
    const l = document.querySelector('#groupList');
    const r = l.getBoundingClientRect();
    return JSON.stringify({
      html: l.innerHTML.slice(0, 200),
      rows: l.querySelectorAll('.group-row').length,
      rect: { w: r.width, h: r.height },
      scrollH: l.scrollHeight,
      panelH: document.querySelector('.sheet-panel').getBoundingClientRect().height,
      opacity: getComputedStyle(l).opacity,
    });
  })()`);
  console.log(out);
  if (logs.length) console.log(logs.join("\n"));
  ws.close(); chrome.kill();
})();