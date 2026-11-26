# Skryvo for Make

The source of Skryvo's custom app for [Make](https://www.make.com): every component as JSON, ready to load into
Make's app builder. With it, a scenario can draft posts, emails and listings in a brand's voice, design a post's
picture, plan and write articles, schedule approved posts, publish articles to a blog, and start when a post
publishes or fails, an article is ready or a post's results come in.

[Skryvo](https://skryvo.ai) is a hosted AI content platform, a paid service with a 7-day free trial on Hobby and
Pro (https://skryvo.ai/pricing/). Docs: https://skryvo.ai/docs/

The app is public in every Make zone (approved 25 Nov 2026): add it to a scenario by searching for Skryvo, or see
https://www.make.com/en/integrations/skryvo. `SUBMIT.md` records how it was loaded and submitted; changes to the
approved app go through Make's approval of changes.

## Connect

Create an API key in Skryvo under [Settings › API & agents](https://app.skryvo.ai/settings/agents) (`sk_skryvo_…`,
shown once) and paste it into a new Skryvo connection in Make. Make checks it against Skryvo and names the
connection after the account's email. The key acts in the workspace it was made in, with its holder's role.

## A scenario in 60 seconds

1. **Skryvo › Write a post**: Topic `Our new studio opens Saturday`, Platforms LinkedIn. Output:
   ```json
   { "status": "written", "generation_id": "gen_5d1c9a",
     "posts": [{ "platform": "linkedin", "text": "Our new studio opens this Saturday in Leeds. #coffee", "hashtags": ["coffee"] }] }
   ```
2. An approval step of your choice.
3. **Skryvo › Schedule a post**: Text = `posts[1].text`, Channels = your LinkedIn page, Publish at = when.
   Output: `{ "id": "c1a2b3c4d5", "platform": "linkedin", "date": "2026-11-24", "time": "09:00", "status": "scheduled" }`.
4. A second scenario starting with **Skryvo › Watch events** (Post published) gets the post once it is live.

Write a post never publishes. Schedule a post publishes exactly the text it is given, so map only approved text.

## Modules

| Name | Type | Label | What it does |
|---|---|---|---|
| `watchEvents` | Instant trigger | Watch events | Triggers when a post is published or fails, an article is ready or fails, or a post's results come in. |
| `listPosts` | Search | List scheduled posts | Returns scheduled and recent posts with their status. |
| `writePost` | Action | Write a post | Drafts a post per platform in the brand's voice. Schedules nothing. |
| `designPicture` | Action | Design a picture | Designs one picture for a post in the brand's kept look, sized for each platform. Uses image credits. |
| `schedulePost` | Action | Schedule a post | Schedules a post's text to one or more connected social channels. |
| `updatePost` | Action | Update a post | Moves a post that has not gone out to a new time, changes its words, or both. |
| `cancelPost` | Action | Cancel a post | Cancels a scheduled post before it is published. |
| `getArticle` | Action | Get an article | Returns an article's status: writing with its stage, done with its text and checked claims, or failed. |
| `planArticle` | Action | Plan an article | Creates an article plan with a headline, outline, search phrase and questions for you to answer. |
| `writeArticle` | Action | Write an article | Starts writing an article from a plan, using two generations. Use Watch events (Article ready) or Get an article for the result. |
| `publishArticle` | Action | Publish an article | Schedules a finished article to a connected blog, or sends it there now as a draft to review. |
| `searchContent` | Search | Search content | Returns earlier articles, posts, emails, listings or ads, newest first. |
| `writeEmail` | Action | Write an email | Writes subject lines, a preheader, the body and a call to action in the brand's voice. Nothing is sent. |
| `writeListing` | Action | Write a product listing | Writes a title, description and feature bullets for a marketplace from one to ten features. |
| `listBrands` | Search | List brands | Returns the brands this key can use. |
| `listChannels` | Search | List channels | Returns the connected channels and what each one takes. |
| `getBalance` | Action | Get the balance | Returns the generations, image credits and article plans left this month. |
| `makeApiCall` | Universal | Make an API call | Performs an arbitrary authorized API call. |

Dropdowns for brands, channels, blogs, platforms, posts and articles come from six RPCs (`app/rpcs/`); the post and
article pickers open in map mode, so an ID from an earlier module can be mapped instead. The app raises Make's
request timeout to its 300-second limit (`app/common.json`). An article takes about four minutes to write: Write an article
starts it, and Watch events (Article ready) or Get an article picks up the result.

Watch events subscribes its own endpoint in Skryvo when a scenario turns on and removes it when it turns off. Each
event arrives as Skryvo sends it, `{id, type, created, test, data}`, with `created` parsed as a date. The endpoint's
signing secret, which Skryvo returns once when the endpoint is created, is sanitised out of Make's logs.

**Signatures are not checked in Make.** Skryvo signs every delivery (`Skryvo-Signature`), but Make's custom-app docs
offer no supported way to verify a signature in a webhook: the webhook sees only the parsed `body`, with no raw-body
variable, so the exact bytes that were signed are not available. This app therefore does not verify deliveries.
The address Make creates for each webhook is private to its scenario: keep it out of shared screenshots and logs,
and turn the scenario off and on again to get a new one if it leaks.

The long calls (writing posts, designing a picture, planning an article) answer in the same module: Make allows a
request up to 300 seconds and they take about a minute, so this app waits for them rather than using Skryvo's
call-back jobs.

## Errors

Every error reads `[status] message`. A refusal (422) fails the module with Skryvo's own sentence, for example
"[422] That time has passed. Pick a time in the future."; a field that fails validation adds each field's message.
A revoked key (401) fails the connection. A 403 means the key holder's team role does not allow that one call, so
it is a data error and the scenario stays on. More than 60 requests a minute or 1000 an hour for a key is a rate
limit error, which Make can retry, and Make retries server errors (5xx) as connection errors.

## Layout

```
app/app.json                  the app, its connection, webhook, RPCs and modules with their types
app/base.json, common.json    base URL, key header, timeout, error handling, log sanitising
app/connections/skryvo/       api.json (the /me check), parameters.json (the key)
app/webhooks/skryvoEvents/    api.json, parameters.json, attach.json, detach.json
app/rpcs/<name>/              api.json, parameters.json
app/modules/<name>/           api.json, parameters.json (static), expect.json (mappable), interface.json, samples.json
app/groups.json               how modules are grouped in the scenario builder
icon.png                      512 × 512
```

## Develop

```bash
npm test   # checks every module against test/openapi.json, Make's naming rules and the webhook wiring
```

### Load into Make

`scripts/load.mjs` writes `app/` into an existing custom app through Make's API, so a new version loads with one
command instead of the pastes in `SUBMIT.md`. It needs a Make API key with the `sdk-apps:read` and
`sdk-apps:write` scopes, and the app's name as Make shows it (Make adds a suffix, e.g. `skryvo-j39n9s`):

```bash
MAKE_API_KEY=… MAKE_ZONE=us2.make.com npm run load -- skryvo-j39n9s 1          # load, then read back and diff
MAKE_API_KEY=… MAKE_ZONE=us2.make.com npm run load -- skryvo-j39n9s 1 --check  # read back and diff only
```

It sets the app's base, common data and icon; finds or creates the connection and webhook by label (Make names
them, and the script links components to those names, not the ones in `app.json`); creates the RPCs and modules
that are missing; writes every section that differs; switches each module's visibility on; sets the groups; then
reads everything back and exits non-zero on any difference. Running it again changes nothing. It never publishes
the app or requests review, and it cannot change a module's type: delete the module in Make first.

`test/openapi.json` is Skryvo's published API description (`https://api.skryvo.ai/openapi.json`). A test fails when a
module calls a route it lacks, sends a field its request does not have, or leaves out a required one.

Issues: https://github.com/Skryvo/make-skryvo/issues · support@skryvo.ai

## License

MIT © Flutter Studio LLC
