# Privacy policy

Effective 5 October 2026.

Archie is a system-design board you talk to. It is an open-source project maintained by Shourya ("we"), with a free public demo at archie-rb2x.onrender.com. This policy explains what happens to your information when you use that demo. If you run Archie yourself, you are the operator and this policy describes the software, not your deployment.

## The short version

- **There are no accounts, no cookies, no analytics and no tracking.**
- **Your boards stay in your browser.** We never receive them unless you use an AI feature.
- **AI features send your words and your board to an AI provider** (Google Gemini, with Groq as a fallback) to get an answer. On Gemini's free tier, Google may use that content to improve its products.
- **Our server logs contain no commands, no boards and no IP addresses.**

## What stays on your device

| What | Where | How long |
|------|-------|----------|
| Your boards, their change history and your settings | Your browser's IndexedDB storage | Until you delete them, or clear your browser's site data |
| An access code, only if the demo asks for one | Your browser's session storage | Until you close the tab |
| Exported files (JSON, Markdown, Mermaid, SVG, PNG) | Wherever your browser saves downloads | Up to you |

Most of Archie works entirely in your browser: drawing and editing boards, the simulator, simple voice or typed commands such as "kill Redis", sharing links, exports and replay. None of that sends your board to us.

## What reaches our server, and why

Only the AI features talk to our server: commands that the local parser doesn't understand, questions about your design, design review, and interview questions and scoring. For those, your browser sends:

- the words you typed or dictated,
- your current board (its components, connections and workload),
- for interviews, the problem, your answers so far and the interviewer's questions.

Our server passes that content to an AI provider and returns the answer. **We don't store it.** Our request logs record only a request id, the route, the status, timings, which AI model answered, token counts and the number of components on the board. They never contain your words, your board or your IP address.

To keep the free demo from being abused, the server counts requests per visitor. It identifies you by a salted hash of your IP address, kept only in the server's memory (at most the 10,000 most recent visitors, and gone when the server restarts) and never written to disk or logs.

## AI providers

| Provider | When | What they receive | Their terms |
|----------|------|-------------------|-------------|
| Google (Gemini API) | Every AI feature, first choice | The content listed above | [Gemini API terms](https://ai.google.dev/gemini-api/terms), [Google privacy policy](https://policies.google.com/privacy) |
| Groq | When Gemini is busy or out of quota | The same content | [Groq privacy policy](https://groq.com/privacy-policy/) |
| Anthropic | Only if an operator configures it (not on the public demo) | The same content | [Anthropic privacy policy](https://www.anthropic.com/legal/privacy) |

**The public demo uses the free tier of the Gemini API.** On that tier, Google may use the content you send to provide, improve and develop its products, and human reviewers may read it. **Don't put personal, confidential or proprietary information into AI commands, board labels or interview answers.** If you need that, run Archie yourself with a paid key, where the provider's paid terms apply.

## Hosting

The demo runs on Render (in Singapore), behind Cloudflare. Like any website, these infrastructure providers process your IP address and request metadata to deliver the site and protect it from attacks, under their own policies: [Render privacy policy](https://render.com/privacy) and [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/).

## Voice

- **Wispr Flow**, or any dictation tool you use, types into Archie like a keyboard. Archie doesn't receive your audio; that tool's own privacy policy applies.
- **The microphone button** uses your browser's built-in speech recognition. Depending on your browser, the audio may be sent to the browser maker's servers for recognition (Chrome sends it to Google). Archie receives only the resulting text.
- **Spoken interview questions** use your device's built-in text-to-speech, which runs locally.

## Share links

A share link contains a compressed copy of your board after the `#` in the URL. Browsers never send that part to a server, so we never see it. But anyone who has the link can open the board, and services you paste the link into (chat apps, email) can see it too. Share a link only with people who should see the design.

## Children

Archie is not directed at children under 13, and we don't knowingly process their information.

## Your choices and rights

Because we don't keep accounts or store your content, there is usually nothing on our side to access, correct or delete:

- **Delete your boards:** delete them from the home page, or clear this site's data in your browser.
- **Avoid sending anything to AI providers:** use the local features only. Typed or spoken commands the local parser understands, the Add menu, the Inspector and the canvas all work without the AI.
- **Ask us anything:** open an issue on [GitHub](https://github.com/im-shourya/Archie/issues). For anything sensitive, use the private [security advisory form](https://github.com/im-shourya/Archie/security/advisories/new).

If the law where you live (for example the GDPR, or India's Digital Personal Data Protection Act) gives you rights over personal data, contact us the same way and we will help as far as we can. Requests about content held by an AI or hosting provider are best sent to that provider.

## Security

We protect the AI service with rate limits and a daily cap, keep provider keys on the server only, and validate everything the browser sends. See [SECURITY.md](https://github.com/im-shourya/Archie/blob/main/SECURITY.md) for how to report a vulnerability.

## Changes

We'll update this policy when Archie's data handling changes and change the date above. Every version is in the repository's history.
