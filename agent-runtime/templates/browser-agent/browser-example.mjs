// Drive the sandbox's Chromium through the Fabric egress proxy.
//
// The worker starts with ZYVOR_EGRESS_PROXY=http://<session>:<capability>@<gateway>:<port>.
// Chromium cannot take proxy credentials on its command line, so they go through
// Playwright's `proxy` option. Every HTTPS host the page touches must be on the
// agent's egress_allow_hosts (or be approved in `ask`/`sentinel` mode).
import { chromium } from "playwright-core";

const proxyUrl = new URL(process.env.ZYVOR_EGRESS_PROXY);

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  proxy: {
    server: `http://${proxyUrl.hostname}:${proxyUrl.port}`,
    username: decodeURIComponent(proxyUrl.username),
    password: decodeURIComponent(proxyUrl.password),
  },
});

const page = await browser.newPage();
await page.goto(process.argv[2] ?? "https://example.com/");
console.log(await page.title());
await browser.close();
