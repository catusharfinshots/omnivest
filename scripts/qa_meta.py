import asyncio
from playwright.async_api import async_playwright
BASE = "http://localhost:8000"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1280, "height": 800})
        for rt, expect in [("/", "All your investing"), ("/about", "About Us"), ("/model-portfolios", "Model Portfolios"), ("/faq", "FAQ"), ("/managers", "Basket Managers")]:
            await page.goto(BASE + rt, wait_until="networkidle"); await page.wait_for_timeout(900)
            t = await page.title()
            print(f"{rt:22s} -> {t}   [{'OK' if expect in t else 'MISMATCH'}]")
        # header logo screenshot
        await page.goto(BASE + "/", wait_until="networkidle"); await page.wait_for_timeout(800)
        await page.locator("header").first.screenshot(path="/app/qa_logo_header.png")
        await b.close()
    print("done")
asyncio.run(main())
