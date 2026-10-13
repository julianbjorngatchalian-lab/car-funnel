# Indigo Lane Motors: used-car sales funnel (portfolio demo)

A five-stage sales funnel for a fictional used-car dealership, built with Claude Code by Julian Bjorn Gatchalian. Plain HTML, CSS and JavaScript on the front end, with Google Apps Script and Google Sheets for leads, follow-up emails and funnel reporting.

Indigo Lane Motors, its cars, prices, policies and the referral reward are invented. Reviews are placeholders.

## Funnel map

| Stage | Pages | Content and actions | Lead captured |
|---|---|---|---|
| **Awareness (TOFU)** | `index.html`, `guide.html` | Ad and social landing page, shopper-type picker, SEO buying guide, interactive 12-point checklist | Checklist email opt-in |
| **Interest & consideration (MOFU)** | `inventory.html`, `car.html` | Filters, sorting, side-by-side comparison of up to 3 cars, history highlights, payment calculator | Video walkaround request |
| **Intent & evaluation** | `test-drive.html` | Test drive booking, trade-in offer request, pre-qualification with an instant price range and matching cars | Test drive, trade-in, pre-qualification |
| **Conversion (BOFU)** | `reserve.html` | Price breakdown with $0 fees, 48-hour hold, guarantees, reviews, one clear "Reserve this car" button | Reservation |
| **Loyalty & retention** | `welcome.html` (emailed after the sale) | First-30-days onboarding, service reminders, referral code, review request | Service sign-up, referral, review |

A small "Funnel stage" button on every page shows reviewers which stage they're on. Remove `renderFunnelMap()` in `assets/funnel.js` for a client launch.

## Personas (working assumptions for the demo)

These are assumptions, not research. For a real dealer, replace them with the dealer's own sales data and local market.

| Persona | What they need | Where the funnel serves them |
|---|---|---|
| First car | Low price, reassurance, financing help | "My first car" path, under-$20k cars, pre-qualification without a credit check, buying guide |
| Family hauler | Space, safety, AWD, 3 rows | "Room for the family" path, SUV/minivan filter, comparison table |
| Daily commuter | Efficiency, low running costs | "An easy commute" path, hybrid filter, payment calculator |

The persona picked on the home page pre-filters inventory and shows a matching message (`inventory.html#first`, `#family`, `#commute`).

## Stage-specific content

- **Top:** SEO buying guide and a downloadable checklist (lead magnet).
- **Middle:** comparison table and vehicle history highlights.
- **Intent:** test drive, live video walkaround (the car equivalent of a product demo), trade-in offer, pre-qualification.
- **Bottom:** clear price breakdown, guarantees, reviews, a time-limited hold, a single main call to action.
- **Retention:** onboarding timeline, service reminders, a referral program and a review request. The same review options are shown for every star rating, since Google's contributed-content policy does not allow merchants to selectively solicit positive reviews ([Google Maps user contributed content policy](https://support.google.com/contributionpolicy/answer/7400114), Rating Manipulation section, checked Oct 13, 2026).

## Tracking and metrics

Every page sets its stage in `<html data-stage="...">`. `assets/funnel.js` then:

- pushes `funnel_view`, `funnel_click` and `funnel_lead_<type>` events to `window.dataLayer`, ready for Google Tag Manager / GA4;
- sends the same events to the Apps Script webhook, which logs them in the **Events** sheet;
- captures `utm_*`, `fbclid` and `gclid` from ad links and stores them with each lead.

Any element with `data-track="name"` is tracked on click automatically.

`buildReport()` runs daily and writes the **Report** sheet:

| Column | Meaning |
|---|---|
| Unique visitors | Distinct visitor IDs that viewed a page in that stage |
| % of top-of-funnel visitors | Stage visitors ÷ Awareness visitors |
| % of previous stage | Stage visitors ÷ previous stage visitors (where prospects stall) |
| Leads / actions captured | Leads of the types that belong to the stage |

Suggested KPIs per stage: Awareness, checklist opt-in rate; Interest, car-page views per visitor and compare usage; Intent, test drives booked and show rate; Conversion, reservations and reservation-to-sale rate; Loyalty, referral leads and review count.

## Payment math

Monthly payment (car page and sticker estimates):

```
M = P × r / (1 − (1 + r)^−n)
P = price − down payment, r = APR ÷ 12 ÷ 100, n = months
```

Worked check: $20,000 car, $2,000 down, 7.9% APR, 60 months → P = 18,000, r = 0.0065833 → M ≈ **$364.11**.

Pre-qualification reverses it to find the largest loan a monthly budget supports:

```
Loan = M × (1 − (1 + r)^−n) / r
```

Worked check: $350/month, 8.9% APR (example rate for "Good"), 60 months → loan ≈ $16,901; plus $2,000 down → max price shown **$18,900** (rounded down to the nearest $100).

APRs in the demo are example rates, labeled as such on the page.

## Automation (apps-script/Code.gs)

| Trigger | What happens |
|---|---|
| Any lead except checklist | Alert email to the dealer, tagged HOT (reserve, test drive, walkaround), ATTENTION (review of 3 stars or less) or NEW |
| Checklist, test drive, trade-in, pre-qualification, reservation, service | Confirmation email to the customer |
| Hourly | Test drive reminder about 24 hours before |
| Hourly, after the dealer sets Status to **Sold** | Welcome email linking to `welcome.html`, then a review request 7 days later |
| Daily, 6am | Funnel report |

## Setup

1. **Backend:** create a Google Sheet, open **Extensions → Apps Script**, paste `apps-script/Code.gs`. Set `ALERT_EMAIL` and `SITE_URL` in `CONFIG`. Run `setup` once and approve the permissions. Deploy as **Web app** (Execute as: Me, Who has access: Anyone) and copy the `/exec` URL. Opening that URL should show `{"ok":true,"service":"car-funnel-webhook"}`.
2. **Front end:** paste the `/exec` URL into `WEBHOOK_URL` in `assets/funnel.js`.
3. **Hosting:** push this folder to GitHub and create a Render **Static Site** from it. Publish directory: `.` (repo root). The site is plain HTML, so there is nothing to build; if Render asks for a build command, copy what you used for your portfolio site.
4. **Test:** go through every stage with your own email and phone, then check the Leads, Events and Report sheets. Set a reservation row's Status to **Sold** and run `sendLoyaltyEmails` to see the welcome email.

## Limits to know

- The webhook is public. For a client, add a shared secret or move intake to GoHighLevel or n8n.
- Test drive times are not checked against a real calendar, so two people can book the same slot.
- Apps Script emails count against the Google account's daily email quota.
- No SMS is sent; the consent wording covers it so it can be added through GoHighLevel or Twilio.
- Reviews are placeholders and the Google review link is a placeholder. Use only real reviews.
