# Changelog

## 1.0.1 (approved by Make, 25 Nov 2026)

- Make an API call stays on `https://api.skryvo.ai/api/`, takes headers, and merges its query string and headers
  into the base request.
- Errors read `[status] message` for every status; server errors are left to Make's retry; 403 (a team role that
  does not allow the call) is a data error; validation errors list each field's message.
- Dates in Watch events (`created`) and Search content (`created_at`) are parsed.
- Post ID in Update a post and Cancel a post, and Article ID in Publish an article, are picked from a list.
- Keywords is a list in Write a product listing, as in Plan an article.
- Limits are optional with a default of 10; Search content asks Skryvo for its full page of 50.
- Cancel a post outputs nothing. Every action module declares its action; groups start with Events.
- The webhook's signing secret is sanitised out of Make's logs.
- Help texts and descriptions rewritten for the person building the scenario.

## 1.0.0

- Connection with a Skryvo API key, checked against Skryvo and named after the account's email.
- Watch events: post published or failed, article ready or failed, results ready, through a dedicated webhook that
  subscribes and unsubscribes itself.
- Actions: write a post, design a picture, schedule, update and cancel a post, plan, write, get and publish an
  article, write an email, write a product listing, get the balance.
- Searches: list scheduled posts, channels and brands; search content. Make an API call for any other route.
- Deliveries to Watch events are not signature-checked: Make's webhook sees only the parsed body (see README).
