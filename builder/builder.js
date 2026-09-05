const HUE={knob:'#4fd1ff',pad:'#ff5fb0',fader:'#ffc861',wheel:'#7ee787',button:'#a9b4c6'};

/**
 * One family at a time, and that is what removes the last question.
 *
 * A continuous CC cannot tell a knob from a fader: the message is identical.
 * Asked control by control, that ambiguity costs a click on every single one.
 * Asked family by family, it costs nothing -- during the knob pass, a CC IS a
 * knob. The step is the answer, so nothing has to be picked from a list.
 *
 * `accepts` is what that family may legitimately send, so a pad struck during
 * the knob pass is turned away with a reason instead of being filed as a knob.
 */
const FAMILIES=[
  {id:'knob',  plural:'knobs',   verb:'Turn a knob',    again:'Turn the next knob',    accepts:['cc']},
  {id:'fader', plural:'faders',  verb:'Move a fader',   again:'Move the next fader',   accepts:['cc']},
  {id:'wheel', plural:'wheels',  verb:'Move a wheel',   again:'Move the other wheel',  accepts:['cc','bend']},
  {id:'pad',   plural:'pads',    verb:'Hit a pad',      again:'Hit the next pad',      accepts:['note','press']},
  {id:'button',plural:'buttons', verb:'Press a button', again:'Press the next button', accepts:['cc','note']}
];
const $=function(id){return document.getElementById(id);};
const st={found:[],pending:null,w:0,h:0,midi:false,phase:'photo',fam:0,deviceName:'',aligned:false,port:'',vendor:''};
const family=function(){return FAMILIES[st.fam];};
const count=function(id){return st.found.filter(function(f){return f.family===id;}).length;};

function readMessage(bytes){
  const kind=bytes[0]&0xf0, ch=(bytes[0]&0x0f)+1;
  if(kind===0x90||kind===0x80)return {type:'note', sig:'note:'+bytes[1], text:'Note '+bytes[1]+' · ch '+ch, note:bytes[1], channel:ch};
  if(kind===0xb0)return {type:'cc',   sig:'cc:'+bytes[1],   text:'CC '+bytes[1]+' · ch '+ch, cc:bytes[1], channel:ch};
  if(kind===0xe0)return {type:'bend', sig:'bend',           text:'Pitch Bend · ch '+ch, channel:ch};
  if(kind===0xd0)return {type:'press',sig:'press',          text:'Aftertouch · ch '+ch, channel:ch};
  return null;
}
const say=function(html,warn){$('heard').innerHTML=html;$('heard').className='heard'+(warn?' warn':'');};

/*
 * Every message, before any rule touches it.
 *
 * A control refused by the current pass and a control that transmits nothing
 * look identical from the outside: nothing happens. This line tells them apart,
 * which is the only way to know whether a wheel is silent or merely ignored.
 */
/** Names a MIDI driver gives when it does not know the maker. */
const GENERIC=/^\s*$|microsoft|unknown|generic|^midi|usb.?audio|class compliant/i;

let rawCount=0;
const seen=[];
function monitor(bytes){
  rawCount++;
  const m=readMessage(bytes);
  if(m&&seen.indexOf(m.sig)<0)seen.push(m.sig);
  const hex=Array.prototype.map.call(bytes,function(b){
    return ('0'+b.toString(16)).slice(-2).toUpperCase();}).join(' ');
  // Every DISTINCT message since the page opened. A control that seems ignored
  // and a control that transmits nothing are told apart here and nowhere else:
  // if its signature is in this list, it spoke and a rule turned it away.
  $('raw').innerHTML='<b>'+rawCount+'</b> received · last <u>'+hex+'</u>'
    +(m?' · '+m.text:' · not a control message')
    +'<br>heard so far: '+(seen.length?seen.join(' '):'nothing');
}

