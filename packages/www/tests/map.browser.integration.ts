import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

// Run against pnpm dev, or set MAP_TEST_URL to another local preview's /map URL.
const mapUrl = process.env.MAP_TEST_URL ?? "http://localhost:5173/map";
await test("CF22 map works in desktop and touch browsers", { timeout: 60_000 }, async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(mapUrl);
    await page.locator('[data-booth="AA-01"]').waitFor();
    await page.getByRole("searchbox").fill("A40a");
    assert.equal(await page.locator(".cf-result").count(), 2);
    await page.getByRole("button", { name: "Sunday", exact: true }).click();
    assert.equal(await page.locator(".cf-result").count(), 1);
    await page.locator(".cf-result").click();
    await page.locator('[data-booth="A-40a"]').hover();
    assert.match(await page.getByRole("tooltip").innerText(), /KrapirafaS/);
    assert.doesNotMatch(await page.getByRole("tooltip").innerText(), /APHIN123/);
    await page.getByRole("button", { name: "All days", exact: true }).click();
    await page.locator('[data-booth="A-40b"]').hover();
    assert.match(await page.getByRole("tooltip").innerText(), /APHIN123[\s\S]*KrapirafaS/);
    await page.locator('[data-booth="A-40a"]').focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute("data-booth")),
        "A-40b",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".cf-selection").count(), 0);
    await page.getByRole("button", { name: "Fit map", exact: true }).click();
    const box = await page.locator('[data-booth="S-01a"]').boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    assert.match(await page.getByRole("tooltip").innerText(), /No circle listed/);
    const initial = await page.locator(".cf-floor").getAttribute("viewBox");
    await page.mouse.move(800, 350);
    await page.mouse.down();
    await page.mouse.move(900, 400, { steps: 10 });
    await page.mouse.up();
    assert.notEqual(await page.locator(".cf-floor").getAttribute("viewBox"), initial);
    assert.equal(await page.locator(".cf-selection").count(), 0);
    await page.getByRole("button", { name: "Fit map", exact: true }).click();
    assert.equal(await page.locator(".cf-floor").getAttribute("viewBox"), initial);
    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, -400);
    await page.waitForFunction(
        (v) => document.querySelector(".cf-floor")?.getAttribute("viewBox") !== v,
        initial,
    );
    const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.goto(mapUrl);
    await mobile.getByRole("searchbox").fill("Ichigowarano");
    await mobile.locator(".cf-result").tap();
    await mobile.locator('[data-booth="AA-02"]').tap();
    assert.match(await mobile.locator(".cf-selection").innerText(), /AA-02[\s\S]*Ichigowarano/);
    assert.equal(
        await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
    );
    const cdp = await mobile.context().newCDPSession(mobile);
    const before = await mobile.locator(".cf-floor").getAttribute("viewBox");
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
            { x: 150, y: 250, id: 1 },
            { x: 240, y: 250, id: 2 },
        ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
            { x: 100, y: 250, id: 1 },
            { x: 290, y: 250, id: 2 },
        ],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.notEqual(await mobile.locator(".cf-floor").getAttribute("viewBox"), before);
    assert.match(await mobile.locator(".cf-selection").innerText(), /AA-02/);
    assert.deepEqual(errors, []);
});
