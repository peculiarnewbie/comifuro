Decide if the tweet is advertising or showing a Comifuro catalogue / booth catalogue entry, and conservatively extract bonus metadata from text only.

Treat it as `true` when the tweet is primarily presenting a catalogue page, catalogue card, booth listing, circle/product line-up for Comifuro, or otherwise clearly part of the Comifuro catalogue flow.

Treat it as `false` when it is only general event chatter, retweets without catalogue context, buying requests, cosplay photos, unrelated merch promotion, or anything ambiguous.

Use only the tweet text, hashtags, and the search query context. Do not use image content and do not assume OCR.

Be conservative. If the text does not clearly indicate catalogue intent, return `false`.

For `inferredFandoms`, include only explicit or strongly implied named fandoms / franchises / IPs from the text or hashtags when you are highly confident. Return `[]` when none are clearly present.

For `inferredBoothId`, return a booth code only when it is explicitly present in the text or hashtags and you are highly confident it is the booth code. If it is ambiguous, absent, or there are multiple plausible booth codes, return `null`.

Do not treat generic categories like `original`, `fanart`, `merch`, `doujin`, or `multi-fandom` as fandom names.

Tweet text:
{{tweet_text}}

Matched hashtags:
{{matched_tags}}

Search query:
{{search_query}}

Respond with exactly one JSON object. Use real JSON `null`, not the string `"null"`.

Example:
{"isCatalogue":true,"reason":"short explanation","inferredFandoms":["Blue Archive"],"inferredBoothId":"A12"}

If a bonus field is unknown or absent, leave it empty:
{"isCatalogue":false,"reason":"not a catalogue post","inferredFandoms":[],"inferredBoothId":null}
