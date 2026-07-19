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
   name>" <neighborhood or Sofia> facebook`, or better, the exact phone number in
   quotes if the name is generic (`"Salon"`, `"Avangard"` — common Bulgarian salon
   names collide across many cities; a phone number doesn't). This is free, but be
   honest about its real hit rate: it works well for distinctive names, and fails
   often for small local businesses — Facebook's own content mostly isn't indexed
   by Google, so a miss here does not mean no page exists, only that this method
   didn't find it. **Don't reach for a dedicated Apify "Facebook search by name"
   actor as a fallback** — `powerai/facebook-page-search-scraper` was tested live
   against a business with a confirmed real Facebook page (found by the user
   manually) and returned zero results, matching its thin usage and weak rating
   on the Store. It isn't a fallback worth paying for.

   When a search comes back empty, say so plainly to the user as "couldn't
   confirm either way" rather than silently reporting the lead as a clean
   "no website" — those are different confidence levels, and conflating them
   erodes trust once the user finds a page you missed. If the user has Facebook
   access themselves (logged-in search surfaces things anonymous tools can't),
   they may be able to check faster than any scraper can.

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
   - `WebSearch` found nothing → qualifies, but label it on the shortlist as
     "no Facebook found (unconfirmed)" rather than a clean "no website" — the
     search missing it isn't the same as it not existing.
   - Facebook page found, no website listed → qualifies. Clean "no website" lead.
   - Facebook page found, only a `*.business.site` link listed → **still
     qualifies**, don't bother fetching it. This is Google's old auto-generated
     Business Profile mini-site (discontinued in 2024, most now 404 anyway) — the
     owner never touched it, it takes zero effort to have one, and it proves
     nothing about their actual digital presence.
   - Facebook page found, a booking/marketplace platform listed — studio24,
     Notino, Booksy, Fresha, Treatwell, or similar — → **drop this lead**, same as
     a real website, don't bother checking liveness. The reasoning here isn't
     "this counts as a website" (it doesn't — the platform built the profile, not
     the business, same as business.site). It's that choosing a free/cheap
     platform tool over paying a developer is itself the disqualifying signal:
     this business has already shown it's not willing to pay for custom web
     development, which is exactly what we'd be selling. A business with zero
     presence anywhere is a better prospect than one that solved the problem
     cheaply on its own. Apply the same read to any other free/cheap DIY option
     you encounter (Wix/Squarespace/Google Sites free tiers, etc.) — the test is
     "did they choose a paid-developer-free path," not "does a URL exist."
   - Facebook page found, a real custom website listed → fetch that URL with
     native `WebFetch` (free) to see if it's actually alive:
     - Loads and looks like a real, current site → **drop this lead entirely**, it
       doesn't belong on the shortlist. They already have what we'd be pitching.
     - Dead, parked, times out, or obviously abandoned → **keep it**, but label it
       differently on the shortlist ("has an old/broken site") rather than "no
       site" — it's a different pitch (rebuild vs. build-from-scratch), and the
       user should know which one they're looking at.

While you're reading the Facebook page's data either way, also check the actor's
`websites` array for an Instagram profile — it sometimes lists one even when no
real website exists. Grab that for `instagram_url` on insert; it's free extra
contact data and doesn't change the qualification call above.

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
