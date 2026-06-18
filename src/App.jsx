import { useState, useRef, useEffect } from "react";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:"#0f1117", surface:"#1a1d27", surfaceAlt:"#22263a", border:"#2e3248",
  amber:"#f0a500", green:"#22c55e", red:"#ef4444", muted:"#6b7280",
  text:"#e8eaf0", textSoft:"#a0a8c0", blue:"#3b82f6", purple:"#a855f7", teal:"#14b8a6",
};
const mono = "'JetBrains Mono','Courier New',monospace";

// ─── Storage ──────────────────────────────────────────────────────────────────
const V = "v6";
const KEYS = {
  items:`bh_items_${V}`, purchases:`bh_purch_${V}`, scans:`bh_scans_${V}`,
  priceHist:`bh_prices_${V}`, walks:`bh_walks_${V}`, liquor:`bh_liquor_${V}`,
  bevSales:`bh_bevs_${V}`, snaps:`bh_snaps_${V}`, waste:`bh_waste_${V}`,
  recipes:`bh_recipes_${V}`, settings:`bh_settings_${V}`, users:`bh_users_${V}`,
  sales:`bh_sales_${V}`,
};
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATS   = ["Food - Protein","Food - Produce","Food - Dairy","Food - Dry","Food - Frozen","Food - Misc","Beverage - NA","Liquor","Beer","Wine","Supplies","Other"];
const UNITS  = ["ea","lb","oz","kg","g","cs","bt","gal","qt","pt","L","mL","bag","box","can","doz"];
const VENDORS= ["Sysco","US Foods","Gordon Food Service","Restaurant Depot","Performance Food Group","Lone Star","Shamrock","Local Farm","Other"];
const BCATS  = ["Spirits","Beer","Wine","NA Bev"];
const BSIZES = ["750mL","1L","1.75L","375mL","200mL","keg","6-pack","case","can","other"];
const STYPES = ["Whiskey","Bourbon","Scotch","Vodka","Gin","Rum","Tequila","Mezcal","Brandy","Liqueur","Other Spirit"];
const WTYPES = ["Spoilage","Breakage","Comp/Void","Spill","Theft","Transfer Out","Over-prep","Other"];

const DEFAULT_WALKS = [
  {id:"w-walkin", name:"Walk-In Cooler", emoji:"🥩", itemIds:[]},
  {id:"w-dry",    name:"Dry Storage",    emoji:"🥫", itemIds:[]},
  {id:"w-freeze", name:"Freezer",        emoji:"❄️",  itemIds:[]},
  {id:"w-bar",    name:"Bar",            emoji:"🍺", itemIds:[]},
];
const DEFAULT_SETTINGS = { restaurantName:"Beacon Hills", foodTarget:29, bevTarget:22, wasteTarget:2 };
const DEFAULT_ADMIN    = { id:"admin-default", name:"Admin", role:"admin", pin:"1234" };

const CAT_TO_WALK = {
  "Food - Protein":"w-walkin","Food - Produce":"w-walkin","Food - Dairy":"w-walkin",
  "Food - Dry":"w-dry","Food - Misc":"w-dry","Supplies":"w-dry","Other":"w-dry",
  "Food - Frozen":"w-freeze",
  "Beverage - NA":"w-bar","Liquor":"w-bar","Beer":"w-bar","Wine":"w-bar",
};

const WALK_EMOJI = [
  [/walk.?in|cooler|cold/i,"🥩"],[/freezer|frozen/i,"❄️"],
  [/dry|shelf|pantry/i,"🥫"],[/bar|liquor|beer|wine/i,"🍺"],
  [/prep|line/i,"🍳"],[/produce|veg/i,"🥦"],[/dairy/i,"🧀"],
];
const pickEmoji = n => (WALK_EMOJI.find(([rx]) => rx.test(n)) || [, "📦"])[1];

const ROLE_TABS = {
  admin:   null,
  manager: ["home","count","walk","scan","items","liquor","waste","reports","history"],
  counter: ["count","walk","scan"],
};
const ROLE_FINANCE = { admin:true, manager:true, counter:false };
const ROLE_COLOR   = { admin:C.amber, manager:C.blue, counter:C.green };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$   = n => `$${Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtPct = n => `${Number(n||0).toFixed(1)}%`;
const uid    = () => `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
const today  = () => new Date().toISOString().slice(0,10);
const b64    = f  => new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(f); });

function autoAssign(itemList, walks) {
  const updated = walks.map(w => ({...w, itemIds:[...w.itemIds]}));
  itemList.forEach(item => {
    const wid = CAT_TO_WALK[item.category] || "w-dry";
    const w   = updated.find(x => x.id === wid);
    if (w && !w.itemIds.includes(item.id)) w.itemIds.push(item.id);
  });
  return updated;
}

// ─── CSV export ───────────────────────────────────────────────────────────────
const toCSV = rows => rows.map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(",")).join("\n");
const dlCSV = (rows, name) => {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([toCSV(rows)], {type:"text/csv"})),
    download: name,
  });
  a.click();
};

// ─── AI call ─────────────────────────────────────────────────────────────────
async function aiCall(messages, maxTokens=4000) {
  const apiKey = LS.get("bh_apikey_v6", "");
  if (!apiKey) throw new Error("No API key — add your Anthropic key in ⚙ Settings");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{
      "Content-Type":"application/json",
      "x-api-key": apiKey,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true",
    },
    body: JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:maxTokens, messages,
      system:"Output ONLY valid JSON. Never truncate. Use short field values if needed to stay within limits.",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API error");
  let raw = data.content?.map(c => c.text||"").join("") || "";

  // Strip markdown fences
  raw = raw.replace(/```json\s*/gi,"").replace(/```\s*/g,"");
  // Find first structural character
  const first = raw.search(/[\[{]/);
  if (first > 0) raw = raw.slice(first);
  // Find last structural character
  const last = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (last >= 0) raw = raw.slice(0, last+1);
  raw = raw.trim();

  // Try direct parse
  try { return JSON.parse(raw); } catch(_) {}

  // Salvage truncated JSON — try each terminator
  for (const term of ['"},', '},', '"}', '}']) {
    const pos = raw.lastIndexOf(term);
    if (pos <= 0) continue;
    let s = raw.slice(0, pos + term.length - (term.endsWith(',') ? 1 : 0));
    const opens  = (s.match(/[\[{]/g)||[]).length;
    const closes = (s.match(/[\]}]/g)||[]).length;
    const diff   = opens - closes;
    if      (diff === 2) s += ']}';
    else if (diff === 1) s += '}';
    else if (diff > 2)  s += ']' + '}'.repeat(diff-1);
    try { return JSON.parse(s); } catch(_) {}
  }
  throw new Error("Could not parse AI response — try a clearer photo or shorter document");
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
const S = {
  card:  { background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:12, overflow:"hidden" },
  hd:    { padding:"11px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" },
  title: (color=C.amber) => ({ fontFamily:mono, fontSize:10, letterSpacing:2.5, color, textTransform:"uppercase" }),
  inp:   { width:"100%", background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:6, padding:"9px 11px", color:C.text, fontFamily:mono, fontSize:13, boxSizing:"border-box" },
  btn:   (v="primary") => ({
    display:"inline-flex", alignItems:"center", gap:6, padding:"9px 16px",
    borderRadius:6, border:"none", fontFamily:mono, fontSize:11, letterSpacing:1,
    cursor:"pointer", fontWeight:700,
    background: v==="primary"?C.amber : v==="danger"?C.red : v==="blue"?C.blue : v==="purple"?C.purple : v==="teal"?C.teal : v==="ghost"?"transparent" : C.surfaceAlt,
    color: v==="primary"?"#000" : C.text,
  }),
  badge: (color) => ({ display:"inline-block", padding:"2px 7px", borderRadius:3, background:`${color}22`, color, fontSize:10, fontFamily:mono, letterSpacing:1 }),
  th:    { padding:"7px 10px", textAlign:"left", color:C.muted, fontSize:9, letterSpacing:2, textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" },
  td:    { padding:"9px 10px", borderBottom:`1px solid ${C.border}15`, verticalAlign:"middle" },
  lbl:   { fontSize:9, color:C.muted, fontFamily:mono, letterSpacing:1.5, marginBottom:4 },
};

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
  return (
    <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:C.green,color:"#000",fontFamily:mono,fontSize:12,padding:"10px 20px",borderRadius:24,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 4px 20px #0008"}}>
      ✓ {msg}
    </div>
  );
}

function Toggle({ on, onToggle, label, color=C.green }) {
  return (
    <button onClick={onToggle} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0}}>
      <div style={{width:38,height:20,borderRadius:10,background:on?color:C.border,position:"relative",transition:"background .2s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:on?18:2,width:16,height:16,borderRadius:8,background:"#fff",transition:"left .2s"}}/>
      </div>
      {label && <span style={{fontFamily:mono,fontSize:10,color:on?color:C.muted,letterSpacing:1}}>{label}</span>}
    </button>
  );
}

function UploadProgress({ progress, color=C.amber }) {
  // progress: { stage: string, pct: 0-100, sub?: string }
  if (!progress) return null;
  return (
    <div style={{marginTop:14,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontFamily:mono,fontSize:11,color,letterSpacing:1}}>{progress.stage}</span>
        <span style={{fontFamily:mono,fontSize:11,color:C.muted}}>{progress.pct}%</span>
      </div>
      <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden",marginBottom:progress.sub?6:0}}>
        <div style={{
          height:"100%", borderRadius:2, background:color,
          width:`${progress.pct}%`,
          transition:"width 0.4s ease",
          boxShadow:`0 0 8px ${color}80`,
        }}/>
      </div>
      {progress.sub&&<div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:1,marginTop:4}}>{progress.sub}</div>}
    </div>
  );
}


// UploadZone — two-step: pick then process
function UploadZone({ onFile, icon="📄", label="Tap to choose a file", sub="JPG · PNG · PDF · CSV" }) {
  const [picked, setPicked] = useState(null);
  const ref = useRef();
  const clear = () => { setPicked(null); if (ref.current) ref.current.value = ""; };
  return (
    <div>
      {!picked ? (
        <div style={{border:`2px dashed ${C.border}`,borderRadius:8,padding:28,textAlign:"center",background:C.surfaceAlt,position:"relative",overflow:"hidden"}}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) setPicked(f); }}>
          <input ref={ref} type="file" accept="*/*"
            style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0,cursor:"pointer",zIndex:2}}
            onChange={e => { const f=e.target.files[0]; if(f) setPicked(f); }}/>
          <div style={{fontSize:32,marginBottom:8,pointerEvents:"none"}}>{icon}</div>
          <div style={{fontFamily:mono,fontSize:13,color:C.textSoft,pointerEvents:"none"}}>{label}</div>
          <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:4,pointerEvents:"none"}}>{sub}</div>
        </div>
      ) : (
        <div style={{background:C.surfaceAlt,border:`2px solid ${C.amber}`,borderRadius:8,padding:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
            <div style={{fontSize:28,flexShrink:0}}>📎</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{picked.name}</div>
              <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{(picked.size/1024).toFixed(1)} KB · Ready to process</div>
            </div>
            <button onClick={clear} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:18,cursor:"pointer",padding:"4px 10px",flexShrink:0}}>✕</button>
          </div>
          <button onClick={() => { onFile(picked); clear(); }} style={{...S.btn(),width:"100%",justifyContent:"center",padding:"13px",fontSize:13}}>
            ▶ Process File
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [users, setUsers]     = useState(() => LS.get(KEYS.users, null) || [DEFAULT_ADMIN]);
  const [selected, setSelected] = useState(null);
  const [pin, setPin]         = useState("");
  const [error, setError]     = useState("");

  const user   = selected ? users.find(u => u.id === selected) : null;
  const noPIN  = user?.pin === "";
  const pinLen = user?.pin?.length || 4;

  const tryLogin = () => {
    if (!user) return;
    if (noPIN || user.pin === pin) { onLogin({ ...user, users, setUsers }); }
    else { setError("Incorrect PIN"); setPin(""); }
  };

  const appendPin = d => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (user && user.pin !== "" && next.length === user.pin.length) {
      if (user.pin === next) onLogin({ ...user, users, setUsers });
      else { setError("Incorrect PIN"); setPin(""); }
    }
  };

  const RC = ROLE_COLOR;
  const wrap = ch => (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,color:C.text,fontFamily:"'Inter',system-ui,sans-serif"}}>
      {ch}
    </div>
  );

  if (!selected) return wrap(<>
    <div style={{width:52,height:52,background:C.amber,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontWeight:700,color:"#000",fontSize:20,marginBottom:16}}>BH</div>
    <div style={{fontFamily:mono,fontSize:11,color:C.amber,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>Beacon Hills</div>
    <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:36}}>Inventory</div>
    <div style={{width:"100%",maxWidth:360,display:"grid",gap:10}}>
      {users.map(u => (
        <button key={u.id} onClick={() => { setSelected(u.id); setPin(""); setError(""); }}
          style={{background:C.surface,border:`2px solid ${C.border}`,borderRadius:12,padding:"16px 18px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%"}}>
          <div style={{width:42,height:42,borderRadius:21,background:`${RC[u.role]||C.muted}22`,border:`2px solid ${RC[u.role]||C.muted}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontWeight:700,fontSize:16,color:RC[u.role]||C.muted,flexShrink:0}}>
            {u.name[0].toUpperCase()}
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:17,color:C.text}}>{u.name}</div>
            <div style={{fontFamily:mono,fontSize:10,color:RC[u.role]||C.muted,letterSpacing:1,marginTop:2}}>{u.role.toUpperCase()}{u.pin===""?" · No PIN":""}</div>
          </div>
          <div style={{fontFamily:mono,fontSize:22,color:C.muted}}>›</div>
        </button>
      ))}
    </div>
  </>);

  return wrap(<>
    <button onClick={() => { setSelected(null); setPin(""); setError(""); }}
      style={{position:"absolute",top:20,left:16,background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:mono}}>← Back</button>
    <div style={{width:56,height:56,borderRadius:28,background:`${RC[user?.role]||C.muted}22`,border:`2px solid ${RC[user?.role]||C.muted}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontWeight:700,fontSize:22,color:RC[user?.role]||C.muted,marginBottom:12}}>
      {user?.name[0].toUpperCase()}
    </div>
    <div style={{fontWeight:700,fontSize:20,marginBottom:4}}>{user?.name}</div>
    <div style={{fontFamily:mono,fontSize:10,color:RC[user?.role]||C.muted,letterSpacing:2,marginBottom:noPIN?24:32}}>{user?.role?.toUpperCase()}</div>
    {noPIN ? (
      <button onClick={() => onLogin({...user,users,setUsers})}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"12px 36px",borderRadius:8,border:"none",fontFamily:mono,fontSize:13,fontWeight:700,cursor:"pointer",background:C.amber,color:"#000"}}>
        Enter
      </button>
    ) : (<>
      <div style={{display:"flex",gap:12,marginBottom:12}}>
        {Array.from({length:pinLen}).map((_,i) => (
          <div key={i} style={{width:14,height:14,borderRadius:7,background:i<pin.length?C.amber:C.border}}/>
        ))}
      </div>
      {error && <div style={{fontFamily:mono,fontSize:11,color:C.red,marginBottom:12}}>{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,72px)",gap:10,marginBottom:14}}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i) => (
          <button key={i}
            onClick={() => { if(d==="")return; if(d==="⌫"){setPin(p=>p.slice(0,-1));}else appendPin(String(d)); }}
            style={{height:68,borderRadius:12,border:`1px solid ${C.border}`,background:d===""?"transparent":C.surface,color:C.text,fontFamily:mono,fontSize:24,fontWeight:700,cursor:d===""?"default":"pointer"}}>
            {d}
          </button>
        ))}
      </div>
      <button onClick={tryLogin}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"12px 36px",borderRadius:8,border:"none",fontFamily:mono,fontSize:13,fontWeight:700,cursor:"pointer",background:C.amber,color:"#000"}}>
        Unlock
      </button>
    </>)}
  </>);
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tab,  setTab]    = useState("home");
  const [items,    setItems]    = useState(() => LS.get(KEYS.items,    []));
  const [purchases,setPurch]    = useState(() => LS.get(KEYS.purchases,[]));
  const [scans,    setScans]    = useState(() => LS.get(KEYS.scans,    []));
  const [priceHist,setPH]       = useState(() => LS.get(KEYS.priceHist,[]));
  const [walks,    setWalks]    = useState(() => LS.get(KEYS.walks,    DEFAULT_WALKS));
  const [liquor,   setLiquor]   = useState(() => LS.get(KEYS.liquor,   []));
  const [bevSales, setBevSales] = useState(() => LS.get(KEYS.bevSales, {spirits:0,beer:0,wine:0,na:0}));
  const [snaps,    setSnaps]    = useState(() => LS.get(KEYS.snaps,    []));
  const [waste,    setWaste]    = useState(() => LS.get(KEYS.waste,    []));
  const [recipes,  setRecipes]  = useState(() => LS.get(KEYS.recipes,  []));
  const [settings, setSettings] = useState(() => LS.get(KEYS.settings, DEFAULT_SETTINGS));
  const [toast,    setToast]    = useState("");
  const [sales,    setSales]    = useState(()=>LS.get(KEYS.sales,0));

  // All persist effects BEFORE auth gate
  useEffect(() => LS.set(KEYS.items,    items),    [items]);
  useEffect(() => LS.set(KEYS.purchases,purchases),[purchases]);
  useEffect(() => LS.set(KEYS.scans,    scans),    [scans]);
  useEffect(() => LS.set(KEYS.priceHist,priceHist),[priceHist]);
  useEffect(() => LS.set(KEYS.walks,    walks),    [walks]);
  useEffect(() => LS.set(KEYS.liquor,   liquor),   [liquor]);
  useEffect(() => LS.set(KEYS.bevSales, bevSales), [bevSales]);
  useEffect(() => LS.set(KEYS.snaps,    snaps),    [snaps]);
  useEffect(() => LS.set(KEYS.waste,    waste),    [waste]);
  useEffect(() => LS.set(KEYS.recipes,  recipes),  [recipes]);
  useEffect(() => LS.set(KEYS.settings, settings), [settings]);
  useEffect(() => LS.set(KEYS.sales,    sales),    [sales]);

  // Role-based tab redirect — also BEFORE auth gate
  const role       = currentUser?.role || "counter";
  const allowedTabs = ROLE_TABS[role];
  useEffect(() => {
    if (allowedTabs && !allowedTabs.includes(tab)) setTab(allowedTabs[0] || "count");
  }, [role]);

  // AUTH GATE — all hooks above this line
  if (!currentUser) return <LoginScreen onLogin={u => { setCurrentUser(u); setTab("home"); }}/>;

  const canFinance = ROLE_FINANCE[role] ?? false;
  const show = msg => setToast(msg);

  const updateItem = (id, p) => setItems(prev => prev.map(i => i.id===id ? {...i,...p} : i));
  const deleteItem = id => { setItems(p => p.filter(i => i.id!==id)); setWalks(p => p.map(w => ({...w,itemIds:w.itemIds.filter(x=>x!==id)}))); };
  const addItem    = () => setItems(p => [...p, {id:uid(),name:"",unit:"ea",qty:0,unitCost:0,category:"Food - Protein",par:0}]);

  // Computed
  const totalFood  = items.reduce((s,i) => s+i.qty*i.unitCost, 0);
  const totalPurch = purchases.reduce((s,p) => s+p.amount, 0);
  const fcPct      = sales>0 ? (totalPurch/sales)*100 : null;
  const fcColor    = !fcPct?C.muted : fcPct>settings.foodTarget+3?C.red : fcPct>settings.foodTarget?C.amber : C.green;
  const foodLow    = items.filter(i => i.par>0 && i.qty<i.par);

  const lqTotals   = {
    spirits: liquor.filter(l=>l.category==="Spirits").reduce((s,l)=>s+l.qty*l.unitCost,0),
    beer:    liquor.filter(l=>l.category==="Beer").reduce((s,l)=>s+l.qty*l.unitCost,0),
    wine:    liquor.filter(l=>l.category==="Wine").reduce((s,l)=>s+l.qty*l.unitCost,0),
    na:      liquor.filter(l=>l.category==="NA Bev").reduce((s,l)=>s+l.qty*l.unitCost,0),
  };
  const totalBev   = Object.values(lqTotals).reduce((s,v)=>s+v,0);
  const totalBevSales = Object.values(bevSales).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const bevPct     = totalBevSales>0 ? (totalBev/totalBevSales)*100 : null;
  const bevColor   = !bevPct?C.muted : bevPct>settings.bevTarget+5?C.red : bevPct>settings.bevTarget?C.amber : C.purple;
  const liqLow     = liquor.filter(l=>l.par>0&&l.qty<l.par);
  const wasteCost  = waste.reduce((s,w)=>s+w.cost,0);
  const totalInv   = totalFood+totalBev;

  const lockSnap = () => {
    setSnaps(p => [{
      id:uid(), date:today(),
      totalFood, totalBev, fcPct, bevPct, sales, totalBevSales,
      foodItems: items.map(i=>({...i})),
      liqItems:  liquor.map(l=>({...l})),
    }, ...p.slice(0,23)]);
    show("Snapshot saved");
  };

  const ALL_TABS = [
    ["home","🏠 Home"],["count","🔢 Count"],["walk","🗺 Walks"],["scan","📷 Scan"],
    ["items","📋 Items"],["liquor","🍷 Liquor"],["purchases","🧾 Purch."],
    ["prices","💲 Prices"],["waste","🗑 Waste"],["recipe","🍽 Recipe"],
    ["reports","📊 Reports"],["history","📅 History"],["settings","⚙ Settings"],
  ];
  const TABS = allowedTabs ? ALL_TABS.filter(([id]) => allowedTabs.includes(id)) : ALL_TABS;

  const P = {
    items, setItems, updateItem, deleteItem, addItem,
    purchases, setPurch, scans, setScans, priceHist, setPH,
    walks, setWalks, liquor, setLiquor, bevSales, setBevSales, lqTotals,
    snaps, setSnaps, waste, setWaste, recipes, setRecipes,
    settings, setSettings, totalFood, totalPurch, fcPct, fcColor, foodLow,
    totalBev, totalBevSales, bevPct, bevColor, liqLow, wasteCost, totalInv,
    sales, setSales, lockSnap, show, canFinance, role, setTab,
    currentUser, setCurrentUser,
    appUsers: currentUser.users, setAppUsers: currentUser.setUsers,
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Inter',system-ui,sans-serif",paddingBottom:90}}>

      {/* Header */}
      <div style={{background:C.surface,borderBottom:`2px solid ${C.amber}`,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
        <div style={{width:30,height:30,background:C.amber,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontWeight:700,color:"#000",fontSize:12,flexShrink:0}}>BH</div>
        <div>
          <div style={{fontFamily:mono,fontSize:10,color:C.amber,letterSpacing:3,textTransform:"uppercase"}}>{settings.restaurantName}</div>
          <div style={{fontFamily:mono,fontSize:8,color:C.muted,letterSpacing:2}}>Inventory</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
          {canFinance && bevPct!==null && <div style={{textAlign:"right"}}><div style={{fontFamily:mono,fontSize:12,fontWeight:700,color:bevColor}}>{fmtPct(bevPct)}</div><div style={{fontFamily:mono,fontSize:8,color:C.muted}}>BEV</div></div>}
          {canFinance && fcPct!==null  && <div style={{textAlign:"right"}}><div style={{fontFamily:mono,fontSize:12,fontWeight:700,color:fcColor}}>{fmtPct(fcPct)}</div><div style={{fontFamily:mono,fontSize:8,color:C.muted}}>FOOD</div></div>}
          {canFinance && <div style={{textAlign:"right"}}><div style={{fontFamily:mono,fontSize:12,fontWeight:700,color:C.amber}}>{fmt$(totalInv)}</div><div style={{fontFamily:mono,fontSize:8,color:C.muted}}>INV</div></div>}
          <button onClick={() => setCurrentUser(null)}
            style={{display:"flex",alignItems:"center",gap:6,background:"none",border:`1px solid ${ROLE_COLOR[role]||C.border}`,borderRadius:16,padding:"4px 10px",cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:9,background:`${ROLE_COLOR[role]||C.muted}33`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontSize:10,fontWeight:700,color:ROLE_COLOR[role]||C.muted}}>
              {currentUser.name[0].toUpperCase()}
            </div>
            <span style={{fontFamily:mono,fontSize:9,color:ROLE_COLOR[role]||C.muted,letterSpacing:1}}>{currentUser.name.split(" ")[0].toUpperCase()}</span>
          </button>
        </div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",background:C.surface,borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
        {TABS.map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{flex:"0 0 auto",padding:"9px 13px",background:"none",border:"none",borderBottom:tab===id?`2px solid ${C.amber}`:"2px solid transparent",color:tab===id?C.amber:C.muted,fontFamily:mono,fontSize:9,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{padding:14}}>
        {tab==="home"      && <HomeTab      {...P}/>}
        {tab==="count"     && <CountTab     {...P}/>}
        {tab==="walk"      && <WalkTab      {...P}/>}
        {tab==="scan"      && <ScanTab      {...P}/>}
        {tab==="items"     && <ItemsTab     {...P}/>}
        {tab==="liquor"    && <LiquorTab    {...P}/>}
        {tab==="purchases" && <PurchasesTab {...P}/>}
        {tab==="prices"    && <PricesTab    {...P}/>}
        {tab==="waste"     && <WasteTab     {...P}/>}
        {tab==="recipe"    && <RecipeTab    {...P}/>}
        {tab==="reports"   && <ReportsTab   {...P}/>}
        {tab==="history"   && <HistoryTab   {...P}/>}
        {tab==="settings"  && <SettingsTab  {...P}/>}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast("")}/>}
    </div>
  );
}

