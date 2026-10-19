const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database");

const router = express.Router();

function validUsername(u) {
  return typeof u === "string" && /^[A-Za-z0-9_-]{3,30}$/.test(u);
}

router.post("/register", async (req, res) => {
  try {
    const { username, password, remember } = req.body || {};
    if (!validUsername(username)) {
      return res.status(400).json({ success:false, message:"Username must be 3-30 characters using letters, numbers, _ or -." });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return res.status(400).json({ success:false, message:"Password must be 8-128 characters." });
    }
    if (db.prepare("SELECT id FROM users WHERE username=?").get(username)) {
      return res.status(409).json({ success:false, message:"Username already exists." });
    }
    const hash = await bcrypt.hash(password, 12);
    const limit = Number(process.env.STORAGE_LIMIT_MB || 500) * 1024 * 1024;
    const info = db.prepare("INSERT INTO users(username,password_hash,storage_limit) VALUES(?,?,?)").run(username, hash, limit);
    req.session.userId = info.lastInsertRowid;
    req.session.username = username;
    if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    db.prepare("INSERT INTO activity_logs(user_id,action,details) VALUES(?,?,?)").run(info.lastInsertRowid,"register","Account created");
    res.json({ success:true, message:"Account created successfully.", username });
  } catch (e) {
    res.status(500).json({ success:false, message:"Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password, remember } = req.body || {};
    const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
    if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) {
      return res.status(401).json({ success:false, message:"Invalid username or password." });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({success:false,message:"Session error."});
      req.session.userId = user.id;
      req.session.username = user.username;
      if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      db.prepare("INSERT INTO activity_logs(user_id,action,details) VALUES(?,?,?)").run(user.id,"login","Successful login");
      res.json({ success:true, message:"Login successful.", username:user.username });
    });
  } catch (e) {
    res.status(500).json({success:false,message:"Login failed."});
  }
});

router.get("/logout", (req,res) => {
  const uid = req.session?.userId;
  if (uid) db.prepare("INSERT INTO activity_logs(user_id,action,details) VALUES(?,?,?)").run(uid,"logout","User logged out");
  req.session.destroy(() => res.json({success:true,message:"Logged out."}));
});

module.exports = router;