function heard(bytes){
  if(st.pending||st.phase==='photo'||st.phase==='done')return;
  const m=readMessage(bytes);
  if(!m)return;

  // No keybed step: the family passes already protect against stray keys. A note
  // is refused outright during knobs, faders and wheels, so the only pass a key
  // could slip into is the pad one -- and Step back costs less than two extra
  // questions asked of every user, on every device, forever.

  const f=family();
  if(f.accepts.indexOf(m.type)<0){
    const owner=FAMILIES.find(function(x){return x.accepts.indexOf(m.type)>=0;});
    say('that is not how a '+f.id+' speaks'
        +(owner?' — sounds like a <b>'+owner.id+'</b>, that pass comes later':''),true);
    return;
  }
  const known=st.found.find(function(x){return x.sig===m.sig;});
  if(known){say('<b>'+m.text+'</b> — already known, that is '+known.id);return;}

  const KIND={cc:'cc',note:'note',bend:'pitchbend',press:'channelpressure'};
  st.pending={sig:m.sig,text:m.text,family:f.id,id:f.id.slice(0,1)+(count(f.id)+1),
              when:{kind:KIND[m.type],number:m.type==='cc'?m.cc:(m.type==='note'?m.note:undefined),
                    channel:m.channel}};
  paint();
}

/*
 * Straighten what the hand could not.
 *
 * Clicking a photograph freehand puts a row of eight knobs on eight slightly
 * different heights, and the blueprint shows every one of those millimetres.
 * This nudges them onto a common line and evens the gaps -- but only ever by a
 * few pixels: `move` caps how far any marker may travel, so a control that
 * genuinely sits apart stays where it was put. Alignment must not invent a
 * geometry, only tidy the one that is already there.
 */
function aligned(){
  const tol=Math.max(7,st.w/40), move=Math.max(5,st.w/55);
  const out=st.found.map(function(f){return {x:f.x,y:f.y,family:f.family,id:f.id,silent:f.silent};});
  ['y','x'].forEach(function(axis){
    const other=axis==='y'?'x':'y';
    const fams={};
    out.forEach(function(f){(fams[f.family]=fams[f.family]||[]).push(f);});
    Object.keys(fams).forEach(function(k){
      const sorted=fams[k].slice().sort(function(a,b){return a[axis]-b[axis];});
      let group=[];
      const flush=function(){
        if(group.length>=2){
          const mean=group.reduce(function(t,f){return t+f[axis];},0)/group.length;
          group.forEach(function(f){
            if(Math.abs(f[axis]-mean)<=move)f[axis]=Math.round(mean);
          });
          if(group.length>=3){
            const line=group.slice().sort(function(a,b){return a[other]-b[other];});
            const first=line[0][other],last=line[line.length-1][other];
            const step=(last-first)/(line.length-1);
            line.forEach(function(f,i){
              const want=Math.round(first+i*step);
              if(Math.abs(f[other]-want)<=move)f[other]=want;
            });
          }
        }
        group=[];
      };
      sorted.forEach(function(f){
        if(group.length&&Math.abs(f[axis]-group[group.length-1][axis])>tol)flush();
        group.push(f);
      });
      flush();
    });
  });
  return out;
}

/* What the blueprint and the file use: the clicks, or the tidied copy of them. */
function positions(){
  if(!st.aligned||st.found.length<3)return st.found;
  const a=aligned();
  return st.found.map(function(f,i){
    return {x:a[i].x,y:a[i].y,family:f.family,id:f.id,silent:f.silent,when:f.when};
  });
}

$('align').addEventListener('click',function(){
  st.aligned=!st.aligned;paint();
});

/* Where a pointer event lands, in the photo's own pixels. */
function at(e){
  const img=$('photo'),r=img.getBoundingClientRect();
  return {x:Math.round((e.clientX-r.left)/r.width*st.w),
          y:Math.round((e.clientY-r.top)/r.height*st.h)};
}
/* The placed control under a point, or -1. Nearest wins, within one marker. */
function hit(pt){
  const reach=Math.max(9,st.w/55);
  let best=-1,bestD=reach*reach;
  st.found.forEach(function(f,i){
    const dx=f.x-pt.x,dy=f.y-pt.y,d=dx*dx+dy*dy;
    if(d<=bestD){bestD=d;best=i;}
  });
  return best;
}

/*
 * A position placed in a hurry is a position to correct later, so any marker can
 * be dragged at any time -- including once the pass that created it is over.
 * Dragging takes priority over placing: grabbing an existing marker never drops
 * a new one underneath it.
 */
