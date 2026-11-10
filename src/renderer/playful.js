(() => {
  const ns='http://www.w3.org/2000/svg';
  const route=document.createElementNS(ns,'svg');route.id='yarn-route';route.setAttribute('aria-hidden','true');
  route.innerHTML='<path class="route-line"/><g class="ball"><circle class="yarn-ball" r="10"/><path class="yarn-thread" d="M-8 -3 Q0 -9 8 2M-8 3 Q0 -3 8 6M-4 -9 Q3 0 1 9"/></g>';
  document.body.prepend(route);
  const line=route.querySelector('.route-line'),ball=route.querySelector('.ball');
  let destination=null,started=0,retract=null;
  const originalRing=showRing,originalHide=hideRing;
  showRing=function(t){originalRing(t);if(t){destination={...t};started=performance.now();retract=null;}};
  hideRing=function(){originalHide();if(destination)retract=performance.now();};
  const paw=document.createElement('button');paw.id='hint-paw';paw.className='hit hidden';paw.type='button';paw.title='Повторить подсказку';paw.setAttribute('aria-label','Повторить подсказку');paw.innerHTML=PushikIcon('paw');catEl.append(paw);
  let folded=false;
  for(const event of ['mousedown','mouseup','dblclick'])paw.addEventListener(event,e=>e.stopPropagation());
  paw.addEventListener('click',e=>{e.stopPropagation();if(!folded)return;folded=false;paw.classList.add('hidden');bubble.classList.remove('hidden');placeBubble();});
  const originalSay=say,originalHideBubble=hideBubble;
  say=function(text,ms,opts={}){
    originalSay(text,ms,opts);folded=false;paw.classList.add('hidden');
    bubble.querySelector('.paw-collapse')?.remove();
    if(!opts.guide||bubble.classList.contains('hidden'))return;
    const collapse=document.createElement('button');collapse.className='paw-collapse';collapse.type='button';collapse.textContent='Свернуть в лапку';
    collapse.addEventListener('click',e=>{e.stopPropagation();clearTimeout(bubbleTimer);folded=true;bubble.classList.add('hidden');paw.classList.remove('hidden');});bubble.append(collapse);
  };
  hideBubble=function(){folded=false;paw.classList.add('hidden');originalHideBubble();};
  function animate(){
    if(destination){
      const t=destination,r=document.querySelector('#sprite').getBoundingClientRect();
      const sx=r.left+r.width*.5,sy=r.top+r.height*.66;
      const tx=Math.max(t.x,Math.min(t.x+t.w,sx)),ty=Math.max(t.y,Math.min(t.y+t.h,sy));
      const progress=retract===null?Math.min(1,(performance.now()-started)/480):Math.max(0,1-(performance.now()-retract)/250);
      const ex=sx+(tx-sx)*progress,ey=sy+(ty-sy)*progress;
      route.style.display='block';line.setAttribute('d',`M${sx} ${sy} Q${(sx+ex)/2} ${Math.min(innerHeight-12,Math.max(sy,ey)+30)} ${ex} ${ey}`);ball.setAttribute('transform',`translate(${ex} ${ey}) rotate(${progress*140})`);
      if(retract!==null&&progress===0){destination=null;route.style.display='none';}
    }else route.style.display='none';
    requestAnimationFrame(animate);
  }requestAnimationFrame(animate);

  // Reverse learning: no target is shown until the user requests a hint.
  let panel=null,serial=0,goal='',summary='',busy=false;
  function closeTeach(){serial++;busy=false;panel?.remove();panel=null;}
  const originalEnd=endGuide;
  endGuide=function(bye){closeTeach();originalEnd(bye);};
  function stopTeach(){closeTeach();originalEnd(false);}
  function teachPanel(){panel?.remove();panel=document.createElement('section');panel.className='teach-panel hit';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Кот учится у тебя');document.body.append(panel);return panel;}
  function message(text,buttons){const p=teachPanel();const h=document.createElement('h2');h.textContent='Научи Пушика';const desc=document.createElement('p');desc.textContent=text;desc.setAttribute('role','status');p.append(h,desc);for(const [label,action,primary]of buttons){const b=document.createElement('button');b.textContent=label;b.classList.toggle('primary',!!primary);b.onclick=action;p.append(b);}p.querySelector('button')?.focus();}
  function hint(){const task=goal;stopTeach();startGuide(task);}
  function waiting(note){message(note||`Я забыл, как это сделать: «${goal}». Покажи мне!`,[['Показать результат',()=>checkRecall(false),true],['Нужна подсказка',hint],['Завершить',stopTeach]]);}
  async function checkRecall(initial){
    if(busy)return;busy=true;const id=++serial;
    // Hide prompt while screenshot is captured; the main process hides the overlay as well.
    panel?.remove();panel=null;
    say(initial?'Запоминаю, с чего мы начали…':'Смотрю, что у тебя получилось…',Infinity,{guide:true,actions:[['Отмена',stopTeach]]});
    let result;try{result=await api.guideLook({mode:initial?'recall_start':'recall_check',goal,history:[],previousSummary:summary});}catch{result={error:'Не удалось проверить экран. Попробуй ещё раз.'};}
    if(id!==serial)return;busy=false;hideBubble();
    if(result.error){message(result.error,[['Повторить',()=>checkRecall(initial),true],['Завершить',stopTeach]]);return;}
    if(initial){summary=result.screenSummary||'';waiting();return;}
    if(result.status==='done'){
      const task=goal;stopTeach();
      try{settings.skills=await api.addSkill('Самостоятельно: '+task);}catch{/* completion remains visible */}
      say(result.whatChanged||result.say||'Получилось! Ты показал мне, как это сделать.',Infinity,{guide:true,actions:[['Ещё задание',chooseTeach],['Закрыть',()=>hideBubble()]]});speak('Получилось! Теперь я вспомнил.');
    }else waiting(result.say||'Пока не могу подтвердить результат. Попробуешь ещё раз?');
  }
  function begin(task){goal=task.trim();if(!goal)return;originalEnd(false);guide.active=true;guide.kind='recall';checkRecall(true);}
  function chooseTeach(){
    stopTeach();closePanels();endTrainer();window.PushikInspect?.stop();
    guide.active=true;guide.kind='recall';setState('busy');
    const p=teachPanel();const h=document.createElement('h2');h.textContent='Кот учится у тебя';const desc=document.createElement('p');desc.textContent='Выбери знакомую задачу. Выполни её сам, а я проверю результат.';p.append(h,desc);
    const goals=[...new Set((settings.skills||[]).map(s=>s.name).filter(s=>!s.startsWith('Изучено:')).map(s=>s.replace(/^Самостоятельно: /,'')))].slice(-3);
    for(const task of goals){const b=document.createElement('button');b.textContent=task;b.onclick=()=>begin(task);p.append(b);}
    const form=document.createElement('form');const input=document.createElement('input');input.placeholder='Например, открыть папку Загрузки';input.setAttribute('aria-label','Задача для самостоятельного выполнения');input.required=true;input.maxLength=200;const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='Попробовать без подсказок';form.append(input,submit);form.onsubmit=e=>{e.preventDefault();begin(input.value);};p.append(form);const cancel=document.createElement('button');cancel.textContent='Назад';cancel.onclick=()=>{stopTeach();showPanel('lessons');};p.append(cancel);input.focus();
  }
  const teachBtn=document.querySelector('#teach-cat');if(teachBtn)teachBtn.onclick=chooseTeach;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&guide.kind==='recall')stopTeach();});
  window.PushikPlayful={chooseTeach,stopTeach};
})();
