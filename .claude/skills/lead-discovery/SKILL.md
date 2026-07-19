---
name: lead-discovery
description: Find local Sofia businesses and add qualified ones to the lead-crm CRM (Supabase table `leads`) under one of two service lines — "no website" leads (Step-by-step section below) or "AI chatbot" leads for medium businesses that already have a site (separate section). Use this whenever the user asks to find/search/scrape leads, businesses, shops, or companies for the CRM, mentions "no website" or "chatbot" prospects, or references Apify/Google Maps discovery for this project — even if they just say something like "find me electricians" or "get some more leads" without spelling out the full workflow or which service line they mean (ask, or infer from context — recent conversation usually makes it clear). Covers the Google Maps search, the Facebook fallback check for businesses whose site only appears on their Facebook page, dedup against existing leads, and the review-before-insert flow.
---

# Lead discovery for lead-crm

Runbook for finding real, uncontacted local businesses and adding them to the CRM
at `/home/boris/lead-crm`, under one of two service lines the user sells. Follow
it end to end rather than reinventing the search/filter/insert logic each time —
it encodes lessons already learned the hard way (see "Why the Facebook step
exists" below).

**Two service lines, one table, distinguished by `service_type`:**
- `website` — businesses with no web presence at all. Pitch: build them a site.
  Full workflow below ("No-website leads").
- `ai_chatbot` — medium-sized businesses that already have a working website.
  Pitch: add an AI chatbot to it. Different qualifying criteria — see "AI chatbot
  leads" section further down. This is the newer, less-commonly-offered service,
  and the user wants it prioritized: it's the default tab in the dashboard.

Ask which line the user means if a request is ambiguous ("find me electricians"
could go either way) rather than guessing — the two lines search for opposite
things (no site vs. has a site) and inserting into the wrong one pollutes both.

Supabase project id: `asrpxtiqpdgbzhjbduaz`. Table `leads` columns: `id`,
`company_name` (required), `owner_first_name`, `owner_last_name`, `email`, `phone`,
`facebook_url`, `linkedin_url`, `instagram_url`, `website_url`, `status`
(New/Contacted/In Progress/Closed-Won/Closed-Lost, defaults New), `industry`,
`location`, `notes`, `service_type` (`website` default / `ai_chatbot`),
`created_at`, `updated_at`. Realtime is already on and the dashboard already
subscribes to the table — inserting a row via SQL shows up live with zero
app-code changes. The dashboard shows the two service lines as separate tabs,
filtering client-side on `service_type`, and `notes` is editable straight in the
UI (mobile card + desktop table), so treat what you write there as a starting
point the user will refine, not the final word.

**Always write `notes` for every lead you insert** — 3-4 sentences the user can
glance at right before dialing, not a data dump. Cover: what the business
actually does day to day (not just the category label), one concrete reason
they're a good prospect (established — cite the review count/rating if strong;
or a specific gap — no chat widget despite a busy real-estate site, etc.), and
anything that shapes the opening line of the call — a name to ask for if you
found one, the neighborhood if it's relevant small talk, or a detail from their
reviews/site worth mentioning to prove this isn't a generic script. Skip
anything you're not confident about rather than padding — a shorter accurate
note beats a longer speculative one.

`location` holds a short "neighborhood, city" string (e.g. `"ж.к. Връбница 1,
София"`) — take it straight from the Google Maps actor's `neighborhood` field in
Step 1 (fall back to just the city if `neighborhood` is empty). The user wants to
see at a glance where each lead is without opening a map.

If the Apify or Supabase MCP tools aren't visible yet, load them with `ToolSearch`
(queries `"apify"` / `"select:mcp__f8fbb57a...__execute_sql"` or similar) before
starting.

## No-website leads (`service_type = 'website'`)

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

0. **If Claude in Chrome is connected and logged into Facebook, use it instead of
   WebSearch — it's strictly more reliable.** Navigate to
   `https://www.facebook.com/search/pages/?q=<exact phone number, digits only>`
   and read the results. A phone number is the highest-confidence query you can
   run: it's unique, so a clean "We didn't find any results" is a real negative,
   not just a miss. Name-based queries (`?q=<business name>`) stay risky even
   logged in — common salon names (Gabi, Sharmant, Avangard, Cveti) return
   same-named businesses in Pleven or Lyulin as readily as the one you want, with
   nothing to disambiguate them. **A lead with no phone number on its Google Maps
   listing structurally can't reach this confidence tier** — you're stuck with a
   name search and its collision risk, so if the user wants zero-uncertainty
   results, that kind of lead is the one to cut, not to guess on. Not logged in,
   or Claude in Chrome unavailable? Fall back to step 1.

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