// ─── HOME TAB ────────────────────────────────────────────────────────────────
function HomeTab({totalFood,totalBev,totalInv,fcPct,fcColor,bevPct,bevColor,foodLow,liqLow,wasteCost,snaps,items,liquor,purchases,waste,settings,lockSnap,show,sales,setSales,canFinance,setTab}) {
  const [si, setSI] = useState(sales>0?String(sales):"");
  const last  = snaps[0];
  const fdDelta = last ? totalFood-last.totalFood : null;
  const bvDelta = last ? totalBev-last.totalBev   : null;
  const lowTotal = foodLow.length + liqLow.length;
  return (<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      {[["Total Inventory",fmt$(totalInv),C.amber],["Food Inventory",fmt$(totalFood),C.text],["Bar Inventory",fmt$(totalBev),C.purple],["Waste This Period",fmt$(wasteCost),wasteCost>0?C.red:C.muted]].map(([l,v,color])=>(
        <div key={l} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:4}}>{l.toUpperCase()}</div>
          <div style={{fontFamily:mono,fontSize:18,fontWeight:700,color}}>{v}</div>
          {l==="Food Inventory"&&fdDelta!==null&&<div style={{fontFamily:mono,fontSize:10,color:fdDelta<0?C.green:C.red,marginTop:2}}>{fdDelta>0?"+":""}{fmt$(fdDelta)} vs last</div>}
          {l==="Bar Inventory" &&bvDelta!==null&&<div style={{fontFamily:mono,fontSize:10,color:bvDelta<0?C.green:C.red,marginTop:2}}>{bvDelta>0?"+":""}{fmt$(bvDelta)} vs last</div>}
        </div>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <div style={{background:C.surface,border:`2px solid ${fcColor}`,borderRadius:8,padding:14,textAlign:"center"}}>
        <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:4}}>FOOD COST</div>
        <div style={{fontFamily:mono,fontSize:32,fontWeight:700,color:fcColor}}>{fcPct!==null?fmtPct(fcPct):"—"}</div>
        <div style={{fontFamily:mono,fontSize:9,color:C.muted,marginTop:4}}>Target {settings.foodTarget}%</div>
      </div>
      <div style={{background:C.surface,border:`2px solid ${bevColor}`,borderRadius:8,padding:14,textAlign:"center"}}>
        <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:4}}>BEV COST</div>
        <div style={{fontFamily:mono,fontSize:32,fontWeight:700,color:bevColor}}>{bevPct!==null?fmtPct(bevPct):"—"}</div>
        <div style={{fontFamily:mono,fontSize:9,color:C.muted,marginTop:4}}>Target {settings.bevTarget}%</div>
      </div>
    </div>
    <div style={S.card}>
      <div style={S.hd}><span style={S.title()}>Period Net Sales</span></div>
      <div style={{padding:14}}>
        <input style={{...S.inp,fontSize:18,fontWeight:700}} type="number" step="0.01" value={si} placeholder="Enter net sales…"
          onChange={e=>{setSI(e.target.value);setSales(parseFloat(e.target.value)||0);}}/>
      </div>
    </div>
    {lowTotal>0&&(
      <button onClick={()=>setTab&&setTab("items")} style={{width:"100%",background:`${C.red}12`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"12px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",textAlign:"left"}}>
        <div><div style={{fontFamily:mono,fontSize:10,color:C.red,letterSpacing:2}}>⚠ BELOW PAR</div><div style={{fontFamily:mono,fontSize:13,color:C.text,marginTop:2}}>{foodLow.length} food · {liqLow.length} bar need ordering</div></div>
        <div style={{fontFamily:mono,fontSize:22,color:C.red,fontWeight:700}}>{lowTotal}</div>
      </button>
    )}
    <div style={S.card}>
      <div style={S.hd}><span style={S.title()}>Status</span></div>
      <div style={{padding:"8px 14px"}}>
        {[["Food items",items.length,"📋","items"],["Bar items",liquor.length,"🍷","liquor"],["Purchases",purchases.length,"🧾","purchases"],["Waste entries",waste.length,"🗑","waste"],["Snapshots",snaps.length,"📅","history"],["Last count",last?last.date:"Never","🕐",null]].map(([l,v,e,link])=>(
          <div key={l} onClick={()=>link&&setTab&&setTab(link)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}20`,cursor:link?"pointer":"default"}}>
            <span style={{fontFamily:mono,fontSize:12,color:link?C.textSoft:C.muted}}>{e} {l}</span>
            <span style={{fontFamily:mono,fontSize:12,fontWeight:700,color:link?C.amber:C.text}}>{v}{link?" ›":""}</span>
          </div>
        ))}
      </div>
    </div>
    <button style={{...S.btn("teal"),width:"100%",justifyContent:"center",padding:"13px"}} onClick={lockSnap}>📅 Lock Current Count as Snapshot</button>
  </>);
}

// ─── COUNT TAB ───────────────────────────────────────────────────────────────
function CountTab({items,walks,updateItem,show,canFinance,settings}) {
  const [mode,setMode]   = useState("picker");
  const [awId,setAW]     = useState(null);
  const [fi,setFI]       = useState(0);
  const [search,setSrch] = useState("");
  const [fcat,setFCat]   = useState("All");
  const [eq,setEQ]       = useState("");
  const [eo,setEO]       = useState(false);

  const ordered = awId ? (walks.find(w=>w.id===awId)?.itemIds.map(id=>items.find(i=>i.id===id)).filter(Boolean)||[]) : items;
  const cats    = ["All",...new Set(ordered.map(i=>i.category||"Other"))];
  const visible = ordered.filter(i=>(!search||i.name.toLowerCase().includes(search.toLowerCase()))&&(fcat==="All"||i.category===fcat));
  const fi_item = visible[fi]||null;
  const wname   = awId?(walks.find(w=>w.id===awId)?.name||"Walk"):"All Items";

  const nudge = d => { if(!fi_item)return; updateItem(fi_item.id,{qty:Math.max(0,parseFloat((fi_item.qty+d).toFixed(4)))}); };
  const commit= () => { if(fi_item&&eq!==""){const v=parseFloat(eq);if(!isNaN(v)&&v>=0)updateItem(fi_item.id,{qty:v});}setEQ("");setEO(false); };
  const goNext= () => { if(fi>=visible.length-1){show("Count complete! ✓");setMode("list");}else setFI(i=>i+1);setEQ("");setEO(false); };
  const goPrev= () => { setFI(i=>Math.max(0,i-1));setEQ("");setEO(false); };

  if (mode==="picker") return (<>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Choose Walk</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        {walks.filter(w=>w.itemIds.length>0).map(w=>{
          const wi=w.itemIds.map(id=>items.find(i=>i.id===id)).filter(Boolean);
          return (<button key={w.id} onClick={()=>{setAW(w.id);setFI(0);setMode("list");}}
            style={{background:C.surfaceAlt,border:`2px solid ${C.border}`,borderRadius:10,padding:14,display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",width:"100%"}}>
            <div style={{fontSize:28}}>{w.emoji}</div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15,color:C.text}}>{w.name}</div><div style={{fontFamily:mono,fontSize:11,color:C.muted,marginTop:2}}>{w.itemIds.length} items · {fmt$(wi.reduce((s,i)=>s+i.qty*i.unitCost,0))}</div></div>
            <div style={{fontFamily:mono,fontSize:20,color:C.amber}}>›</div>
          </button>);
        })}
        {walks.filter(w=>w.itemIds.length>0).length===0&&<div style={{textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11,padding:16}}>No walks set up. Go to 🗺 Walks.</div>}
        {items.length>0&&<button onClick={()=>{setAW(null);setFI(0);setMode("list");}}
          style={{background:"none",border:`1px dashed ${C.border}`,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",width:"100%"}}>
          <div style={{fontSize:24}}>📋</div>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13,color:C.muted}}>Count All Items</div><div style={{fontFamily:mono,fontSize:11,color:C.muted,marginTop:2}}>{items.length} items</div></div>
          <div style={{fontFamily:mono,fontSize:20,color:C.muted}}>›</div>
        </button>}
      </div>
    </div>
  </>);

  if (mode==="focus"&&fi_item) {
    const val=fi_item.qty*fi_item.unitCost;
    const bp=fi_item.par>0&&fi_item.qty<fi_item.par;
    return (<div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button style={{...S.btn("secondary"),padding:"7px 12px"}} onClick={()=>setMode("list")}>← List</button>
        <div style={{fontFamily:mono,fontSize:11,color:C.muted}}>{fi+1}/{visible.length}</div>
        <div style={{flex:1,fontFamily:mono,fontSize:10,color:C.amber,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{wname}</div>
        <div style={{display:"flex",gap:6}}>
          <button style={{...S.btn("secondary"),padding:"7px 12px"}} onClick={goPrev} disabled={fi===0}>◀</button>
          <button style={{...S.btn(fi>=visible.length-1?"primary":"secondary"),padding:"7px 12px"}} onClick={goNext}>{fi>=visible.length-1?"Done ✓":"▶"}</button>
        </div>
      </div>
      <div style={{height:3,background:C.surfaceAlt,borderRadius:2,marginBottom:18}}>
        <div style={{height:"100%",width:`${((fi+1)/visible.length)*100}%`,background:C.amber,borderRadius:2,transition:"width .25s"}}/>
      </div>
      <div style={{background:C.surface,border:`1px solid ${bp?C.red:C.border}`,borderRadius:12,padding:18,marginBottom:14}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.amber,letterSpacing:2,marginBottom:6}}>{fi_item.category}</div>
        <div style={{fontSize:22,fontWeight:700,marginBottom:4,lineHeight:1.2}}>{fi_item.name||<span style={{color:C.muted}}>Unnamed</span>}</div>
        <div style={{fontFamily:mono,fontSize:11,color:C.muted}}>{canFinance&&`${fmt$(fi_item.unitCost)}/${fi_item.unit}`}{fi_item.par>0?` · Par: ${fi_item.par}`:""}</div>
        {bp&&<div style={{fontFamily:mono,fontSize:11,color:C.red,marginTop:6}}>⚠ Below par — need {(fi_item.par-fi_item.qty).toFixed(2)} {fi_item.unit}</div>}
      </div>
      <div style={{background:C.surfaceAlt,border:`2px solid ${C.amber}`,borderRadius:12,padding:"22px 20px",textAlign:"center",marginBottom:14}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,letterSpacing:2,marginBottom:8}}>COUNTED QTY</div>
        <div style={{fontFamily:mono,fontSize:60,fontWeight:700,color:C.amber,lineHeight:1}}>{fi_item.qty}</div>
        <div style={{fontFamily:mono,fontSize:11,color:C.muted,marginTop:4}}>{fi_item.unit}{canFinance?` · ${fmt$(val)}`:""}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
        {[[-10,"−10"],[-1,"−1"],[-0.5,"−½"],[-0.25,"−¼"]].map(([d,l])=><button key={d} style={{...S.btn("secondary"),justifyContent:"center",padding:"13px 6px",fontSize:15,fontWeight:700}} onClick={()=>nudge(d)}>{l}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[[0.25,"+¼"],[0.5,"+½"],[1,"+1"],[10,"+10"]].map(([d,l])=><button key={d} style={{...S.btn("primary"),justifyContent:"center",padding:"13px 6px",fontSize:15,fontWeight:700}} onClick={()=>nudge(d)}>{l}</button>)}
      </div>
      {eo?(
        <div style={{display:"flex",gap:8}}>
          <input style={{...S.inp,flex:1,fontSize:18,fontWeight:700}} type="number" step="0.01" autoFocus value={eq} onChange={e=>setEQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&commit()} placeholder="Exact qty"/>
          <button style={{...S.btn("primary"),padding:"9px 16px"}} onClick={commit}>Set</button>
          <button style={{...S.btn("secondary"),padding:"9px 12px"}} onClick={()=>setEO(false)}>✕</button>
        </div>
      ):(
        <button style={{...S.btn("secondary"),width:"100%",justifyContent:"center",padding:"12px"}} onClick={()=>{setEQ(String(fi_item.qty));setEO(true);}}>✏ Type exact quantity</button>
      )}
    </div>);
  }

  return (<>
    <div style={S.card}>
      <div style={S.hd}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button style={{...S.btn("ghost"),padding:"4px 8px",color:C.muted,fontSize:14}} onClick={()=>setMode("picker")}>←</button>
          <span style={S.title()}>{wname} — {visible.length} items</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {canFinance&&<span style={{fontFamily:mono,fontSize:11,color:C.amber}}>{fmt$(visible.reduce((s,i)=>s+i.qty*i.unitCost,0))}</span>}
          {visible.length>0&&<button style={S.btn()} onClick={()=>{setFI(0);setMode("focus");}}>Start →</button>}
        </div>
      </div>
      <div style={{padding:"10px 14px 6px"}}>
        <input style={{...S.inp,marginBottom:8}} placeholder="Search…" value={search} onChange={e=>setSrch(e.target.value)}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {cats.map(c=><button key={c} onClick={()=>setFCat(c)} style={{...S.badge(fcat===c?C.amber:C.muted),cursor:"pointer",border:"none",whiteSpace:"nowrap"}}>{c}</button>)}
        </div>
      </div>
    </div>
    {visible.map((item,idx)=>(
      <div key={item.id} style={{...S.card,marginBottom:8,cursor:"pointer",borderLeft:item.par>0&&item.qty<item.par?`3px solid ${C.red}`:"3px solid transparent"}} onClick={()=>{setFI(idx);setMode("focus");}}>
        <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontFamily:mono,fontSize:12,color:C.amber,fontWeight:700,width:26,flexShrink:0,textAlign:"center"}}>{idx+1}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name||<span style={{color:C.muted}}>Unnamed</span>}</div>
            <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{item.category} · {item.unit}{item.par>0?` · Par ${item.par}`:""}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:mono,fontSize:20,fontWeight:700,color:item.qty>0?C.amber:C.muted}}>{item.qty}</div>
            {canFinance&&<div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{fmt$(item.qty*item.unitCost)}</div>}
            {item.par>0&&item.qty<item.par&&<div style={{fontFamily:mono,fontSize:9,color:C.red}}>LOW</div>}
          </div>
          <div style={{color:C.muted,fontSize:18}}>›</div>
        </div>
      </div>
    ))}
  </>);
}

// ─── WALK TAB ────────────────────────────────────────────────────────────────
function WalkTab({items,walks,setWalks,show,canFinance}) {
  const [aw,setAW]       = useState(walks[0]?.id||null);
  const [nn,setNN]       = useState("");
  const [ne,setNE]       = useState("📦");
  const [creating,setCr] = useState(false);
  const [picking,setPick]= useState(false);
  const [search,setSrch] = useState("");
  const [dragIdx,setDI]  = useState(null);
  const [overIdx,setOI]  = useState(null);
  const lpt              = useRef(null);

  const walk      = walks.find(w=>w.id===aw);
  const walkItems = walk ? walk.itemIds.map(id=>items.find(i=>i.id===id)).filter(Boolean) : [];
  const unassigned= items.filter(i=>!walk?.itemIds.includes(i.id)&&(!search||i.name.toLowerCase().includes(search.toLowerCase())));
  const totalUnassigned = items.filter(i=>!walks.some(w=>w.itemIds.includes(i.id))).length;
  const walkVal    = walkItems.reduce((s,i)=>s+i.qty*i.unitCost,0);

  const addWalk = () => { if(!nn.trim())return; const w={id:uid(),name:nn.trim(),emoji:ne,itemIds:[]}; setWalks(p=>[...p,w]); setAW(w.id); setNN(""); setCr(false); show(`Walk "${w.name}" created`); };
  const delWalk = id => { setWalks(p=>p.filter(w=>w.id!==id)); setAW(walks.find(w=>w.id!==id)?.id||null); };
  const addItem = id => setWalks(p=>p.map(w=>w.id===aw?{...w,itemIds:[...w.itemIds,id]}:w));
  const remItem = id => setWalks(p=>p.map(w=>w.id===aw?{...w,itemIds:w.itemIds.filter(x=>x!==id)}:w));
  const reorder = (from,to) => { if(from===to||to===null)return; setWalks(p=>p.map(w=>{ if(w.id!==aw)return w; const ids=[...w.itemIds]; const[m]=ids.splice(from,1); ids.splice(to,0,m); return{...w,itemIds:ids}; })); };
  const autoAll = () => { setWalks(autoAssign(items,walks)); show("All items assigned to walks"); };

  const EMOJIS = ["📦","🥩","🥫","❄️","🍺","🍷","🥦","🧀","🧂","🫙","🍳","🗄️"];

  return (<>
    {totalUnassigned>0&&(
      <div style={{background:`${C.amber}12`,border:`1px solid ${C.amber}40`,borderRadius:8,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontFamily:mono,fontSize:11,color:C.amber}}>{totalUnassigned} items not in any walk</div>
        <button style={{...S.btn("primary"),padding:"7px 14px",fontSize:11}} onClick={autoAll}>Auto-Assign →</button>
      </div>
    )}
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,marginBottom:12}}>
      {walks.map(w=>(
        <button key={w.id} onClick={()=>setAW(w.id)}
          style={{flex:"0 0 auto",padding:"8px 14px",borderRadius:20,border:`2px solid ${aw===w.id?C.amber:C.border}`,background:aw===w.id?`${C.amber}18`:C.surface,color:aw===w.id?C.amber:C.muted,fontFamily:mono,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
          {w.emoji} {w.name} ({w.itemIds.length})
        </button>
      ))}
      <button onClick={()=>setCr(!creating)} style={{flex:"0 0 auto",padding:"8px 14px",borderRadius:20,border:`2px dashed ${C.border}`,background:"none",color:C.muted,fontFamily:mono,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>+ New</button>
    </div>

    {creating&&(
      <div style={S.card}><div style={S.hd}><span style={S.title()}>New Walk</span></div>
        <div style={{padding:14,display:"grid",gap:10}}>
          <div><div style={S.lbl}>NAME</div><input style={{...S.inp,marginTop:4}} value={nn} onChange={e=>setNN(e.target.value)} placeholder="e.g. Line Station" onKeyDown={e=>e.key==="Enter"&&addWalk()}/></div>
          <div><div style={S.lbl}>ICON</div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>{EMOJIS.map(e=><button key={e} onClick={()=>setNE(e)} style={{width:38,height:38,borderRadius:8,border:`2px solid ${ne===e?C.amber:C.border}`,background:ne===e?`${C.amber}20`:C.surfaceAlt,fontSize:20,cursor:"pointer"}}>{e}</button>)}</div></div>
          <div style={{display:"flex",gap:8}}><button style={{...S.btn(),flex:1,justifyContent:"center"}} onClick={addWalk}>Create</button><button style={{...S.btn("secondary"),padding:"9px 14px"}} onClick={()=>setCr(false)}>Cancel</button></div>
        </div>
      </div>
    )}

    {walk&&(
      <div style={S.card}>
        <div style={S.hd}>
          <span style={S.title()}>{walk.emoji} {walk.name} — {walkItems.length} items{canFinance?` · ${fmt$(walkVal)}`:""}</span>
          <div style={{display:"flex",gap:8}}>
            <button style={{...S.btn("blue"),padding:"7px 12px",fontSize:10}} onClick={()=>setPick(!picking)}>{picking?"← Done":"+ Add Items"}</button>
            {walks.length>1&&<button style={{...S.btn("ghost"),padding:"7px 10px",color:C.red,fontSize:16}} onClick={()=>delWalk(walk.id)}>🗑</button>}
          </div>
        </div>
        {walkItems.length===0&&!picking&&<div style={{padding:28,textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11}}>No items. Tap "+ Add Items".</div>}
        {!picking&&walkItems.length>0&&(
          <div>
            <div style={{padding:"5px 14px 4px",fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,borderBottom:`1px solid ${C.border}`}}>HOLD & DRAG TO REORDER</div>
            <div onTouchMove={e=>{if(dragIdx===null)return;e.preventDefault();const y=e.touches[0].clientY;let found=null;document.querySelectorAll("[data-wr]").forEach((r,i)=>{const rc=r.getBoundingClientRect();if(y>=rc.top&&y<=rc.bottom)found=i;});setOI(found);}} onTouchEnd={()=>{clearTimeout(lpt.current);if(dragIdx!==null&&overIdx!==null)reorder(dragIdx,overIdx);setDI(null);setOI(null);}}>
              {walkItems.map((item,idx)=>{
                const isDrag=dragIdx===idx, isOver=overIdx===idx&&dragIdx!==null&&dragIdx!==idx;
                return (<div key={item.id} data-wr draggable
                  onDragStart={()=>setDI(idx)} onDragOver={e=>{e.preventDefault();setOI(idx);}} onDrop={()=>reorder(dragIdx,idx)}
                  onTouchStart={e=>{lpt.current=setTimeout(()=>setDI(idx),350);}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderBottom:`1px solid ${C.border}15`,background:isDrag?`${C.amber}18`:isOver?`${C.blue}15`:"transparent",borderTop:isOver?`2px solid ${C.blue}`:"2px solid transparent",opacity:isDrag?0.5:1,userSelect:"none",touchAction:"none",cursor:"grab"}}>
                  <div style={{fontFamily:mono,fontSize:12,color:C.amber,fontWeight:700,width:22,textAlign:"center",flexShrink:0}}>{idx+1}</div>
                  <div style={{color:C.border,fontSize:14,flexShrink:0}}>⠿</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name||"Unnamed"}</div>
                    <div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{item.category} · {item.unit}</div>
                  </div>
                  <div style={{flexShrink:0,textAlign:"right"}}>
                    <div style={{fontFamily:mono,fontSize:14,fontWeight:700,color:item.par>0&&item.qty<item.par?C.red:C.muted}}>{item.qty}</div>
                    {canFinance&&<div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{fmt$(item.qty*item.unitCost)}</div>}
                  </div>
                  <button onClick={()=>remItem(item.id)} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer",padding:"2px 6px",flexShrink:0}}>✕</button>
                </div>);
              })}
            </div>
          </div>
        )}
        {picking&&(
          <div>
            <div style={{padding:"10px 14px 6px"}}><input style={S.inp} placeholder="Search…" value={search} onChange={e=>setSrch(e.target.value)}/></div>
            {unassigned.length===0&&<div style={{padding:20,textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11}}>{search?"No matches.":"All items assigned."}</div>}
            {unassigned.map(item=>(
              <div key={item.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{item.name||"Unnamed"}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{item.category}</div></div>
                <button onClick={()=>addItem(item.id)} style={{...S.btn("primary"),padding:"6px 14px",fontSize:11}}>+ Add</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    {walkItems.length>0&&!picking&&(
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",display:"flex",justifyContent:"space-between"}}>
        <div><div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:4}}>WALK VALUE</div><div style={{fontFamily:mono,fontSize:18,fontWeight:700,color:C.amber}}>{fmt$(walkItems.reduce((s,i)=>s+i.qty*i.unitCost,0))}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:4}}>ITEMS</div><div style={{fontFamily:mono,fontSize:18,fontWeight:700}}>{walkItems.length}</div></div>
      </div>
    )}
  </>);
}

// ─── SCAN TAB ────────────────────────────────────────────────────────────────
function ScanTab({items,setItems,walks,setWalks,scans,setScans,show}) {
  const [loading,setLoad]   = useState(false);
  const [progress,setProgress] = useState(null);
  const [pending,setPend]   = useState([]);
  const [detWalks,setDW]    = useState([]);
  const [buildW,setBW]      = useState(true);
  const [result,setResult]  = useState(null);
  const [error,setErr]      = useState("");

  const togSel = idx => setPend(p=>p.map((r,i)=>i===idx?{...r,selected:!r.selected}:r));
  const togAll = () => { const a=pending.every(r=>r.selected); setPend(p=>p.map(r=>({...r,selected:!a}))); };
  const updRow = (idx,patch) => setPend(p=>p.map((r,i)=>i===idx?{...r,...patch}:r));

  const process = async file => {
    setLoad(true); setErr(""); setResult(null); setPend([]); setDW([]); setProgress({stage:"Reading file…",pct:15,sub:file.name});
    try {
      const d64 = await b64(file); setProgress({stage:"Sending to AI…",pct:35,sub:"Analyzing count sheet"});
      const isImg = file.type.startsWith("image/");
      const existing = items.map(i=>i.name).join(", ");
      setProgress({stage:"AI reading sheet…",pct:55,sub:"Extracting items & locations"});
      const parsed = await aiCall([{role:"user",content:[
        {type:isImg?"image":"document",source:{type:"base64",media_type:file.type,data:d64}},
        {type:"text",text:`Read this restaurant inventory count sheet. Extract every line item AND any storage location sections.\n\nExisting items: ${existing||"none"}\n\nReturn ONLY valid JSON:\n{"locations":[{"name":"string","items":["item name"]}],"items":[{"name":"string","qty":0,"unit":"lb","matchExisting":false,"existingName":"","guessedCategory":"Food - Protein","location":""}],"hasLocations":true,"notes":"string"}\n\nRules: unit=ea/lb/oz/cs/bt/gal/qt/bag/box/can. guessedCategory must be one of: Food - Protein, Food - Produce, Food - Dairy, Food - Dry, Food - Frozen, Food - Misc, Beverage - NA, Liquor, Beer, Wine, Supplies, Other. Extract ALL items, qty=0 if blank. matchExisting=true if close name match.`},
      ]}]);
      setProgress({stage:"Matching existing items…",pct:85,sub:"Building review list"});
      const rows = (parsed.items||[]).map(r=>({...r,selected:true}));
      const dw   = (parsed.locations||[]).map(loc=>({name:loc.name,emoji:pickEmoji(loc.name),itemNames:loc.items||[]}));
      const sess = {id:uid(),file:file.name,ts:new Date().toLocaleString(),count:rows.length,notes:parsed.notes||"",applied:false};
      setProgress({stage:"Done",pct:100,sub:`${rows.length} items found`});
      setScans(p=>[sess,...p.slice(0,19)]); setPend(rows); setDW(dw); setResult(sess);
      setTimeout(()=>setProgress(null),900);
    } catch(e) { setErr(e.message||"Could not read sheet."); setProgress(null); }
    finally { setLoad(false); }
  };

  const apply = () => {
    const sel = pending.filter(r=>r.selected); if(!sel.length)return;
    const nameToId = {};
    setItems(prev => {
      const upd = [...prev];
      sel.forEach(pi => {
        let tid = null;
        if (pi.matchExisting&&pi.existingName) { const i=upd.findIndex(x=>x.name===pi.existingName); if(i>=0){upd[i]={...upd[i],qty:pi.qty};tid=upd[i].id;} }
        if (!tid) { const i=upd.findIndex(x=>x.name.toLowerCase()===pi.name.toLowerCase()); if(i>=0){upd[i]={...upd[i],qty:pi.qty};tid=upd[i].id;} }
        if (!tid) { const ni={id:uid(),name:pi.name,unit:pi.unit||"ea",qty:pi.qty||0,unitCost:0,category:pi.guessedCategory||"Other",par:0}; upd.push(ni); tid=ni.id; }
        nameToId[pi.name]=tid; if(pi.existingName)nameToId[pi.existingName]=tid;
      });
      return upd;
    });
    if (buildW&&dw.length>0) {
      setTimeout(()=>setWalks(prev=>{
        const upd=[...prev];
        dw.forEach(d=>{
          const ids=d.itemNames.map(n=>nameToId[n]).filter(Boolean); if(!ids.length)return;
          const ei=upd.findIndex(w=>w.name.toLowerCase()===d.name.toLowerCase()||w.name.toLowerCase().includes(d.name.toLowerCase().split(" ")[0]));
          if(ei>=0){const m=[...upd[ei].itemIds];ids.forEach(id=>{if(!m.includes(id))m.push(id);});upd[ei]={...upd[ei],itemIds:m};}
          else upd.push({id:uid(),name:d.name,emoji:d.emoji,itemIds:ids});
        });
        return upd;
      }),80);
    } else {
      setTimeout(()=>setWalks(prev=>autoAssign(sel.map(pi=>{const m=items.find(i=>i.name===pi.existingName||i.name.toLowerCase()===pi.name.toLowerCase()); return m||{id:nameToId[pi.name]||"",category:pi.guessedCategory||"Other"};}).filter(i=>i.id),prev)),80);
    }
    setScans(p=>p.map(s=>s.id===result?.id?{...s,applied:true}:s));
    show(`${sel.filter(r=>r.matchExisting).length} updated · ${sel.filter(r=>!r.matchExisting).length} added`);
    setPend([]); setDW([]); setResult(r=>r?{...r,applied:true}:r);
  };

  const dw = detWalks; // alias for JSX
  return (<>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Scan Count Sheet</span></div>
      <div style={{padding:14}}>
        <UploadZone onFile={process} icon="📷" label="Tap to choose count sheet" sub="JPG · PNG · PDF"/>
        {loading&&<UploadProgress progress={progress} color={C.amber}/>}
        {error&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:6,padding:11,marginTop:12,color:C.red,fontFamily:mono,fontSize:11}}>⚠ {error}</div>}
      </div>
    </div>

    {dw.length>0&&!result?.applied&&(
      <div style={{...S.card,border:`2px solid ${C.green}40`}}>
        <div style={S.hd}><span style={S.title(C.green)}>🗺 {dw.length} Locations Detected</span><Toggle on={buildW} onToggle={()=>setBW(b=>!b)} label="AUTO-BUILD"/></div>
        <div style={{padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:8}}>
          {dw.map((d,i)=><div key={i} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{d.emoji}</span><div><div style={{fontWeight:600,fontSize:13}}>{d.name}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{d.itemNames.length} items</div></div></div>)}
        </div>
      </div>
    )}

    {pending.length>0&&!result?.applied&&(
      <div style={S.card}>
        <div style={S.hd}>
          <span style={S.title()}>{pending.filter(r=>r.selected).length}/{pending.length} selected</span>
          <div style={{display:"flex",gap:8}}>
            <button style={{...S.btn("secondary"),padding:"7px 12px"}} onClick={togAll}>{pending.every(r=>r.selected)?"Deselect All":"Select All"}</button>
            <button style={S.btn()} onClick={apply} disabled={!pending.some(r=>r.selected)}>Apply →</button>
          </div>
        </div>
        {result?.notes&&<div style={{padding:"7px 14px",background:`${C.amber}10`,borderBottom:`1px solid ${C.border}`,fontFamily:mono,fontSize:10,color:C.amber}}>📝 {result.notes}</div>}
        {pending.map((row,idx)=>(
          <div key={idx} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}15`,background:row.selected?"transparent":`${C.muted}08`}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <div onClick={()=>togSel(idx)} style={{width:22,height:22,borderRadius:4,border:`2px solid ${row.selected?C.amber:C.border}`,background:row.selected?C.amber:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:2,color:"#000",fontSize:13,fontWeight:700}}>{row.selected&&"✓"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                  <input style={{...S.inp,flex:1,fontSize:13}} value={row.name} onChange={e=>updRow(idx,{name:e.target.value})}/>
                  <span style={S.badge(row.matchExisting?C.green:C.blue)}>{row.matchExisting?"match":"new"}</span>
                </div>
                {row.location&&<div style={{fontFamily:mono,fontSize:9,color:C.purple,letterSpacing:1,marginBottom:6}}>{row.location.toUpperCase()}</div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:6}}>
                  <div><div style={S.lbl}>QTY</div><input style={{...S.inp,fontSize:13}} type="number" step="0.01" value={row.qty} onChange={e=>updRow(idx,{qty:parseFloat(e.target.value)||0})}/></div>
                  <div><div style={S.lbl}>UNIT</div><select style={{...S.inp,fontSize:13}} value={row.unit} onChange={e=>updRow(idx,{unit:e.target.value})}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
                  <div><div style={S.lbl}>CATEGORY</div><select style={{...S.inp,fontSize:11}} value={row.guessedCategory||"Other"} onChange={e=>updRow(idx,{guessedCategory:e.target.value})}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                </div>
              </div>
            </div>
          </div>
        ))}
        <div style={{padding:14}}><button style={{...S.btn(),width:"100%",justifyContent:"center",padding:"13px"}} onClick={apply}>Apply {pending.filter(r=>r.selected).length} items →</button></div>
      </div>
    )}
    {result?.applied&&<div style={{background:`${C.green}15`,border:`1px solid ${C.green}40`,borderRadius:8,padding:14,textAlign:"center",fontFamily:mono,fontSize:12,color:C.green}}>✓ Inventory updated</div>}
    {scans.length>0&&<div style={S.card}><div style={S.hd}><span style={S.title()}>Scan History</span></div>{scans.map(s=><div key={s.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:500}}>{s.file}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{s.ts} · {s.count} items</div></div><span style={S.badge(s.applied?C.green:C.muted)}>{s.applied?"applied":"pending"}</span></div>)}</div>}
  </>);
}

