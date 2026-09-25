// Table definitions. Applied on startup with CREATE TABLE IF NOT EXISTS, so an
// empty database is set up automatically and existing data is never touched.
//
// A saved universe is a small record: the seed and the six physical parameters
// regenerate the whole universe deterministically, so stars and planets are not
// stored.

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS universes (
    snapshot_id                 VARCHAR(20)     NOT NULL PRIMARY KEY,  -- AF-U-XXXX-XXXX, derived from the seed
    seed                        BIGINT UNSIGNED NOT NULL,
    name                        VARCHAR(200)    NOT NULL,
    galaxy_type                 VARCHAR(20)     NOT NULL,
    config_seed                 BIGINT UNSIGNED NOT NULL,
    gravity_strength            DOUBLE          NOT NULL,
    expansion_rate              DOUBLE          NOT NULL,
    stellar_ignition_threshold  DOUBLE          NOT NULL,
    entropy_rate                DOUBLE          NOT NULL,
    emergence_sensitivity       DOUBLE          NOT NULL,
    intelligence_modifier       DOUBLE          NOT NULL,
    summary                     TEXT            NOT NULL,
    star_count                  INT UNSIGNED    NOT NULL,
    life_bearing_planets        INT UNSIGNED    NOT NULL,
    civilization_count          INT UNSIGNED    NOT NULL,
    legendary_events            INT UNSIGNED    NOT NULL,
    total_planets               INT UNSIGNED    NOT NULL,
    notes                       TEXT            NOT NULL,
    is_favorite                 BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at                  DATETIME(3)     NOT NULL,
    updated_at                  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_universes_created (created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS discoveries (
    id             VARCHAR(100)    NOT NULL PRIMARY KEY,
    category       VARCHAR(40)     NOT NULL,
    universe_seed  BIGINT UNSIGNED NOT NULL,
    subject_id     VARCHAR(100)    NOT NULL,
    label          VARCHAR(200)    NOT NULL,
    description    TEXT            NOT NULL,
    saved_at       DATETIME(3)     NOT NULL,
    INDEX idx_discoveries_saved (saved_at)
  )`,
  `CREATE TABLE IF NOT EXISTS experiments (
    id                  VARCHAR(40)     NOT NULL PRIMARY KEY,
    recorded_at         DATETIME(3)     NOT NULL,
    baseline_seed       BIGINT UNSIGNED NOT NULL,
    experiment_seed     BIGINT UNSIGNED NOT NULL,
    modified_constants  JSON            NOT NULL,
    comparison_summary  TEXT            NOT NULL,
    surprises           JSON            NOT NULL,
    note                TEXT            NOT NULL,
    INDEX idx_experiments_recorded (recorded_at)
  )`,
  `CREATE TABLE IF NOT EXISTS star_bookmarks (
    galaxy_seed     BIGINT UNSIGNED NOT NULL,
    star_id         INT UNSIGNED    NOT NULL,
    classification  VARCHAR(20)     NOT NULL,
    mass            DOUBLE          NOT NULL,
    temperature     DOUBLE          NOT NULL,
    note            TEXT            NOT NULL,
    saved_at        DATETIME(3)     NOT NULL,
    PRIMARY KEY (galaxy_seed, star_id)
  )`,
];