let drag=null;
$('scene').addEventListener('pointerdown',function(e){
  const pt=at(e),i=hit(pt);
  if(i<0)return;
  drag={i:i,moved:false};
  $('scene').setPointerCapture(e.pointerId);
  $('scene').classList.add('grabbing');
  e.preventDefault();
});
$('scene').addEventListener('pointermove',function(e){
  if(!drag){
    const over=hit(at(e))>=0;
    $('scene').classList.toggle('grab',over&&!st.pending);
    return;
  }
  const pt=at(e);
  st.found[drag.i].x=pt.x;st.found[drag.i].y=pt.y;drag.moved=true;
  paint();
});
$('scene').addEventListener('pointerup',function(e){
  if(drag){
    const moved=drag.moved,id=st.found[drag.i].id;
    drag=null;$('scene').classList.remove('grabbing');
    if(moved)say('<b>'+id+'</b> moved');
    return;
  }
  if(!st.pending)return;
  const pt=at(e);
  st.pending.x=pt.x;st.pending.y=pt.y;
  st.found.push(st.pending);st.pending=null;paint();
});

/** Next family, or finish. A family with nothing in it is a normal answer. */
/* Any pass can be reopened: the wheel you forgot is one click away, not a reset. */
$('steps').addEventListener('click',function(e){
  const i=Array.prototype.indexOf.call($('steps').children,e.target);
  if(i<0||st.phase==='photo')return;
  st.fam=i;st.phase='family';st.pending=null;paint();
});

/* A control that transmits nothing -- Oct+, Chord, a local function. The format
   already allows it: a control with no binding at all, which is what makes
   completeness.untested a counter rather than a constant. */
$('mute').addEventListener('click',function(){
  if(st.phase!=='family'||st.pending)return;
  const f=family();
  st.pending={sig:'silent:'+f.id+':'+Date.now(),text:'transmits nothing',
              family:f.id,id:f.id.slice(0,1)+(count(f.id)+1),silent:true};
  paint();
});

$('go').addEventListener('click',function(){
  if(st.phase!=='family')return;
  if(st.fam<FAMILIES.length-1){st.fam++;st.pending=null;}else{st.phase='done';}
  paint();
});

$('back').addEventListener('click',function(){
  if(st.pending){st.pending=null;}
  else if(st.phase==='done'){st.phase='family';}
  else if(count(family().id)){
    for(let i=st.found.length-1;i>=0;i--){
      if(st.found[i].family===family().id){st.found.splice(i,1);break;}
    }
  }
  else if(st.fam>0){st.fam--;}
  paint();
});
$('reset').addEventListener('click',function(){
  st.found=[];st.pending=null;st.fam=0;st.phase=st.w?'family':'photo';paint();
});

