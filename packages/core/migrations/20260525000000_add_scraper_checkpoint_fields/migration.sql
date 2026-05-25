ALTER TABLE scraper_state ADD COLUMN checkpoint TEXT;
ALTER TABLE scraper_state ADD COLUMN start_tweet_id TEXT;
ALTER TABLE scraper_state ADD COLUMN end_tweet_id TEXT;
