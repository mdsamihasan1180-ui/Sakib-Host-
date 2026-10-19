const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
require("dotenv").config();

const dbPath = path.resolve(process.env.DATABASE_PATH || "./database/sakibhost.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

const schema = fs.readFileSync(path.join(__dirname, "database", "schema.sql"), "utf8");
db.exec(schema);

module.exports = db;