function paint(){
  const p=st.pending,f=family(),inFamily=st.phase==='family';
  const hue=inFamily?HUE[f.id]:'';

  $('why').textContent = st.phase==='photo' ? 'acquiring the photo'
    : st.phase==='done' ? 'setup complete'
    : 'acquiring the '+f.plural;
  $('why').style.color=hue;

  $('say').innerHTML = st.phase==='photo' ? 'Load a photo of your keyboard'
    : st.phase==='done' ? 'Done — drag any marker to adjust'
    : p ? 'Click it <em>on the photo</em>'
    : count(f.id) ? f.again : f.verb;

  if(p){say(p.silent?'<b>silent control</b> — click where it sits'
                    :'<b>'+p.text+'</b> — never heard before');}
  else if(st.phase==='done'){say('<b>'+st.found.length+'</b> controls placed');}
  else if(inFamily&&count(f.id)){say('<b>'+count(f.id)+'</b> '+f.plural+' so far');}
  else{say('&nbsp;');}

  // One bar per family: where you are in the whole pass, without a word.
  $('steps').style.color=hue||'var(--faint)';
  $('steps').innerHTML=FAMILIES.map(function(x,i){
    const cls=inFamily&&i===st.fam?'now':(count(x.id)?'done':'');
    return '<i class="'+cls+'" title="'+x.plural+' — '+count(x.id)+'"></i>';
  }).join('');

  $('next').hidden=!inFamily;
  $('mute').disabled=!!p;
  if(inFamily){
    const last=st.fam===FAMILIES.length-1;
    $('go').textContent=last?'Finish':('Next: '+FAMILIES[st.fam+1].plural+' →');
    $('go').style.background=hue;$('go').style.borderColor=hue;
    $('go').disabled=!!p;
  }

  $('scene').className='scene'+(p?' armed':'');
  $('n').textContent=st.found.length;
  $('back').disabled=!(st.pending||st.found.length||st.fam>0);
  // Lit only once the pass is closed, and dark again the moment a step is undone.
  $('who').className='who'+(st.phase==='done'?' on':'');
  // Reported, never asked. These are relevancy data used to file the setup, so
  // the only sensible source is the device itself -- and where the device stays
  // silent, saying so beats inviting a guess.
  const trusted=st.vendor&&!GENERIC.test(st.vendor);
  if(!st.port){
    $('device').innerHTML='device &nbsp;<b>nothing has spoken yet</b>';
  }else if(edited()){
    $('device').innerHTML='device &nbsp;<i>'+($('model').value.trim()||reportedModel())+'</i>'
      +'<br>maker &nbsp;&nbsp;<i>'+($('vendor').value.trim()||'—')+'</i>'
      +'<br><span class="faint">corrected by you · recognition still uses "'
      +st.port+'"</span>';
  }else{
    $('device').innerHTML='device &nbsp;<u>'+st.port+'</u><br>maker &nbsp;&nbsp;'
      +(trusted?'<u>'+st.vendor+'</u>'
        :'<b>not reported</b>'+(st.vendor?' &nbsp;(MIDI said "'+st.vendor+'", the driver)':''));
  }
  $('edit').hidden=!st.port&&!edited();
  $('align').disabled=st.found.length<3;
  $('align').setAttribute('aria-pressed',st.aligned?'true':'false');
  $('align').textContent=st.aligned?'Aligned':'Align rows';
  $('alignNote').textContent=st.found.length<3?''
    :(st.aligned?' Rows straightened and gaps evened — nothing moved more than a few pixels.'
                :' Exactly where you clicked.');
  $('commit').disabled=st.phase!=='done'||!st.found.length;
  $('commit').textContent=st.phase==='done'
    ? 'Commit setup — '+st.found.length+' controls'
    : 'Commit setup';

  $('ov').innerHTML=st.found.map(function(x){
    const r=Math.max(7,st.w/70),h=HUE[x.family];
    return '<circle cx="'+x.x+'" cy="'+x.y+'" r="'+r+'" fill="none" stroke="'+h+'" stroke-width="'+(r/4)+'"'
      +(x.silent?' stroke-dasharray="'+(r/2)+' '+(r/2)+'"':'')+'/>'
      +(x.silent?'':'<circle cx="'+x.x+'" cy="'+x.y+'" r="'+(r/3.5)+'" fill="'+h+'"/>')
      +'<text x="'+x.x+'" y="'+(x.y-r-3)+'" fill="'+h+'" font-size="'+(r*1.1)+'" font-family="monospace" text-anchor="middle">'+x.id+'</text>';
  }).join('');
  blueprint();
}

