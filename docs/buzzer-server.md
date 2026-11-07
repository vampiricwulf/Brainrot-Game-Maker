# Set up your own buzzer server

[← Back to the README](../README.md)

Phone buzzers need a small server where the host and the phones meet. The release downloads come with one, so most
people never need this. Set up your own if your copy says **"Phone buzzers aren't set up in this copy"**, if you built
the app yourself, or if you'd rather not depend on someone else's. It runs on **Cloudflare Workers, free**: no credit
card, and it stays well within the free plan's limits for game nights.

You need about 10 minutes, a computer with a terminal (Windows: PowerShell), and:

- a free **[Cloudflare account](https://dash.cloudflare.com/sign-up)**;
- **[Node.js](https://nodejs.org/)** 20 or newer (the LTS download is fine);
- this project's files: **Code → Download ZIP** on the GitHub page (then unzip it), or `git clone` it.

**1. Install the server's tools.** Open a terminal in the project's folder, then:

```sh
cd buzzer
npm ci
```

**2. Log in to Cloudflare.** This opens your browser; click **Allow**.

```sh
npx wrangler login
```

**3. Publish the server.**

```sh
npx wrangler deploy
```

The first time, Cloudflare may ask you to pick a `workers.dev` subdomain (any name you like, once per account). When
it's done it prints the server's address, like:

```
https://brainrot-buzzer.your-name.workers.dev
```

**4. Point the app at it.** In the app, open **⋯ → ⚙ Settings**, paste that address into **Buzzer server**, and press
**Test**: it should say **✔ The buzzer server is answering**. That's it: on the ▶ Play screen, the **📱 Phone
buzzers** card can now open a room. (The address is kept on this computer; one typed without its `https://`, as
Cloudflare's dashboard shows it, gets it. A game exported as a web page keeps the server it was exported with.)

**Updating it.** When a new version of the app comes out, get the new files and run `npx wrangler deploy` in `buzzer`
again (step 1's `npm ci` too if it's a fresh download), ideally not in the middle of a game: phones reconnect by
themselves, but a buzz in flight could be lost. Older and newer copies of the app keep working with it.

**Or let GitHub do it.** If you keep your own copy (a fork) of this repository on GitHub, every push to `main` can
publish the server for you: add two repository secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID`: in the Cloudflare dashboard, **Workers & Pages** (on the right-hand side).
- `CLOUDFLARE_API_TOKEN`: **My Profile → API Tokens → Create Token**, with the **Edit Cloudflare Workers** template.

To build the address into your own releases too (so nobody has to paste it), add a repository **variable**
`BUZZER_URL` with the server's address.

**If something's wrong:**

- **Test says "No answer from there"**: check the address (it starts with `https://` and ends in `.workers.dev`),
  and that the deploy finished without errors. A new `workers.dev` address can take a minute or two to start answering.
- **`npx wrangler login` doesn't open a browser** (on a remote machine, say): run `npx wrangler login --browser=false`
  and open the link it prints.
- **The deploy asks about Durable Objects or a plan**: the free plan is enough; this server uses the kind of Durable
  Objects the free plan includes.
- If the free plan's daily limits are ever reached, new buzzes stop until the next day's reset. It never charges you.
- **Card files** (the pictures and videos hosts send to phones on 🤫 cards) are 90 MB each at most and 900 MB a room by
  default, just under what Cloudflare's free plan allows, and count against a budget for the whole server, 4,000 MB in
  any 24 hours by default; past it, hosts copy those to their players (📋) until it frees up again. Change them with
  `FILE_MB`, `ROOM_FILES_MB` and `FILES_MB_PER_DAY` in `buzzer/wrangler.jsonc` (`FILES_MB_PER_DAY` `0` turns card files
  off), then deploy again: the app asks the server, so it follows on its own, and ⚙ Settings › Buzzer server › Test says
  what it takes. A file over 16 MB that the server takes still goes, with a note in the editor and the host panel that
  phones on mobile data may wait a while for it. A big GIF, video or sound can go as a smaller copy instead: **🗜 Make
  smaller…** on its card in 🖼 Media (or 🗜 in the 📱 preview or the checklist) makes one, which phones get while the
  show keeps the file as it is (Ctrl+Z takes it back): a GIF as a small looping video that phones show like the GIF, a
  video at 720p, 480p or 360p, a sound made again, and a video or sound can hold only the part its cards play. 🖼
  Media's **🗜 2 files are big for phones** makes copies of all of them at once. A .mov or MKV that plays here but phones
  can't open is repackaged for them with **↻** instead (in its place, for the show too, nothing lost; Ctrl+Z undoes it),
  and a video or sound phones can't play that can't be repackaged (a FLAC, say) can get a copy they can (🗜). During the
  game too: the host panel's line about a card's big files, the pre-game ✅ Before you start card's and the host column's have
  **🗜 Make smaller**, for the game being played (the editor's game keeps the copy as well; a card already out switches
  over to it). In one window its window names no file and shows no preview, and mid-game it opens in the host panel,
  never over the stage. A copy that still comes out too big for the server (an encoder can go over on a busy picture)
  says so, and 🗜 again offers only copies smaller than it (a smaller picture, or only the part the cards play), their
  sizes as far over; where none can be (a GIF's, or a sound's its cards play all of), it says to add the file from a
  link. It works the computer hard for a minute or two, so the stream may stutter: it's best done in the editor before
  the show. It needs the app opened from a file or an https:// address, in Chrome, Edge, Firefox or the desktop app;
  where the browser makes H.264 and AAC (Chrome and Edge on Windows or Mac, the desktop app) it makes MP4 and M4A files
  every phone plays, elsewhere WebM and OGG (Opus), which some iPhones may not play.
  See [buzzer/README.md](buzzer/README.md#card-files). Each room keeps
  its cards only until the tile closes (or the round ends, or the host takes it back, for one sent with 🤫 Send a card…),
  and their files up to 10 minutes longer (20 hours after their upload began at most: the app puts one up again if a
  card still needs it).

More about how the server works (fair timing, limits, local testing) is in [`buzzer/README.md`](buzzer/README.md).
