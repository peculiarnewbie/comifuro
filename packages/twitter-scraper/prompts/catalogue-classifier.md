Decide if the tweet is advertising or showing a Comifuro catalogue / booth catalogue entry, and extract metadata from both text and images.

Treat it as `true` when the tweet is primarily presenting a catalogue page, catalogue card, booth listing, circle/product line-up for Comifuro, or otherwise clearly part of the Comifuro catalogue flow.

Treat it as `false` when it is only general event chatter, retweets without catalogue context, buying requests, cosplay photos, unrelated merch promotion, or anything ambiguous.

Be conservative. If the text and images together do not clearly indicate catalogue intent, return `false`.

Analyze ANY images provided for additional metadata. Look for:

- Booth numbers visible on signage or catalogue cards
- Fandom/franchise names or characters visible on products or signage
- Item types being sold (common types: print, sticker, pin, acrylic-stand, keychain, zine, apparel, button, clear-file, postcard, bookmark, tapestry, plushie, strap, badge, coaster, magnet — but also identify anything else you see)
- Prices visible on items or signs
- Preorder deadlines or "〆切" dates

For `inferredFandoms`, include only explicit or strongly implied named fandoms / franchises / IPs from the text, hashtags, or images when you are highly confident. Return `[]` when none are clearly present.

For `inferredBoothId`, return a booth code only when it is explicitly present in the text, hashtags, or visible in images and you are highly confident it is the booth code. If it is ambiguous, absent, or there are multiple plausible booth codes, return `null`.

For `inferredItemTypes`, list the broad categories of items you can identify from the text and images (e.g. ["prints", "stickers", "pins"]). Be concise.

For `preorderDeadline`, return the preorder deadline date if visible (e.g. "2025/03/31"). Return `null` if no preorder info is present.

For `items`, list the individual items you can identify. Each item should have:

- `type`: what kind of item (required)
- `price`: the price if visible (optional, e.g. "¥1500")
- `fandom`: which fandom this specific item is for (optional)

Only include items you are confident about from the text or images.

Do not treat generic categories like `original`, `fanart`, `merch`, `doujin`, or `multi-fandom` as fandom names.

Tweet text:
{{tweet_text}}

Matched hashtags:
{{matched_tags}}

Search query:
{{search_query}}

Respond with exactly one JSON object. Use real JSON `null`, not the string `"null"`.

Example with full metadata:
{"isCatalogue":true,"reason":"Booth E-31A advertising Frieren and Dungeon Meshi goods","inferredFandoms":["Frieren","Dungeon Meshi"],"inferredBoothId":"E-31A","inferredItemTypes":["prints","stickers","pins"],"preorderDeadline":"2025/03/31","items":[{"type":"print","price":"¥1500","fandom":"Frieren"},{"type":"sticker-set","price":"¥400","fandom":"Frieren"},{"type":"pin","price":"¥600","fandom":"Dungeon Meshi"}]}

If a bonus field is unknown or absent, leave it empty:
{"isCatalogue":false,"reason":"not a catalogue post","inferredFandoms":[],"inferredBoothId":null,"inferredItemTypes":[],"preorderDeadline":null,"items":[]}
