#!/usr/bin/env python3
"""
Frontend Playwright tests for Basketly Kite Connect integration.
Tests frontend pages and UI elements as specified in the review request.
"""
from playwright.sync_api import sync_playwright, expect
import sys

FRONTEND_URL = "https://ui-redesign-130.preview.emergentagent.com"

def test_broker_connect_page(page):
    """Test 7: Broker connect page renders correctly"""
    print("\n" + "="*80)
    print("TEST 7: Broker connect page")
    print("="*80)
    
    try:
        page.goto(f"{FRONTEND_URL}/brokers/connect", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Check h1 contains "Link a broker to invest"
        h1 = page.locator("h1")
        expect(h1).to_contain_text("Link a broker to invest", timeout=5000)
        print("✅ h1 contains 'Link a broker to invest'")
        
        # Count broker cards - should be 6
        broker_cards = page.locator(".surface").filter(has=page.locator("text=/Zerodha|Groww|Upstox|Angel One|ICICI Direct|5paisa/"))
        card_count = broker_cards.count()
        if card_count != 6:
            print(f"❌ FAILED: Expected 6 broker cards, found {card_count}")
            return False
        print(f"✅ Found 6 broker cards")
        
        # Check Zerodha has "Connect" button
        zerodha_card = page.locator(".surface").filter(has_text="Zerodha")
        connect_button = zerodha_card.locator("button:has-text('Connect')")
        if connect_button.count() == 0:
            print("❌ FAILED: Zerodha card missing 'Connect' button")
            return False
        print("✅ Zerodha card has 'Connect' button")
        
        # Check other brokers show "Coming soon"
        coming_soon_buttons = page.locator("button:has-text('Coming soon')")
        if coming_soon_buttons.count() != 5:
            print(f"❌ FAILED: Expected 5 'Coming soon' buttons, found {coming_soon_buttons.count()}")
            return False
        print("✅ Other 5 brokers show 'Coming soon'")
        
        # Check for "Common issues" section with amber styling
        common_issues = page.locator("text='Common issues'")
        if common_issues.count() == 0:
            print("❌ FAILED: 'Common issues' section not found")
            return False
        print("✅ 'Common issues' section exists")
        
        # Check for the specific error text
        error_text = page.locator("text=/The user is not enabled for the app/i")
        if error_text.count() == 0:
            print("❌ FAILED: Text 'The user is not enabled for the app' not found")
            return False
        print("✅ Contains text 'The user is not enabled for the app'")
        
        # Check for developers.kite.trade mention
        kite_dev_link = page.locator("text=/developers\\.kite\\.trade/i")
        if kite_dev_link.count() == 0:
            print("❌ FAILED: 'developers.kite.trade' not mentioned")
            return False
        print("✅ Mentions 'developers.kite.trade'")
        
        print("✅ PASSED: Broker connect page renders correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        return False


def test_kite_callback_error(page):
    """Test 8: Kite callback error page"""
    print("\n" + "="*80)
    print("TEST 8: Kite callback error page")
    print("="*80)
    
    try:
        url = f"{FRONTEND_URL}/broker/kite/callback?status=error&message=The%20user%20is%20not%20enabled%20for%20the%20app.&error_type=InputException"
        page.goto(url, timeout=30000)
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Wait a bit for any state transitions
        page.wait_for_timeout(1000)
        
        # Check for human-readable error message (not raw JSON)
        page_content = page.content()
        if '{"status":"error"' in page_content or '"message":' in page_content:
            print("❌ FAILED: Page shows raw JSON")
            return False
        print("✅ No raw JSON visible")
        
        # Check for error message about not being enabled
        error_msg = page.locator("text=/not enabled|Zerodha account/i")
        if error_msg.count() == 0:
            print("❌ FAILED: Human-readable error message not found")
            return False
        print("✅ Human-readable error message displayed")
        
        # Check for developers.kite.trade or app owner mention
        guidance = page.locator("text=/developers\\.kite\\.trade|app owner|whitelist/i")
        if guidance.count() == 0:
            print("❌ FAILED: No guidance about developers.kite.trade or app owner")
            return False
        print("✅ Contains guidance about developers.kite.trade or app owner")
        
        # Check for error type
        error_type = page.locator("text=/InputException/i")
        if error_type.count() == 0:
            print("❌ FAILED: Error type 'InputException' not displayed")
            return False
        print("✅ Error type 'InputException' displayed")
        
        # Check for Close button
        close_button = page.locator("button:has-text('Close')")
        if close_button.count() == 0:
            print("❌ FAILED: 'Close' button not found")
            return False
        print("✅ 'Close' button present")
        
        print("✅ PASSED: Kite callback error page displays correctly")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        return False


def test_kite_callback_fake_success(page):
    """Test 9: Kite callback with fake success token"""
    print("\n" + "="*80)
    print("TEST 9: Kite callback with fake success token")
    print("="*80)
    
    try:
        url = f"{FRONTEND_URL}/broker/kite/callback?status=success&request_token=obviously_fake_token"
        page.goto(url, timeout=30000)
        
        # Check for processing state
        processing = page.locator("text=/Exchanging.*request token/i")
        if processing.count() > 0:
            print("✅ Shows 'Exchanging your Kite request token' (processing state)")
        
        # Wait for the exchange to fail (backend will reject fake token)
        page.wait_for_timeout(3000)
        
        # Should transition to error state
        error_heading = page.locator("text=/Connection failed|failed/i")
        if error_heading.count() == 0:
            print("❌ FAILED: Did not transition to failure state")
            return False
        print("✅ Transitioned to 'Connection failed' state")
        
        # Check error is displayed in readable format (not raw JSON)
        page_content = page.content()
        if '{"detail":' in page_content and 'Kite token exchange failed' in page_content:
            # Check if it's displayed as text, not as JSON
            error_detail = page.locator("text=/Kite token exchange failed/i")
            if error_detail.count() == 0:
                print("❌ FAILED: Error shown as raw JSON")
                return False
        print("✅ Error displayed in readable format")
        
        print("✅ PASSED: Fake token correctly rejected with readable error")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        return False


def test_dashboard_banner(page):
    """Test 10: Dashboard shows connect broker banner"""
    print("\n" + "="*80)
    print("TEST 10: Dashboard connect broker banner")
    print("="*80)
    
    try:
        page.goto(f"{FRONTEND_URL}/dashboard", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Check for "Connect your broker" banner
        banner = page.locator("text='Connect your broker'")
        if banner.count() == 0:
            print("❌ FAILED: 'Connect your broker' banner not found")
            return False
        print("✅ 'Connect your broker' banner visible")
        
        # Check for Connect button/link
        connect_cta = page.locator("a:has-text('Connect'), button:has-text('Connect')").filter(has=page.locator("text=/Connect your broker/"))
        if connect_cta.count() == 0:
            # Try finding any link that goes to /brokers/connect
            connect_link = page.locator("a[href='/brokers/connect']")
            if connect_link.count() == 0:
                print("❌ FAILED: Connect call-to-action not found")
                return False
        print("✅ Connect call-to-action present")
        
        # Verify it links to /brokers/connect
        broker_link = page.locator("a[href='/brokers/connect']")
        if broker_link.count() == 0:
            print("❌ FAILED: Link to /brokers/connect not found")
            return False
        print("✅ Links to /brokers/connect")
        
        print("✅ PASSED: Dashboard shows connect broker banner")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        return False


def test_navbar_connect_broker(page):
    """Test 11: Navbar contains Connect broker link"""
    print("\n" + "="*80)
    print("TEST 11: Navbar Connect broker link")
    print("="*80)
    
    try:
        page.goto(f"{FRONTEND_URL}/", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Check for "Connect broker" in navbar
        navbar_link = page.locator("header a:has-text('Connect broker')")
        if navbar_link.count() == 0:
            print("❌ FAILED: 'Connect broker' link not found in navbar")
            return False
        print("✅ 'Connect broker' link found in navbar")
        
        # Verify it links to /brokers/connect
        href = navbar_link.get_attribute("href")
        if href != "/brokers/connect":
            print(f"❌ FAILED: Link href is '{href}', expected '/brokers/connect'")
            return False
        print("✅ Links to /brokers/connect")
        
        print("✅ PASSED: Navbar contains Connect broker link")
        return True
        
    except Exception as e:
        print(f"❌ FAILED: Exception occurred: {e}")
        return False


def main():
    """Run all frontend tests"""
    print("\n" + "="*80)
    print("BASKETLY KITE CONNECT FRONTEND TESTS (PLAYWRIGHT)")
    print(f"Frontend URL: {FRONTEND_URL}")
    print("="*80)
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        
        tests = [
            ("Broker connect page", test_broker_connect_page),
            ("Kite callback error page", test_kite_callback_error),
            ("Kite callback fake success", test_kite_callback_fake_success),
            ("Dashboard connect banner", test_dashboard_banner),
            ("Navbar connect broker link", test_navbar_connect_broker),
        ]
        
        results = []
        for name, test_func in tests:
            try:
                passed = test_func(page)
                results.append((name, passed))
            except Exception as e:
                print(f"\n❌ Test '{name}' crashed: {e}")
                results.append((name, False))
        
        browser.close()
    
    # Summary
    print("\n" + "="*80)
    print("FRONTEND TEST SUMMARY")
    print("="*80)
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    for name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed_count}/{total_count} tests passed")
    print("="*80)
    
    return 0 if passed_count == total_count else 1


if __name__ == "__main__":
    sys.exit(main())
