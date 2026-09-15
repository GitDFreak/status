/* DATAFREAK / Upptime v5 — barres « 1 barre = 1 jour civil (Europe/Paris), 30 derniers jours ».
   Données : /status-days.json, précalculé côté serveur (workflow status-days) à partir des
   incidents Upptime (issues), même origine, un seul appel. Aucun appel à api.github.com
   depuis le navigateur. Si le fichier est indisponible, les cartes natives restent intactes.
   v5 : clic sur une barre = panneau du jour (disponibilité, 24 heures, incidents du jour avec
   lien vers la page d'incident native) ; mêmes barres sur la page détail /history/<slug>.
   Pied de page « Besoin d'un coup de main ? » injecté ici : le paquet npm @upptime/status-page
   1.17.0 utilisé par le build ne connaît pas `customFootHtml`. */
(() => {
  'use strict';
  const COUNT=30, DATA_URL='/status-days.json', REFRESH_MS=600000, TZ='Europe/Paris';
  const labels={up:'Opérationnel',down:'Indisponible',degraded:'Dégradé',none:'Pas encore supervisé',unknown:'Non renseigné'};
  const hourState={u:'up',d:'down',g:'degraded',n:'none'};
  const dayFmt=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:TZ});
  const longFmt=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:TZ});
  const timeFmt=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
  const ymdFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
  const minutes=m=>m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:`${m} min`;
  const dayDate=ymd=>new Date(`${ymd}T12:00:00Z`); // midi UTC : même jour civil à Paris
  const today=()=>ymdFmt.format(new Date());
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  function describe(day){
    if(!day) return 'Aucune donnée pour cette position';
    const when=cap(longFmt.format(dayDate(day.date)));
    if(day.state==='none') return `${when} · ${labels.none}`;
    const parts=[when,labels[day.state]||labels.unknown];
    if(day.down) parts.push(`${minutes(day.down)} d'indisponibilité`);
    if(day.degraded) parts.push(`${minutes(day.degraded)} de dégradation`);
    if(day.partial) parts.push(day.date===today()?'jour en cours':'supervision démarrée ce jour');
    return parts.join(' · ');
  }
  /** Incidents du service chevauchant le jour civil `ymd` (bornes Paris via les heures du jour). */
  function incidentsOf(site,day){
    const list=(site&&site.incidents)||[];
    // Bornes du jour : on passe par les dates ISO des incidents comparées au jour Paris de début/fin
    return list.filter(inc=>{
      const s=ymdFmt.format(new Date(inc.start)), e=ymdFmt.format(inc.end?new Date(inc.end):new Date());
      return s<=day.date && e>=day.date;
    });
  }
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};

  function start(){
    const root=document.getElementById('sapper');
    if(!root || root.dataset.dfThemeReady==='v5') return;
    root.dataset.dfThemeReady='v5';document.documentElement.lang='fr';
    const controls=new WeakMap();let data=null,dataPromise=null,loadedAt=0,scheduled=false;

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

    /** Barres + panneau du jour. `host` = carte (accueil) ou bloc autonome (page détail). */
    function makeTimeline(host,slug,site,{badge:withBadge=true}={}){
      const wrap=el('div','df-history');
      const heading=el('div','df-history-head');
      const label=el('span',null,'30 derniers jours · heure de Paris');
      const note=el('span','df-history-note');
      heading.append(label,note);
      const track=el('div','df-bars');track.setAttribute('role','group');track.setAttribute('aria-label','Historique jour par jour. Flèches gauche et droite pour parcourir, Entrée pour ouvrir le détail du jour.');
      const detail=el('div','df-bar-detail');detail.setAttribute('aria-live','polite');
      const caption=el('div','df-bar-caption');caption.append(el('span',null,'Il y a 30 jours'),el('span',null,'Aujourd’hui'));
      const panel=el('div','df-day');panel.id=`df-day-${slug}`;panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Détail du jour');
      wrap.append(heading,track,caption,detail,panel);host.append(wrap);host.classList.add('df-has-bars');
      let badge=null;
      if(withBadge){badge=host.querySelector('.df-service-state');if(!badge){badge=el('span','df-service-state');host.prepend(badge);}}
      const buttons=[];let slots=Array(COUNT).fill(null),selected=COUNT-1,open=null,current=site;
      function select(index,focus=false){
        selected=Math.max(0,Math.min(COUNT-1,index));
        buttons.forEach((b,i)=>{b.tabIndex=i===selected?0:-1;b.dataset.selected=String(i===selected);});
        detail.textContent=describe(slots[selected]);
        if(focus)buttons[selected].focus();
      }
      function renderPanel(){
        panel.replaceChildren();
        const day=open!=null?slots[open]:null;
        buttons.forEach((b,i)=>b.setAttribute('aria-expanded',String(i===open&&!!day)));
        if(!day||day.state==='none'){panel.hidden=true;return;}
        panel.hidden=false;
        const head=el('div','df-day-head');
        const title=el('div','df-day-title',cap(longFmt.format(dayDate(day.date))));
        const kpi=el('div','df-day-kpi');
        kpi.append(el('span',`df-day-state is-${day.state}`,labels[day.state]));
        kpi.append(el('span','df-day-uptime',`Disponibilité ${String(day.uptime).replace('.',',')} %`));
        if(day.down)kpi.append(el('span',null,`${minutes(day.down)} d'indisponibilité`));
        if(day.degraded)kpi.append(el('span',null,`${minutes(day.degraded)} de dégradation`));
        if(day.partial)kpi.append(el('span','df-day-partial',day.date===today()?'Jour en cours':'Supervision démarrée ce jour'));
        const close=el('button','df-day-close','Fermer');close.type='button';close.addEventListener('click',()=>toggle(open));
        head.append(title,kpi,close);
        // 24 heures (23/25 les jours de changement d'heure)
        const hoursWrap=el('div','df-hours-wrap');
        const hours=el('div','df-hours');hours.setAttribute('role','list');hours.setAttribute('aria-label','Heure par heure');
        const chars=(day.hours||'').split('');
        chars.forEach((c,h)=>{
          const st=hourState[c]||'none';
          const cell=el('span','df-hour');cell.dataset.state=st;cell.setAttribute('role','listitem');
          cell.title=`${String(h).padStart(2,'0')} h – ${String(h+1).padStart(2,'0')} h : ${labels[st]}`;
          cell.setAttribute('aria-label',cell.title);
          hours.append(cell);
        });
        const axis=el('div','df-hours-axis');['00 h','06 h','12 h','18 h',`${chars.length} h`].forEach(t=>axis.append(el('span',null,t)));
        hoursWrap.append(hours,axis);
        // Incidents du jour → pages natives /incident/<n>
        const list=el('div','df-day-incidents');
        const incs=incidentsOf(current,day);
        if(!incs.length){list.append(el('p','df-day-none',day.state==='up'?'Aucun incident ce jour.':'Aucun incident publié pour ce jour.'));}
        else{
          list.append(el('div','df-day-incidents-title',incs.length>1?`${incs.length} incidents`:'1 incident'));
          incs.forEach(inc=>{
            const row=el('a','df-incident');row.href=`/incident/${inc.number}`;
            const s=new Date(inc.start), e=inc.end?new Date(inc.end):null;
            const dur=e?minutes(Math.max(1,Math.round((e-s)/60000))):'en cours';
            const sd=ymdFmt.format(s), ed=e?ymdFmt.format(e):today();
            const from=(sd<day.date?`${dayFmt.format(s)} `:'')+timeFmt.format(s);
            const to=e?((ed>day.date?`${dayFmt.format(e)} `:'')+timeFmt.format(e)):'maintenant';
            row.append(el('span',`df-incident-sev is-${inc.severity}`,inc.severity==='down'?'Indisponibilité':'Dégradation'));
            row.append(el('span','df-incident-when',`${from} → ${to} · ${dur}`));
            row.append(el('span','df-incident-link','Voir l’incident →'));
            row.setAttribute('aria-label',`${inc.severity==='down'?'Indisponibilité':'Dégradation'} de ${from} à ${to} (${dur}), incident numéro ${inc.number}`);
            list.append(row);
          });
        }
        panel.append(head,hoursWrap,list);
      }
      function toggle(index){
        open=(open===index)?null:index;
        renderPanel();
        if(open==null) buttons[selected]?.focus();
      }
      for(let i=0;i<COUNT;i++){
        const b=el('button','df-bar');b.type='button';b.dataset.state='unknown';b.tabIndex=i===COUNT-1?0:-1;
        b.dataset.selected=String(i===COUNT-1);b.setAttribute('aria-controls',panel.id);b.setAttribute('aria-expanded','false');
        b.addEventListener('focus',()=>select(i));
        b.addEventListener('click',()=>{select(i);toggle(i);});
        b.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')select(i);});
        b.addEventListener('keydown',event=>{
          if(event.key==='Escape'&&open!=null){event.preventDefault();toggle(open);return;}
          const next=event.key==='ArrowRight'?i+1:event.key==='ArrowLeft'?i-1:event.key==='Home'?0:event.key==='End'?COUNT-1:null;
          if(next!==null){event.preventDefault();select(next,true);}
        });buttons.push(b);track.append(b);
      }
      panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&open!=null){event.preventDefault();toggle(open);}});
      function freshness(){
        if(!badge) return;
        // Le badge suit l'état natif publié par Upptime, indépendamment des barres.
        const state=host.classList.contains('down')?'down':host.classList.contains('degraded')?'degraded':host.classList.contains('up')?'up':'unknown';
        host.dataset.dfFreshness=state;
        const text=labels[state];if(badge.textContent!==text)badge.textContent=text;
        badge.title='Dernier état publié par Upptime (sonde toutes les 5 minutes).';
      }
      function render(next){
        current=next||current;
        const days=(current && current.days)||[];
        slots=[...Array(Math.max(0,COUNT-days.length)).fill(null),...days.slice(-COUNT)];
        buttons.forEach((b,i)=>{
          const d=slots[i];
          b.dataset.state=d?(d.state==='none'?'unknown':d.state):'unknown';
          b.setAttribute('aria-label',`${d?dayFmt.format(dayDate(d.date)):`Jour ${i+1} sur ${COUNT}`} : ${describe(d)}`);
        });
        const covered=days.filter(d=>d.state!=='none');
        const first=covered[0];
        note.textContent=first?(covered.length<COUNT?`Supervisé depuis le ${dayFmt.format(dayDate(first.date))}`:`${COUNT} jours complets`):'En attente de données';
        select(selected);
        if(open!=null) renderPanel();
      }
      controls.set(host,{freshness,render});freshness();render(site);
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
      root.querySelectorAll('form.r').forEach(f=>f.setAttribute('aria-label','Période des statistiques chiffrées ; les barres montrent toujours les 30 derniers jours'));
      if(!data) return;
      // Accueil : une frise par carte de service
      const services=root.querySelector('.live-status');
      if(services){
        if(!root.querySelector('.df-bars-explainer')){
          const note=el('p','df-bars-explainer','Une barre = un jour civil (heure de Paris), calculé à partir des incidents publiés sur cette page. Vert : aucun incident. Ambre : performances dégradées. Rouge : indisponibilité. Gris : jour antérieur au début de la supervision. Cliquez sur un jour pour le détail heure par heure.');
          services.after(note);
        }
        root.querySelectorAll('.live-status article').forEach(card=>{
          const link=card.querySelector('h4 a');if(!link)return;
          const slug=slugFromHref(link.href);const site=slug&&data.sites[slug];
          if(!site)return; // pas de données : carte native conservée
          if(controls.has(card)){const c=controls.get(card);c.freshness();c.render(site);return;}
          makeTimeline(card,slug,site);
        });
      }
      // Page détail /history/<slug> : mêmes barres, sous le résumé, avant les courbes natives
      const slug=slugFromHref(location.href);
      if(slug && main && data.sites[slug]){
        let block=main.querySelector(':scope > .df-detail');
        if(!block){
          const summary=main.querySelector(':scope > section');
          if(!summary || !summary.querySelector('h1')) return; // résumé pas encore rendu
          block=el('section','df-detail');
          block.append(el('h2',null,'Les 30 derniers jours'));
          summary.after(block);
          makeTimeline(block,slug,data.sites[slug],{badge:false});
        } else if(controls.has(block)){controls.get(block).render(data.sites[slug]);}
      }
    }

    const observer=new MutationObserver(mutations=>{
      if(!mutations.some(m=>!m.target.closest?.('.df-history,.df-service-state,.df-detail')) || scheduled)return;
      scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});
    });
    load().then(enhance).catch(()=>{ /* fichier indisponible : cartes natives intactes */ });
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