// ─── ITEMS TAB ───────────────────────────────────────────────────────────────
function ItemsTab({items,updateItem,deleteItem,addItem,foodLow,walks,canFinance}) {
  const [search,setSrch]=useState(""); const [fcat,setFC]=useState("All"); const [lowOnly,setLow]=useState(false);
  const cats=["All",...new Set(items.map(i=>i.category||"Other"))];
  const vis=items.filter(i=>(!search||i.name.toLowerCase().includes(search.toLowerCase()))&&(fcat==="All"||i.category===fcat)&&(!lowOnly||i.par>0&&i.qty<i.par));
  const itemWalk={}; walks.forEach(w=>w.itemIds.forEach(id=>{itemWalk[id]=w;}));
  return (<>
    <div style={S.card}>
      <div style={S.hd}>
        <span style={S.title()}>{items.length} Items</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {foodLow.length>0&&<Toggle on={lowOnly} onToggle={()=>setLow(l=>!l)} label={`LOW (${foodLow.length})`} color={C.red}/>}
          <button style={S.btn()} onClick={addItem}>+ Add</button>
        </div>
      </div>
      <div style={{padding:"10px 14px 6px"}}>
        <input style={{...S.inp,marginBottom:8}} placeholder="Search…" value={search} onChange={e=>setSrch(e.target.value)}/>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>{cats.map(c=><button key={c} onClick={()=>setFC(c)} style={{...S.badge(fcat===c?C.amber:C.muted),cursor:"pointer",border:"none",whiteSpace:"nowrap"}}>{c}</button>)}</div>
      </div>
    </div>
    {vis.length===0&&<div style={{textAlign:"center",color:C.muted,padding:40,fontFamily:mono,fontSize:12}}>No items. Scan a count sheet or add manually.</div>}
    {vis.map(item=><ItemRow key={item.id} item={item} updateItem={updateItem} deleteItem={deleteItem} walk={itemWalk[item.id]} canFinance={canFinance}/>)}
  </>);
}
function ItemRow({item,updateItem,deleteItem,walk,canFinance}) {
  const [open,setOpen]=useState(false);
  const val=(item.qty||0)*(item.unitCost||0);
  const bp=item.par>0&&item.qty<item.par;
  return (<div style={{...S.card,marginBottom:8,borderLeft:bp?`3px solid ${C.red}`:"3px solid transparent"}}>
    <div style={{padding:"11px 13px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setOpen(!open)}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name||<span style={{color:C.muted}}>Unnamed</span>}</div>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{item.qty} {item.unit}{canFinance?` × ${fmt$(item.unitCost)}`:""}{walk?<span style={{color:C.amber}}> · {walk.emoji} {walk.name}</span>:""}{item.par>0?` · Par ${item.par}`:""}</div>
      </div>
      {canFinance&&<div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontFamily:mono,fontSize:14,fontWeight:700,color:val>0?C.amber:C.muted}}>{fmt$(val)}</div>
        {bp&&<div style={{fontFamily:mono,fontSize:9,color:C.red}}>LOW</div>}
      </div>}
      <div style={{color:C.muted,fontSize:11}}>{open?"▲":"▼"}</div>
    </div>
    {open&&(<div style={{padding:"0 13px 13px",display:"grid",gap:8}}>
      <div><div style={S.lbl}>NAME</div><input style={{...S.inp,marginTop:4}} value={item.name} onChange={e=>updateItem(item.id,{name:e.target.value})}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><div style={S.lbl}>QTY</div><input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={item.qty} onChange={e=>updateItem(item.id,{qty:parseFloat(e.target.value)||0})}/></div>
        <div><div style={S.lbl}>UNIT</div><select style={{...S.inp,marginTop:4}} value={item.unit} onChange={e=>updateItem(item.id,{unit:e.target.value})}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div><div style={S.lbl}>UNIT COST</div><input style={{...S.inp,marginTop:4}} type="number" step="0.0001" value={item.unitCost} onChange={e=>updateItem(item.id,{unitCost:parseFloat(e.target.value)||0})}/></div>
        <div><div style={S.lbl}>PAR</div><input style={{...S.inp,marginTop:4}} type="number" step="0.5" value={item.par||0} onChange={e=>updateItem(item.id,{par:parseFloat(e.target.value)||0})}/></div>
        <div><div style={S.lbl}>CATEGORY</div><select style={{...S.inp,marginTop:4,fontSize:11}} value={item.category} onChange={e=>updateItem(item.id,{category:e.target.value})}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
      </div>
      <button style={{...S.btn("danger"),marginTop:4,width:"100%",justifyContent:"center"}} onClick={()=>deleteItem(item.id)}>Delete</button>
    </div>)}
  </div>);
}

