/* DATAFREAK / Upptime v9 — frises de disponibilité pilotées par la période, fiche restructurée.
   Données : /status-days.json (précalculé côté serveur par le workflow status-days à partir des
   incidents Upptime + stats natives), même origine, un seul appel ; aucun appel externe depuis
   le navigateur. Si le fichier manque, les cartes natives restent intactes.
   Accueil : 24 h = 24 heures · 7 j = 7 jours · 30 j = 30 jours · 1 an = 52 semaines (la période
   est mémorisée et conservée quand on ouvre une fiche). Clic sur une cellule = panneau détaillé.
   Fiche : « ← Tous les services », titre sans lien + « Ouvrir le site ↗ », stats de période
   (issues des chiffres natifs), frise avec son sélecteur, badge identique à l'accueil.
   Pied de page « Besoin d'un coup de main ? » injecté ici (customFootHtml absent de
   @upptime/status-page 1.17.0) ; crédits Upptime déplacés après.
   Le sélecteur natif « tout » est masqué (couverture identique à « 1 an », 52 semaines). */
(() => {
  'use strict';
  const DATA_URL='/status-days.json', REFRESH_MS=600000, TZ='Europe/Paris', STORE='df-period';
  const labels={up:'Opérationnel',down:'Indisponible',degraded:'Dégradé',none:'Pas encore suivi',unknown:'Non renseigné'};
  const hourState={u:'up',d:'down',g:'degraded',n:'none'};
  const MODES={
    day:  {kind:'hour',count:24,head:'24 dernières heures · heure de Paris',unit:'Une cellule = une heure civile (heure de Paris).',stat:'Day'},
    week: {kind:'day', count:7, head:'7 derniers jours · heure de Paris',unit:'Une cellule = un jour civil (heure de Paris).',stat:'Week'},
    month:{kind:'day', count:30,head:'30 derniers jours · heure de Paris',unit:'Une cellule = un jour civil (heure de Paris).',stat:'Month'},
    year: {kind:'week',count:52,head:'52 dernières semaines',unit:'Une cellule = une semaine, du lundi au dimanche.',stat:'Year'},
    all:  {kind:'week',count:52,head:'52 dernières semaines',unit:'Une cellule = une semaine, du lundi au dimanche.',stat:''},
  };
  const PERIODS=[['day','24 h'],['week','7 j'],['month','30 j'],['year','1 an']];
  const dayFmt=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:TZ});
  const dayYearFmt=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:TZ});
  const longFmt=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:TZ});
  const timeFmt=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
  const ymdFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
  const hourOf=d=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hourCycle:'h23'}).format(d));
  const minutes=m=>m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:`${m} min`;
  const dayDate=ymd=>new Date(`${ymd}T12:00:00Z`);
  const today=()=>ymdFmt.format(new Date());
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const pct=v=>`${String(Math.round(v*100)/100).replace('.',',')} %`;
  const frPct=s=>{const m=String(s??'').trim().match(/^(\d+)\.(\d+)%$/);return m?`${m[1]},${m[2]} %`:String(s??'');};
  const frMs=v=>v==null||v===''?'':`${Number(v).toLocaleString('fr-FR')} ms`;
  const worst=st=>st.includes('down')?'down':st.includes('degraded')?'degraded':st.includes('up')?'up':'none';
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const hh=h=>`${String(h).padStart(2,'0')} h`;
  const store={get(){try{return sessionStorage.getItem(STORE)||'';}catch{return '';}},set(v){try{sessionStorage.setItem(STORE,v);}catch{}}};

  // ── Cellules par mode ───────────────────────────────────────────────────────
  function hourCells(days,{live='up',generatedAt=null}={}){
    // Le fichier est recalculé chaque heure : les heures écoulées depuis sa génération sont encore 'n'.
    // Elles prennent l'état natif publié par Upptime (sonde 5 min), marqué provisoire.
    const cells=[];const t=today(),hn=hourOf(new Date());
    const gen=generatedAt?new Date(generatedAt):null;
    const genDate=gen?ymdFmt.format(gen):null, genHour=gen?hourOf(gen):-1;
    days.slice(-3).forEach(d=>{
      const chars=d.hours?d.hours.split(''):(d.date===t?Array(hn+1).fill('n'):[]);
      chars.forEach((c,h)=>{
        if(d.date===t && h>hn) return;
        let state=hourState[c]||'none',provisional=false;
        if(c==='n' && gen && d.state!=='none' && (d.date>genDate || (d.date===genDate && h>=genHour))){state=live;provisional=true;}
        cells.push({kind:'hour',date:d.date,hour:h,state,provisional,day:d});
      });
    });
    return cells.slice(-24);
  }
  function weekCells(days){
    const byWeek=new Map();
    days.forEach(d=>{
      const dt=dayDate(d.date);const dow=(dt.getUTCDay()+6)%7;
      const monday=new Date(dt.getTime()-dow*86400000);const key=monday.toISOString().slice(0,10);
      if(!byWeek.has(key))byWeek.set(key,{kind:'week',date:key,dateEnd:new Date(monday.getTime()+6*86400000).toISOString().slice(0,10),days:[]});
      byWeek.get(key).days.push(d);
    });
    return [...byWeek.values()].map(w=>{
      const covered=w.days.filter(d=>d.state!=='none');
      w.state=worst(covered.map(d=>d.state));
      w.down=covered.reduce((a,d)=>a+(d.down||0),0);w.degraded=covered.reduce((a,d)=>a+(d.degraded||0),0);
      w.uptime=covered.length?covered.reduce((a,d)=>a+(d.uptime??100),0)/covered.length:null;
      w.partial=covered.length>0&&(covered.length<w.days.length||covered.some(d=>d.partial));
      return w;
    }).slice(-52);
  }
  function cellsFor(site,mode,opts){
    const days=(site&&site.days)||[];const m=MODES[mode]||MODES.week;
    if(m.kind==='hour') return hourCells(days,opts);
    if(m.kind==='week') return weekCells(days);
    return days.slice(-m.count);
  }
  function describe(c){
    if(!c) return 'Aucune donnée pour cette position';
    if(c.kind==='hour') return `${cap(longFmt.format(dayDate(c.date)))}, ${hh(c.hour)} – ${hh(c.hour+1)} · ${labels[c.state]}${c.provisional?' (provisoire : état en direct, calcul horaire à venir)':''}`;
    if(c.kind==='week'){
      const when=`Semaine du ${dayFmt.format(dayDate(c.date))} au ${dayFmt.format(dayDate(c.dateEnd))}`;
      if(c.state==='none') return `${when} · ${labels.none}`;
      const parts=[when,labels[c.state]];
      if(c.down) parts.push(`${minutes(c.down)} d'indisponibilité`);
      if(c.degraded) parts.push(`${minutes(c.degraded)} de dégradation`);
      if(c.partial) parts.push('sur la période suivie');
      return parts.join(' · ');
    }
    const when=cap(longFmt.format(dayDate(c.date)));
    if(c.state==='none') return `${when} · ${labels.none}`;
    const parts=[when,labels[c.state]||labels.unknown];
    if(c.down) parts.push(`${minutes(c.down)} d'indisponibilité`);
    if(c.degraded) parts.push(`${minutes(c.degraded)} de dégradation`);
    if(c.partial) parts.push(c.date===today()?'jour en cours':'sur la période suivie');
    return parts.join(' · ');
  }
  /** Bornes réelles d'une frise. */
  function bounds(slots,kind){
    const first=slots.find(Boolean), last=[...slots].reverse().find(Boolean);
    if(!first||!last) return ['',''];
    if(kind==='hour'){
      const sameDay=first.date===last.date;
      return [`${dayFmt.format(dayDate(first.date))} ${hh(first.hour)}`, `${sameDay?'':dayFmt.format(dayDate(last.date))+' '}${hh(last.hour+1)}`];
    }
    if(kind==='week') return [`Semaine du ${dayYearFmt.format(dayDate(first.date))}`, `Semaine du ${dayFmt.format(dayDate(last.date))}`];
    return [dayFmt.format(dayDate(first.date)), last.date===today()?`Aujourd’hui, ${dayFmt.format(dayDate(last.date))}`:dayFmt.format(dayDate(last.date))];
  }
  function incidentsBetween(site,a,b){
    return ((site&&site.incidents)||[]).filter(inc=>{
      const s=ymdFmt.format(new Date(inc.start)), e=ymdFmt.format(inc.end?new Date(inc.end):new Date());
      return s<=b && e>=a;
    });
  }

  function start(){
    const root=document.getElementById('sapper');
    if(!root || root.dataset.dfThemeReady==='v9') return;
    root.dataset.dfThemeReady='v9';document.documentElement.lang='fr';
    const controls=new WeakMap();let data=null,dataPromise=null,loadedAt=0,scheduled=false;
    const nativeForm=()=>root.querySelector('form.r:not(.df-filter)');
    const periodOf=()=>{const v=nativeForm()?.querySelector('input[type="radio"]:checked')?.value;return v&&v!=='all'?v:(store.get()||'week');};

    function load(force=false){
      if(!force && dataPromise) return dataPromise;
      dataPromise=(async()=>{
        const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
        try{
          const response=await fetch(`${DATA_URL}?t=${Math.floor(Date.now()/REFRESH_MS)}`,{signal:abort.signal,credentials:'omit',cache:'no-cache'});
          if(!response.ok) throw new Error('status-days indisponible');
          const json=await response.json();
          if(!json || typeof json.sites!=='object') throw new Error('format inattendu');
          data=json;loadedAt=Date.now();return json;
        }finally{clearTimeout(timer);}
      })();
      return dataPromise;
    }
    const generatedLabel=()=>data?.generatedAt?`${dayFmt.format(new Date(data.generatedAt))} à ${timeFmt.format(new Date(data.generatedAt)).replace(':',' h ')}`:'';

    /** Frise + panneau. host = carte (accueil) ou bloc autonome (fiche). */
    function makeTimeline(host,slug,site,{badge:withBadge=true,periodFn=null}={}){
      const wrap=el('div','df-history');
      const heading=el('div','df-history-head');const label=el('span');const note=el('span','df-history-note');heading.append(label,note);
      const track=el('div','df-bars');track.setAttribute('role','group');
      const detail=el('div','df-bar-detail');detail.setAttribute('aria-live','polite');
      const caption=el('div','df-bar-caption');const capL=el('span'),capR=el('span');caption.append(capL,capR);
      const panel=el('div','df-day');panel.id=`df-day-${slug}-${Math.random().toString(36).slice(2,7)}`;panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Détail');
      wrap.append(heading,track,caption,detail,panel);host.append(wrap);host.classList.add('df-has-bars');
      let badge=null;
      if(withBadge){badge=host.querySelector('.df-service-state');if(!badge){badge=el('span','df-service-state');host.prepend(badge);}}
      const period=()=>periodFn?periodFn():periodOf();
      let buttons=[],slots=[],selected=0,open=null,current=site,mode=period(),count=0;

      function select(index,focus=false){
        selected=Math.max(0,Math.min(count-1,index));
        buttons.forEach((b,i)=>{b.tabIndex=i===selected?0:-1;b.dataset.selected=String(i===selected);});
        detail.textContent=describe(slots[selected]);
        if(focus)buttons[selected]?.focus();
      }
      function incidentRows(list,rangeA,rangeB,partial){
        const box=el('div','df-day-incidents');
        if(!list.length){box.append(el('p','df-day-none',`Aucun incident signalé sur cette période${partial?' (sur la période suivie)':''}.`));return box;}
        box.append(el('div','df-day-incidents-title',list.length>1?`${list.length} incidents`:'1 incident'));
        list.forEach(inc=>{
          const row=el('a','df-incident');row.href=`/incident/${inc.number}`;
          const s=new Date(inc.start), e=inc.end?new Date(inc.end):null;
          const dur=e?minutes(Math.max(1,Math.round((e-s)/60000))):'en cours';
          const sd=ymdFmt.format(s), ed=e?ymdFmt.format(e):today();
          const from=(sd<rangeA||rangeA!==rangeB?`${dayFmt.format(s)} `:'')+timeFmt.format(s);
          const to=e?((ed>rangeB||rangeA!==rangeB?`${dayFmt.format(e)} `:'')+timeFmt.format(e)):'maintenant';
          const sev=inc.severity==='down'?'Indisponibilité':'Dégradation';
          row.append(el('span',`df-incident-sev is-${inc.severity}`,sev),el('span','df-incident-when',`${from} → ${to} · ${dur}`),el('span','df-incident-link','Voir l’incident →'));
          row.setAttribute('aria-label',`${sev} de ${from} à ${to} (${dur}), incident numéro ${inc.number}`);
          box.append(row);
        });
        return box;
      }
      function kpis(x,partialText){
        const kpi=el('div','df-day-kpi');
        kpi.append(el('span',`df-day-state is-${x.state}`,labels[x.state]));
        if(x.uptime!=null)kpi.append(el('span','df-day-uptime',`Disponibilité ${pct(x.uptime)}`));
        if(x.down)kpi.append(el('span',null,`${minutes(x.down)} d'indisponibilité`));
        if(x.degraded)kpi.append(el('span',null,`${minutes(x.degraded)} de dégradation`));
        if(x.partial)kpi.append(el('span','df-day-partial',partialText));
        return kpi;
      }
      function closeBtn(){const c=el('button','df-day-close','Fermer');c.type='button';c.addEventListener('click',()=>toggle(open));return c;}
      function dayPanel(day){
        const frag=document.createDocumentFragment();
        const head=el('div','df-day-head');head.append(el('div','df-day-title',cap(longFmt.format(dayDate(day.date)))),kpis(day,day.date===today()?'Jour en cours · sur la période suivie':'Sur la période suivie'),closeBtn());frag.append(head);
        if(day.hours){
          const hoursWrap=el('div','df-hours-wrap');
          const hours=el('div','df-hours');hours.setAttribute('role','list');hours.setAttribute('aria-label','Heure par heure');
          const chars=day.hours.split('');
          chars.forEach((c,h)=>{const st=hourState[c]||'none';const cell=el('span','df-hour');cell.dataset.state=st;cell.setAttribute('role','listitem');cell.title=`${hh(h)} – ${hh(h+1)} : ${labels[st]}`;cell.setAttribute('aria-label',cell.title);hours.append(cell);});
          const axis=el('div','df-hours-axis');['00 h','06 h','12 h','18 h',`${chars.length} h`].forEach(t=>axis.append(el('span',null,t)));
          hoursWrap.append(hours,axis);frag.append(hoursWrap);
        } else frag.append(el('p','df-day-none df-day-nohours','Le détail heure par heure n’est conservé que pour les trois derniers jours.'));
        frag.append(incidentRows(incidentsBetween(current,day.date,day.date),day.date,day.date,day.partial));
        return frag;
      }
      function weekPanel(w){
        const frag=document.createDocumentFragment();
        const head=el('div','df-day-head');head.append(el('div','df-day-title',`Semaine du ${dayFmt.format(dayDate(w.date))} au ${dayFmt.format(dayDate(w.dateEnd))}`),kpis(w,'Sur la période suivie'),closeBtn());frag.append(head);
        const daysWrap=el('div','df-hours-wrap');
        const grid=el('div','df-hours df-week-days');grid.setAttribute('role','list');grid.setAttribute('aria-label','Jour par jour');
        w.days.forEach(d=>{const cell=el('span','df-hour');cell.dataset.state=d.state;cell.setAttribute('role','listitem');cell.title=describe(d);cell.setAttribute('aria-label',cell.title);grid.append(cell);});
        const axis=el('div','df-hours-axis');['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'].forEach(t=>axis.append(el('span',null,t)));
        daysWrap.append(grid,axis);frag.append(daysWrap);
        frag.append(incidentRows(incidentsBetween(current,w.date,w.dateEnd),w.date,w.dateEnd,w.partial));
        return frag;
      }
      function renderPanel(){
        panel.replaceChildren();
        const c=open!=null?slots[open]:null;
        buttons.forEach((b,i)=>b.setAttribute('aria-expanded',String(i===open&&!!c)));
        if(!c||(c.state==='none'&&c.kind!=='hour')){panel.hidden=true;return;}
        panel.hidden=false;
        panel.append(c.kind==='week'?weekPanel(c):dayPanel(c.kind==='hour'?c.day:c));
      }
      function toggle(index){open=(open===index)?null:index;renderPanel();if(open==null)buttons[selected]?.focus();}
      function buildButtons(n){
        count=n;track.replaceChildren();buttons=[];track.dataset.count=String(n);
        for(let i=0;i<n;i++){
          const b=el('button','df-bar');b.type='button';b.dataset.state='unknown';b.tabIndex=i===n-1?0:-1;b.dataset.selected=String(i===n-1);
          b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');
          b.addEventListener('focus',()=>select(i));
          b.addEventListener('click',()=>{select(i);toggle(i);});
          b.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')select(i);});
          b.addEventListener('keydown',event=>{
            if(event.key==='Escape'&&open!=null){event.preventDefault();toggle(open);return;}
            const next=event.key==='ArrowRight'?i+1:event.key==='ArrowLeft'?i-1:event.key==='Home'?0:event.key==='End'?n-1:null;
            if(next!==null){event.preventDefault();select(next,true);}
          });buttons.push(b);track.append(b);
        }
        selected=n-1;open=null;panel.hidden=true;
      }
      panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&open!=null){event.preventDefault();toggle(open);}});
      function liveState(){
        const src=withBadge?host:root.querySelector('main.container > section h1 .tag');
        return src?(src.classList.contains('down')?'down':src.classList.contains('degraded')?'degraded':'up'):'up';
      }
      function freshness(){
        if(!badge) return;
        const state=host.classList.contains('down')?'down':host.classList.contains('degraded')?'degraded':host.classList.contains('up')?'up':'unknown';
        host.dataset.dfFreshness=state;
        const text=labels[state];if(badge.textContent!==text)badge.textContent=text;
        badge.title='Dernier état publié par Upptime (sonde toutes les 5 minutes).';
      }
      function render(next,nextMode){
        current=next||current;const newMode=nextMode||period();
        const m=MODES[newMode]||MODES.week;
        const cells=cellsFor(current,newMode,{live:liveState(),generatedAt:data?.generatedAt});
        const n=m.kind==='hour'?24:m.count;
        if(newMode!==mode||n!==count){mode=newMode;buildButtons(n);}
        slots=[...Array(Math.max(0,n-cells.length)).fill(null),...cells.slice(-n)];
        buttons.forEach((b,i)=>{const c=slots[i];b.dataset.state=c?(c.state==='none'?'unknown':c.state):'unknown';b.dataset.provisional=String(!!(c&&c.provisional));b.setAttribute('aria-label',describe(c));});
        label.textContent=m.head;
        const [bl,br]=bounds(slots,m.kind);capL.textContent=bl;capR.textContent=br;
        track.setAttribute('aria-label',`${m.head}. Flèches gauche et droite pour parcourir, Entrée pour ouvrir le détail.`);
        const firstDay=(current.days||[]).find(d=>d.state!=='none');
        if(!firstDay) note.textContent='En attente de données';
        else if(m.kind==='hour') note.textContent=data?.generatedAt?`Calcul horaire du ${generatedLabel()}`:'';
        else note.textContent=m.unit.replace('Une cellule = ','1 cellule = ').replace(/\.$/,'').replace(' (heure de Paris)','');
        select(selected);if(open!=null)renderPanel();
      }
      controls.set(host,{freshness,render});freshness();render(site,mode);
    }

    // ── Accueil : chiffres en français, « Suivi depuis », bandeau daté ─────────
    function formatCardNumbers(card){
      card.querySelectorAll(':scope > div > .data').forEach(d=>{
        const t=d.textContent.trim();
        const p=t.match(/^(\d+)\.(\d+)%$/);if(p){d.textContent=`${p[1]},${p[2]} %`;return;}
        const ms=t.match(/^(\d+)\s*ms$/);if(ms){d.textContent=frMs(ms[1]);}
      });
    }
    function sinceLine(card,site){
      const covered=(site.days||[]).filter(d=>d.state!=='none');
      let line=card.querySelector('.df-since');
      if(covered.length>=30){line?.remove();return;}
      const first=covered[0];if(!first)return;
      const txt=`Suivi depuis le ${dayFmt.format(dayDate(first.date))} · ${covered.length} jour${covered.length>1?'s':''} de recul`;
      if(!line){line=el('div','df-since');const stats=[...card.querySelectorAll(':scope > div:not(.df-history)')].pop();(stats||card).after(line);}
      if(line.textContent!==txt)line.textContent=txt;
    }
    function banner(){
      const b=root.querySelector('main.container > article.up, main.container > article.down, main.container > article.degraded');
      if(!b||!data?.generatedAt)return;
      let s=b.querySelector('.df-banner-date');
      const txt=`Sondes toutes les 5 minutes · frises et détails calculés le ${generatedLabel()}`;
      if(!s){s=el('div','df-banner-date');b.append(s);}
      if(s.textContent!==txt)s.textContent=txt;
    }

    // ── Fiche : retour, titre, lien externe, badge, stats de période ────────────
    function detailHeader(main,slug,site){
      const summary=main.querySelector(':scope > section');
      const h1=summary?.querySelector('h1');if(!h1)return null;
      if(!summary.querySelector('.df-back')){const back=el('a','df-back','← Tous les services');back.href='/';summary.prepend(back);}
      const a=h1.querySelector('a');
      if(a){const name=el('span','df-title',a.textContent.trim());a.replaceWith(name);
        const url=site.url||a.getAttribute('href')||'';
        if(/^https?:\/\//i.test(url)&&!summary.querySelector('.df-open')){const open=el('a','df-open','Ouvrir le site ↗');open.href=url;open.target='_blank';open.rel='noopener';h1.after(open);}
      }
      const dl=summary.querySelector('dl');if(dl)dl.querySelectorAll('dd').forEach(dd=>{const t=dd.textContent.trim();const p=t.match(/^(\d+)\.(\d+)%$/);if(p)dd.textContent=`${p[1]},${p[2]} %`;const ms=t.match(/^(\d+)\s*ms$/);if(ms)dd.textContent=frMs(ms[1]);});
      return summary;
    }
    function detailStats(block,site,mode){
      const m=MODES[mode]||MODES.week;const st=site.stats||{};
      let dl=block.querySelector('dl.df-stats');
      if(!dl){dl=el('dl','df-stats');block.querySelector('.df-detail-head').after(dl);}
      const up=st[`uptime${m.stat}`]??st.uptime, t=st[`time${m.stat}`]??st.time;
      dl.replaceChildren(el('dt',null,'Disponibilité sur la période'),el('dd',null,up!=null?frPct(up):'—'),el('dt',null,'Réponse moyenne sur la période'),el('dd',null,t!=null&&t!==''?frMs(t):'—'));
    }

    const FOOT='<aside class="df-foot" aria-label="Aide et liens utiles"><div class="df-foot-top"><div><div class="df-foot-title">Besoin d’un coup de main ?</div><p>Un problème persiste ? Consultez le centre d’aide.</p></div><a class="df-help" href="https://faq.datafreak.fr">Accéder au centre d’aide <span aria-hidden="true">↗</span></a></div><div class="df-foot-bottom"><div class="df-foot-links"><a href="https://www.datafreak.fr/">DATAFREAK ↗</a><a href="https://freaklabs.io/">FREAKLABS ↗</a></div><span class="df-tricolor" aria-hidden="true"><i></i><i></i><i></i></span></div></aside>';
    function foot(){
      const footer=root.querySelector('footer');if(!footer)return;
      let aside=root.querySelector('.df-foot');
      if(!aside){const tpl=document.createElement('template');tpl.innerHTML=FOOT;aside=tpl.content.firstElementChild;footer.after(aside);}
      if(aside.nextElementSibling!==footer)aside.after(footer); // crédits Upptime après le bloc d'aide
    }
    const slugFromHref=href=>{try{const path=new URL(href,location.href).pathname;const s=decodeURIComponent(path.match(/\/history\/([^/]+)\/?$/)?.[1]||'');return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:'';}catch{return '';}};

    function enhance(){
      foot();
      const main=root.querySelector('main.container');if(main){main.id='df-main';main.tabIndex=-1;}
      const routeSlug=slugFromHref(location.href);
      const services=root.querySelector('.live-status');
      root.querySelectorAll('.df-bars-explainer').forEach(n=>{if(!services)n.remove();});
      root.querySelectorAll('section.df-detail').forEach(n=>{if(!routeSlug||n.dataset.slug!==routeSlug)n.remove();});
      const nf=nativeForm();
      if(nf){nf.setAttribute('aria-label','Période : s’applique aux chiffres et aux frises');nf.querySelectorAll('input[value="all"]').forEach(i=>{i.closest('div')?.classList.add('df-hidden');if(i.checked){const w=nf.querySelector('input[value="'+(store.get()||'week')+'"]')||nf.querySelector('input[value="week"]');if(w){w.checked=true;w.dispatchEvent(new Event('change',{bubbles:true}));}}});}
      if(!data) return;
      const mode=periodOf();
      if(services){
        banner();
        let note=root.querySelector('.df-bars-explainer');
        if(!note){note=el('p','df-bars-explainer');services.after(note);}
        const txt=`${(MODES[mode]||MODES.week).unit} Calculé à partir des incidents publiés sur cette page. Vert : aucun incident. Ambre : performances dégradées. Rouge : indisponibilité. Gris : hors suivi. Cliquez sur une cellule pour le détail.`;
        if(note.textContent!==txt)note.textContent=txt;
        root.querySelectorAll('.live-status article').forEach(card=>{
          const link=card.querySelector('h4 a');if(!link)return;
          const slug=slugFromHref(link.href);const site=slug&&data.sites[slug];
          if(!site)return;
          formatCardNumbers(card);sinceLine(card,site);
          if(controls.has(card)){const c=controls.get(card);c.freshness();c.render(site,mode);return;}
          makeTimeline(card,slug,site);
        });
      }
      if(routeSlug && main && data.sites[routeSlug]){
        const site=data.sites[routeSlug];
        const summary=detailHeader(main,routeSlug,site);if(!summary)return;
        let block=main.querySelector(':scope > section.df-detail');
        if(!block){
          block=el('section','df-detail');block.dataset.slug=routeSlug;
          const head=el('div','f df-detail-head');head.append(el('h2',null,'Disponibilité'));
          const form=el('form','r df-filter');form.setAttribute('aria-label','Période : frise et chiffres ci-dessous');
          const initial=store.get()||'week';
          PERIODS.forEach(([v,t])=>{const box=el('div');const input=el('input');input.type='radio';input.name='df_period';input.value=v;input.id=`df_period_${v}`;input.checked=v===initial;const lab=el('label',null,t);lab.htmlFor=input.id;box.append(input,lab);form.append(box);});
          head.append(form);block.append(head);summary.after(block);
          const periodFn=()=>form.querySelector('input:checked')?.value||initial;
          detailStats(block,site,periodFn());
          makeTimeline(block,routeSlug,site,{badge:false,periodFn});
          form.addEventListener('change',()=>{store.set(periodFn());detailStats(block,data.sites[routeSlug],periodFn());controls.get(block)?.render(data.sites[routeSlug],periodFn());});
        } else if(controls.has(block)){controls.get(block).render(site);}
      }
    }

    root.addEventListener('change',event=>{
      const t=event.target;if(!t?.matches?.('form.r:not(.df-filter) input[type="radio"]'))return;
      if(t.value&&t.value!=='all')store.set(t.value);
      enhance();
    });
    const observer=new MutationObserver(mutations=>{
      if(!mutations.some(m=>!m.target.closest?.('.df-history,.df-service-state,.df-detail,.df-bars-explainer,.df-since,.df-banner-date,.df-foot'))||scheduled)return;
      scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});
    });
    load().then(enhance).catch(()=>{});
    enhance();observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)root.querySelectorAll('.live-status article').forEach(c=>controls.get(c)?.freshness());});
    setInterval(()=>{
      if(document.hidden)return;
      root.querySelectorAll('.live-status article').forEach(c=>controls.get(c)?.freshness());
      if(Date.now()-loadedAt>=REFRESH_MS) load(true).then(enhance).catch(()=>{});
    },60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
