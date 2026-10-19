const $=s=>document.querySelector(s);
let state=null;
async function api(url,opt={}){const r=await fetch(url,{credentials:"include",...opt});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.message||"Request failed");return d}
function bytes(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";if(n<1073741824)return (n/1048576).toFixed(1)+" MB";return (n/1073741824).toFixed(1)+" GB"}
async function load(){
 try{
  state=await api("/api/user");
  $("#hello").textContent=state.username;
  $("#avatar").textContent=state.username[0].toUpperCase();
  $("#webCount").textContent=state.projects.length;
  $("#storage").textContent=bytes(state.storage.used)+" / "+bytes(state.storage.limit);
  $("#versions").textContent=state.totalVersions;
  renderProjects();
  const a=await api("/api/activity");$("#activityList").innerHTML=a.activity.map(x=>`<div><b>${esc(x.action)}</b><small>${esc(x.details||"")} · ${new Date(x.created_at).toLocaleString()}</small></div>`).join("")||"<p>No activity yet.</p>";
 }catch(e){location.href="/login.html"}
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderProjects(){
 $("#projects").innerHTML=state.projects.length?state.projects.map(p=>`<div class="project"><div><h3>${esc(p.name)}</h3><p>${esc(p.subdomain)} · ${bytes(p.storageUsed)} · ${p.versions.length} versions</p></div><div class="projectActions"><a class="iconbtn" target="_blank" href="${esc(p.url)}">Open</a><button class="iconbtn" onclick="download('${encodeURIComponent(p.name)}')">Versions</button><button class="iconbtn danger" onclick="del('${encodeURIComponent(p.name)}')">Delete</button></div></div>`).join(""):"<div class='empty'><p>No websites yet. Deploy your first HTML file.</p></div>";
}
async function refresh(){await load()}
async function del(n){const name=decodeURIComponent(n);if(!confirm(`Delete ${name}? This cannot be undone.`))return;try{await api("/api/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({siteName:name})});await load()}catch(e){alert(e.message)}}
function download(n){const p=state.projects.find(x=>x.name===decodeURIComponent(n));if(!p||!p.versions.length)return alert("No versions.");const v=p.versions[0];window.open(`/api/download-version?project=${encodeURIComponent(p.name)}&v=${v}`,"_blank")}
$("#uploadForm").addEventListener("submit",async e=>{
 e.preventDefault();const fd=new FormData();const name=$("#siteName").value.trim();const file=$("#siteFile").files[0];if(!file)return;
 fd.append("siteName",name);fd.append("siteFile",file);fd.append("enableSecurity","yes");fd.append("isUpdate",state?.projects.some(p=>p.name===name)?"true":"false");
 $("#msg").textContent="Uploading and creating version...";
 try{await api("/upload",{method:"POST",body:fd});$("#msg").textContent="Deployed successfully.";e.target.reset();await load()}catch(x){$("#msg").textContent=x.message}
});
$("#passwordForm").addEventListener("submit",async e=>{e.preventDefault();const n=$("#newPassword").value;if(n!==$("#confirmPassword").value)return $("#setMsg").textContent="Passwords do not match.";try{await api("/api/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:$("#currentPassword").value,newPassword:n})});$("#setMsg").textContent="Password changed successfully.";e.target.reset()}catch(x){$("#setMsg").textContent=x.message}});
document.querySelectorAll(".side[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.add("hidden"));$("#"+b.dataset.tab).classList.remove("hidden");document.querySelectorAll(".side").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
$("#refresh").onclick=refresh;$("#logout").onclick=async()=>{await api("/logout");location.href="/login.html"};load();