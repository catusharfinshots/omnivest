"""Shared helper: create a COMPLETE listing as an analyst and push it through the real
submit gate (methodology, factsheet fields, factsheet PDF, weights = 100) so admin can
approve it. Drafts are invisible to admin, so tests must submit before approving."""
import io

import requests

TINY_PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n"
            b"0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n")


def complete_payload(name, cons, benchmark="NIFTY 50", subtitle="Test listing for the engine.", **extra):
    """Listing 2.0 shape: rationale + methodology are rich text, tags ≤3, no typed returns/risk/min."""
    return {
        "name": name, "subtitle": subtitle, "benchmark": benchmark, "strategy": "thematic", "tags": ["Growth", "Quality"],
        "rebalanceFreq": "Quarterly", "subscription": "Free", "plans": [], "videoUrl": "", "constituents": cons,
        "rationale": "<p>Quality compounders with <strong>steady earnings</strong>.</p><ul><li>Low leverage</li><li>High ROCE</li></ul>",
        "methodology": "<p>Rules-based basket rebalanced quarterly on fundamentals and momentum.</p>",
        "factsheet": {"objective": "Long-term growth", "whoShouldInvest": "Investors with a 3+ year horizon", "riskFactors": "Equity market risk", "pdfName": ""},
        **extra,
    }


def create_submitted_listing(api, analyst_headers, name, cons, benchmark="NIFTY 50", **extra):
    """Returns the portfolio id, in `pending` state (submitted, not yet approved)."""
    r = requests.post(f"{api}/analyst/portfolios", json=complete_payload(name, cons, benchmark, **extra), headers=analyst_headers, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["portfolio"]["id"]
    up = requests.post(f"{api}/analyst/portfolios/{pid}/factsheet", files={"file": ("factsheet.pdf", io.BytesIO(TINY_PDF), "application/pdf")}, headers=analyst_headers, timeout=30)
    assert up.status_code == 200, up.text
    sub = requests.post(f"{api}/analyst/portfolios/{pid}/submit", headers=analyst_headers, timeout=30)
    assert sub.status_code == 200, sub.text
    return pid