// ─── LIQUOR TAB ──────────────────────────────────────────────────────────────
function LiquorTab({liquor,setLiquor,show,bevSales,setBevSales,lqTotals,settings,canFinance}) {
  const [mode,setMode]=useState("list"); const [fi,setFI]=useState(0);
  const [search,setSrch]=useState(""); const [fcat,setFC]=useState("All");
  const [loading,setLoad]=useState(false); const [progress,setProgress]=useState(null); const [error,setErr]=useState("");
  const [pending,setPend]=useState([]);
  const blank={name:"",category:"Spirits",subType:"Whiskey",bottleSize:"750mL",qty:0,unitCost:0,par:0};
  const [form,setForm]=useState(blank);

  const updL=(id,p)=>setLiquor(prev=>prev.map(l=>l.id===id?{...l,...p}:l));
  const delL=id=>setLiquor(p=>p.filter(l=>l.id!==id));
  const cats=["All",...new Set(liquor.map(l=>l.category))];
  const vis=liquor.filter(l=>(!search||l.name.toLowerCase().includes(search.toLowerCase()))&&(fcat==="All"||l.category===fcat));
  const total=liquor.reduce((s,l)=>s+l.qty*l.unitCost,0);
  const low=liquor.filter(l=>l.par>0&&l.qty<l.par);

  const save=()=>{if(!form.name.trim())return;setLiquor(p=>[...p,{id:uid(),...form,qty:parseFloat(form.qty)||0,unitCost:parseFloat(form.unitCost)||0,par:parseFloat(form.par)||0}]);setForm(blank);show("Added");setMode("list");};

  const processFile=async file=>{
    setLoad(true);setErr("");setPend([]);setProgress({stage:"Reading file…",pct:15,sub:file.name});
    try{
      const d64=await b64(file); const isImg=file.type.startsWith("image/"); setProgress({stage:"Sending to AI…",pct:40,sub:"Analyzing bar sheet"});
      const isCSV=file.name.endsWith(".csv")||file.type==="text/csv";
      const known=liquor.map(l=>l.name).join(", ");
      let msgs;
      if(isCSV){const text=await file.text();msgs=[{role:"user",content:[{type:"text",text:`Parse liquor inventory CSV.\nKnown items: ${known||"none"}\nCSV:\n${text.slice(0,6000)}\nReturn ONLY JSON:\n{"items":[{"name":"","category":"Spirits","subType":"Whiskey","bottleSize":"750mL","qty":0,"unitCost":0,"matchExisting":false,"existingName":""}],"notes":""}\ncategory: Spirits/Beer/Wine/NA Bev`}]}];}
      else{msgs=[{role:"user",content:[{type:isImg?"image":"document",source:{type:"base64",media_type:file.type,data:d64}},{type:"text",text:`Parse this liquor inventory for a restaurant bar.\nKnown items: ${known||"none"}\nReturn ONLY valid JSON:\n{"items":[{"name":"","category":"Spirits","subType":"Whiskey","bottleSize":"750mL","qty":0,"unitCost":0,"matchExisting":false,"existingName":""}],"notes":""}\ncategory: Spirits/Beer/Wine/NA Bev. qty uses tenths for spirits (2.7=2 full+7/10).`}]}];}
      setProgress({stage:"AI reading bar sheet…",pct:65,sub:"Identifying products"});
      const parsed=await aiCall(msgs);
      setProgress({stage:"Matching inventory…",pct:90,sub:"Building review list"});
      setPend((parsed.items||[]).map(r=>({...r,selected:true})));
      if(parsed.notes)show("📝 "+parsed.notes.slice(0,60));
      setProgress({stage:"Done",pct:100});
      setTimeout(()=>setProgress(null),900);
    }catch(e){setErr(e.message||"Could not read.");setProgress(null);}
    finally{setLoad(false);}
  };

  const applyPend=()=>{
    const sel=pending.filter(r=>r.selected);
    setLiquor(prev=>{const upd=[...prev];sel.forEach(pi=>{
      if(pi.matchExisting&&pi.existingName){const i=upd.findIndex(l=>l.name===pi.existingName);if(i>=0){upd[i]={...upd[i],qty:pi.qty,unitCost:pi.unitCost||upd[i].unitCost};return;}}
      const f=upd.findIndex(l=>l.name.toLowerCase()===pi.name.toLowerCase());
      if(f>=0){upd[f]={...upd[f],qty:pi.qty,unitCost:pi.unitCost||upd[f].unitCost};return;}
      upd.push({id:uid(),name:pi.name,category:pi.category||"Spirits",subType:pi.subType||"Other Spirit",bottleSize:pi.bottleSize||"750mL",qty:pi.qty||0,unitCost:pi.unitCost||0,par:0});
    });return upd;});
    show(`${sel.filter(r=>!r.matchExisting).length} added · ${sel.filter(r=>r.matchExisting).length} updated`);
    setPend([]);setMode("list");
  };

  const fitem=vis[fi]||null;
  const nudge10=d=>{if(!fitem)return;updL(fitem.id,{qty:Math.max(0,Math.round((fitem.qty+d)*10)/10)});};

  if(mode==="count"&&fitem){
    const btl=Math.floor(fitem.qty),ten=Math.round((fitem.qty%1)*10),bp=fitem.par>0&&fitem.qty<fitem.par;
    return(<div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button style={{...S.btn("secondary"),padding:"7px 12px"}} onClick={()=>setMode("list")}>← List</button>
        <div style={{fontFamily:mono,fontSize:11,color:C.muted}}>{fi+1}/{vis.length}</div>
        <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
          <button style={{...S.btn("secondary"),padding:"7px 12px"}} onClick={()=>setFI(i=>Math.max(0,i-1))} disabled={fi===0}>◀</button>
          <button style={{...S.btn(fi>=vis.length-1?"primary":"secondary"),padding:"7px 12px"}} onClick={()=>{if(fi>=vis.length-1){show("Bar count complete! ✓");setMode("list");}else setFI(i=>i+1);}}>
            {fi>=vis.length-1?"Done ✓":"▶"}
          </button>
        </div>
      </div>
      <div style={{height:3,background:C.surfaceAlt,borderRadius:2,marginBottom:18}}><div style={{height:"100%",width:`${((fi+1)/vis.length)*100}%`,background:C.purple,borderRadius:2}}/></div>
      <div style={{background:C.surface,border:`1px solid ${bp?C.red:C.border}`,borderRadius:12,padding:18,marginBottom:14}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.purple,letterSpacing:2,marginBottom:4}}>{fitem.category} · {fitem.bottleSize}</div>
        <div style={{fontSize:22,fontWeight:700,marginBottom:4}}>{fitem.name}</div>
        <div style={{fontFamily:mono,fontSize:11,color:C.muted}}>{fmt$(fitem.unitCost)}/bottle{fitem.par>0?` · Par: ${fitem.par}`:""}</div>
        {bp&&<div style={{fontFamily:mono,fontSize:11,color:C.red,marginTop:6}}>⚠ Below par</div>}
      </div>
      <div style={{background:C.surfaceAlt,border:`2px solid ${C.purple}`,borderRadius:12,padding:"20px",textAlign:"center",marginBottom:14}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,letterSpacing:2,marginBottom:8}}>COUNTED</div>
        <div style={{display:"flex",justifyContent:"center",alignItems:"baseline",gap:8,marginBottom:4}}>
          <div style={{fontFamily:mono,fontSize:52,fontWeight:700,color:C.purple,lineHeight:1}}>{btl}</div>
          <div style={{fontFamily:mono,fontSize:22,color:C.muted}}>+</div>
          <div style={{fontFamily:mono,fontSize:52,fontWeight:700,color:C.amber,lineHeight:1}}>{ten}</div>
          <div style={{fontFamily:mono,fontSize:14,color:C.muted,paddingBottom:6}}>/10</div>
        </div>
        <div style={{fontFamily:mono,fontSize:12,color:C.muted}}>{fitem.qty} bottles · {fmt$(fitem.qty*fitem.unitCost)}</div>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:6}}>FULL BOTTLES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
          {[[-5,"−5"],[-1,"−1"],[1,"+1"],[5,"+5"]].map(([d,l])=><button key={d} style={{...S.btn(d>0?"primary":"secondary"),justifyContent:"center",padding:"13px 8px",fontSize:15,fontWeight:700}} onClick={()=>nudge10(d)}>{l}</button>)}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:2,marginBottom:6}}>TENTHS</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
          {[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0].map(t=>(
            <button key={t} onClick={()=>updL(fitem.id,{qty:btl+(t===1.0?1:t)})}
              style={{padding:"10px 4px",borderRadius:6,border:`2px solid ${Math.abs((fitem.qty%1)-t)<0.05&&t!==1.0?C.amber:C.border}`,background:Math.abs((fitem.qty%1)-t)<0.05&&t!==1.0?`${C.amber}22`:C.surfaceAlt,fontFamily:mono,fontSize:12,fontWeight:700,color:Math.abs((fitem.qty%1)-t)<0.05&&t!==1.0?C.amber:C.text,cursor:"pointer"}}>
              {t===1.0?"+1":`${Math.round(t*10)}/10`}
            </button>
          ))}
        </div>
      </div>
    </div>);
  }

  return(<>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      {[["list","List"],["count","🔢 Count"],["add","+ Add"],["scan","📄 Scan"],["sales","💰 Sales"]].map(([id,lbl])=>(
        <button key={id} style={{...S.btn(mode===id?"primary":"secondary"),flex:1,justifyContent:"center",padding:"8px 4px",fontSize:10}} onClick={()=>{setMode(id);setPend([]);}}>
          {lbl}
        </button>
      ))}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto"}}>
      {[["Spirits",C.purple],["Beer",C.amber],["Wine",C.red],["NA Bev",C.blue]].map(([cat,color])=>{
        const v=liquor.filter(l=>l.category===cat).reduce((s,l)=>s+l.qty*l.unitCost,0);
        return v>0?<div key={cat} style={{background:C.surface,border:`1px solid ${color}40`,borderRadius:8,padding:"8px 12px",flexShrink:0}}><div style={{fontFamily:mono,fontSize:9,color,letterSpacing:1}}>{cat.toUpperCase()}</div><div style={{fontFamily:mono,fontSize:14,fontWeight:700,color}}>{fmt$(v)}</div></div>:null;
      })}
      {low.length>0&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"8px 12px",flexShrink:0}}><div style={{fontFamily:mono,fontSize:9,color:C.red,letterSpacing:1}}>BELOW PAR</div><div style={{fontFamily:mono,fontSize:14,fontWeight:700,color:C.red}}>{low.length}</div></div>}
    </div>

    {/* Per-category bev cost */}
    {canFinance&&mode==="list"&&(
      <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto"}}>
        {[{k:"spirits",cat:"Spirits",color:C.purple},{k:"beer",cat:"Beer",color:C.amber},{k:"wine",cat:"Wine",color:C.red},{k:"na",cat:"NA Bev",color:C.blue}].map(({k,cat,color})=>{
          const inv=lqTotals[k]||0; const s=parseFloat(bevSales[k])||0; const pct=s>0?(inv/s)*100:null;
          return inv>0?(<div key={k} style={{background:C.surface,border:`1px solid ${color}40`,borderRadius:8,padding:"8px 12px",flexShrink:0,minWidth:90}}>
            <div style={{fontFamily:mono,fontSize:9,color,letterSpacing:1}}>{cat.toUpperCase()}</div>
            <div style={{fontFamily:mono,fontSize:14,fontWeight:700,color}}>{fmt$(inv)}</div>
            {pct!==null&&<div style={{fontFamily:mono,fontSize:10,color:pct>settings.bevTarget?C.red:C.green}}>{fmtPct(pct)}</div>}
          </div>):null;
        })}
      </div>
    )}

    {/* Bev sales entry */}
    {mode==="sales"&&(
      <div style={S.card}><div style={S.hd}><span style={S.title()}>Period Bev Sales</span></div>
        <div style={{padding:14,display:"grid",gap:10}}>
          <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginBottom:4}}>Enter sales by category to see bev cost %</div>
          {[{k:"spirits",cat:"Spirits",color:C.purple},{k:"beer",cat:"Beer",color:C.amber},{k:"wine",cat:"Wine",color:C.red},{k:"na",cat:"NA Bev",color:C.blue}].map(({k,cat,color})=>(
            <div key={k}>
              <div style={{...S.lbl,color}}>{cat.toUpperCase()} SALES ($)</div>
              <input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={bevSales[k]||""}
                onChange={e=>setBevSales(p=>({...p,[k]:parseFloat(e.target.value)||0}))} placeholder="0.00"/>
            </div>
          ))}
        </div>
      </div>
    )}

    {mode==="add"&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Add Item</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div><div style={S.lbl}>NAME</div><input style={{...S.inp,marginTop:4}} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Maker's Mark"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>CATEGORY</div><select style={{...S.inp,marginTop:4}} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{BCATS.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><div style={S.lbl}>TYPE</div><select style={{...S.inp,marginTop:4}} value={form.subType} onChange={e=>setForm(f=>({...f,subType:e.target.value}))}>{STYPES.map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>BOTTLE SIZE</div><select style={{...S.inp,marginTop:4}} value={form.bottleSize} onChange={e=>setForm(f=>({...f,bottleSize:e.target.value}))}>{BSIZES.map(b=><option key={b}>{b}</option>)}</select></div>
          <div><div style={S.lbl}>COST/BOTTLE ($)</div><input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={form.unitCost} onChange={e=>setForm(f=>({...f,unitCost:e.target.value}))}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>QTY</div><input style={{...S.inp,marginTop:4}} type="number" step="0.1" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></div>
          <div><div style={S.lbl}>PAR</div><input style={{...S.inp,marginTop:4}} type="number" step="0.5" value={form.par} onChange={e=>setForm(f=>({...f,par:e.target.value}))}/></div>
        </div>
        <button style={{...S.btn(),width:"100%",justifyContent:"center"}} onClick={save}>Save</button>
      </div>
    </div>)}

    {mode==="scan"&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Scan Bar Sheet / Invoice</span></div>
      <div style={{padding:14}}>
        <UploadZone onFile={processFile} icon="🍷" label="Tap to choose bar sheet or invoice" sub="JPG · PNG · PDF · CSV"/>
        {loading&&<UploadProgress progress={progress} color={C.purple}/>}
        {error&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:6,padding:11,marginTop:12,color:C.red,fontFamily:mono,fontSize:11}}>⚠ {error}</div>}
      </div>
      {pending.length>0&&(<>
        <div style={S.hd}><span style={S.title()}>{pending.filter(r=>r.selected).length}/{pending.length} items</span><button style={S.btn()} onClick={applyPend}>Apply →</button></div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:mono,fontSize:11}}>
            <thead><tr><th style={{...S.th,width:24}}></th><th style={S.th}>Item</th><th style={S.th}>Cat</th><th style={S.th}>Qty</th><th style={S.th}>Cost</th><th style={S.th}>Match</th></tr></thead>
            <tbody>{pending.map((r,i)=>(
              <tr key={i} style={{opacity:r.selected?1:0.4}}>
                <td style={S.td}><div onClick={()=>setPend(p=>p.map((x,j)=>j===i?{...x,selected:!x.selected}:x))} style={{width:20,height:20,borderRadius:3,border:`2px solid ${r.selected?C.amber:C.border}`,background:r.selected?C.amber:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,fontWeight:700,color:"#000"}}>{r.selected&&"✓"}</div></td>
                <td style={S.td}>{r.name}</td><td style={{...S.td,color:C.purple}}>{r.category}</td>
                <td style={{...S.td,color:C.amber,fontWeight:700}}>{r.qty}</td><td style={S.td}>{r.unitCost>0?fmt$(r.unitCost):"—"}</td>
                <td style={S.td}><span style={S.badge(r.matchExisting?C.green:C.blue)}>{r.matchExisting?"✓":"new"}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </div>)}

    {mode==="list"&&(<>
      <div style={S.card}><div style={S.hd}><span style={S.title()}>{liquor.length} items · {fmt$(total)}</span>{vis.length>0&&<button style={S.btn()} onClick={()=>{setFI(0);setMode("count");}}>Count →</button>}</div>
        <div style={{padding:"10px 14px 6px"}}>
          <input style={{...S.inp,marginBottom:8}} placeholder="Search…" value={search} onChange={e=>setSrch(e.target.value)}/>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>{cats.map(c=><button key={c} onClick={()=>setFC(c)} style={{...S.badge(fcat===c?C.purple:C.muted),cursor:"pointer",border:"none",whiteSpace:"nowrap"}}>{c}</button>)}</div>
        </div>
      </div>
      {vis.length===0&&<div style={{textAlign:"center",color:C.muted,padding:40,fontFamily:mono,fontSize:12}}>No bar items.</div>}
      {vis.map(item=><LiquorRow key={item.id} item={item} updL={updL} delL={delL} canFinance={canFinance}/>)}
    </>)}
  </>);
}
function LiquorRow({item,updL,delL,canFinance}){
  const [open,setOpen]=useState(false);
  const val=item.qty*item.unitCost,bp=item.par>0&&item.qty<item.par;
  return(<div style={{...S.card,marginBottom:8,borderLeft:bp?`3px solid ${C.red}`:`3px solid ${C.purple}40`}}>
    <div style={{padding:"11px 13px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setOpen(!open)}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{item.category} · {item.bottleSize} · {item.subType}</div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontFamily:mono,fontSize:15,fontWeight:700,color:bp?C.red:C.purple}}>{item.qty}</div>
        {bp&&<div style={{fontFamily:mono,fontSize:9,color:C.red}}>PAR {item.par}</div>}
      </div>
      {canFinance&&<div style={{fontFamily:mono,fontSize:13,fontWeight:700,color:val>0?C.amber:C.muted,flexShrink:0,marginLeft:4}}>{fmt$(val)}</div>}
      <div style={{color:C.muted,fontSize:11}}>{open?"▲":"▼"}</div>
    </div>
    {open&&(<div style={{padding:"0 13px 13px",display:"grid",gap:8}}>
      <div><div style={S.lbl}>NAME</div><input style={{...S.inp,marginTop:4}} value={item.name} onChange={e=>updL(item.id,{name:e.target.value})}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div><div style={S.lbl}>CATEGORY</div><select style={{...S.inp,marginTop:4}} value={item.category} onChange={e=>updL(item.id,{category:e.target.value})}>{BCATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><div style={S.lbl}>SIZE</div><select style={{...S.inp,marginTop:4}} value={item.bottleSize} onChange={e=>updL(item.id,{bottleSize:e.target.value})}>{BSIZES.map(b=><option key={b}>{b}</option>)}</select></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div><div style={S.lbl}>QTY</div><input style={{...S.inp,marginTop:4}} type="number" step="0.1" value={item.qty} onChange={e=>updL(item.id,{qty:parseFloat(e.target.value)||0})}/></div>
        <div><div style={S.lbl}>COST/BTL</div><input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={item.unitCost} onChange={e=>updL(item.id,{unitCost:parseFloat(e.target.value)||0})}/></div>
        <div><div style={S.lbl}>PAR</div><input style={{...S.inp,marginTop:4}} type="number" step="0.5" value={item.par||0} onChange={e=>updL(item.id,{par:parseFloat(e.target.value)||0})}/></div>
      </div>
      <button style={{...S.btn("danger"),marginTop:4,width:"100%",justifyContent:"center"}} onClick={()=>delL(item.id)}>Delete</button>
    </div>)}
  </div>);
}

// ─── GMAIL IMPORT ────────────────────────────────────────────────────────────
function GmailImport({setPurch,show}) {
  const [token,setToken]     = useState(null);
  const [loading,setLoad]    = useState(false);
  const [progress,setProg]   = useState(null);
  const [pending,setPend]    = useState([]);
  const [error,setErr]       = useState("");

  const clientId = LS.get("bh_gclientid_v6","");

  const loadGIS = cb => {
    if (window.google?.accounts?.oauth2) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = cb;
    s.onerror = () => setErr("Failed to load Google sign-in script");
    document.head.appendChild(s);
  };

  const connect = () => {
    if (!clientId) { setErr("No Google Client ID — add it in ⚙ Settings"); return; }
    setErr("");
    loadGIS(() => {
      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: r => {
          if (r.error) { setErr(r.error_description || r.error); return; }
          setToken(r.access_token);
          fetchEmails(r.access_token);
        },
      }).requestAccessToken();
    });
  };

  const gmailFetch = (url, tok) =>
    fetch(url, {headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());

  const extractBody = msg => {
    const walk = parts => {
      for (const p of parts||[]) {
        if (p.mimeType==="text/plain" && p.body?.data)
          return atob(p.body.data.replace(/-/g,"+").replace(/_/g,"/"));
        if (p.parts) { const r=walk(p.parts); if(r) return r; }
      }
      for (const p of parts||[]) {
        if (p.mimeType==="text/html" && p.body?.data)
          return atob(p.body.data.replace(/-/g,"+").replace(/_/g,"/")).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
      }
      return "";
    };
    if (msg.payload?.parts) return walk(msg.payload.parts);
    if (msg.payload?.body?.data) return atob(msg.payload.body.data.replace(/-/g,"+").replace(/_/g,"/"));
    return msg.snippet||"";
  };

  const hdr = (msg,name) => msg.payload?.headers?.find(h=>h.name===name)?.value||"";

  const fetchEmails = async tok => {
    setLoad(true); setErr(""); setPend([]); setProg({stage:"Searching Gmail…",pct:10});
    try {
      const since = new Date(); since.setDate(since.getDate()-90);
      const after = Math.floor(since.getTime()/1000);
      const q = encodeURIComponent(
        `(from:sysco OR from:usfoods OR from:"us foods" OR from:"gordon food" OR from:"restaurant depot" OR from:"performance food" OR from:shamrock OR from:"lone star" OR subject:invoice OR subject:receipt OR subject:"order confirmation" OR subject:"payment confirmation") after:${after}`
      );
      setProg({stage:"Searching Gmail…",pct:15});
      const list = await gmailFetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=40`,tok);
      const msgs = list.messages||[];
      if (!msgs.length) { setErr("No vendor emails found in the last 3 months."); setProg(null); setLoad(false); return; }

      setProg({stage:`Found ${msgs.length} emails — reading…`,pct:25});
      const bodies = [];
      const limit = Math.min(msgs.length, 25);
      for (let i=0; i<limit; i++) {
        const msg = await gmailFetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msgs[i].id}?format=full`,tok);
        bodies.push({
          subject: hdr(msg,"Subject"),
          from:    hdr(msg,"From"),
          date:    hdr(msg,"Date"),
          body:    extractBody(msg).slice(0,3000),
        });
        setProg({stage:`Reading emails… (${i+1}/${limit})`,pct:25+Math.round((i/limit)*40)});
      }

      setProg({stage:"Sending to AI…",pct:66});
      const results = [];
      const BATCH = 5;
      for (let i=0; i<bodies.length; i+=BATCH) {
        const chunk = bodies.slice(i,i+BATCH);
        const txt = chunk.map((e,n)=>`--- Email ${n+1} ---\nFrom: ${e.from}\nDate: ${e.date}\nSubject: ${e.subject}\n${e.body}`).join("\n\n");
        const parsed = await aiCall([{role:"user",content:`Extract purchase data from these vendor emails for Beacon Hills restaurant.\nOnly include emails that are actual invoices or payment confirmations with a dollar amount.\nReturn ONLY valid JSON:\n{"purchases":[{"vendor":"","date":"YYYY-MM-DD","amount":0,"category":"Food - Misc","invoice":"","notes":"","confidence":"high|medium|low"}]}\nCategories: ${CATS.join(", ")}\nSkip newsletters, promotions, tracking updates with no total amount.\n\n${txt}`}]);
        if (parsed.purchases?.length) results.push(...parsed.purchases);
        setProg({stage:"Processing with AI…",pct:66+Math.round(((i+BATCH)/bodies.length)*30)});
      }

      setProg({stage:"Done",pct:100});
      setPend(results.filter(r=>r.amount>0).map(r=>({...r,selected:true})));
      setTimeout(()=>setProg(null),800);
    } catch(e) { setErr(e.message||"Failed"); setProg(null); }
    finally { setLoad(false); }
  };

  const apply = () => {
    const sel = pending.filter(r=>r.selected);
    if (!sel.length) return;
    setPurch(prev=>[...sel.map(r=>({
      id:uid(), date:r.date||today(), vendor:r.vendor||"Unknown",
      invoice:r.invoice||"", amount:parseFloat(r.amount)||0,
      category:r.category||"Food - Misc", notes:r.notes||"Via Gmail",
    })),...prev]);
    show(`${sel.length} purchase${sel.length!==1?"s":""} imported from Gmail`);
    setPend([]);
  };

  if (!clientId) return (
    <div style={{background:`${C.blue}10`,border:`1px solid ${C.blue}40`,borderRadius:8,padding:16,fontFamily:mono,fontSize:11,color:C.blue,lineHeight:1.7}}>
      ⓘ Add your <strong>Google Client ID</strong> in ⚙ Settings → AI & Integrations to enable Gmail import.
    </div>
  );

  return (<>
    <div style={S.card}><div style={S.hd}>
      <span style={S.title(C.blue)}>📧 Gmail Import</span>
      <span style={{fontFamily:mono,fontSize:10,color:C.muted}}>Last 3 months</span>
    </div>
    <div style={{padding:14}}>
      <div style={{fontFamily:mono,fontSize:10,color:C.muted,lineHeight:1.7,marginBottom:12}}>Scans Gmail for vendor invoices &amp; payment confirmations and uses AI to extract and categorize each purchase.</div>
      {!token
        ? <button style={{...S.btn("blue"),width:"100%",justifyContent:"center",padding:"13px"}} onClick={connect} disabled={loading}>🔐 Connect Gmail</button>
        : <button style={{...S.btn("blue"),width:"100%",justifyContent:"center",padding:"13px"}} onClick={()=>fetchEmails(token)} disabled={loading}>🔄 Re-scan Gmail</button>}
      {loading&&<UploadProgress progress={progress} color={C.blue}/>}
      {error&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:6,padding:11,marginTop:12,color:C.red,fontFamily:mono,fontSize:11}}>⚠ {error}</div>}
    </div></div>

    {pending.length>0&&(
      <div style={S.card}>
        <div style={S.hd}>
          <span style={S.title()}>{pending.filter(r=>r.selected).length}/{pending.length} found</span>
          <div style={{display:"flex",gap:8}}>
            <button style={{...S.btn("secondary"),padding:"7px 12px"}} onClick={()=>{const a=pending.every(r=>r.selected);setPend(p=>p.map(r=>({...r,selected:!a})));}}>
              {pending.every(r=>r.selected)?"Deselect All":"Select All"}
            </button>
            <button style={S.btn()} onClick={apply} disabled={!pending.some(r=>r.selected)}>Apply →</button>
          </div>
        </div>
        {pending.map((row,idx)=>(
          <div key={idx} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}15`,background:row.selected?"transparent":`${C.muted}08`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div onClick={()=>setPend(p=>p.map((r,i)=>i===idx?{...r,selected:!r.selected}:r))}
                style={{width:22,height:22,borderRadius:4,border:`2px solid ${row.selected?C.amber:C.border}`,background:row.selected?C.amber:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:"#000",fontSize:13,fontWeight:700}}>
                {row.selected&&"✓"}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.vendor}</div>
                  <div style={{fontFamily:mono,fontSize:15,fontWeight:700,color:C.amber,flexShrink:0,marginLeft:8}}>{fmt$(row.amount)}</div>
                </div>
                <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>
                  {row.date} · {row.category}{row.invoice?` · #${row.invoice}`:""}{row.notes?` · ${row.notes}`:""}
                </div>
              </div>
              <span style={{...S.badge(row.confidence==="high"?C.green:row.confidence==="medium"?C.amber:C.muted),flexShrink:0}}>
                {row.confidence||"?"}
              </span>
            </div>
          </div>
        ))}
        <div style={{padding:14}}>
          <button style={{...S.btn(),width:"100%",justifyContent:"center",padding:"13px"}} onClick={apply}>
            Import {pending.filter(r=>r.selected).length} purchase{pending.filter(r=>r.selected).length!==1?"s":""} →
          </button>
        </div>
      </div>
    )}
  </>);
}

