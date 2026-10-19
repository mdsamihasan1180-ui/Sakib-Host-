const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../database");
const requireAuth = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = express.Router();
const ROOT = path.join(__dirname,"..","storage","projects");
const VROOT = path.join(__dirname,"..","storage","versions");
fs.mkdirSync(ROOT,{recursive:true});
fs.mkdirSync(VROOT,{recursive:true});

const cleanName = n => typeof n==="string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,50}$/.test(n);

function userProject(uid,name) {
  return db.prepare("SELECT * FROM projects WHERE user_id=? AND name=?").get(uid,name);
}
function safeJoin(base,...parts) {
  const target = path.resolve(base,...parts);
  if (!target.startsWith(path.resolve(base)+path.sep)) throw new Error("Invalid path.");
  return target;
}
function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total=0;
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,e.name);
    total += e.isDirectory()?dirSize(p):fs.statSync(p).size;
  }
  return total;
}
function copyDir(src,dst) {
  fs.mkdirSync(dst,{recursive:true});
  for(const e of fs.readdirSync(src,{withFileTypes:true})) {
    const a=path.join(src,e.name), b=path.join(dst,e.name);
    if(e.isDirectory()) copyDir(a,b); else fs.copyFileSync(a,b);
  }
}
function log(uid,a,d){ db.prepare("INSERT INTO activity_logs(user_id,action,details) VALUES(?,?,?)").run(uid,a,d); }

router.post("/api/projects", requireAuth, (req,res) => {
  const {name} = req.body || {};
  if(!cleanName(name)) return res.status(400).json({success:false,message:"Invalid website name."});
  if(userProject(req.session.userId,name)) return res.status(409).json({success:false,message:"Website already exists."});
  const subdomain=name.toLowerCase();
  if(db.prepare("SELECT id FROM projects WHERE subdomain=?").get(subdomain)) return res.status(409).json({success:false,message:"Subdomain is already in use."});
  const info=db.prepare("INSERT INTO projects(user_id,name,slug,subdomain) VALUES(?,?,?,?)").run(req.session.userId,name,name.toLowerCase(),subdomain);
  fs.mkdirSync(safeJoin(ROOT,String(req.session.userId),subdomain,"current"),{recursive:true});
  log(req.session.userId,"website_created",name);
  res.json({success:true,project:{id:info.lastInsertRowid,name,subdomain}});
});

