# Loading and submitting Skryvo's Make app

These steps load `app/` into Make's web app builder on the Make organisation (us2.make.com), test it, and ask
Make to review it for its public app list. Every value to paste is a file in this repository; paste each file's
whole content into the tab named.

Once the app exists (step 1.1–1.2), `scripts/load.mjs` does steps 1.3 to 5 and the module visibility of step 7.2
through Make's API (README › Load into Make); steps 6 and 7 stay in Make's web app.

## 1. Create the app

1. Sign in at https://us2.make.com with the Skryvo organisation and open **Custom apps** (left menu), then
   **Create a new app**.
2. Name `skryvo`, Label `Skryvo`, Description from `app/app.json`, Theme `#2563EB`, Language English, Audience
   Global. Save.
3. Upload `icon.png` (512 × 512) as the app's icon.
4. **Base** tab: paste `app/base.json`. **Common data**: paste `app/common.json` (it holds only the 300-second
   timeout, no secret). Save both.

## 2. Connection

**Connections › Create a new connection**: Label `Skryvo`, Type **Basic connection**.
- Communication: `app/connections/skryvo/api.json`
- Parameters: `app/connections/skryvo/parameters.json`

## 3. Webhook

**Webhooks › Create a new webhook**: Label `Skryvo events`, Type **Dedicated**, Connection `Skryvo`.
- Communication: `app/webhooks/skryvoEvents/api.json`
- Parameters: `app/webhooks/skryvoEvents/parameters.json`
- Attach: `app/webhooks/skryvoEvents/attach.json`
- Detach: `app/webhooks/skryvoEvents/detach.json`

## 4. RPCs

**Remote procedures › Create a new RPC**, each with Connection `Skryvo`; paste `app/rpcs/<name>/api.json` as
Communication and `parameters.json` as Parameters:
   - `listBrands`, label "List brands"
   - `listSocialChannels`, label "List social channels"
   - `listBlogs`, label "List blogs"
   - `listPlatforms`, label "List platforms"

## 5. Modules

**Modules › Create a new module** for each row, in this order. Name, Label and Description are in `app/app.json`.
Then paste, from `app/modules/<name>/`: Communication `api.json` (the instant trigger has none), Static parameters
`parameters.json`, Mappable parameters `expect.json`, Interface `interface.json`, Samples `samples.json`.

| # | Name | Type | Label | Link |
|---|---|---|---|---|
| 1 | `writePost` | Action | Write a post | connection Skryvo |
| 2 | `designPicture` | Action | Design a picture | connection Skryvo |
| 3 | `schedulePost` | Action | Schedule a post | connection Skryvo |
| 4 | `updatePost` | Action | Update a post | connection Skryvo |
| 5 | `cancelPost` | Action | Cancel a post | connection Skryvo |
| 6 | `listPosts` | Search | List scheduled posts | connection Skryvo |
| 7 | `planArticle` | Action | Plan an article | connection Skryvo |
| 8 | `writeArticle` | Action | Write an article | connection Skryvo |
| 9 | `getArticle` | Action | Get an article | connection Skryvo |
| 10 | `publishArticle` | Action | Publish an article | connection Skryvo |
| 11 | `writeEmail` | Action | Write an email | connection Skryvo |
| 12 | `writeListing` | Action | Write a product listing | connection Skryvo |
| 13 | `getBalance` | Action | Get the balance | connection Skryvo |
| 14 | `listChannels` | Search | List channels | connection Skryvo |
| 15 | `listBrands` | Search | List brands | connection Skryvo |
| 16 | `searchContent` | Search | Search content | connection Skryvo |
| 17 | `watchEvents` | Instant trigger | Watch events | webhook Skryvo events |
| 18 | `makeApiCall` | Universal | Make an API call | connection Skryvo |

Then **Modules › Groups**: paste `app/groups.json`.

## 6. Test

Production must serve the webhook routes (`/api/v1/agent/webhooks`) before Watch events can attach.

1. In a scenario, add **Skryvo › Get the balance** and create a connection with a Skryvo key. A wrong key must
   fail the connection.
2. Run each module at least once in its own scenario, and one scenario that fails (for example Schedule a post
   with a past time, which Skryvo refuses with its own sentence). Use the review account, never real customers'
   data, and only the Telegram test channel for anything that schedules.
3. For Watch events: turn the scenario on, then `POST /webhooks/{id}/test` from the Skryvo CLI
   (`skryvo webhooks test <id>`) and check that each subscribed event arrives; turn it off and check the endpoint is
   gone from `skryvo webhooks list`.

## 7. Request review

1. Delete any components made only for testing: published components cannot be deleted.
2. Click **Publish** (this creates an invite link), and switch on visibility for every module.
3. **Review** tab: API documentation `https://skryvo.ai/docs/`, plus the links to the test scenarios from step 6.
   Click **Request review**.
4. Make then emails a form: developer and support contacts, partner contact, categories (Marketing, Content
   creation), logo, website `https://skryvo.ai`, a trademark statement and the terms-and-indemnity statement. These
   are the owner's to fill and accept.

Make runs an automatic check first, then a person reviews it, and an approved app joins a planned release.
