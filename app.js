'use strict';

// ── CONFIG ────────────────────────────────────────────────
const CFG = {
  POLL_MS:      5000,
  CHART_PTS:    60,
  THR: {
    batLow: 20, batWarn: 30,
    tempWarn: 36, tempFault: 42,
    loadWarn: 80, loadFault: 95,
    runtimeLow: 10,
  }
};

// ── UPS DEVICES ───────────────────────────────────────────
const DEVICES = Array.from({ length: 12 }, (_, i) => ({
  id:   `UPS-${String(i+1).padStart(2,'0')}`,
  ip:   `10.10.20.${i+1}`,
  nmc:  i < 7 ? 'APC NMC AP9643' : 'Guter NMC-III',
  zone: i < 4 ? 'Zone-A' : i < 8 ? 'Zone-B' : 'Zone-C',
}));

// ── STATE ─────────────────────────────────────────────────
const S = {
  data:    {},   // current UPS readings
  hist:    {},   // history arrays
  alarms:  [],
  aid:     0,
  polls:   0,
  charts:  {},
  flow: { running: false, fault: false, step: 0, timer: null },
  trend: { ups: 'UPS-01', range: '1h' },
};

// ── BOOT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  clock();
  nav();
  initData();
  renderGrid();
  snmpFlow();
  purdue();
  trends();
  alarms();
  poll();
});

// ── CLOCK ─────────────────────────────────────────────────
function clock() {
  const el = document.getElementById('clock');
  const tick = () => { el.textContent = new Date().toLocaleTimeString('en-GB',{hour12:false}); };
  tick(); setInterval(tick, 1000);
}

// ── NAV ───────────────────────────────────────────────────
function nav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
      if (btn.dataset.page === 'trends') refreshCharts();
    });
  });
}

// ── DATA INIT ─────────────────────────────────────────────
function initData() {
  const now = Date.now();
  DEVICES.forEach(d => {
    S.data[d.id] = freshReading(d.id);
    S.hist[d.id] = { time:[], bat:[], volt:[], load:[], temp:[] };
    for (let i = CFG.CHART_PTS-1; i >= 0; i--) {
      const t = new Date(now - i*60000);
      const h = S.hist[d.id];
      h.time.push(fmt(t));
      h.bat.push(rnd(88,5));
      h.volt.push(rnd(220,7));
      h.load.push(rnd(48,12));
      h.temp.push(rnd(27,3));
    }
  });
}

function freshReading(id) {
  const p = S.data[id];
  return {
    inputVolt:   clamp(rnd(p?.inputVolt  ?? 220, 1.5), 185, 255),
    inputFreq:   rnd(50, 0.15),
    inputCur:    clamp(rnd(p?.inputCur   ?? 32,  0.4), 20, 50),
    outputVolt:  rnd(220, 0.8),
    outputLoad:  clamp(rnd(p?.outputLoad ?? 48,  2.5), 5, 98),
    batCap:      clamp(rnd(p?.batCap     ?? 94,  0.4), 5, 100),
    batVolt:     rnd(240, 1.5),
    batTemp:     clamp(rnd(p?.batTemp    ?? 27,  0.25), 18, 50),
    runtime:     Math.round(rnd(p?.runtime  ?? 42,  1)),
    status:      p?.status ?? 1,   // 1=Online 2=OnBattery 3=Fault 4=Bypass
  };
}

function rnd(v, spread) { return Math.round((v + (Math.random()-.5)*2*spread)*10)/10; }
function clamp(v,lo,hi) { return Math.min(hi, Math.max(lo, v)); }
function fmt(d) { return d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }

