import type { LibraryFilter, LocalStore } from "@/local/LocalStore";
import type {
  CollectionStats,
  Copy,
  Format,
  Photo,
  Release,
  WishlistItem,
} from "@janne6565/rekordo-shared";
import {
  FORMATS,
  catalogueKeyOf,
  isManualReleaseId,
  manualRelease,
  manualReleaseCopyId,
  mergeCachedRelease,
} from "@janne6565/rekordo-shared";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SQLite from "expo-sqlite";

// The on-device SQLite file, deliberately still the pre-Rekordo name. It holds the
// collection itself, and this app is local-first: without an account there is no copy
// of it anywhere else. Renaming the file would not move the data, it would open a new
// empty database next to the full one. Same reasoning as the web app's IndexedDB name.
const DATABASE = "music-collector.db";
const PHOTO_DIR = `${FileSystem.documentDirectory}photos/`;

function photoPath(id: string): string {
  return `${PHOTO_DIR}${id}`;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** React Native has no btoa/atob for binary, so the two conversions are explicit. */
export function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = ((bytes[i] as number) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64[(chunk >> 18) & 63];
    out += BASE64[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(chunk >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64[chunk & 63] : "=";
  }
  return out;
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | BASE64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}
const DEVICE_ID_KEY = "deviceId";
const CLOCK_KEY = "clock";
const CURSOR_KEY = "syncCursor";
const PENDING_KEY = "pendingIds";
/** Namespaced, so a preference can never collide with the sync bookkeeping above. */
const SETTING_PREFIX = "setting:";

/**
 * The one open database this runtime gets, whoever asks for it.
 *
 * Opening the same file a second time does not give a second connection: expo-sqlite
 * hands both handles the same native database, and whichever handle is collected first
 * closes it for the other one. A single remount of the provider is enough to create that
 * second handle — Fast Refresh does it in development — and the collection then happens
 * the moment the app is backgrounded, which on Android is exactly what signing in through
 * the browser does. What comes back is an app whose every query fails with a
 * NullPointerException until it is restarted. So the handle is opened once and shared.
 */
let opening: Promise<SqliteLocalStore> | null = null;

export function openLocalStore(): Promise<SqliteLocalStore> {
  if (opening === null) {
    const store = new SqliteLocalStore();
    // A failed open is not remembered: the next caller should get to try again rather
    // than be handed the same rejection for the rest of the session.
    opening = store.open().then(
      () => store,
      (error: unknown) => {
        opening = null;
        throw error;
      },
    );
  }
  return opening;
}

/**
 * How many rows a table holds, or zero when it is not there at all.
 *
 * Used only by the repair below, where "the table does not exist" and "the table is empty"
 * lead to the same decision and neither is worth an exception.
 */
async function rowCount(db: SQLite.SQLiteDatabase, table: string): Promise<number> {
  const row = await db.getFirstAsync<{ found: number }>(
    "SELECT count(*) AS found FROM sqlite_master WHERE type = 'table' AND name = ?",
    table,
  );
  if ((row?.found ?? 0) === 0) return 0;
  const counted = await db.getFirstAsync<{ rows: number }>(`SELECT count(*) AS rows FROM ${table}`);
  return counted?.rows ?? 0;
}

/**
 * Clears what an interrupted table rebuild left standing.
 *
 * Relaxing a NOT NULL means building the table again under a working name and renaming it
 * over the old one, and a run cut short between those two leaves that working table behind.
 * Every later launch then failed on `table ... already exists` before the store had opened,
 * which is a blank screen and no way back — the rebuilds below are transactional now, so
 * this cannot happen again, but a database that has already been through it still has to be
 * repaired on the way past.
 *
 * Which table holds the records depends on where the run stopped, so it is asked rather
 * than assumed: before the copy was made the records are in the live table and the debris
 * is an empty shell, and after the drop it is the other way round and the shell is the one
 * `CREATE TABLE IF NOT EXISTS` has just put back.
 */
async function clearRebuildDebris(
  db: SQLite.SQLiteDatabase,
  live: string,
  working: string,
): Promise<void> {
  const carried = await rowCount(db, working);
  if (carried === 0) {
    await db.execAsync(`DROP TABLE IF EXISTS ${working}`);
    return;
  }
  if ((await rowCount(db, live)) > 0) {
    await db.execAsync(`DROP TABLE ${working}`);
    return;
  }
  await db.execAsync(`DROP TABLE IF EXISTS ${live}; ALTER TABLE ${working} RENAME TO ${live};`);
}

/**
 * SQLite-backed store for the mobile app — the same interface the web app implements over
 * IndexedDB, so a screen written against LocalStore ports between them unchanged.
 *
 * Rows are stored with the JSON-ish columns the app actually filters on promoted to real
 * columns, and the rest kept as-is. Filtering happens in SQL rather than in JS because a
 * phone should not deserialise a whole collection to render one filtered grid.
 */
export class SqliteLocalStore implements LocalStore {
  private db: SQLite.SQLiteDatabase | null = null;

  private handle(): SQLite.SQLiteDatabase {
    if (this.db === null) {
      throw new Error("LocalStore used before open()");
    }
    return this.db;
  }

  async open(): Promise<void> {
    if (this.db !== null) return;
    const db = await SQLite.openDatabaseAsync(DATABASE);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS copies (
        id              TEXT PRIMARY KEY NOT NULL,
        -- Null when nobody chose a pressing: the album below is what the person picked.
        releaseId       TEXT,
        albumId         TEXT,
        manualTitle     TEXT,
        manualArtist    TEXT,
        manualYear      INTEGER,
        manualLabel     TEXT,
        manualCatalogNumber TEXT,
        manualFormat    TEXT,
        -- The digits of a scan nobody could look up yet; null the moment it has a name.
        -- No index: it is null on all but a handful of rows, and the one query that reads
        -- it is a scan of those rows.
        pendingBarcode  TEXT,
        condition       TEXT,
        sleeveCondition TEXT,
        pricePaidCents  INTEGER,
        currency        TEXT NOT NULL,
        purchasedOn     TEXT,
        purchasedAt     TEXT,
        notes           TEXT,
        notesConflict   TEXT,
        rating          INTEGER,
        -- Which of this copy's images stands for it: AUTO, PREFERRED or HIDDEN. Defaulted
        -- rather than nullable, because "nobody said" and "the first photo wins" are the
        -- same answer and a third state would only be a way to get this wrong.
        catalogArt      TEXT NOT NULL DEFAULT 'AUTO',
        -- Kept off every shelf but the owner's, whatever the sharing settings say. 0/1
        -- rather than a boolean, which SQLite does not have.
        hidden          INTEGER NOT NULL DEFAULT 0,
        -- Where this copy sits on a shelf somebody has arranged by hand. Nullable, and
        -- null is not position 0: it means never placed, which sorts after every copy
        -- that has been. No index -- the one query that reads it reads the whole shelf.
        sortIndex       INTEGER,
        createdAt       INTEGER NOT NULL,
        deletedAt       INTEGER,
        fieldClocks     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS copies_release_idx ON copies (releaseId);
      CREATE INDEX IF NOT EXISTS copies_alive_idx ON copies (deletedAt);

      CREATE TABLE IF NOT EXISTS releases (
        id               TEXT PRIMARY KEY NOT NULL,
        albumId TEXT NOT NULL,
        title            TEXT NOT NULL,
        artistName       TEXT NOT NULL,
        year             INTEGER,
        format           TEXT NOT NULL,
        label            TEXT,
        catalogNumber    TEXT,
        country          TEXT,
        barcode          TEXT,
        coverArtUrl      TEXT,
        coverTheme       TEXT,
        cachedAt         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS releases_group_idx ON releases (albumId);

      CREATE TABLE IF NOT EXISTS wishlist (
        id               TEXT PRIMARY KEY NOT NULL,
        albumId TEXT NOT NULL,
        -- The pressing the entry was made from, when one was picked (19a). No index:
        -- nothing looks an entry up by it, it is read off the row already in hand.
        releaseId        TEXT,
        -- Mirrors copies.pendingBarcode: a scan sent here before it had a name.
        pendingBarcode   TEXT,
        title            TEXT NOT NULL,
        artistName       TEXT NOT NULL,
        year             INTEGER,
        desiredFormat    TEXT,
        note             TEXT,
        sortIndex        INTEGER,
        createdAt        INTEGER NOT NULL,
        deletedAt        INTEGER,
        fieldClocks      TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS wishlist_group_idx ON wishlist (albumId);

      CREATE TABLE IF NOT EXISTS photos (
        id            TEXT PRIMARY KEY NOT NULL,
        -- A photo pictures a copy or a wishlist entry, so neither owner is NOT NULL and
        -- exactly one of them is set on any row.
        copyId        TEXT,
        wishId        TEXT,
        storageKey    TEXT,
        contentType   TEXT NOT NULL,
        byteSize      INTEGER NOT NULL,
        sortIndex     INTEGER NOT NULL,
        createdAt     INTEGER NOT NULL,
        deletedAt     INTEGER,
        fieldClocks   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS photos_copy_idx ON photos (copyId);
      CREATE INDEX IF NOT EXISTS photos_wish_idx ON photos (wishId);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    await clearRebuildDebris(db, "copies", "copies_optional_pressing");

    // `CREATE TABLE IF NOT EXISTS` leaves an existing database on its old shape, so a column
    // added later has to be added explicitly. PRAGMA rather than a version number: it asks
    // the database what it actually has, which cannot drift the way a stored version can.
    const columns = await db.getAllAsync<{ name: string; notnull: number }>(
      "PRAGMA table_info(copies)",
    );
    if (!columns.some((column) => column.name === "sleeveCondition")) {
      await db.execAsync("ALTER TABLE copies ADD COLUMN sleeveCondition TEXT");
    }
    // The pressing a hand-entered copy describes itself (14a). Columns rather than a blob
    // so the library's filter, search and sort can keep being one SQL statement.
    if (!columns.some((column) => column.name === "manualTitle")) {
      await db.execAsync(`
        ALTER TABLE copies ADD COLUMN manualTitle TEXT;
        ALTER TABLE copies ADD COLUMN manualArtist TEXT;
        ALTER TABLE copies ADD COLUMN manualYear INTEGER;
        ALTER TABLE copies ADD COLUMN manualLabel TEXT;
        ALTER TABLE copies ADD COLUMN manualCatalogNumber TEXT;
        ALTER TABLE copies ADD COLUMN manualFormat TEXT;
      `);
    }
    // Hiding one copy from other people (15f). Defaulted rather than nullable: a record
    // nobody has hidden is shown, and "never asked" is not a third state worth having.
    if (!columns.some((column) => column.name === "hidden")) {
      await db.execAsync("ALTER TABLE copies ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
    }
    // Where a copy sits on a hand-arranged shelf. Nullable, and every row already here
    // gets null -- nobody had arranged anything before the column existed, and null is
    // exactly what "never placed" means.
    if (!columns.some((column) => column.name === "sortIndex")) {
      await db.execAsync("ALTER TABLE copies ADD COLUMN sortIndex INTEGER");
    }
    // A scan kept before it could be identified (2e). Nullable, and every row already here
    // gets null: they were all identified at the moment they were made.
    if (!columns.some((column) => column.name === "pendingBarcode")) {
      await db.execAsync("ALTER TABLE copies ADD COLUMN pendingBarcode TEXT");
    }
    /*
     * Which picture stands for this copy -- and the column this store never had.
     *
     * `catalogArt` has been on `Copy` since turn 12 and is carried by sync, but no version
     * of this table ever held it: the write listed its columns by hand and left it out, and
     * `CopyRow` is an `Omit` of `Copy`, so the type system was told the column existed and
     * had nothing to complain about. Every write was dropped and every read came back
     * undefined, which `?? "AUTO"` then turned into the default. So on this device starring
     * the catalogue's cover and hiding it did nothing at all, silently, and a value set on
     * the web was thrown away on arrival. Reported 2026-09-03; found by logging the write.
     *
     * Every row already here gets AUTO, which is what they have all been behaving as.
     */
    if (!columns.some((column) => column.name === "catalogArt")) {
      await db.execAsync("ALTER TABLE copies ADD COLUMN catalogArt TEXT NOT NULL DEFAULT 'AUTO'");
    }
    // The album a copy is of. Nullable, and backfilled from the mirror below, because
    // every copy written before this column pointed at a pressing and a pressing knows
    // its album.
    if (!columns.some((column) => column.name === "albumId")) {
      await db.execAsync(`
        ALTER TABLE copies ADD COLUMN albumId TEXT;
        UPDATE copies
           SET albumId = (SELECT releases.albumId FROM releases WHERE releases.id = copies.releaseId)
         WHERE albumId IS NULL;
        -- A hand-entered copy is in no catalogue; its album is its own id, exactly as its
        -- release already is.
        UPDATE copies SET albumId = releaseId
         WHERE albumId IS NULL AND releaseId LIKE 'local:%';
      `);
    }

    // A copy whose owner never chose a pressing stores null here, which the original table
    // forbade. SQLite cannot drop NOT NULL in place, so the table is rebuilt -- the same
    // move the photos table needed, and for the same reason: without it the insert fails
    // silently, as one row of a sync batch.
    if (columns.some((column) => column.name === "releaseId" && column.notnull === 1)) {
      // One transaction, run by the driver rather than written into the statement, so that
      // a rebuild which does not finish leaves the old table and nothing else.
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
        CREATE TABLE copies_optional_pressing (
          id              TEXT PRIMARY KEY NOT NULL,
          releaseId       TEXT,
          albumId         TEXT,
          manualTitle     TEXT,
          manualArtist    TEXT,
          manualYear      INTEGER,
          manualLabel     TEXT,
          manualCatalogNumber TEXT,
          manualFormat    TEXT,
          pendingBarcode  TEXT,
          condition       TEXT,
          sleeveCondition TEXT,
          pricePaidCents  INTEGER,
          currency        TEXT NOT NULL,
          purchasedOn     TEXT,
          purchasedAt     TEXT,
          notes           TEXT,
          notesConflict   TEXT,
          rating          INTEGER,
          hidden          INTEGER NOT NULL DEFAULT 0,
          createdAt       INTEGER NOT NULL,
          deletedAt       INTEGER,
          fieldClocks     TEXT NOT NULL
        );
        INSERT INTO copies_optional_pressing
          SELECT id, releaseId, albumId, manualTitle, manualArtist, manualYear, manualLabel,
                 manualCatalogNumber, manualFormat, pendingBarcode, condition,
                 sleeveCondition, pricePaidCents, currency, purchasedOn, purchasedAt, notes,
                 notesConflict, rating, hidden, createdAt, deletedAt, fieldClocks
          FROM copies;
        DROP TABLE copies;
        ALTER TABLE copies_optional_pressing RENAME TO copies;
        CREATE INDEX IF NOT EXISTS copies_release_idx ON copies (releaseId);
        CREATE INDEX IF NOT EXISTS copies_album_idx ON copies (albumId);
        CREATE INDEX IF NOT EXISTS copies_alive_idx ON copies (deletedAt);
      `);
      });
    }

    // Indexed here rather than beside the other two: on an existing database the column
    // does not exist until the ALTER above has run, and on a fresh one the branch holding
    // that ALTER is skipped because the CREATE TABLE already had it. This is the only
    // point both paths have passed through.
    await db.execAsync("CREATE INDEX IF NOT EXISTS copies_album_idx ON copies (albumId)");

    // Why a not-yet-pushed copy exists, so the server can keep imports out of the feed.
    // Local-only and never merged: it is the reason for one push, not a fact about the
    // record, and only this device was ever asked the question.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS copyOrigins (
        id     TEXT PRIMARY KEY NOT NULL,
        origin TEXT NOT NULL
      );
    `);
    // Where a hand-sorted entry sits (16a). Nullable: null is "never placed by hand",
    // which is not the same as position 0 and must not be written as one.
    const wishColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(wishlist)");
    if (!wishColumns.some((column) => column.name === "sortIndex")) {
      await db.execAsync("ALTER TABLE wishlist ADD COLUMN sortIndex INTEGER");
    }
    // The pressing an entry was made from (19a). Nullable, and the rows already here get
    // null: an entry made before this existed genuinely picked no pressing, and reading
    // falls back to the album exactly as it did before.
    if (!wishColumns.some((column) => column.name === "releaseId")) {
      await db.execAsync("ALTER TABLE wishlist ADD COLUMN releaseId TEXT");
    }
    if (!wishColumns.some((column) => column.name === "pendingBarcode")) {
      await db.execAsync("ALTER TABLE wishlist ADD COLUMN pendingBarcode TEXT");
    }
    await this.widenPhotoOwner(db);
    await this.qualifyIds(db, columns);
    this.db = db;
  }

  /**
   * A photo can picture a wishlist entry as well as a copy (18a).
   *
   * Two steps, because SQLite can add a column in place but cannot drop a NOT NULL: the
   * new owner is an ordinary ALTER, and relaxing `copyId` means rebuilding the table. The
   * rebuild is guarded on what the database actually reports rather than on a stored
   * version number, matching how every other migration here decides whether it has run.
   */
  private async widenPhotoOwner(db: SQLite.SQLiteDatabase): Promise<void> {
    await clearRebuildDebris(db, "photos", "photos_widened");

    const columns = await db.getAllAsync<{ name: string; notnull: number }>(
      "PRAGMA table_info(photos)",
    );
    if (columns.length === 0) return;

    if (!columns.some((column) => column.name === "wishId")) {
      await db.execAsync(`
        ALTER TABLE photos ADD COLUMN wishId TEXT;
        CREATE INDEX IF NOT EXISTS photos_wish_idx ON photos (wishId);
      `);
    }

    if (!columns.some((column) => column.name === "copyId" && column.notnull === 1)) return;

    // Rebuild, copying every row across. A wish's photo would otherwise fail to insert on
    // the next sync — and it would fail silently, as one row of a batch.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
      CREATE TABLE photos_widened (
        id            TEXT PRIMARY KEY NOT NULL,
        copyId        TEXT,
        wishId        TEXT,
        storageKey    TEXT,
        contentType   TEXT NOT NULL,
        byteSize      INTEGER NOT NULL,
        sortIndex     INTEGER NOT NULL,
        createdAt     INTEGER NOT NULL,
        deletedAt     INTEGER,
        fieldClocks   TEXT NOT NULL
      );
      INSERT INTO photos_widened
        SELECT id, copyId, wishId, storageKey, contentType, byteSize, sortIndex,
               createdAt, deletedAt, fieldClocks
        FROM photos;
      DROP TABLE photos;
      ALTER TABLE photos_widened RENAME TO photos;
      CREATE INDEX IF NOT EXISTS photos_copy_idx ON photos (copyId);
      CREATE INDEX IF NOT EXISTS photos_wish_idx ON photos (wishId);
    `);
    });
  }

  /**
   * Ids become source-qualified, because the app now reads two catalogues.
   *
   * Every id written before today came from MusicBrainz, so prefixing is exactly right and
   * nothing is lost. SQLite can rename a column in place, primary key included, which is
   * why this is three statements rather than a table rebuild.
   *
   * The field clocks are keyed by field name, so a clock left under the old key would read
   * as never-set — losing every edit that field has ever won in a merge.
   */
  private async qualifyIds(
    db: SQLite.SQLiteDatabase,
    copyColumns: readonly { name: string }[],
  ): Promise<void> {
    if (!copyColumns.some((column) => column.name === "releaseMbid")) {
      return;
    }
    await db.execAsync(`
      ALTER TABLE copies   RENAME COLUMN releaseMbid TO releaseId;
      ALTER TABLE releases RENAME COLUMN mbid TO id;
      ALTER TABLE releases RENAME COLUMN releaseGroupMbid TO albumId;
      ALTER TABLE wishlist RENAME COLUMN releaseGroupMbid TO albumId;

      UPDATE copies   SET releaseId = 'musicbrainz:' || releaseId WHERE releaseId NOT LIKE '%:%';
      UPDATE releases SET id        = 'musicbrainz:' || id        WHERE id        NOT LIKE '%:%';
      UPDATE releases SET albumId   = 'musicbrainz:' || albumId   WHERE albumId   NOT LIKE '%:%';
      UPDATE wishlist SET albumId   = 'musicbrainz:' || albumId   WHERE albumId   NOT LIKE '%:%';

      UPDATE copies
         SET fieldClocks = replace(fieldClocks, '"releaseMbid"', '"releaseId"')
       WHERE fieldClocks LIKE '%"releaseMbid"%';
      UPDATE wishlist
         SET fieldClocks = replace(fieldClocks, '"releaseGroupMbid"', '"albumId"')
       WHERE fieldClocks LIKE '%"releaseGroupMbid"%';
    `);
  }

  async listCopies(filter: LibraryFilter = {}): Promise<Copy[]> {
    const clauses = ["c.deletedAt IS NULL"];
    const params: (string | number)[] = [];

    // A hand-entered copy joins to no release row — it *is* its release — so every
    // reference to the archive's columns falls back to the copy's own.
    const title = "COALESCE(r.title, c.manualTitle)";
    const artist = "COALESCE(r.artistName, c.manualArtist)";

    if (filter.format !== undefined && filter.format !== "ALL") {
      // The copy's own format first: it overrides the archive's where it is set.
      clauses.push("COALESCE(c.manualFormat, r.format) = ?");
      params.push(filter.format);
    }
    const term = filter.search?.trim();
    if (term !== undefined && term !== "") {
      clauses.push(
        `(${title} LIKE ? OR ${artist} LIKE ? OR COALESCE(r.catalogNumber, c.manualCatalogNumber) LIKE ? OR c.notes LIKE ?)`,
      );
      const like = `%${term}%`;
      params.push(like, like, like, like);
    }

    const order =
      filter.sort === "ARTIST_ASC"
        ? `${artist} COLLATE NOCASE ASC`
        : filter.sort === "YEAR_DESC"
          ? "COALESCE(r.year, c.manualYear) DESC"
          : // The shelf as somebody arranged it. `sortIndex IS NULL` sorts 0 before 1, so
            // the placed copies come first and everything filed since the last arranging
            // follows, newest first among themselves -- which is `compareManualOrder` in
            // the shared package, said in SQL. Kept in step by hand: this store needs a
            // device to run at all, so there is no test here that could hold the two
            // together. Change one, change the other.
            filter.sort === "MANUAL"
            ? "c.sortIndex IS NULL, c.sortIndex ASC, c.createdAt DESC"
            : "c.createdAt DESC";

    const rows = await this.handle().getAllAsync<CopyRow>(
      `SELECT c.* FROM copies c LEFT JOIN releases r ON r.id = c.releaseId
       WHERE ${clauses.join(" AND ")} ORDER BY ${order}`,
      params,
    );
    return rows.map(toCopy);
  }

  async getCopy(id: string): Promise<Copy | undefined> {
    const row = await this.handle().getFirstAsync<CopyRow>(
      "SELECT * FROM copies WHERE id = ? AND deletedAt IS NULL",
      [id],
    );
    return row === null ? undefined : toCopy(row);
  }

  async getCopyIncludingDeleted(id: string): Promise<Copy | undefined> {
    const row = await this.handle().getFirstAsync<CopyRow>("SELECT * FROM copies WHERE id = ?", [
      id,
    ]);
    return row === null ? undefined : toCopy(row);
  }

  async listCopiesInReleaseGroup(albumId: string): Promise<Copy[]> {
    // A hand-entered pressing is its own album, under its own copy's id, so it is found
    // directly rather than through a `releases` row it does not have.
    const manualCopyId = manualReleaseCopyId(albumId);
    if (manualCopyId !== null) {
      const row = await this.handle().getFirstAsync<CopyRow>(
        "SELECT * FROM copies WHERE id = ? AND deletedAt IS NULL",
        [manualCopyId],
      );
      return row === null ? [] : [toCopy(row)];
    }
    const rows = await this.handle().getAllAsync<CopyRow>(
      `SELECT c.* FROM copies c JOIN releases r ON r.id = c.releaseId
       WHERE r.albumId = ? AND c.deletedAt IS NULL`,
      [albumId],
    );
    return rows.map(toCopy);
  }

  async putCopy(copy: Copy): Promise<void> {
    await this.write(copy);
    await this.markPending(copy.id);
  }

  /**
   * A whole arranged shelf, in one transaction and one pass over the pending list.
   *
   * `putCopy` in a loop would re-read and re-write the pending ids once per record, which
   * is quadratic -- and the first drag on a shelf that has never been arranged writes to
   * every record on it.
   */
  async putCopies(copies: readonly Copy[]): Promise<void> {
    if (copies.length === 0) return;
    await this.handle().withTransactionAsync(async () => {
      for (const copy of copies) {
        await this.write(copy);
      }
    });
    const pending = new Set(await this.readPendingIds());
    for (const copy of copies) pending.add(copy.id);
    await this.writePendingIds([...pending]);
  }

  async adoptCopy(copy: Copy): Promise<void> {
    // No pending mark: the client would otherwise push straight back what it just pulled.
    await this.write(copy);
  }

  /**
   * Records why some copies were created, for the next push to pass on.
   *
   * Local-only: the server needs the answer exactly once, when it first sees the row, and
   * a question only this device was asked has nothing to merge with anybody else's answer.
   */
  async rememberOrigins(ids: readonly string[], origin: CopyOrigin): Promise<void> {
    for (const id of ids) {
      await this.handle().runAsync(
        "INSERT OR REPLACE INTO copyOrigins (id, origin) VALUES (?, ?)",
        [id, origin],
      );
    }
  }

  async readOrigins(): Promise<Record<string, CopyOrigin>> {
    const rows = await this.handle().getAllAsync<{ id: string; origin: string }>(
      "SELECT id, origin FROM copyOrigins",
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.origin as CopyOrigin]));
  }

  /**
   * Forgets the answers the server has now been given.
   *
   * Cleared after the push, never before: a push that failed has to be able to say the
   * same thing again, or a record added underground would go quiet for good.
   */
  async forgetOrigins(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.handle().runAsync(
      `DELETE FROM copyOrigins WHERE id IN (${ids.map(() => "?").join(",")})`,
      [...ids],
    );
  }

  private async write(copy: Copy): Promise<void> {
    await this.handle().runAsync(
      `INSERT OR REPLACE INTO copies
        (id, releaseId, albumId, pendingBarcode, manualTitle, manualArtist, manualYear,
         manualLabel, manualCatalogNumber, manualFormat, condition, sleeveCondition,
         pricePaidCents, currency, purchasedOn, purchasedAt, notes, notesConflict, rating,
         catalogArt, hidden, sortIndex, createdAt, deletedAt, fieldClocks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        copy.id,
        copy.releaseId,
        copy.albumId,
        copy.pendingBarcode,
        copy.manualTitle,
        copy.manualArtist,
        copy.manualYear,
        copy.manualLabel,
        copy.manualCatalogNumber,
        copy.manualFormat,
        copy.condition,
        copy.sleeveCondition,
        copy.pricePaidCents,
        copy.currency,
        copy.purchasedOn,
        copy.purchasedAt,
        copy.notes,
        copy.notesConflict,
        copy.rating,
        copy.catalogArt,
        copy.hidden ? 1 : 0,
        copy.sortIndex,
        copy.createdAt,
        copy.deletedAt,
        JSON.stringify(copy.fieldClocks),
      ],
    );
  }

  private async markPending(id: string): Promise<void> {
    const pending = new Set(await this.readPendingIds());
    if (pending.has(id)) return;
    pending.add(id);
    await this.writePendingIds([...pending]);
  }

  async cacheReleases(releases: readonly Release[]): Promise<void> {
    const db = this.handle();
    // Read first, in one go: `mergeCachedRelease` decides each row against the one already
    // held, and a cover this device knows about is never written back to nothing.
    const held = await this.getReleases(releases.map((release) => release.id));
    await db.withTransactionAsync(async () => {
      for (const cached of releases) {
        const release = mergeCachedRelease(cached, held.get(cached.id));
        await db.runAsync(
          `INSERT OR REPLACE INTO releases
            (id, albumId, title, artistName, year, format, label, catalogNumber,
             country, barcode, coverArtUrl, coverTheme, cachedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            release.id,
            release.albumId,
            release.title,
            release.artistName,
            release.year,
            release.format,
            release.label,
            release.catalogNumber,
            release.country,
            release.barcode,
            release.coverArtUrl,
            release.coverTheme === null ? null : JSON.stringify(release.coverTheme),
            release.cachedAt,
          ],
        );
      }
    });
  }

  async getRelease(releaseId: string): Promise<Release | undefined> {
    // A manual release is never cached: it is derived from the copy that describes it, so
    // that a device which pulled the copy resolves it with no cache row at all.
    const copyId = manualReleaseCopyId(releaseId);
    if (copyId !== null) {
      const row = await this.handle().getFirstAsync<CopyRow>("SELECT * FROM copies WHERE id = ?", [
        copyId,
      ]);
      return row === null ? undefined : manualRelease(toCopy(row));
    }
    const row = await this.handle().getFirstAsync<ReleaseRow>(
      "SELECT * FROM releases WHERE id = ?",
      [releaseId],
    );
    return row === null ? undefined : toRelease(row);
  }

  async getReleases(releaseIds: readonly string[]): Promise<Map<string, Release>> {
    const unique = [...new Set(releaseIds)];
    if (unique.length === 0) return new Map();
    const found = new Map<string, Release>();

    const manualCopyIds = unique.map(manualReleaseCopyId).filter((id): id is string => id !== null);
    if (manualCopyIds.length > 0) {
      const copies = await this.handle().getAllAsync<CopyRow>(
        `SELECT * FROM copies WHERE id IN (${manualCopyIds.map(() => "?").join(",")})`,
        manualCopyIds,
      );
      for (const row of copies) {
        const copy = toCopy(row);
        found.set(catalogueKeyOf(copy) ?? "", manualRelease(copy));
      }
    }

    const cachedIds = unique.filter((id) => !isManualReleaseId(id));
    if (cachedIds.length > 0) {
      const rows = await this.handle().getAllAsync<ReleaseRow>(
        `SELECT * FROM releases WHERE id IN (${cachedIds.map(() => "?").join(",")})`,
        cachedIds,
      );
      for (const row of rows) found.set(row.id, toRelease(row));
    }
    return found;
  }

  async listPhotos(copyId: string): Promise<Photo[]> {
    const rows = await this.handle().getAllAsync<PhotoRow>(
      "SELECT * FROM photos WHERE copyId = ? AND deletedAt IS NULL ORDER BY sortIndex ASC",
      [copyId],
    );
    return rows.map(toPhoto);
  }

  async listCoverPhotos(copyIds: readonly string[]): Promise<Map<string, Photo>> {
    // An IN () with nothing in it is a syntax error, and the callers hit it on first paint.
    if (copyIds.length === 0) return new Map();
    const rows = await this.handle().getAllAsync<PhotoRow>(
      `SELECT * FROM photos WHERE deletedAt IS NULL AND copyId IS NOT NULL AND copyId IN (${copyIds.map(() => "?").join(",")}) ORDER BY sortIndex ASC`,
      copyIds as string[],
    );

    const first = new Map<string, Photo>();
    // Ordered by sortIndex, so the first row seen for a copy is the one the strip shows
    // first — the same picture on the shelf as on the detail screen.
    for (const row of rows) {
      if (row.copyId !== null && !first.has(row.copyId)) first.set(row.copyId, toPhoto(row));
    }
    return first;
  }

  async listWishPhotos(wishIds: readonly string[]): Promise<Map<string, Photo>> {
    // An IN () with nothing in it is a syntax error, and the callers hit it on first paint.
    if (wishIds.length === 0) return new Map();
    const rows = await this.handle().getAllAsync<PhotoRow>(
      `SELECT * FROM photos WHERE deletedAt IS NULL AND wishId IS NOT NULL AND wishId IN (${wishIds.map(() => "?").join(",")}) ORDER BY createdAt DESC`,
      wishIds as string[],
    );

    const covers = new Map<string, Photo>();
    // Newest first: replacing a picture writes a second one, and the tombstone of the
    // first may not have reached this device yet.
    for (const row of rows) {
      if (row.wishId !== null && !covers.has(row.wishId)) covers.set(row.wishId, toPhoto(row));
    }
    return covers;
  }

  /** Every live photo, whoever owns it — the whole-shelf read the `.mc` export needs. */
  async listAllPhotos(): Promise<Photo[]> {
    const rows = await this.handle().getAllAsync<PhotoRow>(
      "SELECT * FROM photos WHERE deletedAt IS NULL ORDER BY sortIndex ASC",
    );
    return rows.map(toPhoto);
  }

  async getPhotoIncludingDeleted(id: string): Promise<Photo | undefined> {
    const row = await this.handle().getFirstAsync<PhotoRow>("SELECT * FROM photos WHERE id = ?", [
      id,
    ]);
    return row === null ? undefined : toPhoto(row);
  }

  async listPhotosAwaitingUpload(): Promise<Photo[]> {
    const rows = await this.handle().getAllAsync<PhotoRow>(
      "SELECT * FROM photos WHERE storageKey IS NULL AND deletedAt IS NULL",
    );
    // Only those whose bytes are actually on this device; a photo pulled from elsewhere
    // has nothing to upload and retrying it forever would be pointless.
    const withBytes: Photo[] = [];
    for (const row of rows) {
      const info = await FileSystem.getInfoAsync(photoPath(row.id));
      if (info.exists) withBytes.push(toPhoto(row));
    }
    return withBytes;
  }

  async putPhoto(photo: Photo): Promise<void> {
    await this.writePhoto(photo);
    await this.markPending(photo.id);
  }

  async adoptPhoto(photo: Photo): Promise<void> {
    await this.writePhoto(photo);
  }

  private async writePhoto(photo: Photo): Promise<void> {
    await this.handle().runAsync(
      `INSERT OR REPLACE INTO photos
        (id, copyId, wishId, storageKey, contentType, byteSize, sortIndex, createdAt, deletedAt, fieldClocks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        photo.id,
        photo.copyId,
        photo.wishId,
        photo.storageKey,
        photo.contentType,
        photo.byteSize,
        photo.sortIndex,
        photo.createdAt,
        photo.deletedAt,
        JSON.stringify(photo.fieldClocks),
      ],
    );
  }

  /**
   * Image bytes go to the filesystem, not into SQLite: a few megabytes per row would
   * bloat the database and slow down every unrelated query that walks it.
   */
  async putPhotoBytes(id: string, buffer: ArrayBuffer, _contentType: string): Promise<void> {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => undefined);
    await FileSystem.writeAsStringAsync(photoPath(id), encodeBase64(buffer), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  async getPhotoBytes(id: string): Promise<Blob | undefined> {
    const info = await FileSystem.getInfoAsync(photoPath(id));
    if (!info.exists) return undefined;
    const base64 = await FileSystem.readAsStringAsync(photoPath(id), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return new Blob([decodeBase64(base64).buffer as ArrayBuffer]);
  }

  /** Whether the file is here, without reading it — the sweep asks this about everything. */
  async hasPhotoBytes(id: string): Promise<boolean> {
    return (await FileSystem.getInfoAsync(photoPath(id))).exists;
  }

  /**
   * The bytes themselves, which `getPhotoBytes`'s `Blob` cannot give back.
   *
   * React Native's Blob is a handle into a native registry with no way to read it in
   * JavaScript, so the archive reads the file this store already keeps on disk. That is
   * the phone's half of the seam `exportMcArchive` asks for.
   */
  async photoBuffer(id: string): Promise<Uint8Array | undefined> {
    const info = await FileSystem.getInfoAsync(photoPath(id));
    if (!info.exists) return undefined;
    return decodeBase64(
      await FileSystem.readAsStringAsync(photoPath(id), {
        encoding: FileSystem.EncodingType.Base64,
      }),
    );
  }

  /** The on-device file URI, which is what an Image component renders from. */
  photoUri(id: string): string {
    return photoPath(id);
  }

  async deletePhotoBytes(id: string): Promise<void> {
    await FileSystem.deleteAsync(photoPath(id), { idempotent: true }).catch(() => undefined);
  }

  /** Scanned, kept, and still nameless — see {@link LocalStore.listPendingScans}. */
  async listPendingScans(): Promise<{ copies: Copy[]; wishes: WishlistItem[] }> {
    const db = this.handle();
    const copies = await db.getAllAsync<CopyRow>(
      "SELECT * FROM copies WHERE deletedAt IS NULL AND pendingBarcode IS NOT NULL",
    );
    const wishes = await db.getAllAsync<WishRow>(
      "SELECT * FROM wishlist WHERE deletedAt IS NULL AND pendingBarcode IS NOT NULL",
    );
    return { copies: copies.map(toCopy), wishes: wishes.map(toWish) };
  }

  async listWishlist(): Promise<WishlistItem[]> {
    const rows = await this.handle().getAllAsync<WishRow>(
      "SELECT * FROM wishlist WHERE deletedAt IS NULL ORDER BY createdAt DESC",
    );
    return rows.map(toWish);
  }

  async getWishlistItemIncludingDeleted(id: string): Promise<WishlistItem | undefined> {
    const row = await this.handle().getFirstAsync<WishRow>("SELECT * FROM wishlist WHERE id = ?", [
      id,
    ]);
    return row === null ? undefined : toWish(row);
  }

  async wishlistHas(albumId: string): Promise<boolean> {
    const row = await this.handle().getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM wishlist WHERE albumId = ? AND deletedAt IS NULL",
      [albumId],
    );
    return (row?.n ?? 0) > 0;
  }

  async putWishlistItem(item: WishlistItem): Promise<void> {
    await this.writeWish(item);
    await this.markPending(item.id);
  }

  async adoptWishlistItem(item: WishlistItem): Promise<void> {
    // No pending mark: the client would otherwise push straight back what it just pulled.
    await this.writeWish(item);
  }

  private async writeWish(item: WishlistItem): Promise<void> {
    await this.handle().runAsync(
      `INSERT OR REPLACE INTO wishlist
        (id, albumId, releaseId, pendingBarcode, title, artistName, year, desiredFormat, note,
         sortIndex, createdAt, deletedAt, fieldClocks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.albumId,
        item.releaseId,
        item.pendingBarcode,
        item.title,
        item.artistName,
        item.year,
        item.desiredFormat,
        item.note,
        item.sortIndex,
        item.createdAt,
        item.deletedAt,
        JSON.stringify(item.fieldClocks),
      ],
    );
  }

  async stats(): Promise<CollectionStats> {
    const db = this.handle();
    const totals = await db.getFirstAsync<{ copyCount: number; totalSpentCents: number | null }>(
      "SELECT COUNT(*) AS copyCount, SUM(COALESCE(pricePaidCents, 0)) AS totalSpentCents FROM copies WHERE deletedAt IS NULL",
    );
    const groups = await db.getFirstAsync<{ releaseGroupCount: number }>(
      // LEFT JOIN, and a hand-entered copy counts as its own album: an inner join drops
      // every manual copy out of the count, so a shelf of nothing but bootlegs would
      // report zero releases.
      `SELECT COUNT(DISTINCT COALESCE(r.albumId, c.releaseId)) AS releaseGroupCount
       FROM copies c LEFT JOIN releases r ON r.id = c.releaseId WHERE c.deletedAt IS NULL`,
    );
    const perFormat = await db.getAllAsync<{ format: string; n: number }>(
      `SELECT COALESCE(c.manualFormat, r.format) AS format, COUNT(*) AS n
       FROM copies c LEFT JOIN releases r ON r.id = c.releaseId
       WHERE c.deletedAt IS NULL GROUP BY COALESCE(c.manualFormat, r.format)`,
    );

    const byFormat = Object.fromEntries(FORMATS.map((format) => [format, 0])) as Record<
      Format,
      number
    >;
    for (const row of perFormat) {
      if ((FORMATS as readonly string[]).includes(row.format)) {
        byFormat[row.format as Format] = row.n;
      }
    }

    const copyCount = totals?.copyCount ?? 0;
    const totalSpentCents = totals?.totalSpentCents ?? 0;
    return {
      copyCount,
      releaseGroupCount: groups?.releaseGroupCount ?? 0,
      totalSpentCents,
      averageSpentCents: copyCount === 0 ? 0 : Math.round(totalSpentCents / copyCount),
      byFormat,
    };
  }

  async deviceId(): Promise<string> {
    const existing = await this.readMeta(DEVICE_ID_KEY);
    if (existing !== undefined) return existing;
    const generated = Crypto.randomUUID();
    await this.writeMeta(DEVICE_ID_KEY, generated);
    return generated;
  }

  async readClock(): Promise<string | undefined> {
    return this.readMeta(CLOCK_KEY);
  }

  async writeClock(encoded: string): Promise<void> {
    await this.writeMeta(CLOCK_KEY, encoded);
  }

  async readSyncCursor(): Promise<number> {
    const stored = await this.readMeta(CURSOR_KEY);
    return stored === undefined ? 0 : Number.parseInt(stored, 10);
  }

  async writeSyncCursor(cursor: number): Promise<void> {
    await this.writeMeta(CURSOR_KEY, String(cursor));
  }

  async readPendingIds(): Promise<string[]> {
    const stored = await this.readMeta(PENDING_KEY);
    return stored === undefined ? [] : (JSON.parse(stored) as string[]);
  }

  async writePendingIds(ids: readonly string[]): Promise<void> {
    await this.writeMeta(PENDING_KEY, JSON.stringify(ids));
  }

  async readSetting(key: string): Promise<string | undefined> {
    return (await this.readMeta(`${SETTING_PREFIX}${key}`)) ?? undefined;
  }

  async writeSetting(key: string, value: string): Promise<void> {
    await this.writeMeta(`${SETTING_PREFIX}${key}`, value);
  }

  private async readMeta(key: string): Promise<string | undefined> {
    const row = await this.handle().getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = ?",
      [key],
    );
    return row?.value;
  }

  private async writeMeta(key: string, value: string): Promise<void> {
    await this.handle().runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [
      key,
      value,
    ]);
  }
}

interface CopyRow
  extends Omit<
    Copy,
    "fieldClocks" | "hidden" | "pendingBarcode" | "albumId" | "catalogArt" | "sortIndex"
  > {
  fieldClocks: string;
  /** SQLite has no boolean; 0 or 1. */
  hidden: number;
  /** Undefined on a row written before the column existed, which reads as "not pending". */
  pendingBarcode: string | null | undefined;
  /** Undefined on a row written before the column existed, for the same reason. */
  albumId: string | null | undefined;
  /** Undefined on a row written before this store had the column at all -- see the migration. */
  catalogArt: Copy["catalogArt"] | undefined;
  /** Undefined on a row older than the column, which reads the same as never placed. */
  sortIndex: number | null | undefined;
}

interface ReleaseRow extends Omit<Release, "coverTheme"> {
  coverTheme: string | null;
}

type PhotoRow = Omit<Photo, "fieldClocks"> & { fieldClocks: string };

type WishRow = Omit<
  WishlistItem,
  "desiredFormat" | "releaseId" | "pendingBarcode" | "fieldClocks"
> & {
  desiredFormat: string | null;
  /** Undefined on a row written before the column existed, which reads as "none picked". */
  releaseId: string | null | undefined;
  pendingBarcode: string | null | undefined;
  fieldClocks: string;
};

function toCopy(row: CopyRow): Copy {
  return {
    ...row,
    hidden: row.hidden === 1,
    // Undefined on a row older than the column, and undefined is not null to the merge —
    // the same reason `toWish` normalises `releaseId`.
    pendingBarcode: row.pendingBarcode ?? null,
    // Undefined on a row written before the column existed, for the same reason.
    albumId: row.albumId ?? null,
    // A row from before this store held the column at all. AUTO is what it behaved as.
    catalogArt: row.catalogArt ?? "AUTO",
    // Undefined on a row older than the column; never placed, which is what null means.
    sortIndex: row.sortIndex ?? null,
    fieldClocks: JSON.parse(row.fieldClocks) as Copy["fieldClocks"],
  };
}

function toPhoto(row: PhotoRow): Photo {
  return { ...row, fieldClocks: JSON.parse(row.fieldClocks) as Photo["fieldClocks"] };
}

function toWish(row: WishRow): WishlistItem {
  return {
    ...row,
    // A row written before the column existed reads back undefined, and undefined is not
    // null to the merge: a field missing from a pushed record reads as one nobody has ever
    // set, which is a different claim from "no pressing was picked".
    releaseId: row.releaseId ?? null,
    pendingBarcode: row.pendingBarcode ?? null,
    desiredFormat: row.desiredFormat as Format | null,
    fieldClocks: JSON.parse(row.fieldClocks) as WishlistItem["fieldClocks"],
  };
}

function toRelease(row: ReleaseRow): Release {
  return {
    ...row,
    format: row.format as Format,
    coverTheme:
      row.coverTheme === null ? null : (JSON.parse(row.coverTheme) as Release["coverTheme"]),
  };
}

/**
 * Why a copy exists — the only thing that decides whether it reaches anybody's feed.
 *
 * The server cannot work it out for itself: an import of two hundred records and two
 * hundred typed in over a fortnight arrive in exactly the same shape.
 */
export type CopyOrigin = "MANUAL" | "CSV_IMPORT" | "FIRST_SYNC";
