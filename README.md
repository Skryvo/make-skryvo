# Skryvo for Make

The source of Skryvo's custom app for [Make](https://www.make.com): every component as JSON, ready to load into
Make's app builder. With it, a scenario can draft posts, emails and listings in a brand's voice, design a post's
picture, plan and write articles, schedule approved posts, publish articles to a blog, and start when a post
publishes or fails, an article is ready or a post's results come in.

[Skryvo](https://skryvo.ai) is a hosted AI content platform, a paid service with a 7-day free trial on Hobby and
Pro (https://skryvo.ai/pricing/). Docs: https://skryvo.ai/docs/

The app is not yet published in Make; `SUBMIT.md` lists the steps to load and submit it.

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
| `writePost` | Action | Write a post | Drafts a post per platform in the brand's voice. Schedules nothing. |
| `designPicture` | Action | Design a picture | Designs one picture for a post in the brand's kept look, sized for each platform. Uses image credits. |
| `schedulePost` | Action | Schedule a post | Schedules approved text to connected channels. Use it only after the person approved the words. |
| `updatePost` | Action | Update a post | Moves a post that has not gone out to a new time, changes its words, or both. |
| `cancelPost` | Action | Cancel a post | Cancels a scheduled post before it goes out. |
| `listPosts` | Search | List scheduled posts | Returns scheduled and recent posts with their status. |
| `planArticle` | Action | Plan an article | Plans an article for free: headline, outline, search phrase and the questions only the person can answer. |
| `writeArticle` | Action | Write an article | Starts writing a planned article (2 generations). Watch events with Article ready, or Get an article, for the result. |
| `getArticle` | Action | Get an article | Returns an article's status: writing with its stage, done with its text and checked claims, or failed. |
| `publishArticle` | Action | Publish an article | Schedules a finished article to a connected blog, or sends it there now as a draft to review. |
| `writeEmail` | Action | Write an email | Writes subject lines, a preheader, the body and a call to action in the brand's voice. Nothing is sent. |
| `writeListing` | Action | Write a product listing | Writes a title, description and feature bullets for a marketplace from one to ten features. |
| `getBalance` | Action | Get the balance | Returns the generations, image credits and article plans left this month. |
| `listChannels` | Search | List channels | Returns the connected channels and what each one takes. |
| `listBrands` | Search | List brands | Returns the brands this key can use. |
| `searchContent` | Search | Search content | Returns earlier articles, posts, emails, listings or ads, newest first. |
| `watchEvents` | Instant trigger | Watch events | Triggers when a post is published or fails, an article is ready or fails, or a post's results come in. |
| `makeApiCall` | Universal | Make an API call | Performs an authorized call to any route of Skryvo's agent API. |

Dropdowns for brands, channels, blogs and platforms come from four RPCs (`app/rpcs/`). Writing with pictures,
designing a picture and planning an article take Skryvo about a minute, so the app raises Make's request timeout
to its 300-second limit (`app/common.json`). An article takes about four minutes to write: Write an article
starts it, and Watch events (Article ready) or Get an article picks up the result.

Watch events subscribes its own endpoint in Skryvo when a scenario turns on and removes it when it turns off. Each
event arrives as Skryvo sends it: `{id, type, created, test, data}`. Skryvo signs every delivery, but Make hands
the app the parsed body rather than the raw bytes, so this app does not check the signature; the address Make
creates for each webhook is private to the scenario.

## Errors

A refusal fails the module with Skryvo's own sentence, for example "That time has passed. Pick a time in the
future." A revoked key fails the connection. More than 60 requests a minute or 1000 an hour for a key is a rate
limit error, which Make can retry.

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

`test/openapi.json` is Skryvo's published API description (`https://api.skryvo.ai/openapi.json`). A test fails when a
module calls a route it lacks, sends a field its request does not have, or leaves out a required one.

Issues: https://github.com/Skryvo/make-skryvo/issues · support@skryvo.ai

## License

MIT © Flutter Studio LLC
