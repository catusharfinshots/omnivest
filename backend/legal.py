"""Legal pages: Terms, Privacy, Refund policy (+ the details behind the Contact page).

Documents are HTML stored in site_content (keys legalTerms / legalPrivacy / legalRefunds, edited in the
admin console); when a key is empty the Omnivest default below is used. Company facts live once, in
`platformDetails`, and are merged into every document through {{token}} placeholders, so changing the
support email or the registered address updates Terms, Privacy, Refunds, Contact and the checkout terms
together. Conditional blocks {{#key}}...{{/key}} render only when the detail is filled in.

Modelled on what smallcase publishes (platform layer + licence-holder layer, a plain-language "most
important terms" summary on top, the SEBI grievance ladder partner -> SCORES -> Smart ODR), reduced to
what Omnivest actually does today: a sole-proprietor technology platform and merchant of record; SEBI-
registered partners own the research; phone-OTP accounts; PAN/DOB billing; OTP-signed terms; Razorpay.
Not legal advice: Tushar's lawyer should read these once before live payments.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Dict, List

from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from content import DEFAULT_CONTENT

LEGAL_UPDATED_DEFAULT = "2026-09-09"
TOKENS = ("brand", "legalName", "entityType", "registrationNo", "registeredAddress", "supportEmail", "supportPhone",
          "supportHours", "grievanceOfficer", "grievanceEmail", "sebiRegistration", "raasbNo")
REQUIRED = ("legalName", "registeredAddress", "supportEmail", "grievanceOfficer", "grievanceEmail")

RISK_LINE = ("Investments in securities are subject to market risks. Read all related documents carefully before investing. "
             "Registration granted by SEBI, membership of RAASB and certification from NISM in no way guarantee the performance "
             "of a research analyst or provide any assurance of returns to investors. Past performance is not indicative of future returns.")

GRIEVANCE_LADDER = (
    "<ol>"
    "<li><b>Research or a model portfolio:</b> write to the partner first, using the support details printed on the listing and in the "
    "terms you signed. SEBI requires them to resolve your complaint within 21 days.</li>"
    "<li><b>The platform, your account or a payment:</b> write to {{supportEmail}}. If you are not satisfied, escalate to our "
    "grievance officer, {{grievanceOfficer}}, at {{grievanceEmail}}. We acknowledge within 2 working days and aim to resolve within 21 days.</li>"
    "<li><b>Still unresolved:</b> complaints against a SEBI-registered partner can be lodged on SEBI SCORES "
    "(<a href=\"https://scores.sebi.gov.in\" target=\"_blank\" rel=\"noreferrer\">scores.sebi.gov.in</a>) and, after that, through the "
    "Smart ODR portal (<a href=\"https://smartodr.in\" target=\"_blank\" rel=\"noreferrer\">smartodr.in</a>) for online conciliation or arbitration.</li>"
    "</ol>"
)

TERMS_HTML = (
    "<div class=\"mitc\"><h2 id=\"summary\">Most important terms, in plain language</h2><ul>"
    "{{#sebiRegistration}}<li>{{brand}} is a technology platform run by {{legalName}}, a SEBI-registered Research Analyst (registration no. {{sebiRegistration}}), who also publishes model portfolios on it. The Platform itself gives no personalised advice.</li>{{/sebiRegistration}}"
    "{{^sebiRegistration}}<li>{{brand}} is a technology platform run by {{legalName}}. We are not a SEBI-registered adviser or research analyst and we never give investment advice.</li>{{/sebiRegistration}}"
    "<li>Every model portfolio on {{brand}} is created and maintained by a SEBI-registered research analyst (a \"partner\") whose licence details are printed on the listing and in the terms you sign before paying.</li>"
    "<li>You pay {{brand}} for access to a partner's portfolio for a fixed period. {{brand}} is the merchant of record. Fees are not refundable once access starts (see the Refund policy).</li>"
    "<li>Nothing is invested for you. You place orders yourself, through your own broker, and you keep full control of your money and securities.</li>"
    "<li>Returns shown on the site are computed from exchange closing prices of the published constituents and are not guaranteed.</li>"
    "<li>" + RISK_LINE + "</li>"
    "</ul></div>"

    "<h2 id=\"who\">1. Who we are</h2>"
    "<p>{{brand}} (\"we\", \"us\") is the brand under which {{legalName}}{{#entityType}}, a {{entityType}} in India,{{/entityType}} operates the website omnivest.in "
    "and its related applications (together, the \"Platform\").{{#registeredAddress}} Our registered address is {{registeredAddress}}.{{/registeredAddress}}"
    "{{#registrationNo}} Registration: {{registrationNo}}.{{/registrationNo}} You can reach us at {{supportEmail}}.</p>"
    "{{#sebiRegistration}}<p>{{legalName}} is registered with SEBI as a Research Analyst, registration no. {{sebiRegistration}}"
    "{{#raasbNo}}, and enlisted with RAASB (BSE) under no. {{raasbNo}}{{/raasbNo}}. Model portfolios published under that registration carry "
    "its licence-holder details, exactly as portfolios published by other partners carry theirs. Registration granted by SEBI, membership of "
    "RAASB and certification from NISM in no way guarantee performance or assure returns.</p>{{/sebiRegistration}}"
    "<p>By creating an account, browsing the Platform or subscribing to a model portfolio you agree to these Terms, our "
    "<a href=\"/privacy\">Privacy Policy</a> and our <a href=\"/refunds\">Refund Policy</a>. If you do not agree, please do not use the Platform.</p>"

    "<h2 id=\"what\">2. What the Platform does, and does not do</h2>"
    "<p>The Platform lets SEBI-registered research analysts publish model portfolios (a named list of stocks or ETFs with weights, a methodology "
    "and periodic updates) and lets investors browse them, compare their computed track records, subscribe to paid ones and, optionally, "
    "connect a broker account to place orders themselves.</p>"
    "<ul><li>{{#sebiRegistration}}The Platform does not give personalised investment advice. Research on the Platform is published by the "
    "registered research analyst named on each portfolio, which may be {{legalName}} or another partner; no portfolio is an endorsement of another.{{/sebiRegistration}}"
    "{{^sebiRegistration}}We do not provide investment advice, research or recommendations of our own, and we do not endorse any partner's view.{{/sebiRegistration}}</li>"
    "<li>We do not hold, pool or manage your money or securities and we do not execute trades on your behalf. Orders you place through a connected broker are your own instructions to that broker.</li>"
    "<li>We do not guarantee any return, the accuracy of any partner's research, or that a portfolio will suit your circumstances. Speak to your own adviser if you are unsure.</li></ul>"

    "<h2 id=\"partners\">3. Partners and their research</h2>"
    "<p>Each model portfolio is prepared by the partner named on it, who is registered with SEBI as a Research Analyst and enlisted with the "
    "Research Analyst Administration and Supervisory Body (RAASB). The partner alone is responsible for the research, its methodology, "
    "its updates and its compliance with the SEBI (Research Analysts) Regulations, 2014, including disclosure of conflicts of interest. "
    "The partner's registered name, SEBI registration number, RAASB enlistment, support contact, compliance officer and registered address "
    "are printed in the terms you sign for that portfolio and remain available in your account.</p>"
    "<p>Partners must give {{brand}} accurate registration details and keep them current. We verify a partner's documents when they apply, "
    "but we do not audit their research. Partners may not use the Platform to give personalised advice to you; if a partner asks you for money "
    "outside the Platform, or promises assured returns, do not pay and tell us at {{supportEmail}}.</p>"

    "<h2 id=\"account\">4. Your account</h2>"
    "<ul><li>You must be at least 18 years old and resident in India, and you must have a PAN in your own name to subscribe to a paid portfolio.</li>"
    "<li>Your account is tied to your mobile number and secured with one-time codes. Keep your phone and codes to yourself; everything done with them is treated as done by you.</li>"
    "<li>The information you give us (name, PAN, date of birth, state, email) must be accurate. We may suspend an account whose details we cannot verify.</li>"
    "<li>Partner accounts and investor accounts are separate. A mobile number can hold only one of the two.</li></ul>"

    "<h2 id=\"subscriptions\">5. Subscriptions and payments</h2>"
    "<ul><li>Each paid portfolio offers plans of fixed length (for example 1, 3, 6 or 12 months) at a price set by the partner and shown before you pay.</li>"
    "<li>{{brand}} collects the fee on its own account as merchant of record and shares it with the partner under a separate agreement. Payments are processed by Razorpay; we never see your card or bank credentials.</li>"
    "<li>Prices are in Indian rupees and include applicable taxes unless stated otherwise on the plan.</li>"
    "<li>Your subscription starts when the payment is confirmed and ends at the close of the plan period. Access is not renewed automatically; we will not charge you again without a fresh payment from you.</li>"
    "<li>Buying a further plan while one is active adds the new period after the current one ends.</li>"
    "<li>Fees are not refundable once access has started. The narrow exceptions (a duplicate charge, access never granted, a portfolio withdrawn before your period ends) are in the <a href=\"/refunds\">Refund Policy</a>.</li>"
    "<li>Before your first payment for a portfolio you sign that portfolio's terms with a one-time code sent to your mobile. We keep the exact version you signed, with the time and your phone number, in your account.</li></ul>"

    "<h2 id=\"access\">6. What a subscription includes</h2>"
    "<p>A subscription unlocks the portfolio's constituents and weights, its factsheet, its rebalance history and the partner's update posts for the "
    "plan period. Performance figures, methodology and the investment rationale are public for every portfolio.</p>"
    "<p>Paid research is licensed to you personally. You may not copy, publish, resell, scrape or share constituents, weights, factsheets or updates, "
    "or use them to run a service for others. We may end a subscription without refund if this happens.</p>"

    "<h2 id=\"risk\">7. Risk disclosures</h2>"
    "<p>" + RISK_LINE + "</p>"
    "<ul><li>Model portfolios can lose value, including all of it, and concentrated or small-cap portfolios can be especially volatile.</li>"
    "<li>The figures on the Platform (returns since launch, comparison with an index, volatility, market-cap and sector splits) are computed by us "
    "from exchange closing prices of the published constituents on the dates they were published, without transaction costs, taxes or slippage. "
    "They are not audited, may be delayed or corrected, and are not a forecast.</li>"
    "<li>Track records start on the day a portfolio goes live on the Platform. We do not publish back-tested returns.</li>"
    "<li>Prices you actually get depend on your broker, timing and liquidity, so your results will differ from the figures shown.</li></ul>"

    "<h2 id=\"broker\">8. Connecting a broker</h2>"
    "<p>Connecting a broker account is optional. If you connect one, you log in on the broker's own page; we receive only the access the broker "
    "grants for the actions you take and never your broker password. Orders are placed by you, in your name, under the broker's terms, and any "
    "dispute about an order is between you and the broker. You can disconnect at any time.</p>"

    "<h2 id=\"use\">9. Acceptable use and our content</h2>"
    "<ul><li>Do not attempt to access other users' data, interfere with the Platform, or use automated tools to extract content.</li>"
    "<li>The {{brand}} name, logo, design and software are ours. Partner research belongs to the partner. Index names belong to their owners.</li>"
    "<li>Links to third-party sites (brokers, exchanges, SEBI) are provided for convenience; we are not responsible for their content.</li></ul>"

    "<h2 id=\"liability\">10. Our responsibility to you</h2>"
    "<p>We work to keep the Platform available and accurate, but we provide it \"as is\". We are not liable for investment losses, for a partner's "
    "research, for interruptions or errors in market data, or for anything outside our reasonable control. Where liability cannot be excluded, "
    "our total liability to you for any claim is limited to the subscription fees you paid to {{brand}} in the twelve months before the claim. "
    "Nothing in these Terms limits liability for fraud or for anything that cannot be limited under Indian law.</p>"

    "<h2 id=\"ending\">11. Suspension and ending your account</h2>"
    "<p>You can stop using the Platform at any time and ask us to delete your account from {{supportEmail}}; we keep records we are legally required "
    "to keep (see the Privacy Policy). We may suspend or close an account for a breach of these Terms, suspected fraud, a legal requirement, "
    "or if a partner's registration lapses; active subscriptions to a withdrawn portfolio are handled under the Refund Policy.</p>"

    "<h2 id=\"grievance\">12. Complaints and grievance redressal</h2>"
    + GRIEVANCE_LADDER +

    "<h2 id=\"general\">13. General</h2>"
    "<ul><li>These Terms are governed by Indian law. Courts at the seat of our registered address have jurisdiction, without prejudice to the "
    "SEBI and ODR routes above.</li>"
    "<li>We may update these Terms. The date at the top changes when we do, and material changes are announced on the Platform. Continuing to use "
    "the Platform after a change means you accept it; the terms you signed for a portfolio stay as signed for that subscription.</li>"
    "<li>If any part of these Terms is found unenforceable, the rest still applies.</li></ul>"

    "<h2 id=\"contact\">14. Contact</h2>"
    "<p>{{legalName}}, trading as {{brand}}.{{#registeredAddress}} {{registeredAddress}}.{{/registeredAddress}} Support: {{supportEmail}}"
    "{{#supportPhone}} · {{supportPhone}}{{/supportPhone}}{{#supportHours}} ({{supportHours}}){{/supportHours}}. Grievance officer: "
    "{{grievanceOfficer}}, {{grievanceEmail}}.</p>"
)

PRIVACY_HTML = (
    "<div class=\"mitc\"><h2 id=\"summary\">In short</h2><ul>"
    "<li>We collect only what the Platform needs: your mobile number and name to run your account; PAN, date of birth and state to bill a paid subscription as Indian rules require; payment references from Razorpay; and the record of terms you signed.</li>"
    "<li>We never receive or store card, UPI or bank credentials, or your broker password.</li>"
    "<li>We do not sell your data and we do not show third-party advertising.</li>"
    "<li>Financial and consent records are kept for 8 years because securities rules require it; everything else goes when your account does.</li>"
    "<li>Questions or requests: {{grievanceEmail}}.</li>"
    "</ul></div>"

    "<h2 id=\"who\">1. Who is responsible</h2>"
    "<p>{{legalName}}, trading as {{brand}}{{#registeredAddress}}, {{registeredAddress}}{{/registeredAddress}}, is the data fiduciary for the personal "
    "data described here under the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000. Our grievance officer is "
    "{{grievanceOfficer}} ({{grievanceEmail}}).</p>"

    "<h2 id=\"collect\">2. What we collect and why</h2>"
    "<table class=\"legal-table\"><thead><tr><th>Data</th><th>When</th><th>Why</th></tr></thead><tbody>"
    "<tr><td data-label=\"Data\">Mobile number, one-time codes, name, email (optional)</td><td data-label=\"When\">Creating and signing in to your account</td><td data-label=\"Why\">To identify you, secure your account and send you service messages</td></tr>"
    "<tr><td data-label=\"Data\">PAN, name as on PAN, date of birth, state</td><td data-label=\"When\">Before your first paid subscription</td><td data-label=\"Why\">To bill you correctly, confirm you are an adult and issue tax-compliant invoices</td></tr>"
    "<tr><td data-label=\"Data\">Terms you signed: version, time, phone number, code confirmation, IP address</td><td data-label=\"When\">Signing a portfolio's terms</td><td data-label=\"Why\">To keep proof of what you agreed to, as SEBI requires of partners</td></tr>"
    "<tr><td data-label=\"Data\">Order and payment references, amount, plan, payment status</td><td data-label=\"When\">Paying for a subscription</td><td data-label=\"Why\">To grant access, reconcile payments and handle disputes</td></tr>"
    "<tr><td data-label=\"Data\">Watchlist, subscriptions, pages viewed, device and browser type, approximate location from IP</td><td data-label=\"When\">Using the Platform</td><td data-label=\"Why\">To run and improve the product, fix errors and prevent abuse</td></tr>"
    "<tr><td data-label=\"Data\">Broker identifier and the data your broker returns for actions you take</td><td data-label=\"When\">Only if you connect a broker</td><td data-label=\"Why\">To show your holdings and place the orders you request</td></tr>"
    "<tr><td data-label=\"Data\">Registration certificates, PAN, address, officer details</td><td data-label=\"When\">Applying as a partner</td><td data-label=\"Why\">To verify SEBI registration and print licence-holder details for investors</td></tr>"
    "</tbody></table>"
    "<p>We rely on your consent, given when you create an account and again when you subscribe, and on the legitimate uses the law allows for "
    "providing a service you asked for, complying with securities and tax rules and preventing fraud.</p>"

    "<h2 id=\"share\">3. Who we share it with</h2>"
    "<ul><li><b>Partners:</b> the research analyst whose portfolio you subscribe to can see that you are a subscriber and, when needed to serve you or answer a complaint, your name and contact details. Partners never see your PAN or payment details.</li>"
    "<li><b>Razorpay</b> processes payments and receives your name, phone, email and the amount. Card and bank details go to Razorpay directly and never reach us.</li>"
    "<li><b>SMS and email providers</b> deliver one-time codes and service messages to the number and address you gave.</li>"
    "<li><b>Cloud hosting</b> (application and database providers in secured data centres) stores the Platform's data on our behalf under contracts that forbid any other use.</li>"
    "<li><b>Your broker</b>, only if you choose to connect one, in the direction you instruct.</li>"
    "<li><b>Regulators, courts and law enforcement</b> when the law requires it, and professional advisers under confidentiality.</li></ul>"
    "<p>We do not sell personal data, and we do not share it with advertisers.</p>"

    "<h2 id=\"cookies\">4. Cookies and local storage</h2>"
    "<p>We use your browser's storage to keep you signed in and remember preferences such as a chosen tab. We use privacy-respecting analytics "
    "to count visits and usage; no advertising cookies are set. Blocking storage will sign you out.</p>"

    "<h2 id=\"retention\">5. How long we keep data</h2>"
    "<ul><li>Payment records, invoices and the terms you signed: 8 years from the end of the subscription, as securities and tax rules require.</li>"
    "<li>Account data: until you delete your account, after which it is removed within 30 days except for the records above.</li>"
    "<li>Partner verification documents: for the life of the partnership plus 8 years.</li>"
    "<li>Server logs: 90 days.</li></ul>"

    "<h2 id=\"security\">6. How we protect it</h2>"
    "<p>Data is encrypted in transit and at rest, access is limited to what each role needs, admin access is logged, and PAN is shown only in "
    "masked form outside the billing step. No system is perfectly secure; if a breach affects you we will tell you and the Data Protection Board "
    "as the law requires.</p>"

    "<h2 id=\"rights\">7. Your rights</h2>"
    "<ul><li>See the personal data we hold about you and correct it (most of it is editable in your account).</li>"
    "<li>Withdraw consent or ask us to delete your account, subject to the retention rules above.</li>"
    "<li>Nominate a person to exercise these rights for you if you are unable to.</li>"
    "<li>Complain to our grievance officer and, if unresolved, to the Data Protection Board of India.</li></ul>"
    "<p>Write to {{grievanceEmail}} from the email or phone on your account. We respond within 7 days and resolve within 30.</p>"

    "<h2 id=\"children\">8. Children</h2>"
    "<p>The Platform is for adults. We do not knowingly collect data from anyone under 18 and will delete it if we learn we have.</p>"

    "<h2 id=\"changes\">9. Changes</h2>"
    "<p>We will update this policy as the Platform grows. The date at the top changes when we do, and material changes are announced on the Platform "
    "before they take effect.</p>"

    "<h2 id=\"contact\">10. Contact</h2>"
    "<p>Grievance officer: {{grievanceOfficer}}, {{grievanceEmail}}. General support: {{supportEmail}}{{#supportPhone}} · {{supportPhone}}{{/supportPhone}}."
    "{{#registeredAddress}} Postal: {{legalName}}, {{registeredAddress}}.{{/registeredAddress}}</p>"
)

REFUNDS_HTML = (
    "<div class=\"mitc\"><h2 id=\"summary\">In short</h2><ul>"
    "<li>Subscription fees are not refundable once your access starts, because the research is delivered in full the moment it is unlocked.</li>"
    "<li>There is no automatic renewal, so there is nothing to cancel: access simply ends when the plan does.</li>"
    "<li>We do refund a duplicate charge, a payment where access was never granted, or the unused part of a plan if the partner withdraws the portfolio.</li>"
    "</ul></div>"

    "<h2 id=\"policy\">1. No refunds after access starts</h2>"
    "<p>When you subscribe to a model portfolio, its constituents, weights, factsheet and updates are unlocked immediately and cannot be taken "
    "back. For that reason fees paid to {{brand}} ({{legalName}}) are not refundable, in full or in part, once access has started, including if you change your "
    "mind, stop using the Platform, disagree with the partner's research or the portfolio performs poorly. Please read the public methodology, "
    "rationale and track record, and the terms you sign, before paying.</p>"

    "<h2 id=\"exceptions\">2. When we do refund</h2>"
    "<ul><li><b>Duplicate charge:</b> if one order is charged more than once, the extra amount is refunded in full.</li>"
    "<li><b>Access not granted:</b> if a payment is captured but your subscription is not active within 24 hours and we cannot fix it, we refund the payment in full.</li>"
    "<li><b>Portfolio withdrawn:</b> if a partner withdraws a portfolio, or their registration ends, before your plan period is over, we refund the unused days of your plan pro rata, or offer a credit of the same value towards another portfolio if you prefer.</li>"
    "<li><b>Required by law</b> or ordered by a court, regulator or ODR forum.</li></ul>"

    "<h2 id=\"how\">3. How to ask</h2>"
    "<p>Write to {{supportEmail}} from the email or phone number on your account with the portfolio name and the payment reference shown in your "
    "account under Subscriptions. We acknowledge within 2 working days and decide within 7. Approved refunds go back to the original payment method "
    "through Razorpay, usually within 5 to 7 working days depending on your bank.</p>"

    "<h2 id=\"cancel\">4. Cancellation and renewal</h2>"
    "<p>Plans are prepaid for a fixed period and do not renew on their own. You will not be charged again unless you buy a new plan yourself. "
    "If you buy a further plan while one is active, the new period starts when the current one ends.</p>"

    "<h2 id=\"chargebacks\">5. Chargebacks</h2>"
    "<p>Please contact us before raising a dispute with your bank. A chargeback on a subscription that was delivered may lead us to suspend the "
    "account while it is investigated.</p>"

    "<h2 id=\"partner\">6. Fees paid to a partner directly</h2>"
    "<p>This policy covers payments made to {{brand}} on the Platform. If a partner offers services to you outside the Platform, their own terms apply "
    "and you should pay them only through banking channels, never in cash.</p>"
)

PAGES = {
    "terms": ("Terms of Service", "The rules for using Omnivest: what the platform does, partners' responsibilities, subscriptions, risk and grievance redressal.", "legalTerms", TERMS_HTML),
    "privacy": ("Privacy Policy", "What Omnivest collects, why, who it is shared with, how long it is kept and your rights.", "legalPrivacy", PRIVACY_HTML),
    "refunds": ("Refund Policy", "Omnivest subscription fees are non-refundable once access starts; the narrow exceptions and how to ask.", "legalRefunds", REFUNDS_HTML),
}

_COND = re.compile(r"\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}", re.S)
_NOT = re.compile(r"\{\{\^(\w+)\}\}(.*?)\{\{/\1\}\}", re.S)
_TOKEN = re.compile(r"\{\{(\w+)\}\}")


def details_from(content: dict) -> Dict[str, str]:
    """platformDetails with defaults; `cin` kept for older saves and exposed as registrationNo."""
    pd = {**DEFAULT_CONTENT.get("platformDetails", {}), **(content.get("platformDetails") or {})}
    if not pd.get("registrationNo") and pd.get("cin"):
        pd["registrationNo"] = pd["cin"]
    return {k: str(pd.get(k) or "").strip() for k in TOKENS}


def fill(html: str, d: Dict[str, str]) -> str:
    """Render {{#key}}…{{/key}} blocks only when the detail is set, {{^key}}…{{/key}} only when it is empty, then substitute {{key}}."""
    for _ in range(6):   # blocks may nest (e.g. RAASB inside the SEBI block): peel one level per pass
        before = html
        html = _COND.sub(lambda m: m.group(2) if d.get(m.group(1)) else "", html)
        html = _NOT.sub(lambda m: "" if d.get(m.group(1)) else m.group(2), html)
        if html == before:
            break
    return _TOKEN.sub(lambda m: d.get(m.group(1), m.group(0)) if m.group(1) in TOKENS else m.group(0), html)


def missing(d: Dict[str, str]) -> List[str]:
    return [k for k in REQUIRED if not d.get(k)]


def toc(html: str) -> List[dict]:
    return [{"id": i, "title": re.sub(r"<[^>]+>", "", t).strip()} for i, t in re.findall(r"<h2 id=\"([^\"]+)\">(.*?)</h2>", html)]


def render(content: dict, slug: str) -> dict:
    if slug not in PAGES:
        raise KeyError(slug)
    title, desc, key, default = PAGES[slug]
    d = details_from(content)
    raw = (content.get(key) or "").strip() or default
    html = fill(raw, d)
    updated = (content.get("legalUpdated") or "").strip() or LEGAL_UPDATED_DEFAULT
    return {"slug": slug, "title": title, "description": desc, "updated": updated, "html": html, "toc": toc(html),
            "custom": bool((content.get(key) or "").strip()), "details": d, "missing": missing(d)}


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/legal", tags=["legal"])

    async def _content():
        return await db.site_content.find_one({"key": "home"}, {"_id": 0}) or {}

    @router.get("")
    async def index():
        c = await _content()
        d = details_from(c)
        updated = (c.get("legalUpdated") or "").strip() or LEGAL_UPDATED_DEFAULT
        return {"pages": [{"slug": s, "title": v[0], "description": v[1], "path": f"/{s}"} for s, v in PAGES.items()],
                "updated": updated, "details": d, "missing": missing(d), "grievance_html": fill(GRIEVANCE_LADDER, d)}

    @router.get("/{slug}")
    async def page(slug: str):
        try:
            return render(await _content(), slug)
        except KeyError:
            raise HTTPException(status_code=404, detail="No such page")

    return router


def _today() -> str:
    return date.today().isoformat()
