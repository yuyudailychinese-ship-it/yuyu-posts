# Yuyu daily posts

Posts one carousel a day to Instagram **@yuyudailychinese**, automatically, using GitHub Actions.

- `posts/NNN-word/` – four slides (`slide-1.jpg` … `slide-4.jpg`) and `caption.txt` per post
- `state.json` – number of the last published post (the bot updates it)
- `publish.mjs` – posts the next carousel through the Instagram API
- `.github/workflows/post.yml` – runs it every day at 07:00 UTC

Posts are made in the Hanzi app project with `node branding/posts/generate.mjs`, which writes straight into `posts/`.

## One-time setup

1. **Create the repository** on github.com: name `yuyu-posts`, **Public** (Instagram fetches the images from the public file URLs). Don't add a README there.
2. **Upload the files.** Easiest: install GitHub Desktop, choose *File → Add local repository* → this folder, then *Publish repository* (untick "Keep this code private").
3. **Add the token as a secret:** repository → *Settings → Secrets and variables → Actions → New repository secret*
   - Name: `IG_TOKEN`
   - Secret: the system-user token from Meta Business settings
4. **Test without posting:** *Actions → Daily Yuyu post → Run workflow*, mode `check`. It should print `✓ Token works for @yuyudailychinese`.
5. **Preview the next post:** run again with mode `dry-run`. Every image line should show `✓ 200`.

From then on it posts every morning by itself. To post right away, run it with mode `publish`.

## Adding more posts

Generate the next batch (for example posts 31–60) in the Hanzi project, then commit and push the new `posts/` folders with GitHub Desktop. If the queue runs empty, the daily run fails on purpose and GitHub emails you.

## If something goes wrong

- **Token error (code 190):** the token was revoked. Make a new one for system user `yuyu-poster` and replace the `IG_TOKEN` secret.
- **Image error:** check the repo is public and the dry-run shows `✓ 200` for every slide.
- **Skip or repeat a post:** edit `lastPosted` in `state.json` (the next run posts `lastPosted + 1`).
- **Pause posting:** *Actions → Daily Yuyu post → ⋯ → Disable workflow*.