function blueprint(){
  const W=st.w||520,H=st.h||220,u=W/52;
  const out=positions().map(function(f){
    const h=HUE[f.family],x=f.x,y=f.y;
    if(f.family==='knob')return '<circle cx="'+x+'" cy="'+y+'" r="'+(u*1.1)+'" fill="#141922" stroke="'+h+'" stroke-width="'+(u/7)+'"/><line x1="'+x+'" y1="'+(y-u*.3)+'" x2="'+x+'" y2="'+(y-u*.9)+'" stroke="'+h+'" stroke-width="'+(u/7)+'"/>';
    if(f.family==='pad')return '<rect x="'+(x-u*1.5)+'" y="'+(y-u*1.3)+'" width="'+(u*3)+'" height="'+(u*2.6)+'" rx="'+(u/3)+'" fill="#141922" stroke="'+h+'" stroke-width="'+(u/7)+'"/>';
    if(f.family==='fader')return '<rect x="'+(x-u/6)+'" y="'+(y-u*2.5)+'" width="'+(u/3)+'" height="'+(u*5)+'" rx="'+(u/6)+'" fill="#2a3342"/><rect x="'+(x-u*.7)+'" y="'+(y-u*.4)+'" width="'+(u*1.4)+'" height="'+(u*.8)+'" rx="'+(u/5)+'" fill="#141922" stroke="'+h+'" stroke-width="'+(u/7)+'"/>';
    if(f.family==='button')return '<rect x="'+(x-u)+'" y="'+(y-u*.7)+'" width="'+(u*2)+'" height="'+(u*1.4)+'" rx="'+(u/4)+'" fill="#141922" stroke="'+h+'" stroke-width="'+(u/8)+'"/>';
    return '<rect x="'+(x-u*.85)+'" y="'+(y-u*2.5)+'" width="'+(u*1.7)+'" height="'+(u*5)+'" rx="'+(u*.85)+'" fill="#141922" stroke="'+h+'" stroke-width="'+(u/7)+'"/>';
  });
  $('bp').setAttribute('viewBox','0 0 '+W+' '+H);
  $('bp').innerHTML=out.length?out.join('')
    :'<text x="'+(W/2)+'" y="'+(H/2)+'" fill="#5d6879" font-size="'+(W/45)+'" font-family="monospace" text-anchor="middle">nothing shown — so nothing in the setup</text>';
}

/*
 * The profile the whole journey exists to produce.
 *
 * Every field is either measured or left out: `confidence` is "observed" because
 * each binding came from a gesture, a silent control carries no binding at all
 * -- which is what makes completeness.untested a counter rather than a constant
 * -- and `completeness` is computed here rather than typed, so a profile can
 * never grade itself.
 */
const MODE={knob:'absolute',fader:'absolute',wheel:'absolute',pad:'velocity',button:'momentary'};
function buildProfile(){
  const vendor=edited()?$('vendor').value.trim():reportedVendor();
  const model=edited()?$('model').value.trim():reportedModel();
  const author=$('author').value.trim();
  const slug=((vendor+' '+model).trim()||st.port||'my controller').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'my-controller';
  const controls=positions().map(function(f){
    const c={id:f.id,label:f.family.charAt(0).toUpperCase()+f.family.slice(1)+' '+f.id.slice(1),
             family:f.family,layout:{x:f.x,y:f.y},bindings:[]};
    if(!f.silent&&f.when){
      const when={kind:f.when.kind};
      if(f.when.number!==undefined)when.number=f.when.number;
      if(f.when.channel!==undefined)when.channel=f.when.channel;
      c.bindings.push({layer:'default',when:when,
        mode:f.when.kind==='pitchbend'?'bipolar':MODE[f.family],confidence:'observed'});
    }
    return c;
  });
  const observed=controls.filter(function(c){return c.bindings.length;}).length;
  const profile={
    formatVersion:1,profileId:slug,revision:1,
    name:(vendor+' '+model).trim()||st.port||'My controller',author:author,
    createdAt:new Date().toISOString().slice(0,10),
    completeness:{declared:controls.length,observed:observed,inferred:0,
                  untested:controls.length-observed},
    device:{vendor:vendor,model:model,
            layout:{width:st.w,height:st.h},
            ports:[{role:'performance',priority:5,
                    match:{name:st.port||model||'My controller'}}]},
    layers:[{id:'default',label:'Play'}],
    controls:controls
  };
  return profile;
}

/*
 * Reported first, correctable second.
 *
 * What the device says is right often enough to be the default, and wrong often
 * enough -- "Microsoft Corporation" -- that refusing a correction would force a
 * known-false value into the file. Editing never touches `ports[].match.name`:
 * that string is how the device is RECOGNISED, so it stays the one the port
 * actually announced, whatever the reader chooses to call the machine.
 */
