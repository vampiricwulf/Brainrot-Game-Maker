# Set up your own buzzer server

[← Back to the README](../README.md)

Phone buzzers need a small server where the host and the phones meet. The release downloads come with one, so most
people never need this guide.

Set up your own if:

- your copy says **"Phone buzzers aren't set up in this copy"**,
- you built the app yourself, or
- you'd rather not depend on someone else's server.

The server runs on **Cloudflare Workers, for free**. You don't need a credit card, and game nights stay well within
the free plan's limits.

## What you need

About 10 minutes, a computer with a terminal (on Windows, PowerShell), and:

- a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) 20 or newer (the LTS download is fine)
- this project's files: **Code → Download ZIP** on the GitHub page (then unzip it), or `git clone` it

## Steps

1. **Install the server's tools.** Open a terminal in the project's folder and run:

   ```sh
   cd buzzer
   npm ci
   ```

2. **Log in to Cloudflare.** This opens your browser. Click **Allow**.

   ```sh
   npx wrangler login
   ```

3. **Publish the server.**

   ```sh
   npx wrangler deploy
   ```

   The first time, Cloudflare may ask you to pick a `workers.dev` subdomain (any name you like). When it's done, it
   prints the server's address, like:

   ```
   https://brainrot-buzzer.your-name.workers.dev
   ```

4. **Point the app at it.** In the app, open **⋯ → ⚙ Settings**, paste the address into **Buzzer server**, and press
   **Test**. It should say **✔ The buzzer server is answering**.

That's it. On the ▶ Play screen, the **📱 Phone buzzers** card can now open a room.

The address is saved on this computer. A game exported as a web page keeps the server it was exported with.

## Updating the server

When a new version of the app comes out, get the new files and run `npx wrangler deploy` in the `buzzer` folder again
(and `npm ci` first if it's a fresh download). Avoid doing it in the middle of a game: phones reconnect by themselves,
but a buzz could be lost.

## Let GitHub publish it for you

If you keep your own copy (a fork) of this repository on GitHub, every push to `main` can publish the server. Add two
repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → **Workers & Pages** (on the right-hand side) |
| `CLOUDFLARE_API_TOKEN` | **My Profile → API Tokens → Create Token**, using the **Edit Cloudflare Workers** template |

To build the address into your own releases (so nobody has to paste it), also add a repository **variable**
`BUZZER_URL` with the server's address.

## Troubleshooting

- **Test says "No answer from there".** Check the address: it ends in `.workers.dev` (`https://` is added if you leave
  it out). Make sure the deploy finished without errors. A new address can take a minute or two to start answering.
- **`npx wrangler login` doesn't open a browser** (on a remote machine, say). Run `npx wrangler login --browser=false`
  and open the link it prints.
- **The deploy asks about Durable Objects or a plan.** The free plan is enough.
- **Buzzes stop for the day.** The free plan's daily limits were reached. They reset the next day, and you're never
  charged.

## Pictures and videos sent to phones

Hosts can send pictures and videos to phones on 🤫 cards. By default the server takes files up to 90 MB each, 900 MB
per room, and 4,000 MB in any 24 hours for the whole server. Past that total, hosts copy those to their players instead (📋) until it
frees up.

To change these limits, edit `FILE_MB`, `ROOM_FILES_MB` and `FILES_MB_PER_DAY` in `buzzer/wrangler.jsonc` and deploy
again. `FILES_MB_PER_DAY` set to `0` turns these files off.

Big files are slow for phones on mobile data. **🗜 Make smaller…** on a file's card in 🖼 Media makes a smaller copy
for phones, while the show keeps the original. It's best done in the editor before the show, since it works the
computer hard for a minute or two. Copies made in Chrome, Edge (on Windows or Mac) or the desktop app play on every
phone; ones made in other browsers may not play on some iPhones.

More about how the server works (fair timing, limits, local testing) is in
[`buzzer/README.md`](../buzzer/README.md).
