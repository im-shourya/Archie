# Third-party services and open-source notices

Effective 5 October 2026.

## Services a request can reach

| Service | Role | When | Data involved |
|---------|------|------|---------------|
| Google Gemini API | AI provider (first choice) | AI features only | Your command, board and, for interviews, your answers. Free tier: may be used to improve Google's products |
| Groq | AI provider (fallback) | When Gemini is busy or out of quota | The same |
| Anthropic | AI provider (optional) | Only if an operator configures it; not on the public demo | The same |
| Render | Hosting (Singapore) | Every request to the demo | IP address and request metadata, under Render's policy |
| Cloudflare | Network edge in front of Render | Every request to the demo | IP address and request metadata, under Cloudflare's policy |
| Google Fonts | Font files, downloaded once at build time | Never at runtime: fonts are self-hosted | None from visitors |
| Your browser's speech service | Microphone button (optional) | Only when you use it | Your audio, handled by your browser's maker |

Archie has no analytics, advertising, tracking pixels, cookies or other third-party scripts. See the [privacy policy](/legal/privacy) for details.

## Open-source software

Archie is MIT-licensed and stands on these projects. Each is used unmodified, under its own licence.

| Project | Used for | Licence |
|---------|----------|---------|
| Next.js | Web framework | MIT |
| React, React DOM | User interface | MIT |
| React Flow (@xyflow/react) | The canvas | MIT |
| ELK (elkjs) | Automatic graph layout | EPL-2.0 or GPL-3.0-or-later (used under EPL-2.0) |
| Zustand | Board state | MIT |
| Zod | Validation | MIT |
| Hono, @hono/zod-validator | The API | MIT |
| idb | Browser storage | ISC |
| lz-string | Share-link compression | MIT |
| ulid | Ids | MIT |
| Phosphor Icons | Icons | MIT |
| Simple Icons | Brand logos on components named after a product | CC0-1.0 (the brands themselves are trademarks of their owners, shown only to identify the product) |
| Geist, Geist Mono | Type | SIL Open Font License 1.1 |
| IBM Plex Sans | Type in the social preview image | SIL Open Font License 1.1 ([licence file](https://github.com/im-shourya/Archie/blob/main/frontend/assets/fonts/OFL-IBM-Plex.txt)) |
| @google/genai | Gemini client | Apache-2.0 |
| groq-sdk | Groq client | Apache-2.0 |
| @anthropic-ai/sdk | Anthropic client | MIT |

The full dependency tree and exact versions are in [package-lock.json](https://github.com/im-shourya/Archie/blob/main/package-lock.json). ELK's source code is available from the [Eclipse Layout Kernel project](https://github.com/kieler/elkjs).

Archie is built with, and for, [Wispr Flow](https://ref.wisprflow.ai/hhg), a separate product with its own terms. Archie isn't affiliated with or endorsed by any of the companies named on this page.