// ─── PURCHASES TAB ───────────────────────────────────────────────────────────
function PurchasesTab({purchases,setPurch,items,setItems,liquor,setLiquor,priceHist,setPH,show,canFinance}) {
  const [mode,setMode]=useState("list");
  const [form,setForm]=useState({date:today(),vendor:"Sysco",invoice:"",amount:"",category:"Food - Protein",notes:""});
  const [loading,setLoad]=useState(false); const [progress,setProgress]=useState(null); const [error,setErr]=useState(""); const [parsed,setParsed]=useState(null);

  const addManual=()=>{if(!form.amount||isNaN(parseFloat(form.amount)))return;setPurch(p=>[{id:uid(),...form,amount:parseFloat(form.amount)},...p]);setForm(f=>({...f,invoice:"",amount:"",notes:""}));show("Purchase logged");setMode("list");};

  const processInvoice=async file=>{
    setLoad(true);setErr("");setParsed(null);setProgress({stage:"Reading file…",pct:15,sub:file.name});
    try{
      const isCSV=file.name.endsWith(".csv")||file.type==="text/csv";
      const isImg=file.type.startsWith("image/");
      const names=items.map(i=>i.name).join(", ");
      const schema='{"vendor":"","invoiceNum":"","invoiceDate":"YYYY-MM-DD","lineItems":[{"name":"","qty":0,"unit":"lb","unitCost":0,"lineTotal":0,"matchExisting":false,"existingName":""}],"invoiceTotal":0,"notes":""}';
      const rules="Return ONLY the JSON object. No other text. Item names max 40 chars. unit=lb/oz/cs/ea/gal/bt/kg.";
      let msgs;
      setProgress({stage:"Sending to AI…",pct:40,sub:"Reading invoice"});
      if(isCSV){const text=await file.text();msgs=[{role:"user",content:[{type:"text",text:`Parse vendor invoice CSV for Beacon Hills.\nKnown items: ${names}\nCSV:\n${text.slice(0,6000)}\nSchema: ${schema}\n${rules}`}]}];}
      else{setProgress({stage:"Encoding file…",pct:30,sub:"Preparing image"});const d64=await b64(file);setProgress({stage:"Sending to AI…",pct:50,sub:"Reading invoice"});msgs=[{role:"user",content:[{type:isImg?"image":"document",source:{type:"base64",media_type:file.type,data:d64}},{type:"text",text:`Parse vendor invoice for Beacon Hills.\nKnown items: ${names}\nSchema: ${schema}\n${rules}`}]}];}
      setProgress({stage:"AI parsing invoice…",pct:70,sub:"Extracting line items"});
      const p=await aiCall(msgs);
      setProgress({stage:"Done",pct:100,sub:`${(p.lineItems||[]).length} items · ${p.vendor||""}`});
      setParsed({...p,sourceFile:file.name});
      setTimeout(()=>setProgress(null),900);
    }catch(e){setErr(e.message||"Could not parse.");setProgress(null);}
    finally{setLoad(false);}
  };

  const applyInv=()=>{
    if(!parsed)return;
    setPurch(p=>[{id:uid(),date:parsed.invoiceDate||today(),vendor:parsed.vendor||"Unknown",invoice:parsed.invoiceNum||"",amount:parsed.invoiceTotal||0,category:"Food - Misc",notes:`Parsed from ${parsed.sourceFile}`},...p]);
    const upd=[...items];
    (parsed.lineItems||[]).forEach(li=>{if(li.unitCost>0){const k=li.matchExisting&&li.existingName?li.existingName:li.name;const i=upd.findIndex(x=>x.name===k||x.name.toLowerCase().includes(li.name.toLowerCase()));if(i>=0)upd[i]={...upd[i],unitCost:li.unitCost};}});
    setItems(upd);
    // Also update bar item costs
    if(liquor&&setLiquor){const lUpd=[...liquor];(parsed.lineItems||[]).forEach(li=>{if(li.unitCost>0){const i=lUpd.findIndex(x=>x.name.toLowerCase().includes(li.name.toLowerCase()));if(i>=0)lUpd[i]={...lUpd[i],unitCost:li.unitCost};}});setLiquor(lUpd);}
    setPH(p=>[{id:uid(),file:parsed.sourceFile,ts:new Date().toLocaleString(),prices:(parsed.lineItems||[]).map(li=>({name:li.name,unitCost:li.unitCost,unit:li.unit})),reportDate:parsed.invoiceDate,notes:parsed.notes},...p]);
    show(`Invoice from ${parsed.vendor||"vendor"} applied`);setParsed(null);setMode("list");
  };

  const tot=purchases.reduce((s,p)=>s+p.amount,0);
  const byV=purchases.reduce((a,p)=>{a[p.vendor]=(a[p.vendor]||0)+p.amount;return a;},{});

  return(<>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      {[["list","History"],["manual","+ Manual"],["upload","📄 Invoice"],["gmail","📧 Gmail"]].map(([id,lbl])=><button key={id} style={{...S.btn(mode===id?"primary":"secondary"),flex:"1 1 0",justifyContent:"center",padding:"9px 4px",fontSize:10}} onClick={()=>setMode(id)}>{lbl}</button>)}
    </div>

    {mode==="manual"&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Add Purchase</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>DATE</div><input style={{...S.inp,marginTop:4}} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          <div><div style={S.lbl}>VENDOR</div><select style={{...S.inp,marginTop:4}} value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))}>{VENDORS.map(v=><option key={v}>{v}</option>)}</select></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>INVOICE #</div><input style={{...S.inp,marginTop:4}} value={form.invoice} onChange={e=>setForm(f=>({...f,invoice:e.target.value}))} placeholder="Optional"/></div>
          <div><div style={S.lbl}>AMOUNT ($)</div><input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00"/></div>
        </div>
        <div><div style={S.lbl}>CATEGORY</div><select style={{...S.inp,marginTop:4}} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><div style={S.lbl}>NOTES</div><input style={{...S.inp,marginTop:4}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional"/></div>
        <button style={{...S.btn(),width:"100%",justifyContent:"center"}} onClick={addManual}>Save Purchase</button>
      </div>
    </div>)}

    {mode==="upload"&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Parse Invoice</span></div>
      <div style={{padding:14}}>
        <UploadZone onFile={processInvoice} icon="📄" label="Tap to choose invoice" sub="JPG · PNG · PDF · CSV"/>
        {loading&&<UploadProgress progress={progress} color={C.amber}/>}
        {error&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:6,padding:11,marginTop:12,color:C.red,fontFamily:mono,fontSize:11}}>⚠ {error}</div>}
      </div>
      {parsed&&(<div style={{borderTop:`1px solid ${C.border}`,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><div style={{fontWeight:600,fontSize:15}}>{parsed.vendor||"Unknown"}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{parsed.invoiceNum&&`#${parsed.invoiceNum} · `}{parsed.invoiceDate}</div></div>
          <div style={{fontFamily:mono,fontSize:18,fontWeight:700,color:C.amber}}>{fmt$(parsed.invoiceTotal)}</div>
        </div>
        {parsed.notes&&<div style={{fontFamily:mono,fontSize:10,color:C.amber,background:`${C.amber}10`,borderRadius:5,padding:"6px 10px",marginBottom:10}}>📝 {parsed.notes}</div>}
        <div style={{overflowX:"auto",marginBottom:12}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:mono,fontSize:11}}>
            <thead><tr><th style={S.th}>Item</th><th style={S.th}>Qty</th><th style={S.th}>Unit$</th><th style={S.th}>Total</th><th style={S.th}>Match</th></tr></thead>
            <tbody>{(parsed.lineItems||[]).map((li,i)=><tr key={i}><td style={S.td}>{li.name}</td><td style={{...S.td,color:C.muted}}>{li.qty} {li.unit}</td><td style={{...S.td,color:C.amber}}>{fmt$(li.unitCost)}</td><td style={S.td}>{fmt$(li.lineTotal)}</td><td style={S.td}><span style={S.badge(li.matchExisting?C.green:C.blue)}>{li.matchExisting?"✓":"new"}</span></td></tr>)}</tbody>
          </table>
        </div>
        <button style={{...S.btn(),width:"100%",justifyContent:"center"}} onClick={applyInv}>Apply — Log + Update Costs</button>
      </div>)}
    </div>)}

    {mode==="gmail"&&<GmailImport setPurch={setPurch} show={show}/>}

    {mode==="list"&&(<>
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        <div style={{...S.card,flex:1,padding:"12px 14px",marginBottom:0}}><div style={{fontFamily:mono,fontSize:8,color:C.muted,letterSpacing:2,marginBottom:4}}>TOTAL PURCH.</div><div style={{fontFamily:mono,fontSize:18,fontWeight:700,color:C.amber}}>{fmt$(tot)}</div></div>
        <div style={{...S.card,flex:1,padding:"12px 14px",marginBottom:0}}><div style={{fontFamily:mono,fontSize:8,color:C.muted,letterSpacing:2,marginBottom:4}}>VENDORS</div><div style={{fontFamily:mono,fontSize:18,fontWeight:700}}>{Object.keys(byV).length}</div></div>
      </div>
      {Object.keys(byV).length>0&&<div style={S.card}><div style={S.hd}><span style={S.title()}>By Vendor</span></div>{Object.entries(byV).sort((a,b)=>b[1]-a[1]).map(([v,a])=><div key={v} style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:500,fontSize:13}}>{v}</span><span style={{fontFamily:mono,color:C.amber,fontSize:13}}>{fmt$(a)}</span></div>)}</div>}
      <div style={S.card}><div style={S.hd}><span style={S.title()}>All Purchases</span></div>
        {purchases.length===0&&<div style={{padding:24,textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11}}>No purchases logged.</div>}
        {purchases.map(p=><div key={p.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{p.vendor}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{p.date}{p.invoice?` · #${p.invoice}`:""}</div></div>
          <div style={{fontFamily:mono,fontWeight:700,color:C.amber,flexShrink:0}}>{fmt$(p.amount)}</div>
          <button style={{...S.btn("ghost"),padding:"4px 8px",color:C.red,fontSize:14}} onClick={()=>setPurch(prev=>prev.filter(x=>x.id!==p.id))}>✕</button>
        </div>)}
      </div>
    </>)}
  </>);
}

