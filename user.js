const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database");
const requireAuth = require("../middleware/auth");
const router = express.Router();

function projectList(userId) {
  return db.prepare(`
    SELECT p.*, COALESCE(GROUP_CONCAT(v.version_number), '') AS version_list
    FROM projects p
    LEFT JOIN project_versions v ON v.project_id=p.id
    WHERE p.user_id=?
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all(userId).map(p => ({
    name:p.name,
    url: `${process.env.PUBLIC_URL || ""}/${encodeURIComponent(p.subdomain)}`,
    subdomain:p.subdomain,
    customDomain:p.custom_domain,
    versions:p.version_list ? p.version_list.split(",").map(Number).sort((a,b)=>b-a) : [],
    storageUsed:p.storage_used,
    createdAt:p.created_at,
    updatedAt:p.updated_at,
    status:p.status
  }));

router.get("/api/user", requireAuth, (req,res) => {
  const user = db.prepare("SELECT id,username,storage_limit,created_at FROM users WHERE id=?").get(req.session.userId);
  if (!user) return res.status(401).json({authenticated:false});
  const projects = projectList(user.id);
  const used = db.prepare("SELECT COALESCE(SUM(storage_used),0) used FROM projects WHERE user_id=?").get(user.id).used;
  const versions = db.prepare("SELECT COUNT(*) n FROM project_versions v JOIN projects p ON p.id=v.project_id WHERE p.user_id=?").get(user.id).n;
  res.json({
    authenticated:true,
    username:user.username,
    createdAt:user.created_at,
    storage:{used,limit:user.storage_limit,available:Math.max(0,user.storage_limit-used)},
    totalVersions:versions,
    projects
  });
});

router.get("/api/activity", requireAuth, (req,res) => {
  const rows = db.prepare("SELECT action,details,created_at FROM activity_logs WHERE user_id=? ORDER BY id DESC LIMIT 30").all(req.session.userId);
  res.json({success:true,activity:rows});
});

router.post("/api/change-password", requireAuth, async (req,res) => {
  const {currentPassword,newPassword} = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({success:false,message:"New password must be at least 8 characters."});
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!u || !(await bcrypt.compare(String(currentPassword||""),u.password_hash))) return res.status(400).json({success:false,message:"Current password is incorrect."});
  const hash = await bcrypt.hash(newPassword,12);
  db.prepare("UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(hash,u.id);
  res.json({success:true,message:"Password changed."});
});

module.exports = { router, projectList };
