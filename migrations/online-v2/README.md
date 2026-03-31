# Online V2 (OV2) migrations

Apply SQL files in numeric order (`001`, `002`, …).

**Supabase Realtime:** Room lobby and Board Path clients subscribe to `postgres_changes` on several `public.ov2_*` tables. Those tables must be members of the `supabase_realtime` publication, or clients will stay subscribed without row events until a manual refresh. See `014_ov2_realtime_publication.sql`.