// ─── PRICES TAB ──────────────────────────────────────────────────────────────
function PricesTab({items,setItems,liquor,setLiquor,priceHist,setPH,show,walks,setWalks}) {
  const [loading,setLoad]=useState(false); const [progress,setProgress]=useState(null); const [error,setErr]=useState("");
  const [pending,setPend]=useState([]); const [review,setRev]=useState([]); const [applied,setApplied]=useState(false);

  const parseSmartCSV=text=>{
    const lines=text.trim().split("\n");
    const headers=lines[0].split(",").map(h=>h.replace(/"/g,"").trim());
    const isSmart=headers.includes("needsReview");
    const rows=lines.slice(1).map(line=>{
      const vals=[]; let cur="",inQ=false;
      for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===","&&!inQ){vals.push(cur);cur="";}else cur+=ch;}
      vals.push(cur);
      return Object.fromEntries(headers.map((h,i)=>[h,(vals[i]||"").trim()]));
    }).filter(r=>r.name);
    return{isSmart,rows};
  };

  const process=async file=>{
    setLoad(true);setErr("");setPend([]);setRev([]);setApplied(false);setProgress({stage:"Reading file…",pct:15,sub:file.name});
    try{
      const isCSV=file.name.endsWith(".csv")||file.type==="text/csv";
      const isImg=file.type.startsWith("image/");
      if(isCSV){
        const text=await file.text();
        const{isSmart,rows}=parseSmartCSV(text);
        if(isSmart){
          const clean=[],rev=[];
          rows.forEach(r=>{
            const entry={name:r.name,unitCost:parseFloat(r.unitCost)||0,unit:r.unit||"cs",category:r.category||"Other",qty:parseFloat(r.qty)||0,note:r.note||"",needsReview:r.needsReview==="True",matchExisting:false,existingName:"",reviewUnit:r.unit||"cs",reviewCost:parseFloat(r.unitCost)||0};
            const m=items.find(i=>i.name.toLowerCase()===r.name.toLowerCase());
            if(m){entry.matchExisting=true;entry.existingName=m.name;}
            if(entry.needsReview)rev.push(entry);else clean.push(entry);
          });
          setProgress({stage:"Matching items…",pct:80,sub:`${clean.length} auto · ${rev.length} need review`});
          setPend(clean);setRev(rev);
          setPH(prev=>[{id:uid(),file:file.name,ts:new Date().toLocaleString(),prices:clean,notes:`Smart import: ${clean.length} auto, ${rev.length} review`},...prev.slice(0,19)]);
          setProgress({stage:"Done",pct:100,sub:`${clean.length + rev.length} items imported`});
          setTimeout(()=>setProgress(null),900);
          setLoad(false);return;
        }
      }
      const names=items.map(i=>i.name).join(", ");
      let msgs;
      setProgress({stage:"Sending to AI…",pct:40,sub:"Reading cost report"});
      if(isCSV){const text=await file.text();msgs=[{role:"user",content:[{type:"text",text:`Parse average cost report CSV.\nKnown items: ${names}\nCSV:\n${text.slice(0,6000)}\nReturn ONLY JSON:\n{"prices":[{"name":"","unitCost":0,"unit":"lb","matchExisting":false,"existingName":""}],"reportDate":"YYYY-MM-DD","notes":""}`}]}];}
      else{setProgress({stage:"Encoding file…",pct:30,sub:"Preparing image"});const d64=await b64(file);setProgress({stage:"Sending to AI…",pct:50,sub:"Reading cost report"});msgs=[{role:"user",content:[{type:isImg?"image":"document",source:{type:"base64",media_type:file.type,data:d64}},{type:"text",text:`Parse price/cost report.\nKnown items: ${names}\nReturn ONLY JSON:\n{"prices":[{"name":"","unitCost":0,"unit":"lb","matchExisting":false,"existingName":""}],"reportDate":"YYYY-MM-DD","notes":""}`}]}];}
      setProgress({stage:"AI reading report…",pct:65,sub:"Extracting prices"});
      const p=await aiCall(msgs);
      setProgress({stage:"Matching items…",pct:90,sub:`${(p.prices||[]).length} prices found`});
      setPH(prev=>[{id:uid(),file:file.name,ts:new Date().toLocaleString(),prices:p.prices||[],reportDate:p.reportDate,notes:p.notes},...prev.slice(0,19)]);
      setPend(p.prices||[]);
      setProgress({stage:"Done",pct:100});
      setTimeout(()=>setProgress(null),900);
    }catch(e){setErr(e.message||"Could not read.");setProgress(null);}
    finally{setLoad(false);}
  };

  const applyAll=()=>{
    const all=[...pending,...review.filter(r=>!r.skip)];
    const upd=[...items];
    all.forEach(pp=>{
      const key=pp.matchExisting&&pp.existingName?pp.existingName:pp.name;
      const idx=upd.findIndex(i=>i.name===key||i.name.toLowerCase()===pp.name.toLowerCase());
      if(idx>=0){upd[idx]={...upd[idx],unitCost:pp.reviewCost||pp.unitCost,unit:pp.reviewUnit||pp.unit};}
      else{upd.push({id:uid(),name:pp.name,unit:pp.reviewUnit||pp.unit,qty:pp.qty||0,unitCost:pp.reviewCost||pp.unitCost,category:pp.category||"Other",par:0});}
    });
    setItems(upd);
    if(liquor&&setLiquor){const lUpd=[...liquor];all.forEach(pp=>{const i=lUpd.findIndex(l=>l.name.toLowerCase()===pp.name.toLowerCase());if(i>=0)lUpd[i]={...lUpd[i],unitCost:pp.reviewCost||pp.unitCost};});setLiquor(lUpd);}
    if(walks&&setWalks)setWalks(autoAssign(upd,walks));
    setPend([]);setRev([]);setApplied(true);
    show(`${all.length} items imported · walks updated`);
  };

  return(<>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Upload Price Report</span></div>
      <div style={{padding:14}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginBottom:12,lineHeight:1.7}}>Upload a monthly cost report or the <strong style={{color:C.amber}}>beacon_inventory_import.csv</strong> from your count sheet.</div>
        <UploadZone onFile={process} icon="💲" label="Tap to choose price report" sub="JPG · PNG · PDF · CSV"/>
        {loading&&<UploadProgress progress={progress} color={C.amber}/>}
        {error&&<div style={{background:`${C.red}15`,border:`1px solid ${C.red}40`,borderRadius:6,padding:11,marginTop:12,color:C.red,fontFamily:mono,fontSize:11}}>⚠ {error}</div>}
      </div>
    </div>

    {(pending.length>0||review.length>0)&&!applied&&(
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontFamily:mono,fontSize:10,color:C.muted,letterSpacing:2,marginBottom:4}}>IMPORT SUMMARY</div>
          <div style={{fontFamily:mono,fontSize:12,color:C.green}}>✓ {pending.length} auto-resolved</div>
          {review.length>0&&<div style={{fontFamily:mono,fontSize:12,color:C.amber}}>⚠ {review.filter(r=>!r.skip).length} items below need review</div>}
        </div>
        <button style={S.btn()} onClick={applyAll}>Apply All →</button>
      </div>
    )}

    {review.length>0&&!applied&&(
      <div style={S.card}><div style={S.hd}><span style={S.title(C.amber)}>⚠ {review.length} Items Need Input</span></div>
        <div style={{padding:"8px 14px",fontFamily:mono,fontSize:10,color:C.muted,borderBottom:`1px solid ${C.border}`,lineHeight:1.6}}>Set unit and cost, or Skip to use case pricing.</div>
        {review.map((r,idx)=>(
          <div key={idx} style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}15`,opacity:r.skip?0.4:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{r.note}</div>
                <div style={{fontFamily:mono,fontSize:10,color:C.muted}}>Case price: {fmt$(r.unitCost)}</div>
              </div>
              <button onClick={()=>setRev(p=>p.map((x,i)=>i===idx?{...x,skip:!x.skip}:x))} style={{...S.btn("ghost"),padding:"4px 10px",fontSize:11,color:r.skip?C.green:C.red,flexShrink:0}}>{r.skip?"Include":"Skip"}</button>
            </div>
            {!r.skip&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div style={S.lbl}>COUNT AS</div><select style={{...S.inp,marginTop:4,fontSize:12}} value={r.reviewUnit} onChange={e=>setRev(p=>p.map((x,i)=>i===idx?{...x,reviewUnit:e.target.value}:x))}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
                <div><div style={S.lbl}>UNIT COST ($)</div><input style={{...S.inp,marginTop:4,fontSize:13}} type="number" step="0.01" value={r.reviewCost} onChange={e=>setRev(p=>p.map((x,i)=>i===idx?{...x,reviewCost:parseFloat(e.target.value)||0}:x))}/></div>
              </div>
            )}
          </div>
        ))}
      </div>
    )}

    {pending.length>0&&!applied&&(
      <div style={S.card}>
        <div style={{...S.hd,cursor:"pointer"}} onClick={()=>{}}>
          <span style={S.title(C.green)}>✓ {pending.length} Auto-resolved</span>
        </div>
      </div>
    )}

    {applied&&<div style={{background:`${C.green}15`,border:`1px solid ${C.green}40`,borderRadius:8,padding:14,textAlign:"center",fontFamily:mono,fontSize:12,color:C.green}}>✓ Import complete</div>}
    {priceHist.length>0&&<div style={S.card}><div style={S.hd}><span style={S.title()}>History</span></div>{priceHist.map(ph=><div key={ph.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}15`}}><div style={{fontWeight:500,fontSize:13}}>{ph.file}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{ph.ts}{ph.notes?` · ${ph.notes}`:""}</div></div>)}</div>}
  </>);
}

