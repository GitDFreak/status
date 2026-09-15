/* DATAFREAK / Upptime v7 — frises de disponibilité pilotées par le sélecteur de période natif.
   Données : /status-days.json (précalculé côté serveur par le workflow status-days à partir des
   incidents Upptime), même origine, un seul appel ; aucun appel à api.github.com depuis le
   navigateur. Si le fichier manque, les cartes natives restent intactes.
   Accueil : 24 h = 24 heures · 7 j = 7 jours · 30 j = 30 jours · 1 an / tout = 52 semaines,
   synchronisé avec les radios natives (form.r). Clic sur une cellule = panneau détaillé
   (état, disponibilité, heure par heure ou jours de la semaine, incidents → /incident/<n>).
   Fiche /history/<slug> : même frise avec son propre sélecteur de période (24 h par défaut). Fond de page « Besoin d'un coup de
   main ? » injecté ici (customFootHtml absent de @upptime/status-page 1.17.0). */
(() => {
  'use strict';
  const DATA_URL='/status-days.json', REFRESH_MS=600000, TZ='Europe/Paris';
  const labels={up:'Opérationnel',down:'Indisponible',degraded:'Dégradé',none:'Pas encore supervisé',unknown:'Non renseigné'};
  const hourState={u:'up',d:'down',g:'degraded',n:'none'};
  const MODES={
    day:  {kind:'hour',count:24,head:'24 dernières heures · heure de Paris',left:'Il y a 24 h',right:'Maintenant',explain:'Une cellule = une heure civile (heure de Paris).'},
    week: {kind:'day', count:7, head:'7 derniers jours · heure de Paris',left:'Il y a 7 jours',right:'Aujourd’hui',explain:'Une barre = un jour civil (heure de Paris).'},
    month:{kind:'day', count:30,head:'30 derniers jours · heure de Paris',left:'Il y a 30 jours',right:'Aujourd’hui',explain:'Une barre = un jour civil (heure de Paris).'},
    year: {kind:'week',count:52,head:'52 dernières semaines',left:'Il y a 1 an',right:'Cette semaine',explain:'Une barre = une semaine (du lundi au dimanche).'},
    all:  {kind:'week',count:52,head:'Depuis le début de la supervision',left:'Il y a 1 an',right:'Cette semaine',explain:'Une barre = une semaine (du lundi au dimanche) ; l’historique couvre au plus un an.'},
  };
  const dayFmt=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:TZ});
  const longFmt=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:TZ});
  const timeFmt=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
  const ymdFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
  const hourNow=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const minutes=m=>m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:`${m} min`;
  const dayDate=ymd=>new Date(`${ymd}T12:00:00Z`); // midi UTC : même jour civil à Paris
  const today=()=>ymdFmt.format(new Date());
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const pct=v=>`${String(Math.round(v*100)/100).replace('.',',')} %`;
  const worst=states=>states.includes('down')?'down':states.includes('degraded')?'degraded':states.includes('up')?'up':'none';
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const hh=h=>`${String(h).padStart(2,'0')} h`;

  // ── Cellules par mode ───────────────────────────────────────────────────────
  function hourCells(days){
    const cells=[];const t=today(),hn=hourNow();
    days.slice(-3).forEach(d=>{
      if(!d.hours) return;
      d.hours.split('').forEach((c,h)=>{
        if(d.date===t && h>hn) return; // heures futures
        cells.push({kind:'hour',date:d.date,hour:h,state:hourState[c]||'none',day:d});
      });
    });
    return cells.slice(-24);
  }
  function weekCells(days){
    // Semaines lundi→dimanche (jour civil Paris), la dernière = semaine en cours
    const byWeek=new Map();
    days.forEach(d=>{
      const dt=dayDate(d.date);const dow=(dt.getUTCDay()+6)%7; // 0 = lundi
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
  function cellsFor(site,mode){
    const days=(site&&site.days)||[];const m=MODES[mode]||MODES.month;
    if(m.kind==='hour') return hourCells(days);
    if(m.kind==='week') return weekCells(days);
    return days.slice(-m.count);
  }
  function describe(c){
    if(!c) return 'Aucune donnée pour cette position';
    if(c.kind==='hour'){
      return `${cap(longFmt.format(dayDate(c.date)))}, ${hh(c.hour)} – ${hh(c.hour+1)} · ${labels[c.state]}`;
    }
    if(c.kind==='week'){
      const when=`Semaine du ${dayFmt.format(dayDate(c.date))} au ${dayFmt.format(dayDate(c.dateEnd))}`;
      if(c.state==='none') return `${when} · ${labels.none}`;
      const parts=[when,labels[c.state]];
      if(c.down) parts.push(`${minutes(c.down)} d'indisponibilité`);
      if(c.degraded) parts.push(`${minutes(c.degraded)} de dégradation`);
      if(c.partial) parts.push('semaine incomplète');
      return parts.join(' · ');
    }
    const when=cap(longFmt.format(dayDate(c.date)));
    if(c.state==='none') return `${when} · ${labels.none}`;
    const parts=[when,labels[c.state]||labels.unknown];
    if(c.down) parts.push(`${minutes(c.down)} d'indisponibilité`);
    if(c.degraded) parts.push(`${minutes(c.degraded)} de dégradation`);
    if(c.partial) parts.push(c.date===today()?'jour en cours':'supervision démarrée ce jour');
    return parts.join(' · ');
  }
  /** Incidents du service chevauchant [dateA, dateB] (jours civils Paris). */
  function incidentsBetween(site,a,b){
    return ((site&&site.incidents)||[]).filter(inc=>{
      const s=ymdFmt.format(new Date(inc.start)), e=ymdFmt.format(inc.end?new Date(inc.end):new Date());
      return s<=b && e>=a;
    });
  }

  function start(){
    const root=document.getElementById('sapper');
    if(!root || root.dataset.dfThemeReady==='v7') return;
    root.dataset.dfThemeReady='v7';document.documentElement.lang='fr';
    const controls=new WeakMap();let data=null,dataPromise=null,loadedAt=0,scheduled=false;
    const periodOf=()=>root.querySelector('form.r:not(.df-filter) input[type="radio"]:checked')?.value||'week';

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

    /** Frise + panneau. host = carte (accueil) ou bloc autonome (fiche). */
    function makeTimeline(host,slug,site,{badge:withBadge=true,fixedMode=null,periodFn=null}={}){
      const wrap=el('div','df-history');
      const heading=el('div','df-history-head');const label=el('span');const note=el('span','df-history-note');heading.append(label,note);
      const track=el('div','df-bars');track.setAttribute('role','group');
      const detail=el('div','df-bar-detail');detail.setAttribute('aria-live','polite');
      const caption=el('div','df-bar-caption');const capL=el('span'),capR=el('span');caption.append(capL,capR);
      const panel=el('div','df-day');panel.id=`df-day-${slug}-${Math.random().toString(36).slice(2,7)}`;panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Détail');
      wrap.append(heading,track,caption,detail,panel);host.append(wrap);host.classList.add('df-has-bars');
      let badge=null;
      if(withBadge){badge=host.querySelector('.df-service-state');if(!badge){badge=el('span','df-service-state');host.prepend(badge);}}
      const period=()=>fixedMode||(periodFn?periodFn():periodOf());
      let buttons=[],slots=[],selected=0,open=null,current=site,mode=period(),count=0;

      function select(index,focus=false){
        selected=Math.max(0,Math.min(count-1,index));
        buttons.forEach((b,i)=>{b.tabIndex=i===selected?0:-1;b.dataset.selected=String(i===selected);});
        detail.textContent=describe(slots[selected]);
        if(focus)buttons[selected]?.focus();
      }
      function incidentRows(list,rangeA,rangeB){
        const box=el('div','df-day-incidents');
        if(!list.length){box.append(el('p','df-day-none','Aucun incident sur cette période.'));return box;}
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
      function dayPanel(day){
        const head=el('div','df-day-head');
        head.append(el('div','df-day-title',cap(longFmt.format(dayDate(day.date)))));
        const kpi=el('div','df-day-kpi');
        kpi.append(el('span',`df-day-state is-${day.state}`,labels[day.state]));
        if(day.uptime!=null)kpi.append(el('span','df-day-uptime',`Disponibilité ${pct(day.uptime)}`));
        if(day.down)kpi.append(el('span',null,`${minutes(day.down)} d'indisponibilité`));
        if(day.degraded)kpi.append(el('span',null,`${minutes(day.degraded)} de dégradation`));
        if(day.partial)kpi.append(el('span','df-day-partial',day.date===today()?'Jour en cours':'Supervision démarrée ce jour'));
        const close=el('button','df-day-close','Fermer');close.type='button';close.addEventListener('click',()=>toggle(open));
        head.append(kpi,close);
        const frag=document.createDocumentFragment();frag.append(head);
        if(day.hours){
          const hoursWrap=el('div','df-hours-wrap');
          const hours=el('div','df-hours');hours.setAttribute('role','list');hours.setAttribute('aria-label','Heure par heure');
          const chars=day.hours.split('');
          chars.forEach((c,h)=>{const st=hourState[c]||'none';const cell=el('span','df-hour');cell.dataset.state=st;cell.setAttribute('role','listitem');cell.title=`${hh(h)} – ${hh(h+1)} : ${labels[st]}`;cell.setAttribute('aria-label',cell.title);hours.append(cell);});
          const axis=el('div','df-hours-axis');['00 h','06 h','12 h','18 h',`${chars.length} h`].forEach(t=>axis.append(el('span',null,t)));
          hoursWrap.append(hours,axis);frag.append(hoursWrap);
        } else {
          frag.append(el('p','df-day-none df-day-nohours','Le détail heure par heure n’est conservé que pour les trois derniers jours.'));
        }
        frag.append(incidentRows(incidentsBetween(current,day.date,day.date),day.date,day.date));
        return frag;
      }
      function weekPanel(w){
        const head=el('div','df-day-head');
        head.append(el('div','df-day-title',`Semaine du ${dayFmt.format(dayDate(w.date))} au ${dayFmt.format(dayDate(w.dateEnd))}`));
        const kpi=el('div','df-day-kpi');
        kpi.append(el('span',`df-day-state is-${w.state}`,labels[w.state]));
        if(w.uptime!=null)kpi.append(el('span','df-day-uptime',`Disponibilité ${pct(w.uptime)}`));
        if(w.down)kpi.append(el('span',null,`${minutes(w.down)} d'indisponibilité`));
        if(w.degraded)kpi.append(el('span',null,`${minutes(w.degraded)} de dégradation`));
        if(w.partial)kpi.append(el('span','df-day-partial','Semaine incomplète'));
        const close=el('button','df-day-close','Fermer');close.type='button';close.addEventListener('click',()=>toggle(open));
        head.append(kpi,close);
        const frag=document.createDocumentFragment();frag.append(head);
        const daysWrap=el('div','df-hours-wrap');
        const grid=el('div','df-hours df-week-days');grid.setAttribute('role','list');grid.setAttribute('aria-label','Jour par jour');
        w.days.forEach(d=>{const cell=el('span','df-hour');cell.dataset.state=d.state==='none'?'none':d.state;cell.setAttribute('role','listitem');cell.title=describe(d);cell.setAttribute('aria-label',cell.title);grid.append(cell);});
        const axis=el('div','df-hours-axis');['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'].forEach(t=>axis.append(el('span',null,t)));
        daysWrap.append(grid,axis);frag.append(daysWrap);
        frag.append(incidentRows(incidentsBetween(current,w.date,w.dateEnd),w.date,w.dateEnd));
        return frag;
      }
      function renderPanel(){
        panel.replaceChildren();
        const c=open!=null?slots[open]:null;
        buttons.forEach((b,i)=>b.setAttribute('aria-expanded',String(i===open&&!!c)));
        if(!c||c.state==='none'&&c.kind!=='hour'){panel.hidden=true;return;}
        panel.hidden=false;
        if(c.kind==='week') panel.append(weekPanel(c));
        else panel.append(dayPanel(c.kind==='hour'?c.day:c));
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
      function freshness(){
        if(!badge) return;
        const state=host.classList.contains('down')?'down':host.classList.contains('degraded')?'degraded':host.classList.contains('up')?'up':'unknown';
        host.dataset.dfFreshness=state;
        const text=labels[state];if(badge.textContent!==text)badge.textContent=text;
        badge.title='Dernier état publié par Upptime (sonde toutes les 5 minutes).';
      }
      function render(next,nextMode){
        current=next||current;const newMode=fixedMode||nextMode||period();
        const m=MODES[newMode]||MODES.month;
        const cells=cellsFor(current,newMode);
        const n=m.kind==='hour'?24:m.count;
        if(newMode!==mode||n!==count){mode=newMode;buildButtons(n);}
        slots=[...Array(Math.max(0,n-cells.length)).fill(null),...cells.slice(-n)];
        buttons.forEach((b,i)=>{const c=slots[i];b.dataset.state=c?(c.state==='none'?'unknown':c.state):'unknown';b.setAttribute('aria-label',describe(c));});
        label.textContent=m.head;capL.textContent=m.left;capR.textContent=m.right;
        track.setAttribute('aria-label',`${m.head}. Flèches gauche et droite pour parcourir, Entrée pour ouvrir le détail.`);
        const covered=slots.filter(c=>c&&c.state!=='none');
        const firstDay=(current.days||[]).find(d=>d.state!=='none');
        if(!firstDay) note.textContent='En attente de données';
        else if(m.kind==='hour') note.textContent=data?.generatedAt?`Mis à jour à ${timeFmt.format(new Date(data.generatedAt))}`:'';
        else if(covered.length<n) note.textContent=`Supervisé depuis le ${dayFmt.format(dayDate(firstDay.date))}`;
        else note.textContent=m.kind==='week'?`${n} semaines complètes`:`${n} jours complets`;
        select(selected);if(open!=null)renderPanel();
      }
      controls.set(host,{freshness,render});freshness();render(site,mode);
    }

    const FOOT='<aside class="df-foot" aria-label="Aide et liens utiles"><div class="df-foot-top"><div><div class="df-foot-title">Besoin d’un coup de main ?</div><p>Un accès bloqué, une question : consultez le centre d’aide.</p></div><a class="df-help" href="https://faq.datafreak.fr">Accéder au centre d’aide <span aria-hidden="true">↗</span></a></div><div class="df-foot-bottom"><div class="df-foot-links"><a href="https://www.datafreak.fr/">DATAFREAK ↗</a><a href="https://freaklabs.io/">FREAKLABS ↗</a></div><span class="df-tricolor" aria-hidden="true"><i></i><i></i><i></i></span></div></aside>';
    function foot(){
      const footer=root.querySelector('footer');
      if(!footer || root.querySelector('.df-foot')) return;
      const tpl=document.createElement('template');tpl.innerHTML=FOOT;footer.after(tpl.content.firstElementChild);
    }
    const slugFromHref=href=>{try{const path=new URL(href,location.href).pathname;const s=decodeURIComponent(path.match(/\/history\/([^/]+)\/?$/)?.[1]||'');return /^[a-z0-9][a-z0-9-]*$/i.test(s)?s:'';}catch{return '';}};

    function enhance(){
      foot();
      const main=root.querySelector('main.container');if(main){main.id='df-main';main.tabIndex=-1;}
      const routeSlug=slugFromHref(location.href);
      // Nettoyage des blocs injectés hors de leur page (navigation interne Sapper : <main> est réutilisé)
      const services=root.querySelector('.live-status');
      root.querySelectorAll('.df-bars-explainer').forEach(n=>{if(!services)n.remove();});
      root.querySelectorAll('section.df-detail').forEach(n=>{if(!routeSlug||n.dataset.slug!==routeSlug)n.remove();});
      root.querySelectorAll('form.r').forEach(f=>f.setAttribute('aria-label','Période : s’applique aux chiffres et aux frises de disponibilité'));
      if(!data) return;
      const mode=periodOf();
      if(services){
        let note=root.querySelector('.df-bars-explainer');
        if(!note){note=el('p','df-bars-explainer');services.after(note);}
        note.textContent=`${MODES[mode]?.explain||MODES.month.explain} Calculé à partir des incidents publiés sur cette page. Vert : aucun incident. Ambre : performances dégradées. Rouge : indisponibilité. Gris : hors supervision. Cliquez sur une cellule pour le détail.`;
        root.querySelectorAll('.live-status article').forEach(card=>{
          const link=card.querySelector('h4 a');if(!link)return;
          const slug=slugFromHref(link.href);const site=slug&&data.sites[slug];
          if(!site)return;
          if(controls.has(card)){const c=controls.get(card);c.freshness();c.render(site,mode);return;}
          makeTimeline(card,slug,site);
        });
      }
      if(routeSlug && main && data.sites[routeSlug]){
        let block=main.querySelector(':scope > section.df-detail');
        if(!block){
          const summary=main.querySelector(':scope > section');
          if(!summary || !summary.querySelector('h1')) return;
          block=el('section','df-detail');block.dataset.slug=routeSlug;
          const head=el('div','f df-detail-head');head.append(el('h2',null,'Disponibilité'));
          // Sélecteur de période propre à la fiche (même rendu que celui de l'accueil) ; 24 h par défaut
          const form=el('form','r df-filter');form.setAttribute('aria-label','Période de la frise de disponibilité');
          [['day','24 h'],['week','7 j'],['month','30 j'],['year','1 an'],['all','tout']].forEach(([v,t],i)=>{
            const box=el('div');const input=el('input');input.type='radio';input.name='df_period';input.value=v;input.id=`df_period_${v}`;input.checked=i===0;
            const lab=el('label',null,t);lab.htmlFor=input.id;box.append(input,lab);form.append(box);
          });
          head.append(form);block.append(head);summary.after(block);
          const periodFn=()=>form.querySelector('input:checked')?.value||'day';
          makeTimeline(block,routeSlug,data.sites[routeSlug],{badge:false,periodFn});
          form.addEventListener('change',()=>controls.get(block)?.render(data.sites[routeSlug],periodFn()));
        } else if(controls.has(block)){controls.get(block).render(data.sites[routeSlug]);}
      }
    }

    // Sélecteur de période natif → frises
    root.addEventListener('change',event=>{if(event.target?.matches?.('form.r:not(.df-filter) input[type="radio"]'))enhance();});
    const observer=new MutationObserver(mutations=>{
      if(!mutations.some(m=>!m.target.closest?.('.df-history,.df-service-state,.df-detail,.df-bars-explainer')) || scheduled)return;
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
