---
name: lead-discovery
description: Find local Sofia businesses with no working website and add qualified ones to the lead-crm CRM (Supabase table `leads`). Use this whenever the user asks to find/search/scrape leads, businesses, shops, or companies for the CRM, mentions "no website" prospects, or references Apify/Google Maps discovery for this project — even if they just say something like "find me electricians" or "get some more leads" without spelling out the full workflow. Covers the Google Maps search, the Facebook fallback check for businesses whose site only appears on their Facebook page, dedup against existing leads, and the review-before-insert flow.
---

# Lead discovery for lead-crm

Runbook for finding real, uncontacted local businesses with no website and adding
them to the CRM at `/home/boris/lead-crm`. Follow it end to end rather than
reinventing the search/filter/insert logic each time — it encodes lessons already
learned the hard way (see "Why the Facebook step exists" below).

Supabase project id: `asrpxtiqpdgbzhjbduaz`. Table `leads` columns: `id`,
`company_name` (required), `owner_first_name`, `owner_last_name`, `email`, `phone`,
`facebook_url`, `linkedin_url`, `instagram_url`, `status` (New/Contacted/In
Progress/Closed-Won/Closed-Lost, defaults New), `industry`, `created_at`,
`updated_at`. Realtime is already on and the dashboard already subscribes to the
table — inserting a row via SQL shows up live with zero app-code changes.

If the Apify or Supabase MCP tools aren't visible yet, load them with `ToolSearch`
(queries `"apify"` / `"select:mcp__f8fbb57a...__execute_sql"` or similar) before
starting.

## Step 1 — Search Google Maps

Actor: `compass/crawler-google-places`, called via `mcp__Apify__call-actor`.

Standing defaults, unless the user overrides them:
- **Location**: Sofia, ~5km radius. Use `customGeolocation: {"type": "Point", "coordinates": [23.3219, 42.6977], "radiusKm": 5}` — note the coordinate order is `[longitude, latitude]`, not the more familiar lat/lon.
- **Industry**: open to anything, but skip categories that structurally can't be pitched a standalone website — government offices, ATMs, transit stops, parking lots, non-profits, corporate chain/franchise locations (the local unit doesn't own that decision). The point of the CRM is businesses that could plausibly say yes to "let us build your site."

Let the actor do the filtering instead of fetching everything and filtering yourself
— it's both cheaper and more accurate:
- `website: "withoutWebsite"` — server-side "no website" filter.
- `skipClosedPlaces: true` — drops permanently/temporarily closed places.
- `includeWebResults: true` — Google sometimes surfaces a business's Facebook page
  directly in its own "web results" for the place. When it does, you can skip the
  WebSearch lookup in Step 2 entirely for that candidate.

Cost control — this is real money per result, so don't over-fetch: cap
`maxCrawledPlacesPerSearch` at **30** by default, only raise it if the user
explicitly asks for more. Also pass `callOptions: {"maxItems": <same cap>,
"maxTotalChargeUsd": 2}` on the `call-actor` call as a platform-level safety net
independent of the actor's own logic.

## Step 2 — Facebook verification (don't skip this)

### Why this step exists
`website: withoutWebsite` looks at the business's Google Maps profile only. A real
case from this project: a photo shop's Maps profile had no website field, so it
passed the filter — but the owner actually links their site from their Facebook
page, which Maps never surfaces. Without this step you'll periodically pitch
"build you a website" to someone who already has one, which is an easy way to look
sloppy. Do this check before showing anything to the user, not after.

### How to check
For each candidate that survived Step 1 and doesn't already have a Facebook URL
from `includeWebResults`:

1. **Find their Facebook page** with a plain native `WebSearch` — e.g. `"<company
   name>" <neighborhood or Sofia> facebook`. This is free. Don't reach for a
   dedicated Apify "Facebook search by name" actor for this part — the ones
   available on the Apify Store for that specific job (`powerai/facebook-page-search-scraper`,
   `powerai/facebook-people-search-scraper`, `scrapio/facebook-groups-search-scraper`)
   all had thin usage and weak or single-review ratings when checked. WebSearch is
   good enough for "does a Facebook page for this business exist, and what's the URL."

2. **Read the page's listed website** with the Apify actor
   `apify/facebook-page-contact-information` (official Apify actor, well-rated,
   cheap — roughly $0.013/result). Input is exactly:
   ```json
   {"pages": ["<facebook page url or id>", "..."], "language": "bg-BG"}
   ```
   Batch every candidate that needs checking into **one** call — the `pages` array
   takes multiple URLs, and one run for five candidates costs the same as one run
   for one candidate plus the flat per-run charge, so batching is strictly cheaper.