// ─── WASTE TAB ───────────────────────────────────────────────────────────────
function WasteTab({waste,setWaste,items,liquor,purchases,show,settings,canFinance}) {
  const all=[...items.map(i=>({...i,src:"food"})),...liquor.map(l=>({...l,src:"bar"}))];
  const blank={date:today(),itemId:"",type:"Spoilage",qty:0,cost:0,notes:""};
  const [form,setForm]=useState(blank); const [sf,setSF]=useState(false);
  const sel=all.find(i=>i.id===form.itemId);
  const est=sel&&form.qty?(parseFloat(form.qty)||0)*(sel.unitCost||0):0;
  const save=()=>{if(!form.itemId||!form.qty)return;const item=all.find(i=>i.id===form.itemId);setWaste(p=>[{id:uid(),...form,qty:parseFloat(form.qty),cost:parseFloat(form.cost)||est,itemName:item?.name||"",category:item?.category||""},...p]);setForm(blank);setSF(false);show("Waste logged");};
  const tot=waste.reduce((s,w)=>s+w.cost,0);
  const totalPurch=purchases.reduce((s,p)=>s+p.amount,0);
  const wastePct=totalPurch>0?(tot/totalPurch)*100:null;
  const byT=waste.reduce((a,w)=>{a[w.type]=(a[w.type]||0)+w.cost;return a;},{});
  return(<>
    <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"flex-start"}}>
      {canFinance&&<div style={{display:"flex",gap:10,flex:1}}>
        <div style={{...S.card,flex:1,padding:"12px 14px",marginBottom:0}}><div style={{fontFamily:mono,fontSize:8,color:C.muted,letterSpacing:2,marginBottom:4}}>WASTE COST</div><div style={{fontFamily:mono,fontSize:18,fontWeight:700,color:tot>0?C.red:C.muted}}>{fmt$(tot)}</div></div>
        {wastePct!==null&&<div style={{...S.card,flex:1,padding:"12px 14px",marginBottom:0}}><div style={{fontFamily:mono,fontSize:8,color:C.muted,letterSpacing:2,marginBottom:4}}>WASTE / PURCH</div><div style={{fontFamily:mono,fontSize:18,fontWeight:700,color:wastePct>(settings.wasteTarget||2)?C.red:C.green}}>{fmtPct(wastePct)}</div></div>}
      </div>}
      <button style={S.btn()} onClick={()=>setSF(!sf)}>+ Log Waste</button>
    </div>
    {sf&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Log Waste</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>DATE</div><input style={{...S.inp,marginTop:4}} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          <div><div style={S.lbl}>TYPE</div><select style={{...S.inp,marginTop:4}} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{WTYPES.map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <div><div style={S.lbl}>ITEM</div>
          <select style={{...S.inp,marginTop:4}} value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))}>
            <option value="">-- Select item --</option>
            <optgroup label="Food">{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</optgroup>
            <optgroup label="Bar">{liquor.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
          </select>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>QTY</div><input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></div>
          <div><div style={S.lbl}>COST ($) {est>0&&canFinance&&<span style={{color:C.muted}}>est {fmt$(est)}</span>}</div><input style={{...S.inp,marginTop:4}} type="number" step="0.01" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))} placeholder={est>0?est.toFixed(2):"0.00"}/></div>
        </div>
        <div><div style={S.lbl}>NOTES</div><input style={{...S.inp,marginTop:4}} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional"/></div>
        <button style={{...S.btn(),width:"100%",justifyContent:"center"}} onClick={save}>Log Waste</button>
      </div>
    </div>)}
    {Object.keys(byT).length>0&&<div style={S.card}><div style={S.hd}><span style={S.title()}>By Type</span></div>{Object.entries(byT).sort((a,b)=>b[1]-a[1]).map(([t,c])=><div key={t} style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:500,fontSize:13}}>{t}</span><span style={{fontFamily:mono,color:C.red,fontSize:13}}>{fmt$(c)}</span></div>)}</div>}
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Waste Log</span></div>
      {waste.length===0&&<div style={{padding:24,textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11}}>No waste logged.</div>}
      {waste.map(w=><div key={w.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{w.itemName}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted}}>{w.date} · {w.type} · {w.qty} units{w.notes?` · ${w.notes}`:""}</div></div>
        <div style={{fontFamily:mono,fontWeight:700,color:C.red,flexShrink:0}}>{fmt$(w.cost)}</div>
        <button style={{...S.btn("ghost"),padding:"4px 8px",color:C.red,fontSize:14}} onClick={()=>setWaste(p=>p.filter(x=>x.id!==w.id))}>✕</button>
      </div>)}
    </div>
  </>);
}

// ─── RECIPE TAB ──────────────────────────────────────────────────────────────
function RecipeTab({recipes,setRecipes,items,liquor,settings,show,canFinance}) {
  const [ar,setAR]=useState(null); const [nn,setNN]=useState("");
  const allIngredients=[...items,...liquor.map(l=>({...l,unit:l.bottleSize}))];
  const addR=()=>{if(!nn.trim())return;const r={id:uid(),name:nn.trim(),menuPrice:0,ingredients:[]};setRecipes(p=>[...p,r]);setAR(r.id);setNN("");};
  const delR=id=>{setRecipes(p=>p.filter(r=>r.id!==id));if(ar===id)setAR(null);};
  const addIng=rid=>setRecipes(p=>p.map(r=>r.id===rid?{...r,ingredients:[...r.ingredients,{id:uid(),itemId:"",qty:0,unit:"oz"}]}:r));
  const updIng=(rid,iid,p)=>setRecipes(prev=>prev.map(r=>r.id===rid?{...r,ingredients:r.ingredients.map(i=>i.id===iid?{...i,...p}:i)}:r));
  const remIng=(rid,iid)=>setRecipes(p=>p.map(r=>r.id===rid?{...r,ingredients:r.ingredients.filter(i=>i.id!==iid)}:r));
  const updR=(id,p)=>setRecipes(prev=>prev.map(r=>r.id===id?{...r,...p}:r));
  const calcCost=r=>r.ingredients.reduce((s,ing)=>{
    const item=allIngredients.find(i=>i.id===ing.itemId);if(!item)return s;
    let q=parseFloat(ing.qty)||0;
    if(item.unit==="lb"&&ing.unit==="oz")q/=16;else if(item.unit==="oz"&&ing.unit==="lb")q*=16;
    return s+q*item.unitCost;
  },0);
  const recipe=recipes.find(r=>r.id===ar);
  const plateCost=recipe?calcCost(recipe):0;
  const tgt=settings.foodTarget/100;
  const suggested=plateCost>0?plateCost/tgt:0;
  const actPct=recipe?.menuPrice>0?plateCost/recipe.menuPrice*100:null;
  return(<>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>{recipes.length} Recipes</span></div>
      <div style={{padding:14,display:"flex",gap:8}}>
        <input style={{...S.inp,flex:1}} value={nn} onChange={e=>setNN(e.target.value)} placeholder="New recipe name…" onKeyDown={e=>e.key==="Enter"&&addR()}/>
        <button style={S.btn()} onClick={addR}>+ Add</button>
      </div>
      {recipes.map(r=>{const cost=calcCost(r);const fp=r.menuPrice>0?cost/r.menuPrice*100:null;const color=!fp?C.muted:fp>settings.foodTarget+3?C.red:fp>settings.foodTarget?C.amber:C.green;return(
        <div key={r.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:ar===r.id?`${C.amber}10`:"transparent"}} onClick={()=>setAR(ar===r.id?null:r.id)}>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{r.name}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{r.ingredients.length} ingredients · {fmt$(cost)}</div></div>
          {fp&&<span style={S.badge(color)}>{fmtPct(fp)}</span>}
          <button style={{...S.btn("ghost"),padding:"4px 8px",color:C.red,fontSize:14}} onClick={e=>{e.stopPropagation();delR(r.id);}}>✕</button>
        </div>
      );})}
    </div>
    {recipe&&(<div style={S.card}>
      <div style={S.hd}><span style={S.title()}>{recipe.name}</span></div>
      <div style={{padding:"12px 14px",background:C.surfaceAlt,borderBottom:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {[["Plate Cost",fmt$(plateCost),C.text],["Suggested",fmt$(suggested),C.amber],["Actual FC%",actPct?fmtPct(actPct):"—",!actPct?C.muted:actPct>settings.foodTarget+3?C.red:actPct>settings.foodTarget?C.amber:C.green]].map(([l,v,col])=>(
          <div key={l} style={{textAlign:"center"}}><div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:1}}>{l}</div><div style={{fontFamily:mono,fontSize:15,fontWeight:700,color:col,marginTop:4}}>{v}</div></div>
        ))}
      </div>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,flexShrink:0}}>Menu Price ($)</div>
        <input style={{...S.inp,flex:1,fontSize:16,fontWeight:700}} type="number" step="0.01" value={recipe.menuPrice||""} placeholder={suggested.toFixed(2)} onChange={e=>updR(recipe.id,{menuPrice:parseFloat(e.target.value)||0})}/>
      </div>
      <div style={S.hd}><span style={S.title()}>Ingredients</span><button style={{...S.btn("secondary"),padding:"7px 12px",fontSize:10}} onClick={()=>addIng(recipe.id)}>+ Add</button></div>
      {recipe.ingredients.length===0&&<div style={{padding:20,textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11}}>No ingredients yet.</div>}
      {recipe.ingredients.map(ing=>{
        const item=allIngredients.find(i=>i.id===ing.itemId);let cost=0;if(item&&ing.qty){let q=parseFloat(ing.qty)||0;if(item.unit==="lb"&&ing.unit==="oz")q/=16;else if(item.unit==="oz"&&ing.unit==="lb")q*=16;cost=q*item.unitCost;}
        return(<div key={ing.id} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}15`}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:6,alignItems:"center",marginBottom:4}}>
            <select style={{...S.inp,fontSize:11}} value={ing.itemId} onChange={e=>updIng(recipe.id,ing.id,{itemId:e.target.value})}><option value="">-- Select --</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select>
            <input style={{...S.inp,fontSize:13}} type="number" step="0.01" value={ing.qty} onChange={e=>updIng(recipe.id,ing.id,{qty:e.target.value})} placeholder="Qty"/>
            <select style={{...S.inp,fontSize:11}} value={ing.unit} onChange={e=>updIng(recipe.id,ing.id,{unit:e.target.value})}>{UNITS.map(u=><option key={u}>{u}</option>)}</select>
            <button style={{...S.btn("ghost"),padding:"4px 8px",color:C.red,fontSize:14}} onClick={()=>remIng(recipe.id,ing.id)}>✕</button>
          </div>
          {item&&<div style={{fontFamily:mono,fontSize:10,color:C.muted}}>Cost: {fmt$(cost)} · {item.unitCost}/{item.unit}</div>}
        </div>);
      })}
    </div>)}
  </>);
}

// ─── REPORTS TAB ─────────────────────────────────────────────────────────────
function ReportsTab({items,purchases,liquor,lqTotals,totalFood,totalPurch,totalBev,totalBevSales,bevSales,fcPct,bevPct,sales,walks,foodLow,liqLow,waste,settings,show,wasteCost,snaps,recipes}) {
  const expFood=()=>{
    const ws=walks.flatMap(w=>{const wi=w.itemIds.map(id=>items.find(i=>i.id===id)).filter(Boolean);if(!wi.length)return[];return[[`--- ${w.name} ---`,"","","","",""],...wi.map(i=>[i.name,i.category,i.qty,i.unit,i.unitCost.toFixed(4),(i.qty*i.unitCost).toFixed(2)])]});
    dlCSV([["BEACON HILLS — FOOD INVENTORY REPORT","","","","",""],["Generated:",new Date().toLocaleString(),"","","",""],["","","","","",""],["=== INVENTORY (WALK ORDER) ===","","","","",""],["Item","Category","Qty","Unit","Unit Cost","Value"],...ws,["","","","","TOTAL",totalFood.toFixed(2)],["","","","","",""],["=== PURCHASES ===","","","","",""],["Date","Vendor","Invoice","Category","Amount","Notes"],...purchases.map(p=>[p.date,p.vendor,p.invoice||"",p.category||"",p.amount.toFixed(2),p.notes||""]),["","","","","TOTAL",totalPurch.toFixed(2)],["","","","","",""],["=== FOOD COST ===","","","","",""],["Total Purchases","","","","",totalPurch.toFixed(2)],["Period Sales","","","","",sales.toFixed(2)],["Food Cost %","","","","",fcPct!==null?fmtPct(fcPct):"—"]],`BH_FoodReport_${today()}.csv`);show("Food report exported");
  };
  const expBev=()=>{
    const cats=[{k:"spirits",l:"Spirits",t:[18,22]},{k:"beer",l:"Beer",t:[22,28]},{k:"wine",l:"Wine",t:[25,30]},{k:"na",l:"NA Bev",t:[20,30]}];
    dlCSV([["BEACON HILLS — BEVERAGE COST REPORT","","",""],["Generated:",new Date().toLocaleString(),"",""],["","","",""],["=== LIQUOR INVENTORY ===","","","","",""],["Item","Category","Qty","Bottle Size","Cost","Value"],...liquor.map(l=>[l.name,l.category,l.qty,l.bottleSize,l.unitCost.toFixed(2),(l.qty*l.unitCost).toFixed(2)]),["","","","","TOTAL",totalBev.toFixed(2)],["","","","","",""],["=== BEV COST ===","","","","",""],["Category","Inv Value","Sales","Cost%","Target","Status"],...cats.map(c=>{const s=parseFloat(bevSales[c.k])||0;const p=s>0?(lqTotals[c.k]/s)*100:0;return[c.l,lqTotals[c.k].toFixed(2),s.toFixed(2),p>0?fmtPct(p):"—",`${c.t[0]}–${c.t[1]}%`,p>0&&p>c.t[1]?"OVER":p>0&&p<c.t[0]?"UNDER":p>0?"OK":"—"];}),["OVERALL",totalBev.toFixed(2),totalBevSales.toFixed(2),bevPct!==null?fmtPct(bevPct):"—","18–28%",""]],`BH_BevReport_${today()}.csv`);show("Bev report exported");
  };
  const expOrder=()=>{
    const fr=foodLow.map(i=>[i.name,"Food",i.category,i.qty,i.par,(i.par-i.qty).toFixed(2),i.unit,fmt$((i.par-i.qty)*i.unitCost)]);
    const br=liqLow.map(l=>[l.name,"Bar",l.category,l.qty,l.par,(l.par-l.qty).toFixed(1),l.bottleSize,fmt$((l.par-l.qty)*l.unitCost)]);
    dlCSV([["BEACON HILLS — REORDER GUIDE","","","","","","",""],["Generated:",new Date().toLocaleString(),"","","","","",""],["","","","","","","",""],["Item","Dept","Category","Have","Par","Need","Unit","Est. Cost"],...fr,...br,["","","","","","","TOTAL",fmt$([...foodLow,...liqLow].reduce((s,i)=>s+(i.par-i.qty)*(i.unitCost||0),0))]],`BH_OrderGuide_${today()}.csv`);show("Order guide exported");
  };
  const expBlank=()=>{
    const ws=walks.flatMap(w=>{const wi=w.itemIds.map(id=>items.find(i=>i.id===id)).filter(Boolean);if(!wi.length)return[];return[[`--- ${w.name} ---`,"","",""],["Item","Unit","Par","Count"],...wi.map(i=>[i.name,i.unit,i.par>0?i.par:"—",""])];});
    const un=items.filter(i=>!walks.some(w=>w.itemIds.includes(i.id)));
    if(un.length)ws.push(["--- Unassigned ---","","",""],["Item","Unit","Par","Count"],...un.map(i=>[i.name,i.unit,i.par>0?i.par:"—",""]));
    dlCSV([["BEACON HILLS — BLANK COUNT SHEET","","",""],["Date: ___________","Counter: ___________","",""],["","","",""],...ws],`BH_BlankSheet_${today()}.csv`);show("Blank sheet exported");
  };
  const expWaste=()=>{
    dlCSV([["BEACON HILLS — WASTE REPORT","","","",""],["Generated:",new Date().toLocaleString(),"","",""],["Period Total:",fmt$(wasteCost),"","",""],["","","","",""],["Date","Item","Type","Qty","Cost","Notes"],...waste.map(w=>[w.date,w.itemName,w.type,w.qty,w.cost.toFixed(2),w.notes||""]),["","","","","TOTAL",wasteCost.toFixed(2)]],`BH_WasteReport_${today()}.csv`);show("Waste report exported");
  };
  const expRecipes=()=>{
    const rows=recipes.flatMap(r=>{
      const cost=r.ingredients.reduce((s,ing)=>{const item=items.find(i=>i.id===ing.itemId);if(!item)return s;let q=parseFloat(ing.qty)||0;if(item.unit==="lb"&&ing.unit==="oz")q/=16;return s+q*item.unitCost;},0);
      const pct=r.menuPrice>0?cost/r.menuPrice*100:null;
      return[[r.name,`${r.ingredients.length} ingredients`,fmt$(cost),r.menuPrice>0?fmt$(r.menuPrice):"—",pct?fmtPct(pct):"—"],...r.ingredients.map(ing=>{const item=items.find(i=>i.id===ing.itemId);return["",item?.name||"",ing.qty,ing.unit,item?fmt$(parseFloat(ing.qty)*(item.unit==="lb"&&ing.unit==="oz"?1/16:1)*item.unitCost):"—"];})];
    });
    dlCSV([["BEACON HILLS — RECIPE COST REPORT","","","",""],["Generated:",new Date().toLocaleString(),"","",""],["Recipe","Ingredients","Plate Cost","Menu Price","FC%"],...rows],`BH_RecipeReport_${today()}.csv`);show("Recipe report exported");
  };
  const last2=snaps[0]; const prev2=snaps[1];
  const snapDelta=last2&&prev2?{food:last2.totalFood-prev2.totalFood,bev:last2.totalBev-prev2.totalBev,fc:last2.fcPct&&prev2.fcPct?last2.fcPct-prev2.fcPct:null}:null;
  const EXPORTS=[
    {label:"📊 Full Food Report",  desc:"Inventory by walk + purchases + food cost",fn:expFood,  color:C.amber},
    {label:"🍷 Full Bev Report",   desc:"Liquor inventory + bev cost by category",  fn:expBev,   color:C.purple},
    {label:"📋 Order Guide",       desc:"All items below par with quantities needed",fn:expOrder, color:C.red},
    {label:"📄 Blank Count Sheet", desc:"Empty sheet sorted by walk order",          fn:expBlank, color:C.blue},
    {label:"🗑 Waste Report",      desc:"All waste/comp entries with totals",         fn:expWaste, color:C.teal},
    {label:"🍽 Recipe Cost Report",desc:"All recipes with plate cost and FC%",fn:expRecipes,color:C.green},
  ];
  return(<>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Cost Summary</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        {[["Food Cost %",fcPct!==null?fmtPct(fcPct):"—",fcPct!==null&&fcPct>settings.foodTarget?C.red:C.green,`Target ${settings.foodTarget}%`],["Bev Cost %",bevPct!==null?fmtPct(bevPct):"—",bevPct!==null&&bevPct>settings.bevTarget?C.red:C.purple,`Target ${settings.bevTarget}%`],["Food Inventory",fmt$(totalFood),C.amber,""],["Bar Inventory",fmt$(totalBev),C.purple,""],["Total Purchases",fmt$(totalPurch),C.text,"Period to date"],["Waste Cost",fmt$(wasteCost),wasteCost>0?C.red:C.muted,"Period to date"]].map(([l,v,col,sub])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}20`}}>
            <div><div style={{fontFamily:mono,fontSize:12,color:C.muted}}>{l}</div>{sub&&<div style={{fontFamily:mono,fontSize:9,color:C.muted}}>{sub}</div>}</div>
            <div style={{fontFamily:mono,fontSize:16,fontWeight:700,color:col}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
    {snapDelta&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>vs Previous Count</span></div><div style={{padding:14,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>{[["Food Inv",snapDelta.food,true],["Bar Inv",snapDelta.bev,true],["Food Cost%",snapDelta.fc,false,"%"]].map(([l,v,inv,sfx])=>v!==null&&v!==undefined?(<div key={l} style={{background:C.surfaceAlt,borderRadius:8,padding:"10px 12px",textAlign:"center"}}><div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:1}}>{l}</div><div style={{fontFamily:mono,fontSize:16,fontWeight:700,color:v===0?C.muted:(inv?v<0:v<0)?C.green:C.red,marginTop:4}}>{v>0?"+":""}{sfx?v.toFixed(1)+sfx:fmt$(v)}</div></div>):null)}</div></div>)}
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Export Reports</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        {EXPORTS.map(({label,desc,fn,color})=>(
          <button key={label} onClick={fn} style={{background:C.surfaceAlt,border:`1px solid ${C.border}`,borderLeft:`3px solid ${color}`,borderRadius:8,padding:"12px 14px",textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontFamily:mono,fontSize:12,fontWeight:700,color}}>{label}</div><div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:3}}>{desc}</div></div>
            <div style={{fontFamily:mono,fontSize:16,color:C.muted}}>⬇</div>
          </button>
        ))}
      </div>
    </div>
  </>);
}

