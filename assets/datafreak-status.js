/* DATAFREAK / Upptime v3 — barres « 1 barre = 1 jour civil (Europe/Paris), 30 derniers jours ».
   Données : /status-days.json, précalculé côté serveur (workflow status-days) à partir des
   incidents Upptime (issues), même origine, un seul appel. Aucun appel à api.github.com
   depuis le navigateur. Si le fichier est indisponible, les cartes natives restent intactes.
   Rendu, classes CSS, clavier et accessibilité : identiques au thème v2. */
(() => {
  'use strict';
  const COUNT=30, DATA_URL='/status-days.json', REFRESH_MS=600000;
  const labels={up:'Opérationnel',down:'Indisponible',degraded:'Dégradé',none:'Pas encore supervisé',unknown:'Non renseigné'};
  const dayFmt=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'Europe/Paris'});
  const longFmt=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Paris'});
  const minutes=m=>m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:`${m} min`;
  const dayDate=ymd=>new Date(`${ymd}T12:00:00Z`); // midi UTC : même jour civil à Paris
  function describe(day){
    if(!day) return 'Aucune donnée pour cette position';
    const when=longFmt.format(dayDate(day.date));
    if(day.state==='none') return `${when} · ${labels.none}`;
    const parts=[when,labels[day.state]||labels.unknown];
    if(day.down) parts.push(`${minutes(day.down)} d'indisponibilité`);
    if(day.degraded) parts.push(`${minutes(day.degraded)} de dégradation`);
    if(day.partial) parts.push(day.date===today()?'jour en cours':'supervision démarrée ce jour');
    return parts.join(' · ');
  }
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  function start(){
    const root=document.getElementById('sapper');
    if(!root || root.dataset.dfThemeReady==='v3') return;
    root.dataset.dfThemeReady='v3';document.documentElement.lang='fr';
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

    function makeTimeline(card,slug,site){
      const el=document.createElement('div');el.className='df-history';
      const heading=document.createElement('div');heading.className='df-history-head';
      const label=document.createElement('span');label.textContent='30 derniers jours · heure de Paris';
      const note=document.createElement('span');note.className='df-history-note';
      heading.append(label,note);
      const track=document.createElement('div');track.className='df-bars';track.setAttribute('role','group');track.setAttribute('aria-label','Historique jour par jour. Flèches gauche et droite pour parcourir les barres.');
      const detail=document.createElement('div');detail.className='df-bar-detail';detail.setAttribute('aria-live','polite');
      const caption=document.createElement('div');caption.className='df-bar-caption';caption.innerHTML='<span>Il y a 30 jours</span><span>Aujourd’hui</span>';
      el.append(heading,track,caption,detail);card.append(el);card.classList.add('df-has-bars');
      let badge=card.querySelector('.df-service-state');
      if(!badge){badge=document.createElement('span');badge.className='df-service-state';card.prepend(badge);}
      const buttons=[];let slots=Array(COUNT).fill(null),selected=COUNT-1;
      function select(index,focus=false){
        selected=Math.max(0,Math.min(COUNT-1,index));
        buttons.forEach((b,i)=>{b.tabIndex=i===selected?0:-1;b.dataset.selected=String(i===selected);});
        detail.textContent=describe(slots[selected]);
        if(focus)buttons[selected].focus();
      }
      for(let i=0;i<COUNT;i++){
        const b=document.createElement('button');b.type='button';b.className='df-bar';b.dataset.state='unknown';b.tabIndex=i===COUNT-1?0:-1;
        b.dataset.selected=String(i===COUNT-1);
        b.addEventListener('focus',()=>select(i));b.addEventListener('click',()=>select(i));
        b.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')select(i);});
        b.addEventListener('keydown',event=>{
          const next=event.key==='ArrowRight'?i+1:event.key==='ArrowLeft'?i-1:event.key==='Home'?0:event.key==='End'?COUNT-1:null;
          if(next!==null){event.preventDefault();select(next,true);}
        });buttons.push(b);track.append(b);
      }
      function freshness(){
        // Le badge suit l'état natif publié par Upptime, indépendamment des barres.
        const state=card.classList.contains('down')?'down':card.classList.contains('degraded')?'degraded':card.classList.contains('up')?'up':'unknown';
        card.dataset.dfFreshness=state;
        const text=labels[state];if(badge.textContent!==text)badge.textContent=text;
        badge.title='Dernier état publié par Upptime (sonde toutes les 5 minutes).';
      }
      function render(current){
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
      }
      controls.set(card,{freshness,render});freshness();render(site);
    }

    function enhance(){
      const main=root.querySelector('main.container');if(main){main.id='df-main';main.tabIndex=-1;}
      root.querySelectorAll('form.r').forEach(f=>f.setAttribute('aria-label','Période des statistiques chiffrées ; les barres montrent toujours les 30 derniers jours'));
      const services=root.querySelector('.live-status');
      if(!services || !data) return;
      if(!root.querySelector('.df-bars-explainer')){
        const note=document.createElement('p');note.className='df-bars-explainer';
        note.textContent='Une barre = un jour civil (heure de Paris), calculé à partir des incidents publiés sur cette page. Vert : aucun incident. Ambre : performances dégradées. Rouge : indisponibilité. Gris : jour antérieur au début de la supervision.';
        services.after(note);
      }
      root.querySelectorAll('.live-status article').forEach(card=>{
        const link=card.querySelector('h4 a');if(!link)return;
        let slug='';try{const path=new URL(link.href,location.href).pathname;slug=decodeURIComponent(path.match(/\/history\/([^/]+)\/?$/)?.[1]||'');}catch{}
        if(!/^[a-z0-9][a-z0-9-]*$/i.test(slug))return;
        const site=data.sites[slug];
        if(!site)return; // pas de données pour ce service : carte native conservée
        if(controls.has(card)){const c=controls.get(card);c.freshness();c.render(site);return;}
        makeTimeline(card,slug,site);
      });
    }

    const observer=new MutationObserver(mutations=>{
      if(!mutations.some(m=>!m.target.closest?.('.df-history,.df-service-state')) || scheduled)return;
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
