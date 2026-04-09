Decide if the tweet is advertising or showing a Comifuro catalogue / booth catalogue entry.

Treat it as `true` when the tweet is primarily presenting a catalogue page, catalogue card, booth listing, circle/product line-up for Comifuro, or otherwise clearly part of the Comifuro catalogue flow.

Treat it as `false` when it is only general event chatter, retweets without catalogue context, buying requests, cosplay photos, unrelated merch promotion, or anything ambiguous.

Use the tweet text, hashtags, and the search query context. Be conservative. If the text does not clearly indicate catalogue intent, return `false`.

Tweet text:
{{tweet_text}}

Matched hashtags:
{{matched_tags}}

Search query:
{{search_query}}

Respond with JSON only:
{"isCatalogue":true|false,"confidence":"low|medium|high","reason":"short explanation"}