// ── POLL LOOP ─────────────────────────────────────────────
function poll() {
  setInterval(() => {
    S.polls++;
    DEVICES.forEach(d => {
      const r = freshReading(d.id);
      S.data[d.id] = r;
      const h = S.hist[d.id];
      h.time.push(fmt(new Date())); h.bat.push(r.batCap);
      h.volt.push(r.inputVolt);     h.load.push(r.outputLoad);
      h.temp.push(r.batTemp);
      Object.keys(h).forEach(k => { if (h[k].length > CFG.CHART_PTS) h[k].shift(); });
      autoCheck(d.id, r);
    });
    renderGrid();
    kpis();
    marq();
    oidsLive();
    document.getElementById('stat-polltime').textContent = `T+${S.polls*5}s`;
  }, CFG.POLL_MS);
}

function autoCheck(id, r) {
  const { THR: T } = CFG;
  if (r.batCap < T.batLow && !activeAlarm(id,'Battery Low'))
    addAlarm(id,'Battery Low','MAJOR','1.3.6.1.4.1.318.1.1.1.5.3',`Battery at ${r.batCap.toFixed(0)}% — below threshold`);
  if (r.batTemp > T.tempFault && !activeAlarm(id,'High Temperature'))
    addAlarm(id,'High Temperature','WARNING','1.3.6.1.4.1.318.1.1.1.5.6',`Temp ${r.batTemp.toFixed(1)}°C exceeds limit`);
  if (r.outputLoad > T.loadFault && !activeAlarm(id,'Overload'))
    addAlarm(id,'Overload','MAJOR','1.3.6.1.4.1.318.1.1.1.5.4',`Output load ${r.outputLoad.toFixed(0)}%`);
}
function activeAlarm(id, type) {
  return S.alarms.some(a => a.upsId===id && a.type===type && a.status==='ACTIVE');
}

// ── UPS GRID ──────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('ups-grid');
  grid.innerHTML = '';
  DEVICES.forEach(d => grid.appendChild(upsCard(d)));
}

function upsCard(dev) {
  const r = S.data[dev.id];
  const stMap = ['','st-online','st-battery','st-fault','st-bypass'];
  const pillMap = ['','pill-online','pill-battery','pill-fault','pill-bypass'];
  const lblMap  = ['','ONLINE','ON BATT','FAULT','BYPASS'];
  const st = r.status || 1;

  const el = document.createElement('div');
  el.className = `ups-card ${stMap[st]}`;

  const pct = Math.round(r.batCap);
  const ringColor = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#e84040';
  const ring = buildRing(pct, ringColor);

  el.innerHTML = `
    <div class="ups-card-top">
      <div class="ups-id-block">
        <div class="ups-id">${dev.id}</div>
        <div class="ups-ip">${dev.ip}</div>
      </div>
      <div class="ups-pill ${pillMap[st]}">${lblMap[st]}</div>
    </div>
    <div class="ups-body">
      <div class="ring-wrap">
        ${ring}
        <div class="ring-center">
          <span class="ring-pct" style="color:${ringColor}">${pct}</span>
          <span class="ring-unit">%</span>
        </div>
      </div>
      <div class="ups-metrics">
        <div class="met">
          <span class="met-l">IN VOLT</span>
          <span class="met-v">${r.inputVolt.toFixed(0)}<span class="met-u"> V</span></span>
        </div>
        <div class="met">
          <span class="met-l">LOAD</span>
          <span class="met-v" style="color:${r.outputLoad>80?'#f59e0b':''}">${r.outputLoad.toFixed(0)}<span class="met-u"> %</span></span>
        </div>
        <div class="met">
          <span class="met-l">TEMP</span>
          <span class="met-v" style="color:${r.batTemp>36?'#f59e0b':''}">${r.batTemp.toFixed(1)}<span class="met-u"> °C</span></span>
        </div>
        <div class="met">
          <span class="met-l">RUNTIME</span>
          <span class="met-v">${r.runtime}<span class="met-u"> m</span></span>
        </div>
      </div>
    </div>
    <div class="ups-card-foot">
      <span><span class="poll-dot"></span>${dev.nmc}</span>
      <span>${dev.zone}</span>
    </div>
  `;
  return el;
}