router.post("/upload", requireAuth, upload.single("siteFile"), (req,res) => {
  let temp=req.file?.path;
  try {
    const {siteName,isUpdate}=req.body || {};
    if(!cleanName(siteName)) return res.status(400).json({success:false,message:"Invalid website name."});
    if(!req.file) return res.status(400).json({success:false,message:"HTML file is required."});
    let p=userProject(req.session.userId,siteName);
    if(!p && String(isUpdate)==="true") return res.status(404).json({success:false,message:"Project not found."});
    if(!p) {
      const sub=siteName.toLowerCase();
      if(db.prepare("SELECT id FROM projects WHERE subdomain=?").get(sub)) return res.status(409).json({success:false,message:"Subdomain is already in use."});
      const info=db.prepare("INSERT INTO projects(user_id,name,slug,subdomain) VALUES(?,?,?,?)").run(req.session.userId,siteName,sub,sub);
      p=db.prepare("SELECT * FROM projects WHERE id=?").get(info.lastInsertRowid);
    }
    const user=db.prepare("SELECT storage_limit FROM users WHERE id=?").get(req.session.userId);
    const oldSize=Number(p.storage_used||0);
    const newFileSize=fs.statSync(temp).size;
    const currentDir=safeJoin(ROOT,String(req.session.userId),p.subdomain,"current");
    fs.mkdirSync(currentDir,{recursive:true});
    const target=path.join(currentDir,"index.html");
    const existing=fs.existsSync(target)?fs.statSync(target).size:0;
    const projected=oldSize-existing+newFileSize;
    if(projected>user.storage_limit) return res.status(413).json({success:false,message:"Storage limit exceeded."});
    const count=db.prepare("SELECT COALESCE(MAX(version_number),0) n FROM project_versions WHERE project_id=?").get(p.id).n;
    const version=count+1;
    const versionDir=safeJoin(VROOT,String(req.session.userId),p.subdomain,`v${version}`);
    fs.mkdirSync(versionDir,{recursive:true});
    fs.copyFileSync(temp,path.join(versionDir,"index.html"));
    fs.copyFileSync(temp,target);
    const size=dirSize(currentDir);
    db.prepare("INSERT INTO project_versions(project_id,version_number,storage_path,size) VALUES(?,?,?,?)").run(p.id,version,versionDir,newFileSize);
    db.prepare("UPDATE projects SET storage_used=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(size,p.id);
    log(req.session.userId,"version_created",`${siteName} v${version}`);
    res.json({success:true,message:"Project deployed successfully.",project:{
      name:p.name,version,url:`${process.env.PUBLIC_URL || ""}/${encodeURIComponent(p.subdomain)}`
    }});
  } catch(e) {
    res.status(500).json({success:false,message:e.message||"Upload failed."});
  } finally {
    if(temp && fs.existsSync(temp)) fs.unlinkSync(temp);
  }
});

router.post("/api/delete",requireAuth,(req,res)=>{
  const name=req.body?.siteName;
  const p=userProject(req.session.userId,name);
  if(!p) return res.status(404).json({success:false,message:"Project not found."});
  fs.rmSync(safeJoin(ROOT,String(req.session.userId),p.subdomain),{recursive:true,force:true});
  fs.rmSync(safeJoin(VROOT,String(req.session.userId),p.subdomain),{recursive:true,force:true});
  db.prepare("DELETE FROM projects WHERE id=?").run(p.id);
  log(req.session.userId,"website_deleted",name);
  res.json({success:true,message:"Project deleted."});
});

router.post("/api/rename-project",requireAuth,(req,res)=>{
  const {oldName,newName}=req.body||{};
  if(!cleanName(oldName)||!cleanName(newName)) return res.status(400).json({success:false,message:"Invalid project name."});
  const p=userProject(req.session.userId,oldName);
  if(!p) return res.status(404).json({success:false,message:"Project not found."});
  if(userProject(req.session.userId,newName)) return res.status(409).json({success:false,message:"New name already exists."});
  const newSub=newName.toLowerCase();
  if(db.prepare("SELECT id FROM projects WHERE subdomain=?").get(newSub)) return res.status(409).json({success:false,message:"Subdomain already exists."});
  const oldBase=safeJoin(ROOT,String(req.session.userId),p.subdomain);
  const newBase=safeJoin(ROOT,String(req.session.userId),newSub);
  const oldV=safeJoin(VROOT,String(req.session.userId),p.subdomain);
  const newV=safeJoin(VROOT,String(req.session.userId),newSub);
  fs.renameSync(oldBase,newBase);
  if(fs.existsSync(oldV)) fs.renameSync(oldV,newV);
  db.prepare("UPDATE projects SET name=?,slug=?,subdomain=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newName,newName.toLowerCase(),newSub,p.id);
  db.prepare("UPDATE project_versions SET storage_path=REPLACE(storage_path,?,?) WHERE project_id=?").run(oldV,newV,p.id);
  log(req.session.userId,"website_renamed",`${oldName} -> ${newName}`);
  res.json({success:true,message:"Project renamed successfully.",project:{name:newName,subdomain:newSub}});
});

router.get("/api/download-version",requireAuth,(req,res)=>{
  const {project,v}=req.query;
  const p=userProject(req.session.userId,project);
  if(!p) return res.status(404).send("Project not found.");
  const ver=db.prepare("SELECT * FROM project_versions WHERE project_id=? AND version_number=?").get(p.id,Number(v));
  if(!ver) return res.status(404).send("Version not found.");
  const file=path.join(ver.storage_path,"index.html");
  if(!fs.existsSync(file)) return res.status(404).send("Version file not found.");
  res.download(file,`${p.name}-v${ver.version_number}.html`);
});

router.post("/api/restore-version",requireAuth,(req,res)=>{
  const p=userProject(req.session.userId,req.body?.project);
  const version=Number(req.body?.version);
  if(!p) return res.status(404).json({success:false,message:"Project not found."});
  const ver=db.prepare("SELECT * FROM project_versions WHERE project_id=? AND version_number=?").get(p.id,version);
  if(!ver) return res.status(404).json({success:false,message:"Version not found."});
  const source=path.join(ver.storage_path,"index.html");
  if(!fs.existsSync(source)) return res.status(404).json({success:false,message:"Version file missing."});
  const current=safeJoin(ROOT,String(req.session.userId),p.subdomain,"current");
  fs.mkdirSync(current,{recursive:true});
  const next=db.prepare("SELECT COALESCE(MAX(version_number),0) n FROM project_versions WHERE project_id=?").get(p.id).n+1;
  const vd=safeJoin(VROOT,String(req.session.userId),p.subdomain,`v${next}`);
  fs.mkdirSync(vd,{recursive:true});
  fs.copyFileSync(source,path.join(current,"index.html"));
  fs.copyFileSync(source,path.join(vd,"index.html"));
  db.prepare("INSERT INTO project_versions(project_id,version_number,storage_path,size) VALUES(?,?,?,?)").run(p.id,next,vd,fs.statSync(source).size);
  db.prepare("UPDATE projects SET storage_used=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(dirSize(current),p.id);
  log(req.session.userId,"version_restored",`${p.name} v${version} -> v${next}`);
  res.json({success:true,message:`Version ${version} restored as version ${next}.`});
});

router.get("/api/projects/:name/files",requireAuth,(req,res)=>{
  const p=userProject(req.session.userId,req.params.name);
  if(!p) return res.status(404).json({success:false,message:"Project not found."});
  const rel=String(req.query.path||"").replace(/\\/g,"/");
  if(rel.includes("..")) return res.status(400).json({success:false,message:"Invalid path."});
  const base=safeJoin(ROOT,String(req.session.userId),p.subdomain,"current");
  const dir=safeJoin(base,rel);
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory()) return res.status(404).json({success:false,message:"Folder not found."});
  const items=fs.readdirSync(dir,{withFileTypes:true}).map(e=>{
    const fp=path.join(dir,e.name);
    const st=fs.statSync(fp);
    return {name:e.name,type:e.isDirectory()?"folder":"file",size:e.isDirectory()?0:st.size,modifiedAt:st.mtime.toISOString()};
  });
  res.json({success:true,path:rel,files:items});
});

module.exports=router;
