-- Widens `presets.output_format` to allow "svg" (the vector-in/vector-out
-- identity case for real SVG optimization — see
-- packages/contracts/src/presets/image-operation.schema.ts) and
-- `variants.provider` to allow "builtin" (the new real, local,
-- provider-independent transformation provider — see
-- packages/providers/src/transformations/builtin.provider.ts).
--
-- SQLite has no ALTER TABLE support for changing a CHECK constraint in
-- place, so both tables are rebuilt: create a replacement table with the
-- widened constraint, copy every row, drop the original, rename the
-- replacement into place, then recreate the indexes that were dropped
-- along with the original table.
--
-- Ordering is deliberately NOT "rebuild presets, then rebuild variants":
-- `variants.preset_id REFERENCES presets (id) ON DELETE CASCADE`, and per
-- SQLite's documented behavior, `DROP TABLE` on a table with foreign key
-- constraints enabled performs an implicit `DELETE FROM` first — which
-- would cascade-delete every row in `variants` when `presets` is dropped,
-- if a live `ON DELETE CASCADE` foreign key still points at it. `PRAGMA
-- foreign_keys = OFF` is also a documented no-op inside a transaction (and
-- D1 migrations may run inside one), so this migration does not rely on
-- that pragma for safety at all. Instead, `variants` is rebuilt FIRST
-- with its `preset_id` foreign key temporarily dropped, so that when
-- `presets` is dropped and rebuilt, no table has a live foreign key
-- pointing at it — structurally impossible to cascade-delete regardless
-- of pragma/transaction behavior. `variants` is then rebuilt a second
-- time with the foreign key restored, now pointing at the rebuilt
-- `presets` table.

-- Step 1: rebuild variants WITHOUT its preset_id foreign key (temporarily) --

CREATE TABLE variants_step1 (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  preset_id TEXT NOT NULL,
  preset_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'cloudflare', 'cloudinary', 'builtin')),
  storage_key TEXT,
  delivery_url TEXT,
  mime_type TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO variants_step1 (id, asset_id, preset_id, preset_hash, provider, storage_key, delivery_url, mime_type, width, height, size_bytes, checksum, status, created_at, updated_at)
SELECT id, asset_id, preset_id, preset_hash, provider, storage_key, delivery_url, mime_type, width, height, size_bytes, checksum, status, created_at, updated_at
FROM variants;

DROP TABLE variants;
ALTER TABLE variants_step1 RENAME TO variants;

-- No indexes recreated yet — this is an intermediate state, replaced by step 3 below.

-- Step 2: rebuild presets with the widened output_format CHECK ------------
-- Safe to drop now: no table has a foreign key pointing at `presets` (step 1 removed the only one).

CREATE TABLE presets_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  operations TEXT NOT NULL,
  output_format TEXT NOT NULL CHECK (output_format IN ('auto', 'avif', 'webp', 'jpeg', 'png', 'svg')),
  quality INTEGER CHECK (quality IS NULL OR (quality BETWEEN 1 AND 100)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO presets_new (id, project_id, name, slug, description, operations, output_format, quality, is_system, created_at, updated_at)
SELECT id, project_id, name, slug, description, operations, output_format, quality, is_system, created_at, updated_at
FROM presets;

DROP TABLE presets;
ALTER TABLE presets_new RENAME TO presets;

CREATE UNIQUE INDEX idx_presets_unique_slug ON presets (project_id, slug);
CREATE INDEX idx_presets_project ON presets (project_id);

-- Step 3: rebuild variants again, this time with the widened provider CHECK
-- and the preset_id foreign key restored, pointing at the rebuilt presets table --

CREATE TABLE variants_new (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  preset_id TEXT NOT NULL REFERENCES presets (id) ON DELETE CASCADE,
  preset_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'cloudflare', 'cloudinary', 'builtin')),
  storage_key TEXT,
  delivery_url TEXT,
  mime_type TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO variants_new (id, asset_id, preset_id, preset_hash, provider, storage_key, delivery_url, mime_type, width, height, size_bytes, checksum, status, created_at, updated_at)
SELECT id, asset_id, preset_id, preset_hash, provider, storage_key, delivery_url, mime_type, width, height, size_bytes, checksum, status, created_at, updated_at
FROM variants;

DROP TABLE variants;
ALTER TABLE variants_new RENAME TO variants;

CREATE UNIQUE INDEX idx_variants_unique_asset_preset_hash ON variants (asset_id, preset_hash);
CREATE INDEX idx_variants_asset ON variants (asset_id);
CREATE INDEX idx_variants_preset ON variants (preset_id);
CREATE INDEX idx_variants_status ON variants (status);