/* SVG ring gauge ——————————————————— */
function buildRing(pct, color) {
  const r = 24, cx = 29, cy = 29, strokeW = 4;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return `<svg width="58" height="58" viewBox="0 0 58 58">
    <circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="#2a2a30" stroke-width="${strokeW}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${color}" stroke-width="${strokeW}"
      stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${(circ-dash).toFixed(2)}"
      stroke-dashoffset="${(circ*0.25).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"
      style="transition:stroke-dasharray 0.8s ease"/>
  </svg>`;
}

// ── KPI STRIP ─────────────────────────────────────────────
function kpis() {
  let online=0, bat=0, alm=0, totalBat=0;
  DEVICES.forEach(d => {
    const r = S.data[d.id];
    if (r.status===1) online++;
    if (r.status===2) bat++;
    totalBat += r.batCap;
  });
  alm = S.alarms.filter(a=>a.status==='ACTIVE').length;
  document.getElementById('stat-online').textContent    = online;
  document.getElementById('stat-onbattery').textContent = bat;
  document.getElementById('stat-alarms').textContent    = alm;
  document.getElementById('stat-avgbat').textContent    = Math.round(totalBat/DEVICES.length)+'%';
  const badge = document.getElementById('nav-alarm-count');
  badge.textContent = alm;
  badge.classList.toggle('show', alm>0);
}

// ── MARQUEE ───────────────────────────────────────────────
function marq() {
  const active = S.alarms.filter(a=>a.status==='ACTIVE');
  const el = document.getElementById('marq-text');
  if (!active.length) {
    const msg = '  All systems nominal · SNMPv3 polling active · IEC 62443 Compliant ·  ';
    el.textContent = msg+msg;
    el.style.color = '';
    return;
  }
  const msgs = active.map(a=>`  ⚠ [${a.severity}] ${a.upsId}: ${a.type} — ${a.desc} `);
  const full = msgs.join(' · ');
  el.textContent = full+full;
  el.style.color = '#e84040';
}

// ── SNMP FLOW ─────────────────────────────────────────────
function snmpFlow() {
  document.getElementById('btn-start-flow').addEventListener('click', startFlow);
  document.getElementById('btn-fault-scenario').addEventListener('click', ()=>{ S.flow.fault=true; startFlow(); });
  document.getElementById('btn-reset-flow').addEventListener('click', resetFlow);
  oidsLive();
}

function startFlow() {
  if (S.flow.running) return;
  resetFlow();
  S.flow.running = true;
  stepFlow();
}

function stepFlow() {
  if (S.flow.step > 6) { S.flow.running = false; return; }
  activateStep(S.flow.step);
  S.flow.step++;
  S.flow.timer = setTimeout(stepFlow, 1500);
}

function activateStep(n) {
  // Step nodes
  document.querySelectorAll('.step-node').forEach((el, i) => {
    el.classList.remove('active','done','fault');
    if (i < n)  el.classList.add('done');
    if (i === n) el.classList.add(S.flow.fault && n===2 ? 'fault' : 'active');
  });
  // Detail cards
  document.querySelectorAll('.step-detail').forEach((el, i) => {
    el.classList.remove('active','inactive','done');
    if (i > n)  el.classList.add('inactive');
    if (i < n)  el.classList.add('done');
    if (i === n) el.classList.add('active');
  });
  // Step 4 value update
  if (n === 3) {
    const v = document.getElementById('step4-val');
    if (S.flow.fault) {
      v.textContent = 'Battery = 12% ⚠  ·  Status = ON BATTERY';
      v.style.color = '#e84040';
    } else {
      v.textContent = 'InputVoltage = 414 V  ·  Battery = 98%';
      v.style.color = '';
    }
  }
  // Step 5 — fire alarm
  if (n === 5 && S.flow.fault) {
    addAlarm('UPS-01','Battery Low','MAJOR','1.3.6.1.4.1.318.1.1.1.5.3','Demo: Battery at 12% — on battery power');
    renderAlarmTable(); updateAlarmCounts();
  }
  // OID table update with fault
  oidsLive(n >= 3 && S.flow.fault);
}

