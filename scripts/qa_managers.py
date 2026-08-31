import asyncio
from playwright.async_api import async_playwright
BASE="http://localhost:8000"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); page=await b.new_page(viewport={"width":1280,"height":800})
        await page.goto(BASE+"/managers", wait_until="networkidle"); await page.wait_for_timeout(1200)
        cards=await page.locator("[data-testid^='manager-card-']").count()
        print("manager cards:", cards)
        await page.screenshot(path="/app/qa_managers.png")
        await b.close()
asyncio.run(main())
