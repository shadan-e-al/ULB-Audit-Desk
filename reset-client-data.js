
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "data", "db.json");
const UPLOAD_DIR = path.join(ROOT, "upload");

function resetClientData() {
  if (!fs.existsSync(DB_FILE)) {
    throw new Error("data/db.json was not found. Nothing changed.");
  }

  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

  // Validate the database before making any changes.
  const requiredArrays = [
    "users", "districts", "ulbs", "audits",
    "form2", "attendance", "auditLogs", "revenue",
    "observations", "checklists", "checklistRecords",
    "queryDocuments"
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(db[key])) {
      throw new Error(
        `Unexpected database structure: "${key}" is not an array. Nothing changed.`
      );
    }
  }

  const admins = db.users.filter(
    user => user.role === "admin"
  );

  if (admins.length !== 1) {
    throw new Error(
      `Expected exactly 1 admin; found ${admins.length}. Nothing changed.`
    );
  }

  // Create a backup outside the client project folder.
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupDir = path.resolve(
    ROOT,
    "..",
    `ulb-client-reset-backup-${stamp}`
  );

  fs.mkdirSync(backupDir, { recursive: true });

  fs.copyFileSync(
    DB_FILE,
    path.join(backupDir, "db.json")
  );

  if (fs.existsSync(UPLOAD_DIR)) {
    fs.cpSync(
      UPLOAD_DIR,
      path.join(backupDir, "upload"),
      { recursive: true, errorOnExist: true }
    );
  }

  // Keep only the existing admin account.
  db.users = admins;

  // Clear test/business records, not master data.
  const collectionsToClear = [
    "audits",
    "form2",
    "attendance",
    "auditLogs",
    "revenue",
    "observations",
    "checklists",
    "checklistRecords",
    "queryDocuments"
  ];

  const previousCounts = {};

  for (const key of collectionsToClear) {
    previousCounts[key] = db[key].length;
    db[key] = [];
  }

  // Write the new database safely using a temporary file.
  const tempFile = `${DB_FILE}.reset-tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(db, null, 2),
    "utf8"
  );

  JSON.parse(fs.readFileSync(tempFile, "utf8"));
  fs.renameSync(tempFile, DB_FILE);

  // Clear uploaded test files after the database is saved.
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const entry of fs.readdirSync(UPLOAD_DIR)) {
      fs.rmSync(path.join(UPLOAD_DIR, entry), {
        recursive: true,
        force: true
      });
    }
  }

  console.log("\nClient data reset completed.");
  console.log("Admin account preserved:", admins[0].mobile);
  console.log("Districts preserved:", db.districts.length);
  console.log("ULBs preserved:", db.ulbs.length);
  console.log("Backup location:", backupDir);
  console.log("Cleared record counts:", previousCounts);
}

const confirmation = process.argv[2];

if (confirmation !== "RESET-CLIENT-DATA") {
  console.log(
    'No changes made. To confirm, run:\n' +
    'node reset-client-data.js RESET-CLIENT-DATA'
  );
  process.exitCode = 1;
} else {
  try {
    resetClientData();
  } catch (error) {
    console.error("Reset failed:", error.message);
    console.error("Check the backup folder before retrying.");
    process.exitCode = 1;
  }
}
