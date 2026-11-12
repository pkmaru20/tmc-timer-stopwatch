'use strict';
const $=id=>document.getElementById(id);
const TONES=['gentle','beep','rapid','deskbell','doublebell'];
const VOLUMES=[0.08,0.16,0.3,0.55,0.9];
const DEFAULTS={minutes:6,sound:true,tone:'gentle',volume:3};
let config={...DEFAULTS};try{const saved=JSON.parse(localStorage.getItem('presentation-clock-settings'));if(saved&&Number.isInteger(saved.minutes)&&saved.minutes>=1&&saved.minutes<=60)config={minutes:saved.minutes,sound:typeof saved.sound==='boolean'?saved.sound:true,tone:TONES.includes(saved.tone)?saved.tone:'gentle',volume:Number.isInteger(saved.volume)&&saved.volume>=1&&saved.volume<=5?saved.volume:3};}catch{}
let running=false,accumulated=0,startedAt=0,alarmed=false,audioCtx=null,voices=[];
function elapsedMs(){return accumulated+(running?performance.now()-startedAt:0)}
function timeText(ms){const seconds=Math.floor(Math.max(0,ms)/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
function timingState(ms,duration){return{zone:ms<240000?'short':ms<=600000?'valid':'long',fraction:Math.min(ms/600000,1),remaining:Math.max(0,duration-ms)}}
function audioReady(){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}catch{}}
function silence(){for(const voice of voices){try{voice.stop()}catch{}}voices=[]}
function chime(tone=config.tone,volume=config.volume){
  audioReady();if(!audioCtx)return;silence();
  const play=()=>{
    const now=audioCtx.currentTime,master=audioCtx.createGain();
    master.gain.value=VOLUMES[volume-1]??VOLUMES[2];
    master.connect(audioCtx.destination);
    const notes=[];
    function note(f,offset,duration,level=1,type='sine'){
      notes.push({f,offset,duration,level,type});
    }
    function bell(offset,base){
      // Inharmonic partials and individual decays create a struck metal bell.
      [[1,0.46,2.4],[2.71,0.23,1.4],[4.05,0.14,0.8],[5.43,0.08,0.45],[6.8,0.04,0.22]]
        .forEach(([ratio,level,duration])=>note(base*ratio,offset,duration,level));
    }
    if(tone==='rapid'){
      for(let group=0;group<2;group++)for(let i=0;i<5;i++)note(1800,group*1.25+i*.18,.11,.85,'square');
    }else if(tone==='deskbell'){
      bell(0,1350);
    }else if(tone==='doublebell'){
      bell(0,1100);bell(.65,1450);
    }else{
      (tone==='beep'?[880,880,880]:[659.25,830.61,987.77])
        .forEach((f,i)=>note(f,i*.38,.36,.85));
    }
    let remaining=notes.length;
    notes.forEach(({f,offset,duration,level,type})=>{
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),t=now+offset;
      osc.type=type;osc.frequency.value=f;
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(level,t+.006);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain);gain.connect(master);
      osc.onended=()=>{
        osc.disconnect();gain.disconnect();
        voices=voices.filter(voice=>voice!==osc);
        if(--remaining===0)master.disconnect();
      };
      osc.start(t);osc.stop(t+duration+.01);voices.push(osc);
    });
  };
  if(audioCtx.state==='suspended')audioCtx.resume().then(play).catch(()=>{});else play();
}
function showVolume(){
  const level=Number($('volume').value);
  $('volumeValue').textContent=level+' / 5'+(level===5?'（最大）':'');
  $('volume').setAttribute('aria-valuetext',level+'段階目、全5段階');
}
function render(){const ms=elapsedMs(),duration=config.minutes*60000,s=timingState(ms,duration);document.documentElement.style.setProperty('--tone',s.zone==='valid'?'var(--green)':'var(--red)');$('elapsed').textContent=timeText(ms);$('centis').textContent='.'+String(Math.floor(ms/10)%100).padStart(2,'0');$('range').textContent=s.zone==='short'?'4分未満':s.zone==='long'?'10分超過':'評価時間内';$('fill').style.width=s.fraction*100+'%';$('bar').setAttribute('aria-valuenow',Math.min(Math.floor(ms/1000),600));$('bar').setAttribute('aria-valuetext',timeText(ms));$('remaining').textContent=timeText(Math.ceil(s.remaining/1000)*1000);$('remaining').classList.toggle('overtime',s.remaining===0);$('ring').style.strokeDashoffset=226.195*(1-s.remaining/duration);$('ring').style.stroke=s.remaining===0?'var(--red)':'#6e8675';$('timerTitle').textContent=config.minutes+'分タイマー';$('timerNote').textContent=s.remaining===0?'時間です · ストップウォッチは継続':config.minutes===6?'発表終了の1分前をお知らせ':config.minutes+'分でお知らせ';$('start').disabled=running;$('stop').disabled=!running;$('start').textContent=accumulated>0?'▶ 再開':'▶ スタート';$('state').classList.toggle('active',running);$('state').innerHTML='<i class="running"></i>'+(running?'計測中':accumulated>0?'停止中':'待機中');if(running&&ms>=duration&&!alarmed){alarmed=true;if(config.sound)chime();}}
function start(){if(running)return;audioReady();startedAt=performance.now();running=true;render();}
function stop(){if(!running)return;accumulated=elapsedMs();running=false;silence();render();}
function reset(){running=false;accumulated=0;startedAt=0;alarmed=false;silence();render();}
$('start').onclick=start;$('stop').onclick=stop;$('reset').onclick=reset;
$('settings').onclick=()=>{$('minutes').value=config.minutes;$('sound').checked=config.sound;$('tone').value=config.tone;$('volume').value=config.volume;showVolume();$('dialog').showModal();};$('cancel').onclick=()=>$('dialog').close();$('testSound').onclick=()=>chime($('tone').value,Number($('volume').value));$('volume').oninput=showVolume;$('dialog').addEventListener('close',silence);$('settingsForm').onsubmit=e=>{e.preventDefault();config={minutes:Number($('minutes').value),sound:$('sound').checked,tone:$('tone').value,volume:Number($('volume').value)};try{localStorage.setItem('presentation-clock-settings',JSON.stringify(config))}catch{}reset();$('dialog').close();};document.addEventListener('keydown',e=>{if($('dialog').open||/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)||e.repeat)return;if(e.code==='Space'){e.preventDefault();running?stop():start();}if(e.key.toLowerCase()==='r')reset();});document.addEventListener('visibilitychange',render);setInterval(render,50);render();
