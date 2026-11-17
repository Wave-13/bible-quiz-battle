# Bible Quiz Battle — Dami vs Betty

A standalone, real-time multiplayer Bible quiz game. Two players join the
same room with a 4-letter code, get the same 10 Bible questions at the same
moment, and the fastest correct answer wins more points.

- **Questions:** Bible only, drawn at random from the validated 200-question
  bank in `questions_bank.json` (copied from `~/workspace/Exodus/questions_bank.json`).
  Every question carries its scripture reference, shown at the reveal.
- **Battle:** 10 questions, 15 seconds each, about 3 minutes total.
- **Scoring (timed by the server, so no phone clock can cheat):**
  correct = 100 points + up to 100 speed bonus (faster = more);
  wrong or too slow = 0.
- **Flow:** create a room → share the link/code → friend joins →
  host starts → live VS scoreboard → reveal after each question →
  winner screen with a round-by-round breakdown → rematch.
- **Look:** parchment and gold, matching the Bible Quiz, mobile-first.

## Run it locally

```bash
cd quiz-battle-standalone
npm install
npm start
```

Then open http://localhost:3000 — open it in two browsers / phones on the
same network (or via a tunnel, see below) to play a real battle.

## Play it

1. Player 1 types a name (default **Dami**), taps **Create a room**.
   A 4-letter room code appears — copy the link and send it to your friend.
2. Player 2 (default **Betty**) opens the link, types a name, taps **Join**.
   The link already carries the room code, so they only need their name.
3. When both are in the lobby, the host taps **Start battle**.
4. Answer fast. After each question both answers are revealed with the
   scripture reference. At the end the winner is crowned and either player
   can tap **Rematch** — a new game starts when both accept.

## Make it public (outside Muse)

This app is a normal Node.js server, so it can live anywhere a Node server
can live. The simplest free routes, in order:

1. **Temporary public link, no account:** run the server, then in a second
   terminal run a free tunnel, e.g. Cloudflare Tunnel:
   `cloudflared tunnel --url http://localhost:3000`
   It prints a `https://<random>.trycloudflare.com` link anyone can open.
   The link dies when the tunnel stops — good for one game night, not permanent.
2. **Permanent free hosting:** deploy this folder to a free Node host
   (e.g. Render free tier, Railway trial, Fly.io free allowance, or an
   Oracle Always Free VM — the route already planned for the Discord bot).
   Set the start command to `npm start` and the port from the `PORT`
   environment variable (the server already reads `PORT`, default 3000).
   No account or key belonging to the user is stored in this repo.

### Public-link status (checked 2026-11-17, from this VM)

**No working public link yet — do not share a link until one is verified.**
Tried, in order, and all failed because of this VM's egress proxy
(all outbound traffic goes through a proxy that only allows certain hosts;
the VM has no public IP of its own — its address is 198.19.0.2, private):

- Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3000`):
  binary downloaded fine, but `api.trycloudflare.com` returns 403 from the
  proxy, so no tunnel URL is ever issued.
- Localtunnel (`npx localtunnel --port 3000`): client ran 75+ seconds and
  never printed a URL.
- SSH tunnels (localhost.run, Pinggy on port 443): SSH is reset by the proxy
  (`Connection reset by 198.19.0.1 port 3128`).
- bore.pub: unreachable (connection fails).

**What gets it live — one specific step:** deploy this folder on a free
Node host with the user's own account (Render free tier is the simplest:
create a Web Service from this folder, start command `npm start`).
That gives a permanent public `https://…onrender.com` link. It needs the
user to sign in / connect once — no password or key is needed from the
agent side, and none was asked for.

## Files

- `server.js` — Express + Socket.io server: rooms, timers, scoring, reveals.
- `public/index.html` — the whole frontend (no build step).
- `questions_bank.json` — the 200 validated Bible questions.
- `package.json` — dependencies: express, socket.io.