3. **Apply the result**:
   - No Facebook page found at all → qualifies. Genuinely no web presence found
     anywhere.
   - Facebook page found, no website listed → qualifies. Clean "no website" lead.
   - Facebook page found, website listed, but it's not really a website the
     business built — → **still qualifies**, don't even bother fetching it to
     check liveness. The test: did the business author this page's content, or
     are they just a listing on someone else's platform? Both count as "not a
     website": `*.business.site` (Google's old auto-generated Business Profile
     mini-site — Google discontinued this in 2024, so most of these now 404
     anyway), a Linktree/social-bio link, any social host, or a third-party
     marketplace/booking-platform redirect (Notino, Booksy, Fresha, Treatwell,
     and similar — these are directory listings the business didn't build, not
     their own site, even though the actor reports them in the `website` field).
     While you're in there, also check the actor's `websites` array — it
     sometimes includes an Instagram profile even when no real website exists;
     grab that for `instagram_url` on insert, it's free extra contact data.
   - Facebook page found, a real (non-placeholder) website listed → fetch that URL
     with native `WebFetch` (free) to see if it's actually alive:
     - Loads and looks like a real, current site → **drop this lead entirely**, it
       doesn't belong on the shortlist. They already have what we'd be pitching.
     - Dead, parked, times out, or obviously abandoned → **keep it**, but label it
       differently on the shortlist ("has an old/broken site") rather than "no
       site" — it's a different pitch (rebuild vs. build-from-scratch), and the
       user should know which one they're looking at.

Whenever a Facebook page turns up for a lead, record its URL in `facebook_url` at
insert time regardless of how the website check came out — it's a live contact
channel either way, and the dashboard already renders a proper Facebook icon for
it.

## Step 3 — Dedup against existing leads

Batch every surviving candidate into one query before showing the shortlist. Match
on lowercase/trimmed company name OR last-9-digits phone match — the digit-suffix
comparison absorbs Bulgarian phone formatting differences (`+359888123456` vs
`0888 123 456` vs `088-123-456` all match on `888123456`):

```sql
with candidates(company_name, phone) as (
  values ('Name 1', 'Phone 1'), ('Name 2', 'Phone 2')
)
select c.company_name, l.id, l.company_name as existing_match
from candidates c
left join leads l
  on lower(trim(l.company_name)) = lower(trim(c.company_name))
  or (c.phone <> '' and right(regexp_replace(l.phone, '\D', '', 'g'), 9)
                       = right(regexp_replace(c.phone, '\D', '', 'g'), 9));
```

Run this via the Supabase `execute_sql` tool against project
`asrpxtiqpdgbzhjbduaz`. Annotate matches on the shortlist rather than silently
dropping them — let the user make the final call.

## Step 4 — Show the shortlist, wait for approval

Never insert without asking first. Present each candidate with: company, industry,
phone, Facebook URL if found, site status ("no site" / "has old/broken site"), and
dupe flag if any. The user may approve only some of the list — that's normal, don't
treat a partial approval as a rejection of the rest, and don't assume silence on an
item means yes.

## Step 5 — Insert approved rows

One multi-row `INSERT` via the Supabase `execute_sql` tool, dollar-quoted
(`$$...$$`) rather than escaped single quotes — `execute_sql` takes a raw SQL
string with no bind-parameter support, and scraped business names sometimes
contain apostrophes:

```sql
insert into leads (company_name, phone, facebook_url, industry)
values
  ($$Name$$, $$Phone$$, $$https://facebook.com/...$$, $$Industry$$),
  ($$Name 2$$, $$Phone 2$$, null, $$Industry 2$$);
```

Leave `id`, `status`, `created_at`, `updated_at` unset — table defaults handle
them. Realtime pushes the new rows into the live dashboard automatically; no app
code is involved in this whole flow.

## Field-mapping expectations

`owner_first_name`, `owner_last_name`, and `email` will almost always come back
empty from this pipeline, and that's expected, not a bug worth investigating:
Google Business Profiles don't carry an owner name field at all, and this actor's
email-enrichment add-ons work by crawling the business's own website — which, for
every lead that qualifies here, by definition doesn't exist.

## Scope

This is a chat-driven workflow, not an app feature — there's no "Discover Leads"
button and there shouldn't be one unless the user explicitly asks for it. Running
this skill means calling MCP tools in conversation, not writing or editing files in
`/home/boris/lead-crm`.
