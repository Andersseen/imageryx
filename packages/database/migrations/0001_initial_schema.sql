-- Imageryx Phase 2 initial schema.
--
-- Deletion strategy (documented once, applies to every FK below):
--   * projects -> everything: ON DELETE CASCADE. Deleting a project is a
--     whole-project deletion; every child row deleting with it is expected.
--   * folders -> folders (parent_id): ON DELETE CASCADE. Deleting a folder
--     deletes its subfolder tree.
--   * folders -> assets (folder_id): ON DELETE SET NULL. Deleting a folder
--     must NOT silently delete assets — they become root-level instead.
--   * assets -> variants/processing_jobs/asset_tags/asset_activity:
--     ON DELETE CASCADE — these rows have no meaning without their asset.
--     Asset *soft* deletion (deleted_at) is the normal user-facing delete;
--     this hard-delete cascade only fires if an asset row is actually
--     removed (e.g. a future permanent-purge job), not on every soft delete.
--
-- D1 (SQLite) enables `PRAGMA foreign_keys` by default, so these
-- constraints are enforced without an explicit pragma statement.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_folders_project ON folders (project_id);
CREATE INDEX idx_folders_parent ON folders (parent_id);
CREATE UNIQUE INDEX idx_folders_unique_path ON folders (project_id, path);
-- Two partial indexes (rather than one composite UNIQUE) because SQLite
-- treats every NULL as distinct for uniqueness purposes: a plain
-- UNIQUE(project_id, parent_id, slug) would silently allow duplicate
-- root-level (parent_id IS NULL) sibling slugs.
CREATE UNIQUE INDEX idx_folders_root_sibling_slug ON folders (project_id, slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX idx_folders_nested_sibling_slug ON folders (project_id, parent_id, slug) WHERE parent_id IS NOT NULL;

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml')),
  extension TEXT NOT NULL CHECK (extension IN ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg')),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  aspect_ratio REAL CHECK (aspect_ratio IS NULL OR aspect_ratio > 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  checksum TEXT NOT NULL,
  has_alpha INTEGER CHECK (has_alpha IS NULL OR has_alpha IN (0, 1)),
  dominant_color TEXT,
  placeholder TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  download_original_enabled INTEGER NOT NULL DEFAULT 0 CHECK (download_original_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_assets_project ON assets (project_id);
CREATE INDEX idx_assets_folder ON assets (folder_id);
CREATE INDEX idx_assets_visibility ON assets (visibility);
CREATE INDEX idx_assets_processing_status ON assets (processing_status);
CREATE INDEX idx_assets_mime_type ON assets (mime_type);
CREATE INDEX idx_assets_checksum ON assets (checksum);
CREATE INDEX idx_assets_created_at ON assets (created_at);
-- Partial index: only active (non-deleted) assets need a unique path per
-- project, so a soft-deleted asset's path can be reused by a new one.
CREATE UNIQUE INDEX idx_assets_active_path ON assets (project_id, path) WHERE deleted_at IS NULL;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_tags_unique_name ON tags (project_id, name);
CREATE INDEX idx_tags_project ON tags (project_id);

CREATE TABLE asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX idx_asset_tags_tag ON asset_tags (tag_id);

CREATE TABLE presets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  operations TEXT NOT NULL,
  output_format TEXT NOT NULL CHECK (output_format IN ('auto', 'avif', 'webp', 'jpeg', 'png')),
  quality INTEGER CHECK (quality IS NULL OR (quality BETWEEN 1 AND 100)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_presets_unique_slug ON presets (project_id, slug);
CREATE INDEX idx_presets_project ON presets (project_id);

CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  preset_id TEXT NOT NULL REFERENCES presets (id) ON DELETE CASCADE,
  preset_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'cloudflare', 'cloudinary')),
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

-- Prevents two variants for the same asset + normalized preset hash from
-- ever coexisting — this is what `VariantRepository.create` relies on to
-- detect a duplicate and raise `DuplicateVariantError` instead of a raw
-- constraint failure leaking out.
CREATE UNIQUE INDEX idx_variants_unique_asset_preset_hash ON variants (asset_id, preset_hash);
CREATE INDEX idx_variants_asset ON variants (asset_id);
CREATE INDEX idx_variants_preset ON variants (preset_id);
CREATE INDEX idx_variants_status ON variants (status);

CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  asset_id TEXT REFERENCES assets (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (
    type IN ('inspect-metadata', 'generate-variant', 'extract-placeholder', 'strip-metadata', 'copy-provider-result', 'delete-object', 'batch-operation')
  ),
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  input TEXT NOT NULL,
  result TEXT,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT
);

CREATE INDEX idx_processing_jobs_status ON processing_jobs (status);
CREATE INDEX idx_processing_jobs_type ON processing_jobs (type);
CREATE INDEX idx_processing_jobs_project ON processing_jobs (project_id);
CREATE INDEX idx_processing_jobs_asset ON processing_jobs (asset_id);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs (created_at);

-- Only a prefix + a secure hash of the secret are ever stored — never a
-- complete, usable API key. `hashed_secret` is produced by a provider/
-- security utility outside this package's scope; this table just persists it.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL UNIQUE,
  hashed_secret TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE asset_activity (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_asset_activity_asset ON asset_activity (asset_id);
CREATE INDEX idx_asset_activity_project ON asset_activity (project_id);
CREATE INDEX idx_asset_activity_created_at ON asset_activity (created_at);
