# MakanMates setup

Guest discovery works with the JSON seed before Supabase is configured.
Demo reviews remain in the seed file but do not contribute to community ratings.

1. Create a Supabase project.
2. Run backend/supabase/schema.sql once in its SQL editor.
3. Run backend/supabase/seed.sql to import the 35 places.
4. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to frontend/.env.
   Use a public/publishable key, never a service-role or secret key.
5. Set the Auth Site URL and allowed redirect URL to http://localhost:3000.
6. Enable Google in Supabase Auth and configure its OAuth client using the
   callback URL shown in the dashboard. Email confirmation may be required for signup.
7. Restart the frontend with npm.cmd start from frontend.

The browser uses Supabase Auth and its database API with row-level security.
FastAPI remains available for future server-only integrations.
Test using two accounts: create/edit/delete reviews, save/unsave places, refresh,
sign out, and confirm that each account can modify only its own records.
Mapbox geocodes remain temporary in memory; opening hours and bookings are not invented.

## Included in this increment

Account setup, email/password and Google sign-in, persistent SDK sessions,
profile/cuisine preferences, database places, authenticated reviews and saves,
rating sorting, directions, and shared place links.

## Outstanding

Posts/storage/likes/feed, friends/activity, groups/food plans, search history UI,
recommendations/AI, verified opening hours and open-now filtering.
The searches table is prepared but its UI is not yet implemented.
Live Supabase validation requires project configuration.
This increment does not complete the full requirements document.
