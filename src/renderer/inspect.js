// Select an area without sending a click to the program underneath.
(() => {
  let picker=null, origin=null, rect=null, epoch=0, active=false;
  const button=document.querySelector('#inspect-element');
  function removePicker(){picker?.remove();picker=null;origin=null;setIgnore(true);}
  function stop(){cancelPointGaze();bubble.classList.remove('inspect-explanation');epoch++;active=false;removePicker();api.guideUnwatch();ring.classList.remove('inspect-highlight');hideRing();hideBubble();catEl.classList.remove('thinking');cat.onArrive=null;if(cat.jump)cat.jump.after=null;guide.active=false;if(cat.state==='perch')startFall();else if(cat.state==='busy')setState('idle',3000);speechSynthesis?.cancel?.();}
  function choose(){
    stop();rect=null;closePanels();endTrainer();endGuide(false);
    guide.active=true;guide.kind='inspect';setState('busy');active=true;
    picker=document.createElement('div');picker.className='inspect-picker hit';
    picker.innerHTML='<div class="inspect-tip" role="status">Обведи мышкой строку или кнопку. Esc — отмена.</div><div class="inspect-box hidden"></div>';
    document.body.append(picker);setIgnore(false);
    picker.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();origin={x:e.clientX,y:e.clientY};picker.setPointerCapture(e.pointerId);});
    picker.addEventListener('pointermove',e=>{if(!origin)return;rect={x:Math.min(origin.x,e.clientX),y:Math.min(origin.y,e.clientY),w:Math.abs(e.clientX-origin.x),h:Math.abs(e.clientY-origin.y)};const box=picker.querySelector('.inspect-box');box.classList.remove('hidden');Object.assign(box.style,{left:rect.x+'px',top:rect.y+'px',width:rect.w+'px',height:rect.h+'px'});});
    picker.addEventListener('pointerup',e=>{if(!origin)return;if(!rect||rect.w<8||rect.h<8){origin=null;rect=null;return;}removePicker();explain();});
  }
  async function explain(){
    const token=++epoch;active=true;guide.active=true;guide.kind='inspect';
    hideRing();catEl.classList.add('thinking');
    say('Смотрю на выбранную область…',Infinity,{guide:true,actions:[['Отмена',stop]]});
    let result;
    try{result=await api.guideLook({mode:'inspect',selection:{...rect},history:[],goal:''});}catch{result={error:'Не удалось посмотреть экран. Попробуй ещё раз.'};}
    if(token!==epoch||!active)return;
    catEl.classList.remove('thinking');
    if(result.error){say(result.error,Infinity,{guide:true,actions:[['Повторить',explain],['Выбрать другое',choose],['Закрыть',stop]]});return;}
    ring.classList.add('inspect-highlight');showRing(rect);
    goPoint(rect,()=>{
      if(token!==epoch||!active)return;
      let text=[result.say,result.explain].filter(Boolean).join('\n');
      let saved=false, working=false;
      const skillName='Изучено: '+String(result.say||'Элемент интерфейса').slice(0,100);
      const practice = () => {
        const goal = result.practiceGoal;
        if (!goal) return;
        stop();closePanels();endTrainer();
        guide.active=true;guide.kind='ai';guide.goal=goal;guide.history=[];guide.screenSummary='';guide.last=null;guide.busy=false;
        look('practice');
      };
      const render = (notice='') => {
        bubble.classList.add('inspect-explanation');
        const actions = [];
        if (result.practiceGoal && result.status !== 'danger') actions.push(['Попробовать самому',practice,true]);
        actions.push([working?'Подожди…':'Проще',simpler],[saved?'Навык сохранён':'Запомнить навык',saveSkill],['Повторить',()=>speak(text)],['Выбрать другое',choose],['Понятно',stop]);
        say((text||'Не могу уверенно определить этот элемент. Выдели область точнее.')+(notice?'\n\n'+notice:''),Infinity,{guide:true,actions});
      };
      const simpler = async () => {
        if(working)return;working=true;render('Объясняю проще…');
        try {
          const out=await api.simplifyExplanation(text);
          if(token!==epoch||!active)return;
          working=false;
          if(out.error){render(out.error);return;}
          text=out.text||text;render();speak(text);
        } catch {if(token===epoch&&active){working=false;render('Не удалось упростить. Попробуй ещё раз.');}}
      };
      const saveSkill = async () => {
        if(saved||working)return;working=true;
        try {
          const skills=await api.addSkill(skillName);
          settings.skills=skills;
          if(token!==epoch||!active)return;
          saved=true;working=false;render('Сохранено в разделе «Обучение».');
        } catch {if(token===epoch&&active){working=false;render('Не удалось сохранить навык. Попробуй ещё раз.');}}
      };
      render();speak(text);
      api.guideWatch(guideMasks());
    });
  }
  api.on('screen-changed',()=>{if(!active||picker)return;stop();say('Экран изменился. Выдели элемент ещё раз.',6000,{guide:true,actions:[['Выбрать элемент',choose]]});});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){stop();e.preventDefault();}});
  // Dragging the cat ends the explanation and removes stale highlight.
  document.addEventListener('mousemove',()=>{if(active&&!picker&&cat.state==='drag')stop();});
  window.addEventListener('resize',()=>{if(active)stop();});
  button.addEventListener('click',choose);
  window.PushikInspect={choose,stop};
})();
