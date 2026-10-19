require("dotenv").config();
const express=require("express");
const session=require("express-session");
const cookieParser=require("cookie-parser");
const helmet=require("helmet");
const rateLimit=require("express-rate-limit");
const path=require("path");
const fs=require("fs");
const db=require("./database");
const auth=require("./routes/auth");
const {router:userRouter}=require("./routes/user");
const projects=require("./routes/projects");
const domains=require("./routes/domains");

const app=express();
const PORT=Number(process.env.PORT||3000);
const HOSTING_DOMAIN=String(process.env.HOSTING_DOMAIN||"localhost").toLowerCase();
const PUBLIC_URL=String(process.env.PUBLIC_URL||`http://localhost:${PORT}`).replace(/\/$/,"");

app.set("trust proxy",1);
app.use(helmet({
  contentSecurityPolicy:false,
  crossOriginResourcePolicy:{policy:"cross-origin"}
}));
app.use(cookieParser());
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true,limit:"1mb"}));

const authLimiter=rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false});
app.use(["/login","/register"],authLimiter);

app.use(session({
  secret:process.env.SESSION_SECRET||"change-me",
  resave:false,
  saveUninitialized:false,
  cookie:{
    httpOnly:true,
    sameSite:"lax",
    secure:process.env.NODE_ENV==="production",
    maxAge:7*24*60*60*1000
  }
}));

app.use(auth);
app.use(userRouter);
app.use(projects);
app.use(domains);

app.get("/health",(req,res)=>res.json({ok:true,name:"SAKIB HOST",time:new Date().toISOString()}));

/* Serve hosted projects through:
   /project-name on the same origin for local testing, and
   project-name.HOSTING_DOMAIN in production with wildcard DNS.
*/
function serveProject(project,req,res,next){
  const userDir=path.join(__dirname,"storage","projects",String(project.user_id),project.subdomain,"current");
  const index=path.join(userDir,"index.html");
  if(!fs.existsSync(index)) return res.status(404).send("Website not deployed yet.");
  const requested=req.path.replace(/^\/+/,"");
  const target=requested ? path.resolve(userDir,requested) : index;
  if(!target.startsWith(path.resolve(userDir)+path.sep) && target!==path.resolve(userDir)) return res.status(400).send("Invalid path.");
  if(fs.existsSync(target) && fs.statSync(target).isFile()) return res.sendFile(target);
  return res.sendFile(index);
}

app.use((req,res,next)=>{
  const host=(req.hostname||"").toLowerCase().split(":")[0];
  let sub=null;

  if(host.endsWith("."+HOSTING_DOMAIN) && host!==HOSTING_DOMAIN) {
    sub=host.slice(0,-(HOSTING_DOMAIN.length+1));
  }

  /* Local/dev fallback: http://localhost:3000/project-name/... */
  if(!sub && host==="localhost") {
    const parts=req.path.split("/").filter(Boolean);
    if(parts.length) {
      const candidate=parts[0];
      if(/^[A-Za-z0-9_-]+$/.test(candidate)) sub=candidate.toLowerCase();
      if(sub) req.url="/"+parts.slice(1).join("/");
    }
  }

  if(!sub) return next();

  const project=db.prepare("SELECT * FROM projects WHERE subdomain=? AND status='active'").get(sub);
  if(!project) return res.status(404).send("SAKIB HOST: Website not found.");
  return serveProject(project,req,res,next);
});

app.use(express.static(path.join(__dirname,"public")));

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.use((err,req,res,next)=>{
  console.error(err);
  const status=err.code==="LIMIT_FILE_SIZE"?413:400;
  res.status(status).json({success:false,message:err.message||"Server error."});
});

fs.mkdirSync(path.join(__dirname,"storage","tmp"),{recursive:true});
fs.mkdirSync(path.join(__dirname,"storage","projects"),{recursive:true});
fs.mkdirSync(path.join(__dirname,"storage","versions"),{recursive:true});

app.listen(PORT,()=>console.log(`SAKIB HOST running on ${PUBLIC_URL}`));
