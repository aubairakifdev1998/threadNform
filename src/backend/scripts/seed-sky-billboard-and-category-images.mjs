import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env'), override: true });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const bucket = process.env.SUPABASE_STORAGE_BUCKET_PRODUCTS || 'products';

if (!url || !key || !databaseUrl) {
  throw new Error('Missing env');
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upload(localPath, destPath, contentType) {
  const body = readFileSync(localPath);
  const { error } = await supabase.storage.from(bucket).upload(destPath, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(destPath).data.publicUrl;
}

const ts = Date.now();
const dir = '/tmp/fareya-sky';

const heroVideo = await upload(
  `${dir}/long-aesthetic.mp4`,
  `site/billboards/${ts}-fashion-field-montage.mp4`,
  'video/mp4',
);
const heroPoster = await upload(
  `${dir}/cat-women.jpg`,
  `site/billboards/${ts}-sky-poster.jpg`,
  'image/jpeg',
);

const images = {
  women: await upload(`${dir}/cat-women.jpg`, `site/categories/${ts}-women.jpg`, 'image/jpeg'),
  men: await upload(`${dir}/cat-men.jpg`, `site/categories/${ts}-men.jpg`, 'image/jpeg'),
  clothing: await upload(`${dir}/cat-clothing.jpg`, `site/categories/${ts}-clothing.jpg`, 'image/jpeg'),
  tees: await upload(`${dir}/cat-tees.jpg`, `site/categories/${ts}-tees.jpg`, 'image/jpeg'),
  dresses: await upload(`${dir}/cat-dresses.jpg`, `site/categories/${ts}-dresses.jpg`, 'image/jpeg'),
};

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await pool.query(`
  alter table public.categories add column if not exists image_url text;
  alter table public.departments add column if not exists image_url text;
`);

await pool.query(`update public.site_billboards set is_active = false where is_active = true`);
await pool.query(
  `insert into public.site_billboards (
    title, subtitle, season_label, cta_label, cta_href,
    secondary_cta_label, secondary_cta_href,
    media_type, media_url, poster_url, is_active, sort_order
  ) values ($1,$2,$3,$4,$5,$6,$7,'VIDEO',$8,$9,true,0)`,
  [
    'New Collection',
    'Cut against open sky. Worn with intent.',
    'Summer edit',
    'Go to shop',
    '/shop',
    'View catalogue',
    '/shop',
    heroVideo,
    heroPoster,
  ],
);

await pool.query(
  `update public.departments set image_url = $1, updated_at = now() where lower(slug) = 'women'`,
  [images.women],
);
await pool.query(
  `update public.departments set image_url = $1, updated_at = now() where lower(slug) = 'men'`,
  [images.men],
);

const categoryMap = [
  ['clothing', images.clothing],
  ['t-shirts', images.tees],
  ['tshirts', images.tees],
  ['tees', images.tees],
  ['dresses', images.dresses],
];

for (const [slug, image] of categoryMap) {
  await pool.query(
    `update public.categories set image_url = $1, updated_at = now() where lower(slug) = $2`,
    [image, slug],
  );
}

// Any remaining categories without image get clothing fallback
await pool.query(
  `update public.categories set image_url = $1, updated_at = now() where image_url is null`,
  [images.clothing],
);

console.log(JSON.stringify({ heroVideo, heroPoster, images }, null, 2));
await pool.end();
