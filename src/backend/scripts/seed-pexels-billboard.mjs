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
  throw new Error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY / DATABASE_URL');
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
  const { data } = supabase.storage.from(bucket).getPublicUrl(destPath);
  return data.publicUrl;
}

const ts = Date.now();
const mediaDir = '/tmp/fareya-pexels';

const heroVideo = await upload(
  `${mediaDir}/hero-video.mp4`,
  `site/billboards/${ts}-apparel-hero.mp4`,
  'video/mp4',
);
const heroPoster = await upload(
  `${mediaDir}/hero-poster.jpg`,
  `site/billboards/${ts}-apparel-poster.jpg`,
  'image/jpeg',
);
const apparelImage = await upload(
  `${mediaDir}/apparel-1.jpg`,
  `site/billboards/${ts}-apparel-still.jpg`,
  'image/jpeg',
);
const rackVideo = await upload(
  `${mediaDir}/rack-video.mp4`,
  `site/billboards/${ts}-apparel-rack.mp4`,
  'video/mp4',
);

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await pool.query(`update public.site_billboards set is_active = false where is_active = true`);

const active = await pool.query(
  `insert into public.site_billboards (
    title, subtitle, season_label, cta_label, cta_href,
    secondary_cta_label, secondary_cta_href,
    media_type, media_url, poster_url, is_active, sort_order
  ) values (
    $1,$2,$3,$4,$5,$6,$7,'VIDEO',$8,$9,true,0
  ) returning id, title, media_type, media_url`,
  [
    'New Collection',
    'Formed in thread. Worn with intent.',
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
  `insert into public.site_billboards (
    title, subtitle, season_label, cta_label, cta_href,
    media_type, media_url, poster_url, is_active, sort_order
  ) values
  ($1,$2,$3,$4,$5,'IMAGE',$6,null,false,1),
  ($7,$8,$9,$10,$11,'VIDEO',$12,$13,false,2)`,
  [
    'Cut & cloth',
    'Tailored silhouettes for every day.',
    'Lookbook',
    'Shop the edit',
    '/shop',
    apparelImage,
    'On the rail',
    'Garments in motion — hangers to wardrobe.',
    'Studio cut',
    'Explore',
    '/shop',
    rackVideo,
    heroPoster,
  ],
);

console.log(JSON.stringify({ active: active.rows[0], heroVideo, heroPoster, apparelImage, rackVideo }, null, 2));
await pool.end();