// ─── HISTORY TAB ─────────────────────────────────────────────────────────────
function HistoryTab({snaps,setSnaps,lockSnap,show,canFinance}) {
  const [ca,setCA]=useState(null); const [cb,setCB]=useState(null); const [drill,setDrill]=useState(null);
  const sa=snaps.find(s=>s.id===ca); const sb=snaps.find(s=>s.id===cb);
  const diff=sa&&sb?{fd:sb.totalFood-sa.totalFood,bd:sb.totalBev-sa.totalBev,fc:sb.fcPct&&sa.fcPct?sb.fcPct-sa.fcPct:null,bc:sb.bevPct&&sa.bevPct?sb.bevPct-sa.bevPct:null}:null;
  return(<>
    <button style={{...S.btn("teal"),width:"100%",justifyContent:"center",padding:"12px",marginBottom:14}} onClick={lockSnap}>📅 Save Current Count as Snapshot</button>
    {snaps.length>=2&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Compare Two Counts</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>COUNT A (earlier)</div>
            <select style={{...S.inp,marginTop:4}} value={ca||""} onChange={e=>setCA(e.target.value)}><option value="">-- Select --</option>{snaps.map(s=><option key={s.id} value={s.id}>{s.date} · {fmt$(s.totalFood+s.totalBev)}</option>)}</select>
          </div>
          <div><div style={S.lbl}>COUNT B (later)</div>
            <select style={{...S.inp,marginTop:4}} value={cb||""} onChange={e=>setCB(e.target.value)}><option value="">-- Select --</option>{snaps.map(s=><option key={s.id} value={s.id}>{s.date} · {fmt$(s.totalFood+s.totalBev)}</option>)}</select>
          </div>
        </div>
        {diff&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:4}}>
          {[["Food Inv Δ",diff.fd,true],["Bar Inv Δ",diff.bd,true],["Food Cost Δ",diff.fc,false,"%"],["Bev Cost Δ",diff.bc,false,"%"]].filter(([,,, s])=>s!==undefined||true).map(([l,v,inv,sfx])=>v!==null&&v!==undefined?(
            <div key={l} style={{background:C.surfaceAlt,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontFamily:mono,fontSize:9,color:C.muted,letterSpacing:1.5}}>{l}</div>
              <div style={{fontFamily:mono,fontSize:18,fontWeight:700,color:v===0?C.muted:(inv?v<0:v<0)?C.green:C.red,marginTop:4}}>
                {v>0?"+":""}{sfx?v.toFixed(1)+sfx:fmt$(v)}
              </div>
            </div>
          ):null)}
        </div>)}
      </div>
    </div>)}
    <div style={S.card}><div style={S.hd}><span style={S.title()}>{snaps.length} Snapshots</span></div>
      {snaps.length===0&&<div style={{padding:24,textAlign:"center",color:C.muted,fontFamily:mono,fontSize:11}}>No snapshots. Save one above.</div>}
      {snaps.map(s=>(<div key={s.id}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setDrill(drill===s.id?null:s.id)}>
            <div style={{fontWeight:600,fontSize:14}}>{s.date}</div>
            <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginTop:2}}>{canFinance&&`Food: ${fmt$(s.totalFood)} · Bar: ${fmt$(s.totalBev)}`}{canFinance&&s.fcPct?` · FC: ${fmtPct(s.fcPct)}`:""}</div>
          </div>
          <span style={{fontFamily:mono,fontSize:10,color:C.muted}}>{drill===s.id?"▲":"▼"}</span>
          <button style={{...S.btn("ghost"),padding:"4px 8px",color:C.red,fontSize:14}} onClick={()=>setSnaps(p=>p.filter(x=>x.id!==s.id))}>✕</button>
        </div>
        {drill===s.id&&canFinance&&(<div style={{background:C.surfaceAlt,padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontFamily:mono,fontSize:9,color:C.amber,letterSpacing:2,marginBottom:8}}>TOP ITEMS BY VALUE</div>
          {(s.foodItems||[]).sort((a,b)=>b.qty*b.unitCost-a.qty*a.unitCost).slice(0,8).map(i=>(<div key={i.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}10`}}><span style={{fontFamily:mono,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{i.name}</span><span style={{fontFamily:mono,fontSize:11,color:C.amber,flexShrink:0,marginLeft:8}}>{fmt$(i.qty*i.unitCost)}</span></div>))}
        </div>)}
      </div>))}
    </div>
  </>);
}

// ─── SETTINGS TAB ────────────────────────────────────────────────────────────
function SettingsTab({settings,setSettings,items,setItems,liquor,setLiquor,purchases,setPurch,waste,setWaste,snaps,setSnaps,scans,setScans,recipes,setRecipes,priceHist,setPH,walks,setWalks,show,role,appUsers,setAppUsers,currentUser,setCurrentUser}) {
  const upd=(k,v)=>setSettings(s=>({...s,[k]:v}));
  const [cc,setCC]=useState(null);
  const [eu,setEU]=useState(null); const [uf,setUF]=useState({name:"",role:"manager",pin:""});
  const RC=ROLE_COLOR;
  const [apiKey,setApiKey]=useState(()=>LS.get("bh_apikey_v6",""));
  const saveKey=()=>{LS.set("bh_apikey_v6",apiKey);show("API key saved");};
  const [gClientId,setGClientId]=useState(()=>LS.get("bh_gclientid_v6",""));
  const saveGId=()=>{LS.set("bh_gclientid_v6",gClientId);show("Google Client ID saved");};

  const saveUser=()=>{
    if(!uf.name.trim())return;
    if(eu==="new"){const u={id:uid(),name:uf.name.trim(),role:uf.role,pin:uf.pin};const next=[...(appUsers||[]),u];setAppUsers(next);LS.set(KEYS.users,next);show(`${u.name} added`);}
    else{const next=(appUsers||[]).map(u=>u.id===eu?{...u,...uf}:u);setAppUsers(next);LS.set(KEYS.users,next);if(eu===currentUser.id)setCurrentUser(cu=>({...cu,...uf}));show("User updated");}
    setEU(null);setUF({name:"",role:"manager",pin:""});
  };
  const delUser=id=>{if(id===currentUser.id){show("Can't delete yourself");return;}const next=(appUsers||[]).filter(u=>u.id!==id);setAppUsers(next);LS.set(KEYS.users,next);show("User removed");};
  const clearData=type=>{
    if(type==="food")setItems([]);else if(type==="bar")setLiquor([]);else if(type==="purch")setPurch([]);else if(type==="waste")setWaste([]);else if(type==="snaps")setSnaps([]);else if(type==="scans")setScans([]);else if(type==="recipes")setRecipes([]);else if(type==="prices")setPH([]);else if(type==="walks")setWalks(DEFAULT_WALKS);else if(type==="all"){setItems([]);setLiquor([]);setPurch([]);setWaste([]);setSnaps([]);setScans([]);setRecipes([]);setPH([]);setWalks(DEFAULT_WALKS);}
    show("Cleared");setCC(null);
  };

  return(<>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Restaurant</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div><div style={S.lbl}>RESTAURANT NAME</div><input style={{...S.inp,marginTop:4}} value={settings.restaurantName} onChange={e=>upd("restaurantName",e.target.value)}/></div>
      </div>
    </div>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>AI Features (Scan / Invoice)</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,lineHeight:1.7}}>Required for scanning count sheets and invoices. Get a key at <strong style={{color:C.amber}}>console.anthropic.com</strong>. Stored locally only.</div>
        <div><div style={S.lbl}>ANTHROPIC API KEY</div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <input style={{...S.inp,flex:1,fontFamily:mono,letterSpacing:1}} type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-…"/>
            <button style={{...S.btn("primary"),padding:"9px 16px"}} onClick={saveKey}>Save</button>
          </div>
        </div>
        {apiKey&&<div style={{fontFamily:mono,fontSize:10,color:C.green}}>✓ Key configured</div>}
        <div style={{marginTop:8,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <div style={S.lbl}>GOOGLE CLIENT ID (for Gmail import)</div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <input style={{...S.inp,flex:1,fontFamily:mono,fontSize:11}} value={gClientId} onChange={e=>setGClientId(e.target.value)} placeholder="000000000000-xxx.apps.googleusercontent.com"/>
            <button style={{...S.btn("blue"),padding:"9px 16px"}} onClick={saveGId}>Save</button>
          </div>
          {gClientId&&<div style={{fontFamily:mono,fontSize:10,color:C.green,marginTop:4}}>✓ Google Client ID configured</div>}
          <div style={{fontFamily:mono,fontSize:9,color:C.muted,marginTop:6,lineHeight:1.6}}>Get one free at console.cloud.google.com → APIs → Gmail API → OAuth 2.0 credentials. Add <strong style={{color:C.amber}}>https://2bigjohn.github.io</strong> as an authorized JS origin.</div>
        </div>
      </div>
    </div>
    <div style={S.card}><div style={S.hd}><span style={S.title()}>Cost Targets</span></div>
      <div style={{padding:14,display:"grid",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>FOOD COST TARGET (%)</div><input style={{...S.inp,marginTop:4}} type="number" step="0.5" value={settings.foodTarget} onChange={e=>upd("foodTarget",parseFloat(e.target.value)||29)}/></div>
          <div><div style={S.lbl}>BEV COST TARGET (%)</div><input style={{...S.inp,marginTop:4}} type="number" step="0.5" value={settings.bevTarget} onChange={e=>upd("bevTarget",parseFloat(e.target.value)||22)}/></div>
          <div><div style={S.lbl}>WASTE TARGET (%)</div><input style={{...S.inp,marginTop:4}} type="number" step="0.5" value={settings.wasteTarget||2} onChange={e=>upd("wasteTarget",parseFloat(e.target.value)||2)}/></div>
        </div>
      </div>
    </div>
    {role==="admin"&&(<div style={S.card}><div style={S.hd}><span style={S.title()}>Users & Access</span><button style={{...S.btn("secondary"),padding:"7px 12px",fontSize:10}} onClick={()=>{setEU("new");setUF({name:"",role:"manager",pin:""});}}>+ Add User</button></div>
      {eu&&(<div style={{padding:14,borderBottom:`1px solid ${C.border}`,display:"grid",gap:10}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.amber,letterSpacing:2}}>{eu==="new"?"NEW USER":"EDIT USER"}</div>
        <div><div style={S.lbl}>NAME</div><input style={{...S.inp,marginTop:4}} value={uf.name} onChange={e=>setUF(f=>({...f,name:e.target.value}))} placeholder="e.g. Maria"/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><div style={S.lbl}>ROLE</div>
            <select style={{...S.inp,marginTop:4}} value={uf.role} onChange={e=>setUF(f=>({...f,role:e.target.value}))}>
              <option value="admin">Admin — full access</option>
              <option value="manager">Manager — no settings</option>
              <option value="counter">Counter — count only</option>
            </select>
          </div>
          <div><div style={S.lbl}>PIN (leave blank = no PIN)</div><input style={{...S.inp,marginTop:4}} type="number" value={uf.pin} onChange={e=>setUF(f=>({...f,pin:e.target.value.slice(0,6)}))} placeholder="4–6 digits"/></div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btn(),flex:1,justifyContent:"center"}} onClick={saveUser}>Save</button>
          <button style={{...S.btn("secondary"),padding:"9px 14px"}} onClick={()=>setEU(null)}>Cancel</button>
        </div>
      </div>)}
      {(appUsers||[]).map(u=>(
        <div key={u.id} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}15`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:17,background:`${RC[u.role]||C.muted}22`,border:`2px solid ${RC[u.role]||C.muted}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:mono,fontWeight:700,fontSize:14,color:RC[u.role]||C.muted,flexShrink:0}}>{u.name[0].toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:14}}>{u.name}{u.id===currentUser.id?" (you)":""}</div>
            <div style={{fontFamily:mono,fontSize:10,color:RC[u.role]||C.muted,letterSpacing:1,marginTop:2}}>{u.role.toUpperCase()} · {u.pin?"PIN set":"No PIN"}</div>
          </div>
          <button style={{...S.btn("secondary"),padding:"6px 12px",fontSize:10}} onClick={()=>{setEU(u.id);setUF({name:u.name,role:u.role,pin:u.pin||""});}}>Edit</button>
          {u.id!==currentUser.id&&<button style={{...S.btn("ghost"),padding:"6px 8px",color:C.red,fontSize:14}} onClick={()=>delUser(u.id)}>✕</button>}
        </div>
      ))}
      <div style={{padding:"10px 14px",fontFamily:mono,fontSize:10,color:C.muted,lineHeight:1.7}}>
        <strong style={{color:C.text}}>Admin</strong> — full access · <strong style={{color:C.blue}}>Manager</strong> — no settings · <strong style={{color:C.green}}>Counter</strong> — count/scan only
      </div>
    </div>)}
    {role==="admin"&&(<div style={S.card}><div style={S.hd}><span style={S.title(C.red)}>Clear Data</span></div>
      <div style={{padding:14,display:"grid",gap:8}}>
        <div style={{fontFamily:mono,fontSize:10,color:C.muted,marginBottom:4}}>Permanent — cannot be undone.</div>
        {[["food","Food Inventory"],["bar","Bar Inventory"],["walks","Reset Walks"],["purch","Purchase Log"],["waste","Waste Log"],["snaps","Snapshots"],["scans","Scan History"],["recipes","Recipes"],["prices","Price History"],["all","⚠ ALL DATA"]].map(([type,label])=>(
          cc===type?(
            <div key={type} style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{fontFamily:mono,fontSize:11,color:C.red,flex:1}}>Delete {label}?</div>
              <button style={{...S.btn("danger"),padding:"7px 14px"}} onClick={()=>clearData(type)}>Confirm</button>
              <button style={{...S.btn("secondary"),padding:"7px 14px"}} onClick={()=>setCC(null)}>Cancel</button>
            </div>
          ):(
            <button key={type} style={{...S.btn("secondary"),width:"100%",justifyContent:"flex-start",border:type==="all"?`1px solid ${C.red}40`:`1px solid ${C.border}`}} onClick={()=>setCC(type)}>Clear {label}</button>
          )
        ))}
      </div>
    </div>)}
  </>);
}