2. **Check booking-platform directories directly — don't rely on keyword search
   for this.** WebFetch gets blocked by studio24.bg (403, anti-bot), but
   `mcp__Apify__apify--rag-web-browser` (a full browser under the hood) reads it
   fine. Better still, don't search by business name at all — fetch the
   platform's own per-neighborhood directory listing page and read every name on
   it yourself:
   `https://studio24.bg/en/beauty-salons-in-<neighborhood-slug>-sofia-k<id>`
   (grab the exact slug/id from the neighborhood picker on any studio24 page —
   they're not guessable). One fetch covers every candidate in that
   neighborhood at once, which is usually several of them, and it's a direct
   factual read of the real listing instead of a hope that Google indexed the
   right page. This is far more reliable than a name-based `WebSearch`, which
   keeps surfacing same-named businesses in other cities (there are multiple
   "Шармант," "Avangard," and "Cveti"-named salons across Bulgaria — a generic
   search can't tell them apart, a neighborhood directory listing can).

3. **Read the Facebook page's listed website** with the Apify actor
   `apify/facebook-page-contact-information` (official Apify actor, well-rated,
   cheap — roughly $0.013/result). Input is exactly:
   ```json
   {"pages": ["<facebook page url or id>", "..."], "language": "bg-BG"}
   ```
   Batch every candidate that needs checking into **one** call — the `pages` array
   takes multiple URLs, and one run for five candidates costs the same as one run
   for one candidate plus the flat per-run charge, so batching is strictly cheaper.

4. **Apply the result**:
   - Not found on the neighborhood directory AND `WebSearch` found nothing →
     qualifies, but label it on the shortlist as "no Facebook/platform presence
     found (unconfirmed)" rather than a clean "no website" — not finding it isn't
     the same as it not existing, especially for Facebook specifically (Google
     doesn't index Facebook's own content well; if the user has Facebook access
     themselves, their logged-in search sees things anonymous tools can't).
   - Found on a booking-platform directory (studio24, Notino, Booksy, Fresha,
     Treatwell, or similar) → **drop this lead**. Same disqualifying reasoning as
     the "website listed on Facebook" case below — jump straight there instead
     of also running the Facebook check for this candidate.
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

While you're reading the Facebook page's data either way — via the actor or via a
logged-in Claude in Chrome contact-info page — also grab whatever else is sitting
right there for free: an Instagram profile from the actor's `websites` array, and
an email from the page's "Contact info" section. Neither changes the
qualification call above, but both go straight into `instagram_url` / `email` on
insert instead of being left blank when they were sitting in plain view.

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

Never insert without asking first. Present each candidate with: company, industry, location,
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
insert into leads (company_name, phone, facebook_url, industry, location, notes)
values
  ($$Name$$, $$Phone$$, $$https://facebook.com/...$$, $$Industry$$, $$Neighborhood, Sofia$$, $$3-4 sentence talking points$$),
  ($$Name 2$$, $$Phone 2$$, null, $$Industry 2$$, $$Neighborhood 2, Sofia$$, $$3-4 sentence talking points$$);
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

## AI chatbot leads (`service_type = 'ai_chatbot'`)

Same tools, opposite target: medium-sized businesses that already run a website
and don't yet have a chat widget on it. Pitch is "add an AI chatbot," not "build
you a site," so everything about qualifying a lead flips accordingly.

**Search**: same Google Maps defaults as above (Sofia, 5km radius,
`skipClosedPlaces: true`), but flip the website filter to `website: "withWebsite"`.
Skip the whole Facebook-verification block (Step 2 above) — it exists purely to
catch businesses with a *hidden* website, which is moot once you're already
selecting for "has one."

**"Medium business" proxy signals** — Google Maps has no employee-count field, so
lean on what's there: a meaningfully higher review count than the no-website
line's bar (50+ is a reasonable floor, hundreds is better), a `$$`–`$$$` price
level, and established categories (clinics, agencies, multi-service retail). A
single-location franchise outlet is fine here unlike the no-website line — you're
not asking them to greenlight a whole new site, just add a widget to the one
that exists, which a local manager can often decide alone.

**The qualifying check — does the site already have a chatbot?** Fetch the
business's website with `WebFetch` (free) and ask it specifically to look for
chat-widget `<script>` tags in the page source, not just describe the page —
these load via script references that survive HTML→markdown conversion even
without executing JS: Intercom (`widget.intercom.io`, `intercomSettings`), Drift
(`js.driftt.com`), Tidio (`code.tidio.co`), Crisp (`client.crisp.chat`), Tawk.to
(`embed.tawk.to`), HubSpot (`js.hs-scripts.com`), Zendesk (`static.zdassets.com`),
or a Facebook Messenger plugin (`connect.facebook.net` + `fb-customerchat`). Any
of these present → drop the lead, they already have what you'd be pitching. A
bare WhatsApp click-to-chat link does **not** disqualify — it's a contact
shortcut a visitor has to already know to look for, not an actual chatbot, and a
business relying on just that is a good prospect for a real one.

**Dedup, shortlist, insert** — same mechanics as the no-website line. `INSERT`
must set `service_type` explicitly since it doesn't default the way `website`
leads do:
```sql
insert into leads (company_name, phone, industry, location, service_type, website_url, notes)
values ($$Name$$, $$Phone$$, $$Industry$$, $$Neighborhood, Sofia$$, $$ai_chatbot$$, $$https://...$$, $$3-4 sentence talking points$$);
```

## Scope

This is a chat-driven workflow, not an app feature — there's no "Discover Leads"
button and there shouldn't be one unless the user explicitly asks for it. Running
this skill means calling MCP tools in conversation, not writing or editing files in
`/home/boris/lead-crm`. (The dashboard's two tabs are a display filter on
`service_type`, already shipped — that's a UI concern, not part of this runbook.)