$('edit').addEventListener('click',function(){
  const open=$('fix').hidden;
  if(open){
    $('vendor').value=$('vendor').value||reportedVendor();
    $('model').value=$('model').value||reportedModel();
  }
  $('fix').hidden=!open;
  $('edit').textContent=open?'Use what the device reported':'Edit device details';
  if(!open){$('vendor').value='';$('model').value='';}
  paint();
  if(open)$('vendor').focus();
});
const reportedVendor=function(){return (st.vendor&&!GENERIC.test(st.vendor))?st.vendor:'';};
const reportedModel=function(){return st.port||'';};
const edited=function(){return !$('fix').hidden;};

$('commit').addEventListener('click',function(){
  const profile=buildProfile();
  const blob=new Blob([JSON.stringify(profile,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=profile.profileId+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  // Committing is the author's call, never the tool's: the file is written
  // whatever state it is in. What is missing is reported, not refused -- a
  // profile only has to be well formed for MiniHub to READ it, and whether it
  // is any good is answered by the author and then by whoever adopts it.
  const gaps=[];
  if(!profile.author)gaps.push('no author');
  if(!profile.device.vendor)gaps.push('maker not reported');
  if(profile.completeness.untested)gaps.push(profile.completeness.untested+' silent');
  say('<b>'+profile.profileId+'.json</b> saved · '+profile.completeness.declared+' controls'
      +(gaps.length?' · '+gaps.join(' · '):''));
});

function setPhoto(url){
  const img=$('photo');
  img.onload=function(){
    st.w=img.naturalWidth;st.h=img.naturalHeight;
    $('ov').setAttribute('viewBox','0 0 '+st.w+' '+st.h);
    st.found=[];st.pending=null;st.fam=0;st.phase='family';
    $('drop').hidden=true;$('scene').hidden=false;$('change').hidden=false;
    paint();
  };
  img.src=url;
}
const take=function(f){if(f&&f.type.indexOf('image/')===0)setPhoto(URL.createObjectURL(f));};
$('pick').addEventListener('change',function(e){take(e.target.files[0]);});
$('drop').addEventListener('click',function(){$('pick').click();});
$('change').addEventListener('click',function(){$('pick').click();});
['dragenter','dragover'].forEach(function(ev){
  $('drop').addEventListener(ev,function(e){e.preventDefault();$('drop').classList.add('over');});
});
['dragleave','drop'].forEach(function(ev){
  $('drop').addEventListener(ev,function(e){e.preventDefault();$('drop').classList.remove('over');});
});
$('drop').addEventListener('drop',function(e){take(e.dataTransfer.files[0]);});

// The computer keyboard is wired first, before MIDI is even asked for: a pending
// permission must never leave the page listening to nothing.
// Q..P play notes on channel 1, "," a pad on channel 10, "." a pitch bend, the rest CCs.
window.addEventListener('keydown',function(e){
  if(e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.target&&/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))return;
  if(e.key.length!==1)return;
  const k=e.key.toLowerCase(),c=k.charCodeAt(0);
  const bytes='qwertyuiop'.indexOf(k)>=0 ? [0x90,48+'qwertyuiop'.indexOf(k),100]
    : k==='.' ? [0xe0,0,64]
    : k===',' ? [0x99,36+(c%8),100]
    : [0xb0,20+(c%40),64];
  monitor(bytes);heard(bytes);
});
if(navigator.requestMIDIAccess){
  navigator.requestMIDIAccess({sysex:false}).then(function(access){
    const names=[];
    access.inputs.forEach(function(i){
      names.push(i.name);
      i.onmidimessage=function(ev){
        // The port that TALKS is the performance port. Enumeration order is not
        // that -- on this machine the first input is Minilab3 MCU/HUI, which
        // carries no key press, and naming the device after it was wrong.
        if(st.port!==i.name){
          st.port=i.name;
          st.vendor=i.manufacturer||'';
          // "Microsoft Corporation" is the Windows class driver answering, not
          // the company that built the keyboard. Filling the field with it would
          // put a wrong maker in the profile and look confident doing it, so a
          // value from this list is reported and never pre-filled.
              paint();
        }
        monitor(ev.data);heard(ev.data);
      };
    });
    if(names.length){
      st.midi=true;
      $('raw').textContent='listening on '+names.join(', ');
    }
  }).catch(function(){});
}

paint();
