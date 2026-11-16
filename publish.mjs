// Publishes the next queued Yuyu carousel to Instagram.
//
// Runs daily in GitHub Actions (.github/workflows/post.yml). Each run:
//   1. reads state.json to find the next post number,
//   2. creates one Instagram container per slide (image fetched from this repo's public URL),
//   3. combines them into a carousel with the caption and publishes it,
//   4. bumps state.json so the same post is never published twice.
//
// Environment:
//   IG_USER_ID   Instagram account ID (not secret)
//   IG_TOKEN     system-user access token (GitHub secret, never commit it)
//   RAW_BASE     public base URL of this repo's files, e.g.
//                https://raw.githubusercontent.com/<user>/<repo>/main
//   MODE         "publish" (default), "dry-run" (show what would be posted),
//                or "check" (verify the token can see the account, posts nothing)
//   GRAPH_VERSION  Graph API version, default v23.0

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MODE = process.env.MODE || 'publish';
const VERSION = process.env.GRAPH_VERSION || 'v23.0';
const API = `https://graph.facebook.com/${VERSION}`;
const { IG_USER_ID, IG_TOKEN, RAW_BASE } = process.env;

function need(name, value) {
  if (!value) {
    console.error(`Missing ${name}. See README.md for setup.`);
    process.exit(1);
  }
}

async function graph(method, path, params = {}) {
  const url = new URL(`${API}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: IG_TOKEN });
  const res =
    method === 'GET'
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Instagram API error on ${path}: ${e.message || res.statusText} (code ${e.code ?? res.status})`);
  }
  return json;
}

// Containers are processed asynchronously; wait until Instagram has fetched the image.
async function waitReady(id) {
  for (let i = 0; i < 30; i++) {
    const { status_code } = await graph('GET', id, { fields: 'status_code' });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Container ${id} failed: ${status_code}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Container ${id} was not ready after 2 minutes`);
}

const statePath = join(here, 'state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const next = state.lastPosted + 1;
const prefix = String(next).padStart(3, '0') + '-';
const folder = readdirSync(join(here, 'posts'), { withFileTypes: true })
  .find((d) => d.isDirectory() && d.name.startsWith(prefix))?.name;

if (MODE === 'check') {
  need('IG_USER_ID', IG_USER_ID);
  need('IG_TOKEN', IG_TOKEN);
  const me = await graph('GET', IG_USER_ID, { fields: 'username,media_count' });
  console.log(`✓ Token works for @${me.username} (${me.media_count} posts on the account).`);
  console.log(folder ? `Next in queue: post ${next} (${folder}).` : `Queue is empty after post ${state.lastPosted}.`);
  process.exit(0);
}

if (!folder) {
  // Fails the run on purpose so GitHub emails you that the queue needs refilling.
  console.error(`No post ${next} in posts/. Generate more posts and push them.`);
  process.exit(1);
}

const dir = join(here, 'posts', folder);
const slides = readdirSync(dir).filter((f) => /^slide-\d+\.jpg$/.test(f)).sort();
const caption = readFileSync(join(dir, 'caption.txt'), 'utf8').trim();
if (slides.length < 2 || slides.length > 10) throw new Error(`${folder} needs 2–10 slides, has ${slides.length}`);
if (caption.length > 2200) throw new Error(`${folder} caption is ${caption.length} characters (max 2200)`);

const urls = slides.map((f) => `${RAW_BASE || '<repo URL>'}/posts/${folder}/${f}`);

if (MODE === 'dry-run') {
  console.log(`Would publish post ${next} (${folder}):`);
  urls.forEach((u) => console.log('  ' + u));
  console.log('\n' + caption);
  if (RAW_BASE) {
    for (const u of urls) {
      const r = await fetch(u, { method: 'HEAD' });
      console.log(`${r.ok ? '✓' : '✗'} ${r.status} ${u}`);
    }
  }
  process.exit(0);
}

need('IG_USER_ID', IG_USER_ID);
need('IG_TOKEN', IG_TOKEN);
need('RAW_BASE', RAW_BASE);

console.log(`Publishing post ${next} (${folder}) with ${slides.length} slides…`);
const children = [];
for (const image_url of urls) {
  const { id } = await graph('POST', `${IG_USER_ID}/media`, { image_url, is_carousel_item: 'true' });
  await waitReady(id);
  children.push(id);
  console.log(`  slide ready: ${id}`);
}
const carousel = await graph('POST', `${IG_USER_ID}/media`, {
  media_type: 'CAROUSEL',
  children: children.join(','),
  caption,
});
await waitReady(carousel.id);
const published = await graph('POST', `${IG_USER_ID}/media_publish`, { creation_id: carousel.id });
console.log(`✓ Published post ${next}: media ${published.id}`);

state.lastPosted = next;
state.history = [...(state.history || []), { n: next, folder, media: published.id, at: new Date().toISOString() }];
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
