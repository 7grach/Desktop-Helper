(() => {
  let home=null,postcard=null,roomObserver=null;
  function closeHome(){roomObserver?.disconnect();roomObserver=null;home?.remove();home=null;}
  function closePostcard(){postcard?.remove();postcard=null;}
  function element(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
  function header(container,title,close){const h=element('header'),b=element('button','×','home-close');b.setAttribute('aria-label','Закрыть');b.onclick=close;h.append(element('h2',title),b);container.append(h);}
  function objectFor(name){
    if(/фото|photo/i.test(name))return ['photos','Рамка с фотографией'];
    if(/звон|call/i.test(name))return ['call','Телефон'];
    if(/интернет|поиск|search/i.test(name))return ['search','Лупа исследователя'];
    if(/мыш|mouse/i.test(name))return ['mouse','Игрушечная мышка'];
    if(/букв|текст|клавиат|text/i.test(name))return ['type','Печатная машинка'];
    if(/звук|громк|sound/i.test(name))return ['volume','Радио'];
    return ['search','Лупа исследователя'];
  }
  function openHome(){
    closeHome();closePanels();
    home=element('section',null,'skill-home hit');home.setAttribute('role','dialog');home.setAttribute('aria-label','Домик освоенных навыков');
    header(home,'Домик Пушика',closeHome);{const back=element('button','←','home-close home-back');back.setAttribute('aria-label','Назад');back.title='Назад';back.onclick=()=>{closeHome();showPanel('lessons');};home.querySelector('header').prepend(back);}home.append(element('p','Каждый предмет — твоё открытие. Нажми, чтобы вспомнить навык.'));
    const room=element('div',null,'home-room'),detail=element('div',null,'home-detail');detail.setAttribute('aria-live','polite');
    const decor=element('div',null,'room-decor');decor.setAttribute('aria-hidden','true');
    decor.innerHTML='<div class="room-window"><i></i><i></i><i></i><i></i></div><div class="room-shelf room-shelf-top"></div><div class="room-shelf room-shelf-middle"></div><div class="room-floor"></div><div class="room-rug"></div><div class="room-desk"><i></i><i></i></div><div class="room-plant"><i></i><i></i><i></i><b></b></div><div class="room-sleeping-cat"></div><div class="room-sunlight"></div>';
    room.append(decor);
    const tooltip=element('div',null,'room-tooltip hidden');tooltip.setAttribute('role','tooltip');room.append(tooltip);
    let pointed=null;
    function positionLabel(){
      if(!pointed||tooltip.classList.contains('hidden'))return;
      const box=pointed.getBoundingClientRect(),bounds=room.getBoundingClientRect();
      const pad=10,w=tooltip.offsetWidth,h=tooltip.offsetHeight;
      const cx=box.left-bounds.left-room.clientLeft+box.width/2;
      const top=box.top-bounds.top-room.clientTop;
      const below=top+box.height+6;
      const y=top-h-7>=pad?top-h-7:below;
      tooltip.style.left=Math.max(pad,Math.min(room.clientWidth-w-pad,cx-w/2))+'px';
      tooltip.style.top=Math.max(pad,Math.min(room.clientHeight-h-pad,y))+'px';
    }
    function labelFor(button,title){pointed=button;tooltip.textContent=title;tooltip.classList.remove('hidden');positionLabel();}
    roomObserver=new ResizeObserver(positionLabel);roomObserver.observe(room);
    const skills=settings.skills||[];
    const groups=new Map();
    skills.forEach(skill=>{const [icon,title]=objectFor(skill.name);if(!groups.has(icon))groups.set(icon,{title,skills:[]});groups.get(icon).skills.push(skill);});
    function showSkill(skill,group){
      detail.replaceChildren();detail.append(element('h3',skill.name));const studied=skill.name.startsWith('Изучено:');
      detail.append(element('p',studied?'Ты познакомился с этим элементом. Самостоятельное выполнение ещё можно потренировать.':'Ты уже освоил это действие. Можно повторить его ещё раз.'));
      if(!studied){const repeat=element('button','Повторить навык','home-action');repeat.onclick=()=>{closeHome();const known=typeof lessons==='function'?lessons().find(l=>l.name===skill.name):null;if(known)known.start();else routeGoal(skill.name.replace(/^Самостоятельно: /,''));};detail.append(repeat);}
      if(group.skills.length>1){const back=element('button','Все открытия этого предмета','home-action home-secondary');back.onclick=()=>showGroup(group);detail.append(back);}
    }
    function showGroup(group){
      if(group.skills.length===1){showSkill(group.skills[0],group);return;}
      detail.replaceChildren();detail.append(element('h3',group.title),element('p','Выбери, что хочешь вспомнить:'));
      group.skills.forEach(skill=>{const item=element('button',skill.name,'home-action home-secondary');item.onclick=()=>showSkill(skill,group);detail.append(item);});
    }
    if(!skills.length)room.append(element('div','Комната ждёт твоих открытий. Пройди первый урок — здесь появится предмет.','home-empty'));
    for(const [icon,group] of groups){
      const button=element('button',null,'home-object room-object-'+icon);button.type='button';button.setAttribute('aria-label',group.title+': '+group.skills.map(s=>s.name).join(', '));
      const art=element('span',null,'home-item-art home-art-'+icon);art.setAttribute('aria-hidden','true');button.append(art);
      button.addEventListener('mouseenter',()=>labelFor(button,group.title));
      button.addEventListener('focus',()=>labelFor(button,group.title));
      button.addEventListener('mouseleave',()=>{if(!button.classList.contains('selected')&&document.activeElement!==button)tooltip.classList.add('hidden');});
      button.addEventListener('blur',()=>{if(!button.classList.contains('selected'))tooltip.classList.add('hidden');});
      if(group.skills.length>1)button.append(element('span',String(group.skills.length),'room-object-count'));
      button.onclick=()=>{room.querySelectorAll('.home-object').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');labelFor(button,group.title);showGroup(group);};room.append(button);
    }
    home.append(element('div',skills.length+' открытий · '+groups.size+' предметов в комнате','room-caption'));
    home.append(room,detail);
    if(settings.firstSuccessCard){const card=element('button','Открытка первого успеха','home-action');card.onclick=()=>showPostcard(settings.firstSuccessCard);home.append(card);}
    document.body.append(home);home.querySelector('button')?.focus();
  }
  function wrap(ctx,text,x,y,maxWidth,lineHeight){let line='';for(const word of String(text).split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){ctx.fillText(line,x,y);line=word;y+=lineHeight;}else line=next;}ctx.fillText(line,x,y);return y+lineHeight;}
  function drawCard(card){
    // Canvas не наследует CSS: открытка использует тот же набор шрифтов, что и окна.
    const fontFamily=getComputedStyle(document.body).fontFamily;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=760;canvas.setAttribute('aria-label','Открытка: первый успех с Пушиком');
    const c=canvas.getContext('2d');c.fillStyle='#fffcf3';c.fillRect(0,0,1000,760);c.fillStyle='#d5eaf8';c.beginPath();c.roundRect(30,30,940,700,35);c.fill();c.fillStyle='#fffcf3';c.beginPath();c.roundRect(55,55,890,650,28);c.fill();
    c.fillStyle='#718493';c.font=`24px ${fontFamily}`;c.fillText('ПУШИК · МАЛЕНЬКИЕ ШАГИ, БОЛЬШИЕ ОТКРЫТИЯ',95,115);
    c.fillStyle='#24251f';c.font=`bold 58px ${fontFamily}`;c.fillText('У меня получилось!',95,210);
    c.font=`30px ${fontFamily}`;c.fillStyle='#61717a';c.fillText('Мой первый успех за компьютером',95,265);
    c.font=`bold 38px ${fontFamily}`;c.fillStyle='#24251f';wrap(c,(card.name.replace(/^Самостоятельно: /,'').slice(0,105)+(card.name.length>105?'…':'')),95,355,650,52);
    // Draw a small vector kitten: no external images, so PNG export stays origin-clean.
    c.save();c.translate(790,465);c.lineWidth=5;c.strokeStyle='#637784';c.fillStyle='#fffefa';
    c.beginPath();c.moveTo(35,60);c.bezierCurveTo(100,60,100,-10,76,-5);c.stroke();
    c.beginPath();c.ellipse(0,38,43,58,0,0,Math.PI*2);c.fill();c.stroke();
    c.beginPath();c.moveTo(-49,-17);c.lineTo(-45,-65);c.lineTo(-18,-43);c.quadraticCurveTo(0,-51,21,-43);c.lineTo(47,-65);c.lineTo(49,-15);c.quadraticCurveTo(48,30,0,31);c.quadraticCurveTo(-48,30,-49,-17);c.fill();c.stroke();
    c.fillStyle='#ffd6dd';c.beginPath();c.moveTo(-39,-51);c.lineTo(-37,-29);c.lineTo(-23,-39);c.fill();c.beginPath();c.moveTo(39,-51);c.lineTo(37,-29);c.lineTo(23,-39);c.fill();
    c.fillStyle='#344b59';for(const x of [-19,19]){c.beginPath();c.ellipse(x,-11,4,6,0,0,Math.PI*2);c.fill();}
    c.fillStyle='#d58e9f';c.beginPath();c.moveTo(-5,0);c.lineTo(5,0);c.lineTo(0,6);c.fill();c.lineWidth=2;c.beginPath();c.moveTo(0,6);c.quadraticCurveTo(-7,16,-12,8);c.moveTo(0,6);c.quadraticCurveTo(7,16,12,8);c.stroke();
    c.strokeStyle='#d5eaf8';c.lineWidth=9;c.beginPath();c.moveTo(-26,34);c.lineTo(26,34);c.stroke();c.fillStyle='#f2cc55';c.beginPath();c.arc(0,39,7,0,Math.PI*2);c.fill();c.restore();
    c.font=`25px ${fontFamily}`;c.fillStyle='#64767f';c.fillText(new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'Europe/Moscow'}).format(new Date(card.at)),95,610);
    c.font=`26px ${fontFamily}`;c.fillText('Мы с Пушиком справились.',95,655);return canvas;
  }
  function showPostcard(card){
    closePostcard();postcard=element('section',null,'success-postcard hit');postcard.setAttribute('role','dialog');postcard.setAttribute('aria-label','Первый успех');header(postcard,'Твой первый успех',closePostcard);
    const canvas=drawCard(card),save=element('button','Сохранить открытку PNG','home-action'),status=element('div',null,'postcard-status');status.setAttribute('role','status');
    save.onclick=async()=>{save.disabled=true;try{if(api.savePostcard){const out=await api.savePostcard(canvas.toDataURL('image/png'));status.textContent=out.saved?'Открытка сохранена.':out.error||'';}else{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='Первый успех с Пушиком.png';a.click();status.textContent='Открытка подготовлена.';}}catch{status.textContent='Не удалось сохранить. Попробуй ещё раз.';}finally{save.disabled=false;}};
    postcard.append(canvas,save,status);document.body.append(postcard);save.focus();
  }
  api.on('skill-earned',event=>{if(home)openHome();if(event.first&&event.card){settings.firstSuccessCard=event.card;setTimeout(()=>showPostcard(event.card),200);}});
  document.querySelector('#open-skill-home').onclick=openHome;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(postcard)closePostcard();else if(home)closeHome();}});
  window.PushikHome={open:openHome,close:closeHome,showPostcard,drawCard};
})();