function resetFlow() {
  clearTimeout(S.flow.timer);
  S.flow.running = false; S.flow.fault = false; S.flow.step = 0;
  document.querySelectorAll('.step-node').forEach(el=>el.classList.remove('active','done','fault'));
  document.querySelectorAll('.step-detail').forEach(el=>{ el.classList.add('inactive'); el.classList.remove('active','done'); });
  const v = document.getElementById('step4-val');
  if (v) { v.textContent='InputVoltage = 414 V  ·  Battery = 98%'; v.style.color=''; }
  oidsLive(false);
}

function oidsLive(fault=false) {
  const d = S.data['UPS-01'] || {};
  const rows = [
    { param:'Input Voltage',       oid:'1.3.6.1.4.1.318.1.1.2.2.1.0', raw:'4140', val:`${d.inputVolt?.toFixed(0)||220} V`,   st:'ok' },
    { param:'Input Frequency',     oid:'1.3.6.1.4.1.318.1.1.2.2.2.0', raw:'500',  val:'50.0 Hz',                              st:'ok' },
    { param:'Input Current',       oid:'1.3.6.1.4.1.318.1.1.2.2.3.0', raw:'320',  val:`${d.inputCur?.toFixed(1)||32} A`,     st:'ok' },
    { param:'Output Voltage',      oid:'1.3.6.1.4.1.318.1.1.2.3.1.0', raw:'2200', val:'220.0 V',                              st:'ok' },
    { param:'Output Load',         oid:'1.3.6.1.4.1.318.1.1.2.3.4.0', raw:`${Math.round(d.outputLoad||48)}`, val:`${Math.round(d.outputLoad||48)} %`, st: d.outputLoad>80?'warn':'ok' },
    { param:'Battery Capacity',    oid:'1.3.6.1.4.1.318.1.1.2.2.1.0', raw: fault?'12':`${Math.round(d.batCap||94)}`, val: fault?'12 % ⚠':`${Math.round(d.batCap||94)} %`, st: fault?'fault':'ok' },
    { param:'Battery Voltage',     oid:'1.3.6.1.4.1.318.1.1.2.9.2.0', raw:'2400', val:'240.0 V',                              st:'ok' },
    { param:'Battery Temperature', oid:'1.3.6.1.4.1.318.1.1.2.2.2.0', raw:'270',  val:`${d.batTemp?.toFixed(1)||27} °C`,    st: d.batTemp>36?'warn':'ok' },
    { param:'Runtime Remaining',   oid:'1.3.6.1.4.1.318.1.1.2.2.3.0', raw:`${d.runtime||42}`, val:`${d.runtime||42} min`,   st:'ok' },
    { param:'UPS Status',          oid:'1.3.6.1.4.1.318.1.1.2.1.1.3.0', raw: fault?'2':'1', val: fault?'2 — On Battery':'1 — Online', st: fault?'warn':'ok' },
  ];
  const tbody = document.getElementById('oid-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r=>`<tr>
    <td>${r.param}</td>
    <td class="oid-col">${r.oid}</td>
    <td style="color:var(--t3)">${r.raw}</td>
    <td>${r.val}</td>
    <td><span class="st-${r.st}">${r.st==='ok'?'✓ Normal':r.st==='warn'?'⚠ Warning':'✕ Fault'}</span></td>
  </tr>`).join('');
}

// ── PURDUE ARCHITECTURE ───────────────────────────────────
const LEVELS = [
  {
    id:'l34', cls:'plvl-34', badge:'LEVEL 3/4', name:'Enterprise',
    title:'Dashboard & Enterprise Integration',
    desc:'Web-based HMI/SCADA for all user roles. Data pushed to OSIsoft PI Historian, SAP PM/Maximo CMMS, and DCS Alarm System via REST APIs and Syslog. Role-based access: Engineer / Operator / Manager / Read-Only.',
    chips:[
      {l:'Web HMI (React/Grafana)',c:'b'},{l:'OSIsoft PI Historian',c:'g'},{l:'SAP PM / Maximo CMMS',c:'g'},
      {l:'DCS Alarm System',c:'a'},{l:'RBAC – 4 roles',c:''}
    ],
    comps:[{i:'📊',n:'Web HMI',d:'Grafana · React'},{i:'📦',n:'PI Historian',d:'OSIsoft · REST'},{i:'🏭',n:'SAP PM',d:'CMMS · RFC'},{i:'🚨',n:'DCS Alarms',d:'Syslog/Trap'}],
  },
  {
    id:'l3', cls:'plvl-3', badge:'LEVEL 3', name:'Site Operations',
    title:'Monitoring Server & Time-Series Database',
    desc:'On-premise server running SNMP Polling Engine (pysnmp/Zabbix), Alarm Engine with threshold rules, Data Processor for normalization, and Syslog Receiver. InfluxDB stores metrics at 60s resolution for 12 months.',
    chips:[
      {l:'SNMP Polling Engine',c:'b'},{l:'Alarm Engine – Rules',c:'b'},{l:'InfluxDB – ups_metrics',c:'g'},
      {l:'PostgreSQL – alarm_events',c:'g'},{l:'Syslog UDP/514',c:'a'}
    ],
    comps:[{i:'🖥️',n:'SNMP Poller',d:'UDP 161 · 60s'},{i:'🔔',n:'Alarm Engine',d:'Threshold Rules'},{i:'🗄️',n:'InfluxDB',d:'Time-Series DB'},{i:'🪵',n:'Syslog Rcvr',d:'UDP 514'}],
  },
  {
    id:'l35', cls:'plvl-35', badge:'LEVEL 3.5', name:'OT Boundary / DMZ',
    title:'IEC 62443 Firewall & DMZ Services',
    desc:'Industrial firewall (FortiGate/Cisco IE) with unidirectional data conduit. DMZ hosts Modbus-to-SNMP gateway for battery chargers, NTP time server, and hardened Jump Server. Default-deny policy with explicit ACLs.',
    chips:[
      {l:'FortiGate / Cisco IE',c:'r'},{l:'ACL: UDP/161 SNMP',c:'a'},{l:'ACL: UDP/514 Syslog',c:'a'},
      {l:'Deny All Default',c:'r'},{l:'IEC 62443-3.5 Compliant',c:'g'},{l:'Audit Logging',c:'g'}
    ],
    comps:[{i:'🔥',n:'IEC Firewall',d:'FortiGate'},{i:'🔄',n:'Modbus GW',d:'Modbus→SNMP'},{i:'⏰',n:'NTP Server',d:'Time Sync'},{i:'🖥️',n:'Jump Server',d:'SSH · MFA'}],
  },
  {
    id:'l12', cls:'plvl-12', badge:'LEVEL 1/2', name:'OT Field Network',
    title:'Industrial Ethernet & VLAN Segmentation',
    desc:'Redundant Fiber Ring (Turbo Ring · IEC 62443-3-3) with Managed Core Switch and 4 Access Switches. Four VLANs provide full segmentation: UPS, Battery Chargers, Management, Servers. All SNMP traffic encrypted (SNMPv3 AuthPriv).',
    chips:[
      {l:'Redundant Fiber Ring',c:'g'},{l:'VLAN 20 – UPS 10.10.20.0/24',c:'g'},{l:'VLAN 30 – Chargers 10.10.30.0/24',c:'g'},
      {l:'VLAN 40 – Mgmt 10.10.40.0/24',c:'a'},{l:'VLAN 50 – Servers 10.10.50.0/24',c:'a'},{l:'SNMPv3 AuthPriv',c:'r'}
    ],
    comps:[{i:'🔄',n:'Fiber Ring',d:'Turbo Ring'},{i:'🌐',n:'Core Switch',d:'Managed VLAN'},{i:'🔗',n:'VLAN 20/30',d:'UPS + Chargers'},{i:'🔗',n:'VLAN 40/50',d:'Mgmt + Servers'}],
  },
  {
    id:'l0', cls:'plvl-0', badge:'LEVEL 0', name:'Field Layer',
    title:'UPS Units & NMC SNMP Agents',
    desc:'12 UPS units across three zones (A, B, C). UPS-01–07 use APC NMC AP9643; UPS-08–12 use Guter NMC-III. Each NMC agent listens on UDP/161. Battery chargers accessed via Modbus-to-SNMP gateway in the DMZ.',
    chips:[
      {l:'12 UPS Units',c:'g'},{l:'APC NMC AP9643 (01–07)',c:'g'},{l:'Guter NMC-III (08–12)',c:'g'},
      {l:'SNMP Agent UDP/161',c:'a'},{l:'APC OID: 1.3.6.1.4.1.318',c:'a'},{l:'Modbus RTU/TCP',c:'b'}
    ],
    comps:[{i:'⚡',n:'UPS-01..07',d:'APC AP9643'},{i:'⚡',n:'UPS-08..12',d:'Guter NMC-III'},{i:'🔋',n:'Bat. Chargers',d:'Modbus RTU'},{i:'📡',n:'SNMP Agents',d:'UDP 161'}],
  },
];

function purdue() {
  const wrap = document.getElementById('purdue-diagram');
  LEVELS.forEach(lv => {
    const row = document.createElement('div');
    row.className = `plvl ${lv.cls}`;
    row.id = `plvl-${lv.id}`;
    row.innerHTML = `
      <div class="plvl-label">
        <div class="plvl-badge">${lv.badge}</div>
        <div class="plvl-name">${lv.name}</div>
      </div>
      <div class="plvl-content">
        ${lv.comps.map(c=>`<div class="arch-comp"><div class="comp-ico">${c.i}</div><div class="comp-name">${c.n}</div><div class="comp-desc">${c.d}</div></div>`).join('')}
      </div>`;
    row.addEventListener('click', () => inspect(lv));
    wrap.appendChild(row);
  });
}

function inspect(lv) {
  document.querySelectorAll('.plvl').forEach(el=>el.classList.remove('selected'));
  document.getElementById(`plvl-${lv.id}`)?.classList.add('selected');
  const colorMap = {g:'chip-g',a:'chip-a',r:'chip-r',b:'chip-b','':`chip`};
  document.getElementById('arch-detail-panel').innerHTML = `
    <div class="inspector-content">
      <h3>${lv.badge} — ${lv.title}</h3>
      <p>${lv.desc}</p>
      <div class="spec-chips">${lv.chips.map(c=>`<span class="chip ${colorMap[c.c]||'chip'}">${c.l}</span>`).join('')}</div>
    </div>`;
}

// ── TRENDS ────────────────────────────────────────────────
let CI = {};

function trends() {
  const sel = document.getElementById('trend-ups-select');
  DEVICES.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = `${d.id}  (${d.ip})`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => { S.trend.ups = sel.value; refreshCharts(); });
  document.querySelectorAll('.range-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      S.trend.range = btn.dataset.range;
      refreshCharts();
    });
  });
  buildCharts();
  refreshCharts();
}

function buildCharts() {
  const defs = [
    { id:'chart-battery', key:'bat',  color:'#22c55e', label:'Battery (%)' },
    { id:'chart-voltage', key:'volt', color:'#3b82f6', label:'Input Volt (V)' },
    { id:'chart-load',    key:'load', color:'#d97706', label:'Load (%)' },
    { id:'chart-temp',    key:'temp', color:'#e85555', label:'Temp (°C)' },
  ];
  defs.forEach(def => {
    if (CI[def.id]) CI[def.id].destroy();
    CI[def.id] = new Chart(document.getElementById(def.id), {
      type: 'line',
      data: {
        labels: [],
        datasets:[{
          label: def.label, data: [],
          borderColor: def.color,
          backgroundColor: def.color+'14',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.8,
        animation: { duration: 200 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#141416',
            borderColor: def.color,
            borderWidth: 1,
            titleColor: '#606070',
            bodyColor: '#f0f0f2',
            padding: 8,
          }
        },
        scales: {
          x: { ticks:{color:'#38383f',font:{size:10,family:'IBM Plex Mono'}}, grid:{color:'#1a1a1d'}, maxTicksLimit:8 },
          y: { ticks:{color:'#38383f',font:{size:10,family:'IBM Plex Mono'}}, grid:{color:'#1a1a1d'} }
        }
      }
    });
    CI[def.id]._key = def.key;
  });
}

function refreshCharts() {
  const h = S.hist[S.trend.ups];
  if (!h) return;
  const pts = {
    '1h': 12, '6h': 36, '24h': CFG.CHART_PTS, '7d': CFG.CHART_PTS
  }[S.trend.range] || CFG.CHART_PTS;
  const sl = arr => arr.slice(-Math.min(pts, arr.length));

  Object.values(CI).forEach(ch => {
    ch.data.labels = sl(h.time);
    ch.data.datasets[0].data = sl(h[ch._key]);
    ch.update('none');
  });
  statRibbon(h, pts);
}

function statRibbon(h, pts) {
  const sl = arr => arr.slice(-Math.min(pts,arr.length));
  const avg = a => a.length ? (a.reduce((s,v)=>s+v,0)/a.length).toFixed(1) : '--';
  const min = a => a.length ? Math.min(...a).toFixed(1) : '--';
  const max = a => a.length ? Math.max(...a).toFixed(1) : '--';
  const bat  = sl(h.bat);
  const volt = sl(h.volt);
  const load = sl(h.load);
  const stats = [
    {l:'AVG BATTERY',  v:`${avg(bat)}%`,    c:'#22c55e'},
    {l:'MIN BATTERY',  v:`${min(bat)}%`,     c:'#f59e0b'},
    {l:'AVG VOLTAGE',  v:`${avg(volt)} V`,   c:'#3b82f6'},
    {l:'VOLT RANGE',   v:`${min(volt)}–${max(volt)} V`, c:'#606070'},
    {l:'AVG LOAD',     v:`${avg(load)}%`,    c:'#d97706'},
    {l:'PEAK LOAD',    v:`${max(load)}%`,    c:'#e84040'},
    {l:'DATA POINTS',  v:bat.length,          c:'#38383f'},
  ];
  document.getElementById('trend-stats').innerHTML =
    stats.map(s=>`<div class="sr-stat"><span class="sr-label">${s.l}</span><span class="sr-val" style="color:${s.c}">${s.v}</span></div>`).join('');
}

// ── ALARMS ────────────────────────────────────────────────
function alarms() {
  document.getElementById('trig-onbattery').addEventListener('click', () => {
    const id = pickRandom();
    S.data[id].status = 2;
    addAlarm(id,'On Battery','MAJOR','1.3.6.1.4.1.318.1.1.1.5.2',`${id} switched to battery power. Utility input failed.`);
    renderGrid(); refresh();
  });
  document.getElementById('trig-battlow').addEventListener('click', () => {
    const id = pickRandom();
    S.data[id].batCap = 14;
    addAlarm(id,'Battery Low','MAJOR','1.3.6.1.4.1.318.1.1.1.5.3',`${id} battery at 14%. Replacement required.`);
    renderGrid(); refresh();
  });
  document.getElementById('trig-utility').addEventListener('click', () => {
    const id = pickRandom();
    S.data[id].status = 2;
    addAlarm(id,'Utility Failure','MAJOR','1.3.6.1.4.1.318.1.1.1.5.4',`${id} AC input power interrupted.`);
    renderGrid(); refresh();
  });
  document.getElementById('trig-overload').addEventListener('click', () => {
    const id = pickRandom();
    S.data[id].outputLoad = 97;
    addAlarm(id,'Overload','WARNING','1.3.6.1.4.1.318.1.1.1.5.4',`${id} output load 97%. Reduce load immediately.`);
    renderGrid(); refresh();
  });
  document.getElementById('btn-ack-all').addEventListener('click', () => {
    S.alarms.forEach(a=>{ if(a.status==='ACTIVE') a.status='ACK'; });
    refresh();
  });
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    S.alarms = [];
    DEVICES.forEach(d=>{ S.data[d.id].status=1; S.data[d.id].batCap=clamp(rnd(88,5),60,100); S.data[d.id].outputLoad=clamp(rnd(48,10),10,70); });
    renderGrid(); refresh();
  });
  renderAlarmTable();
}

function addAlarm(upsId, type, severity, oid, desc) {
  S.alarms.unshift({ id:++S.aid, upsId, type, severity, oid, desc,
    time: new Date().toLocaleTimeString('en-GB')+' '+new Date().toLocaleDateString('en-GB'),
    status:'ACTIVE' });
  renderAlarmTable(); updateAlarmCounts(); marq(); kpis();
}

function renderAlarmTable() {
  const tbody = document.getElementById('alarm-tbody');
  const empty = document.getElementById('alarm-empty');
  if (!S.alarms.length) {
    tbody.innerHTML='';
    empty.style.display='flex';
    return;
  }
  empty.style.display='none';
  const sevCls = s => s==='MAJOR'?'sev-major':s==='WARNING'?'sev-warn':'sev-minor';
  tbody.innerHTML = S.alarms.map(a=>`
    <tr id="arow-${a.id}" class="${a.status==='ACK'?'row-acked':''}">
      <td><span class="sev ${sevCls(a.severity)}">${a.severity}</span></td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--t3);white-space:nowrap">${a.time}</td>
      <td style="font-family:var(--mono);font-weight:600">${a.upsId}</td>
      <td style="font-weight:600">${a.type}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--t3)">${a.oid}</td>
      <td style="color:var(--t2);font-size:11px">${a.desc}</td>
      <td><span class="${a.status==='ACTIVE'?'alarm-active':'alarm-ack'}">${a.status==='ACTIVE'?'● ACTIVE':'✓ ACK'}</span></td>
      <td><button class="btn-ack" onclick="ackRow(${a.id})" ${a.status!=='ACTIVE'?'disabled':''}>Acknowledge</button></td>
    </tr>`).join('');
}

function ackRow(id) {
  const a = S.alarms.find(x=>x.id===id);
  if (a) a.status='ACK';
  renderAlarmTable(); updateAlarmCounts(); marq(); kpis();
}
window.ackRow = ackRow;

function updateAlarmCounts() {
  const active  = S.alarms.filter(a=>a.status==='ACTIVE');
  const major   = active.filter(a=>a.severity==='MAJOR').length;
  const warn    = active.filter(a=>a.severity==='WARNING').length;
  const acked   = S.alarms.filter(a=>a.status==='ACK').length;
  document.getElementById('asumm-major').textContent   = major;
  document.getElementById('asumm-warning').textContent = warn;
  document.getElementById('asumm-minor').textContent   = 0;
  document.getElementById('asumm-ack').textContent     = acked;
  const badge = document.getElementById('nav-alarm-count');
  badge.textContent = active.length;
  badge.classList.toggle('show', active.length>0);
}

function refresh() { renderAlarmTable(); updateAlarmCounts(); kpis(); marq(); }
function pickRandom() { return DEVICES[Math.floor(Math.random()*DEVICES.length)].id; }
