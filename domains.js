const express=require("express");
const db=require("../database");
const requireAuth=require("../middleware/auth");
const router=express.Router();

router.get("/api/domains",requireAuth,(req,res)=>{
  const rows=db.prepare(`
    SELECT d.*,p.name project
    FROM domains d JOIN projects p ON p.id=d.project_id
    WHERE p.user_id=? ORDER BY d.id DESC
  `).all(req.session.userId);
  res.json({success:true,domains:rows});
});

router.post("/api/domains",requireAuth,(req,res)=>{
  const domain=String(req.body?.domain||"").trim().toLowerCase();
  const project=String(req.body?.project||"");
  if(!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))
    return res.status(400).json({success:false,message:"Invalid domain."});
  const p=db.prepare("SELECT * FROM projects WHERE user_id=? AND name=?").get(req.session.userId,project);
  if(!p) return res.status(404).json({success:false,message:"Project not found."});
  try {
    db.prepare("INSERT INTO domains(project_id,domain) VALUES(?,?)").run(p.id,domain);
    db.prepare("UPDATE projects SET custom_domain=? WHERE id=?").run(domain,p.id);
    res.json({success:true,message:"Domain added. DNS verification is pending.",status:"pending"});
  } catch(e) {
    res.status(409).json({success:false,message:"Domain is already registered."});
  }
});
module.exports=router;
