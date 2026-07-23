# CreatorSuite

Full-stack personal-use creator dashboard with AI scripts, subtitles, thumbnails, storyboards, and a working Podcast Episode Manager + RSS Publisher.

## Run

```bash
npm start
```

Open `http://localhost:4173`.

## What Is Included

- `frontend/` - responsive CreatorTools workspace matching the provided dashboard/tool mockups.
- `backend/` - Node HTTP API with JSON persistence in `backend/data/store.json`.
- Single-creator dashboard with usage, projects, jobs, media, exports, notifications, activity, and settings.
- Five BRD modules:
  - AI Script Writer: structured hooks, timed scenes, captions, descriptions, hashtags, CTA, rewrite-ready output.
  - Subtitle Studio: transcription simulation, editable time-coded segments, lock controls, SRT/VTT/TXT exports.
- Podcast Manager: podcast setup, audio upload, drafts, publish/schedule/unpublish/archive/delete, RSS validation, public podcast pages, AI metadata, Groq transcription, local or S3-compatible object storage.
  - Thumbnail Studio: headline suggestions, stock-search terms, editable canvas JSON, export warnings.
  - Storyboard Builder: concepts, consistency controls, timed scenes, locked-scene regeneration, shot-list/voice-over exports.
- Personal controls: provider health/fallbacks, storage cleanup, retention settings, audit activity.

## Useful Routes

- App: `http://localhost:4173`
- Dashboard API: `GET /api/dashboard`
- Projects: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`
- Media: `GET/POST /api/media`
- Jobs: `GET /api/jobs`, `POST /api/jobs/:id/retry`
- Exports: `GET/POST /api/exports`, `GET /api/exports/:id`
- Podcast API: `GET /api/podcasts`, `POST /api/podcasts`, `PATCH /api/podcasts/:id`
- Episodes: `POST /api/podcasts/:podcastId/episodes`, `GET /api/podcasts/:podcastId/episodes`, `POST /api/episodes/:episodeId/publish`
- RSS: `GET /rss/:podcastSlug.xml`
- Public podcast page: `GET /podcast/:podcastSlug`
- Public episode page: `GET /podcast/:podcastSlug/:episodeSlug`
- Settings: `GET/PATCH /api/settings`

## Render + Spotify Setup

Spotify cannot read `localhost`. Deploy the app to Render and set:

```bash
APP_URL=https://your-app-name.onrender.com
AUTH_SECRET=generate_a_long_random_secret
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
```

Users sign up or log in with email and password. Each email gets one isolated creator workspace and one podcast channel.

After deployment, create your podcast and publish at least one episode. Submit this public RSS URL to Spotify for Creators:

```text
https://your-app-name.onrender.com/rss/your-podcast-slug.xml
```

## Quick Test Without Object Storage

For a short Spotify test, put files in the static frontend folder:

```text
frontend/podcast/my-first-ai-podcast.mp3
frontend/podcast/tech-with-priyanshu-cover.jpg
```

Then use these URLs in your podcast/episode details:

```text
https://your-app-name.onrender.com/podcast/my-first-ai-podcast.mp3
https://your-app-name.onrender.com/podcast/tech-with-priyanshu-cover.jpg
```

The server serves real static files before public podcast routes, so `/podcast/file.mp3` and `/podcast/:slug` both work.

## Backblaze B2 Storage

For future dashboard uploads, configure a public Backblaze B2 bucket with S3-compatible credentials:

```bash
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_BUCKET_NAME=creator-podcast
B2_KEY_ID=your_key_id
B2_APP_KEY=your_application_key
B2_PUBLIC_BASE_URL=https://f005.backblazeb2.com/file/creator-podcast
```

Uploaded episode audio will be stored under `podcasts/...`, and the RSS enclosure URL will use the public B2 URL.

## Validation

```bash
npm run build
```

This parses the backend JavaScript and confirms the required frontend/backend files exist.

# creatortools
