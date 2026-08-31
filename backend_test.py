#!/usr/bin/env python3
"""
Backend API test for Basketly research-analyst listing endpoints.
Tests the analyst.py module endpoints and updated signup role handling.
"""
import requests
import json
import random
import string

# Read backend URL from frontend/.env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
            break

API_BASE = f"{BASE_URL}/api"

def random_email():
    """Generate a unique random email for testing."""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"test_analyst_{rand}@example.com"

def test_step(step_num, description):
    """Print test step header."""
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print('='*80)

def check_response(resp, expected_status, step_desc):
    """Check response status and print result."""
    if resp.status_code == expected_status:
        print(f"✅ PASS: {step_desc} → {resp.status_code}")
        return True
    else:
        print(f"❌ FAIL: {step_desc} → Expected {expected_status}, got {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        return False

def main():
    print("\n" + "="*80)
    print("BASKETLY RESEARCH-ANALYST LISTING ENDPOINTS TEST")
    print("="*80)
    
    results = []
    
    # ========== SETUP: Admin login ==========
    test_step("SETUP", "Admin login to get admin token")
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": "admin@basketly.in",
        "password": "Admin@123"
    })
    if not check_response(resp, 200, "Admin login"):
        print("❌ CRITICAL: Cannot proceed without admin token")
        return
    admin_token = resp.json()["token"]
    print(f"Admin token: {admin_token[:20]}...")
    results.append(("Admin login", "PASS"))
    
    # ========== STEP 1: Create analyst via signup ==========
    test_step(1, "Create ANALYST via signup with role:'analyst'")
    analyst_email = random_email()
    resp = requests.post(f"{API_BASE}/auth/signup", json={
        "name": "Test Analyst",
        "email": analyst_email,
        "password": "Password123",
        "role": "analyst"
    })
    passed = check_response(resp, 200, "Signup with role:analyst")
    if passed:
        data = resp.json()
        analyst_token = data["token"]
        analyst_user = data["user"]
        analyst_id = analyst_user["id"]
        if analyst_user.get("role") == "analyst":
            print(f"✅ PASS: Returned user.role == 'analyst'")
            print(f"Analyst user: {analyst_user}")
            results.append(("Create analyst via signup", "PASS"))
        else:
            print(f"❌ FAIL: Expected user.role='analyst', got '{analyst_user.get('role')}'")
            results.append(("Create analyst via signup", "FAIL"))
            passed = False
    else:
        results.append(("Create analyst via signup", "FAIL"))
        print("❌ CRITICAL: Cannot proceed without analyst token")
        return
    
    # ========== STEP 2: Confirm signup with role:'admin' returns investor ==========
    test_step(2, "Confirm signup with role:'admin' returns user.role='investor'")
    fake_admin_email = random_email()
    resp = requests.post(f"{API_BASE}/auth/signup", json={
        "name": "Fake Admin",
        "email": fake_admin_email,
        "password": "Password123",
        "role": "admin"
    })
    passed = check_response(resp, 200, "Signup with role:admin")
    if passed:
        data = resp.json()
        fake_user = data["user"]
        if fake_user.get("role") == "investor":
            print(f"✅ PASS: Self-signup with role:'admin' correctly returned user.role='investor'")
            results.append(("Signup role:admin returns investor", "PASS"))
        else:
            print(f"❌ FAIL: Expected user.role='investor', got '{fake_user.get('role')}'")
            results.append(("Signup role:admin returns investor", "FAIL"))
    else:
        results.append(("Signup role:admin returns investor", "FAIL"))
    
    # ========== STEP 3: GET /api/analyst/profile ==========
    test_step(3, "GET /api/analyst/profile with analyst token")
    resp = requests.get(f"{API_BASE}/analyst/profile", headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 200, "GET /api/analyst/profile")
    if passed:
        data = resp.json()
        if "profile" in data:
            print(f"✅ PASS: Profile object returned: {data['profile']}")
            results.append(("GET /api/analyst/profile", "PASS"))
        else:
            print(f"❌ FAIL: No 'profile' key in response")
            results.append(("GET /api/analyst/profile", "FAIL"))
    else:
        results.append(("GET /api/analyst/profile", "FAIL"))
    
    # ========== STEP 4: PUT /api/analyst/profile ==========
    test_step(4, "PUT /api/analyst/profile to update profile")
    profile_data = {
        "displayName": "Test Analyst",
        "sebiReg": "INH000111222",
        "philosophy": "Quality investing",
        "description": "About me",
        "logo": "TA"
    }
    resp = requests.put(f"{API_BASE}/analyst/profile", json=profile_data, headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 200, "PUT /api/analyst/profile")
    if passed:
        data = resp.json()
        if data.get("profile", {}).get("sebiReg") == "INH000111222":
            print(f"✅ PASS: Profile updated and persisted: {data['profile']}")
            results.append(("PUT /api/analyst/profile", "PASS"))
        else:
            print(f"❌ FAIL: Profile not persisted correctly")
            results.append(("PUT /api/analyst/profile", "FAIL"))
    else:
        results.append(("PUT /api/analyst/profile", "FAIL"))
    
    # ========== STEP 5: POST /api/analyst/portfolios ==========
    test_step(5, "POST /api/analyst/portfolios to create a portfolio")
    portfolio_data = {
        "name": "Alpha Movers",
        "subtitle": "Momentum stocks",
        "strategy": "thematic",
        "risk": "High",
        "minAmount": 8000,
        "subscription": "Free",
        "methodology": "Momentum ranking",
        "rebalanceFreq": "Monthly",
        "constituents": [
            {"symbol": "TCS", "name": "TCS", "type": "Stock", "weight": 50},
            {"symbol": "INFY", "name": "Infosys", "type": "Stock", "weight": 50}
        ],
        "returns": {"cagr": 24, "y1": 20, "y3": 22, "y5": 0}
    }
    resp = requests.post(f"{API_BASE}/analyst/portfolios", json=portfolio_data, headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 200, "POST /api/analyst/portfolios")
    if passed:
        data = resp.json()
        portfolio = data.get("portfolio", {})
        portfolio_id = portfolio.get("id")
        if portfolio_id and portfolio.get("status") == "draft":
            print(f"✅ PASS: Portfolio created with id={portfolio_id}, status='draft'")
            print(f"Portfolio: {json.dumps(portfolio, indent=2)}")
            results.append(("POST /api/analyst/portfolios", "PASS"))
        else:
            print(f"❌ FAIL: Portfolio missing id or status != 'draft'")
            results.append(("POST /api/analyst/portfolios", "FAIL"))
            passed = False
    else:
        results.append(("POST /api/analyst/portfolios", "FAIL"))
        print("❌ CRITICAL: Cannot proceed without portfolio_id")
        return
    
    # ========== STEP 6: GET /api/analyst/portfolios ==========
    test_step(6, "GET /api/analyst/portfolios to list portfolios")
    resp = requests.get(f"{API_BASE}/analyst/portfolios", headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 200, "GET /api/analyst/portfolios")
    if passed:
        data = resp.json()
        portfolios = data.get("portfolios", [])
        if len(portfolios) > 0 and any(p.get("id") == portfolio_id for p in portfolios):
            print(f"✅ PASS: Portfolio list contains created portfolio (count={len(portfolios)})")
            results.append(("GET /api/analyst/portfolios", "PASS"))
        else:
            print(f"❌ FAIL: Created portfolio not found in list")
            results.append(("GET /api/analyst/portfolios", "FAIL"))
    else:
        results.append(("GET /api/analyst/portfolios", "FAIL"))
    
    # ========== STEP 7: Authorization - analyst cannot access admin endpoints ==========
    test_step(7, "Authorization: analyst token on GET /api/admin/portfolios → 403")
    resp = requests.get(f"{API_BASE}/admin/portfolios", headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 403, "Analyst accessing admin endpoint")
    if passed:
        print(f"✅ PASS: Analyst correctly denied access to admin endpoint (403)")
        results.append(("Analyst cannot access admin endpoint", "PASS"))
    else:
        results.append(("Analyst cannot access admin endpoint", "FAIL"))
    
    # ========== STEP 8: Authorization - no token on analyst endpoints → 401 ==========
    test_step(8, "Authorization: no token on GET /api/analyst/portfolios → 401")
    resp = requests.get(f"{API_BASE}/analyst/portfolios")
    passed = check_response(resp, 401, "No token on analyst endpoint")
    if passed:
        print(f"✅ PASS: No token correctly returns 401")
        results.append(("No token returns 401", "PASS"))
    else:
        results.append(("No token returns 401", "FAIL"))
    
    # ========== STEP 9: Public visibility before approval (draft) ==========
    test_step(9, "Public visibility before approval: GET /api/portfolios (no auth)")
    resp = requests.get(f"{API_BASE}/portfolios")
    passed = check_response(resp, 200, "GET /api/portfolios (public)")
    if passed:
        data = resp.json()
        portfolios = data.get("portfolios", [])
        if not any(p.get("id") == portfolio_id for p in portfolios):
            print(f"✅ PASS: Draft portfolio NOT visible in public list (count={len(portfolios)})")
            results.append(("Draft portfolio not public", "PASS"))
        else:
            print(f"❌ FAIL: Draft portfolio should NOT be visible in public list")
            results.append(("Draft portfolio not public", "FAIL"))
    else:
        results.append(("Draft portfolio not public", "FAIL"))
    
    # ========== STEP 10: Public visibility before approval (detail) ==========
    test_step(10, "Public visibility before approval: GET /api/portfolios/{id} → 404")
    resp = requests.get(f"{API_BASE}/portfolios/{portfolio_id}")
    passed = check_response(resp, 404, "GET /api/portfolios/{id} for draft")
    if passed:
        print(f"✅ PASS: Draft portfolio detail returns 404 (not approved yet)")
        results.append(("Draft portfolio detail 404", "PASS"))
    else:
        results.append(("Draft portfolio detail 404", "FAIL"))
    
    # ========== STEP 11: Submit portfolio (draft → pending) ==========
    test_step(11, "Submit portfolio: POST /api/analyst/portfolios/{id}/submit")
    resp = requests.post(f"{API_BASE}/analyst/portfolios/{portfolio_id}/submit", headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 200, "POST /api/analyst/portfolios/{id}/submit")
    if passed:
        data = resp.json()
        if data.get("status") == "pending":
            print(f"✅ PASS: Portfolio status changed to 'pending'")
            results.append(("Submit portfolio (draft→pending)", "PASS"))
        else:
            print(f"❌ FAIL: Expected status='pending', got '{data.get('status')}'")
            results.append(("Submit portfolio (draft→pending)", "FAIL"))
    else:
        results.append(("Submit portfolio (draft→pending)", "FAIL"))
    
    # ========== STEP 12: Admin review - list pending portfolios ==========
    test_step(12, "Admin review: GET /api/admin/portfolios?status=pending")
    resp = requests.get(f"{API_BASE}/admin/portfolios?status=pending", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    passed = check_response(resp, 200, "GET /api/admin/portfolios?status=pending")
    if passed:
        data = resp.json()
        portfolios = data.get("portfolios", [])
        if any(p.get("id") == portfolio_id for p in portfolios):
            print(f"✅ PASS: Pending portfolio found in admin list (count={len(portfolios)})")
            results.append(("Admin list pending portfolios", "PASS"))
        else:
            print(f"❌ FAIL: Pending portfolio not found in admin list")
            results.append(("Admin list pending portfolios", "FAIL"))
    else:
        results.append(("Admin list pending portfolios", "FAIL"))
    
    # ========== STEP 13: Admin review - approve portfolio ==========
    test_step(13, "Admin review: POST /api/admin/portfolios/{id}/review (approve)")
    resp = requests.post(f"{API_BASE}/admin/portfolios/{portfolio_id}/review", json={
        "action": "approve"
    }, headers={
        "Authorization": f"Bearer {admin_token}"
    })
    passed = check_response(resp, 200, "POST /api/admin/portfolios/{id}/review")
    if passed:
        data = resp.json()
        if data.get("status") == "approved":
            print(f"✅ PASS: Portfolio status changed to 'approved'")
            results.append(("Admin approve portfolio", "PASS"))
        else:
            print(f"❌ FAIL: Expected status='approved', got '{data.get('status')}'")
            results.append(("Admin approve portfolio", "FAIL"))
    else:
        results.append(("Admin approve portfolio", "FAIL"))
    
    # ========== STEP 14: Public visibility after approval (list) ==========
    test_step(14, "Public visibility after approval: GET /api/portfolios (no auth)")
    resp = requests.get(f"{API_BASE}/portfolios")
    passed = check_response(resp, 200, "GET /api/portfolios (public)")
    if passed:
        data = resp.json()
        portfolios = data.get("portfolios", [])
        found = None
        for p in portfolios:
            if p.get("id") == portfolio_id:
                found = p
                break
        if found:
            print(f"✅ PASS: Approved portfolio NOW visible in public list")
            # Check that owner_id and review_note are NOT exposed
            if "owner_id" in found:
                print(f"❌ FAIL: owner_id should NOT be exposed in public list")
                results.append(("Public list hides owner_id", "FAIL"))
            else:
                print(f"✅ PASS: owner_id NOT exposed in public list")
                results.append(("Public list hides owner_id", "PASS"))
            if "review_note" in found:
                print(f"❌ FAIL: review_note should NOT be exposed in public list")
                results.append(("Public list hides review_note", "FAIL"))
            else:
                print(f"✅ PASS: review_note NOT exposed in public list")
                results.append(("Public list hides review_note", "PASS"))
        else:
            print(f"❌ FAIL: Approved portfolio NOT found in public list")
            results.append(("Approved portfolio visible", "FAIL"))
    else:
        results.append(("Approved portfolio visible", "FAIL"))
    
    # ========== STEP 15: Public visibility after approval (detail) ==========
    test_step(15, "Public visibility after approval: GET /api/portfolios/{id}")
    resp = requests.get(f"{API_BASE}/portfolios/{portfolio_id}")
    passed = check_response(resp, 200, "GET /api/portfolios/{id} for approved")
    if passed:
        data = resp.json()
        portfolio = data.get("portfolio", {})
        if portfolio.get("id") == portfolio_id:
            print(f"✅ PASS: Approved portfolio detail returns 200")
            # Check that owner_id and review_note are NOT exposed
            if "owner_id" in portfolio:
                print(f"❌ FAIL: owner_id should NOT be exposed in public detail")
                results.append(("Public detail hides owner_id", "FAIL"))
            else:
                print(f"✅ PASS: owner_id NOT exposed in public detail")
                results.append(("Public detail hides owner_id", "PASS"))
            if "review_note" in portfolio:
                print(f"❌ FAIL: review_note should NOT be exposed in public detail")
                results.append(("Public detail hides review_note", "FAIL"))
            else:
                print(f"✅ PASS: review_note NOT exposed in public detail")
                results.append(("Public detail hides review_note", "PASS"))
        else:
            print(f"❌ FAIL: Portfolio id mismatch")
            results.append(("Approved portfolio detail", "FAIL"))
    else:
        results.append(("Approved portfolio detail", "FAIL"))
    
    # ========== STEP 16: Investor cannot manage listings ==========
    test_step(16, "Investor cannot manage listings: GET /api/analyst/portfolios with investor token")
    # Login as demo investor
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": "demo@basketly.in",
        "password": "Password123"
    })
    if resp.status_code == 200:
        investor_token = resp.json()["token"]
        resp = requests.get(f"{API_BASE}/analyst/portfolios", headers={
            "Authorization": f"Bearer {investor_token}"
        })
        passed = check_response(resp, 403, "Investor accessing analyst endpoint")
        if passed:
            print(f"✅ PASS: Investor correctly denied access to analyst endpoint (403)")
            results.append(("Investor cannot manage listings", "PASS"))
        else:
            results.append(("Investor cannot manage listings", "FAIL"))
    else:
        print(f"❌ FAIL: Could not login as investor")
        results.append(("Investor cannot manage listings", "FAIL"))
    
    # ========== STEP 17: Cleanup - delete portfolio ==========
    test_step(17, "Cleanup: DELETE /api/analyst/portfolios/{id}")
    resp = requests.delete(f"{API_BASE}/analyst/portfolios/{portfolio_id}", headers={
        "Authorization": f"Bearer {analyst_token}"
    })
    passed = check_response(resp, 200, "DELETE /api/analyst/portfolios/{id}")
    if passed:
        data = resp.json()
        if data.get("ok"):
            print(f"✅ PASS: Portfolio deleted successfully")
            results.append(("Delete portfolio", "PASS"))
        else:
            print(f"❌ FAIL: Delete did not return ok:true")
            results.append(("Delete portfolio", "FAIL"))
    else:
        results.append(("Delete portfolio", "FAIL"))
    
    # ========== SUMMARY ==========
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed_count = sum(1 for _, status in results if status == "PASS")
    failed_count = sum(1 for _, status in results if status == "FAIL")
    print(f"\nTotal: {len(results)} tests")
    print(f"✅ Passed: {passed_count}")
    print(f"❌ Failed: {failed_count}")
    print("\nDetailed results:")
    for i, (test_name, status) in enumerate(results, 1):
        icon = "✅" if status == "PASS" else "❌"
        print(f"{i:2d}. {icon} {test_name}")
    
    if failed_count == 0:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {failed_count} test(s) failed")
    
    print("="*80)

if __name__ == "__main__":
    main()
