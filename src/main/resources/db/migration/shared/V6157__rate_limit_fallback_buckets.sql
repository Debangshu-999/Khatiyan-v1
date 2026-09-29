-- Rate-limit buckets for when Valkey is down.
--
-- Every limit in the app lives in Valkey, as Bucket4j token buckets. When
-- Valkey could not be reached the API-wide and per-route limits used to switch
-- off entirely (the filter failed open); only OTP sending had a database
-- fallback. This table is that fallback for all of them: the same buckets, the
-- same capacity and refill, read and written only while Valkey is unavailable.
--
-- Not a JPA entity — read and written with plain SQL under a row lock — so
-- ddl-auto: validate never inspects it.
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    bucket_key VARCHAR(300) PRIMARY KEY,
    -- Fractional: a greedy bucket refills continuously, a little every moment.
    tokens DOUBLE PRECISION NOT NULL,
    refilled_at TIMESTAMPTZ NOT NULL,
    -- Once a whole duration has passed unused, the bucket is full again and the
    -- row says nothing a fresh one would not. The sweep deletes past this.
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expires_at
    ON public.rate_limit_buckets (expires_at);
