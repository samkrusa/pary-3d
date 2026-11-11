// Мини-проверка интерфейса через CDP: кликаем по карточке пары и снимаем скриншот.
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const url = process.argv[2] || "http://127.0.0.1:8765/index.html#g=861-top863";
const out = process.argv[3] || "C:/Users/samir/AppData/Local/Temp/modal.png";
const action = process.argv[4] || "lesson";
const size = process.argv[5] || "1440,1000";

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=C:/Users/samir/AppData/Local/Temp/cdp-prof",
  "--hide-scrollbars", `--window-size=${size}`, "about:blank",
], { stdio: "ignore" });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp() {
  let list;
  for (let i = 0; i < 40; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (list.length) break;
    } catch (_) { /* ещё не поднялся */ }
    await wait(250);
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  const logs = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      logs.push("EXCEPTION: " + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });

  await send("Page.navigate", { url });
  await wait(4500);

  const evalJS = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result;

  if (action === "lesson") {
    const r = await evalJS(`(() => {
      const card = document.querySelector('.lesson, .slot');
      if (!card) return 'no card';
      card.click();
      return 'clicked';
    })()`);
    console.log("action:", r?.value ?? r);
    await wait(1200);
  } else if (action === "sheet") {
    const r = await evalJS(`(() => { document.querySelector('#groupBtn').click(); return 'sheet'; })()`);
    console.log("action:", r?.value ?? r);
    await wait(1600);
  } else if (action === "search") {
    await evalJS(`(() => {
      const btn = document.querySelector('#groupBtn'); if (btn) btn.click();
      return 1;
    })()`);
    await wait(800);
    await evalJS(`(() => {
      const inp = document.querySelector('#searchInput');
      const chip = document.querySelector('.chip'); if (chip) chip.click();
      inp.value = 'топ';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    await wait(1800);
  }

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("saved", out);
  if (logs.length) console.log("console:\n" + logs.join("\n"));
  ws.close();
  chrome.kill();
}

cdp().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });