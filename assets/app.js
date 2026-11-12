/* URL-Agent 2.1 browser client: JSONP for Google Apps Script public web apps */
(function () {
  "use strict";
  var page = document.body.dataset.page || "home";
  var result = document.getElementById("result");
  var status = document.getElementById("status");
  var params = new URLSearchParams(location.search);
  var writeActions = {files:["create","write","append","mkdir"],room:["create","send"]};
  function response(state, payload, msg) {
    if(status) { status.textContent=msg || ({ok:"操作成功",ready:"等待参数",error:"操作失败",setup_required:"后端未配置",running:"正在执行"}[state] || state); status.dataset.status=state; }
    if(result) result.textContent=JSON.stringify(payload,null,2);
  }
  function fail(code,message) { response("error",{protocol:"URL-Agent/2.1",status:"error",error:{code:code,message:message}}); }
  function endpoint() {
    return String((window.URL_AGENT_CONFIG && window.URL_AGENT_CONFIG.apiBaseUrl) || "").trim();
  }
  function normalize(p) {
    var copy=new URLSearchParams(p.toString());
    copy.delete("callback");
    copy.delete("cb");
    copy.delete("_t");
    if (writeActions[page] && writeActions[page].indexOf(copy.get("action"))!==-1 && !copy.has("request_id")) {
      var text=copy.toString();
      var h1=2166136261,h2=5381;
      for(var i=0;i<text.length;i++){h1=Math.imul(h1^text.charCodeAt(i),16777619); h2=Math.imul(h2,33)^text.charCodeAt(i);}
      copy.set("request_id","auto-"+(h1>>>0).toString(16).padStart(8,"0")+(h2>>>0).toString(16).padStart(8,"0"));
    }
    return copy;
  }
  function jsonp(base,p) {
    return new Promise(function(resolve,reject) {
      var id="UAP_CB_"+Math.random().toString(36).slice(2)+Date.now();
      var script=document.createElement("script"),timer;
      var finished=false;
      function finish(){if(finished)return;finished=true;clearTimeout(timer);delete window[id];if(script.parentNode)script.parentNode.removeChild(script);}
      window[id]=function(data){finish();resolve(data);};
      script.onerror=function(){finish();reject(new Error("无法连接后端。请检查 Web App 部署权限、地址和网络连接。"));};
      var sep=base.indexOf("?")===-1?"?":"&";
      script.src=base+sep+p.toString()+"&callback="+encodeURIComponent(id)+"&nocache="+Date.now();
      timer=setTimeout(function(){finish();reject(new Error("后端响应超时，写入可能仍在处理中。重新请求时请使用相同的 request_id。"));},30000);
      document.head.appendChild(script);
    });
  }

  function validatePublicPath(v) {
    if (!v || !/^[A-Za-z0-9_./-]{1,180}$/.test(v) ||
       v.split("/").some(function(part){return !part || part==="." || part===".." || part.charAt(0)===".";})) {
      throw new Error("无效路径。");
    }
    return v;
  }
  function publicPath(p, allowRoot) {
    var path = p.get("path") || "";
    if (path.indexOf("workspace/")===0) return validatePublicPath(path);
    var agent=p.get("ai_id") || "";
    if (agent && !/^[A-Za-z0-9_-]{1,48}$/.test(agent)) throw new Error("无效 AI_ID。");
    if(!path && allowRoot) return agent ? "workspace/"+agent : "workspace";
    if(!agent) throw new Error("相对文件路径读取需要 ai_id。");
    return validatePublicPath("workspace/"+agent+"/"+path);
  }
  async function githubGet(path) {
    var url="https://api.github.com/repos/Xun-Ci/ai-Site/contents/"+
      path.split("/").map(encodeURIComponent).join("/")+"?ref=uap-data&cb="+Date.now();
    var r=await fetch(url,{cache:"no-store",headers:{"Accept":"application/vnd.github+json"}});
    if(r.status===404)return null;
    if(!r.ok)throw new Error("GitHub 读取失败 HTTP "+r.status);
    return await r.json();
  }
  function decodedFile(file) {
    if(!file || file.type!=="file")throw new Error("文件不存在或不是文本文件。");
    if(typeof file.content!=="string")throw new Error("此文件没有可读取的内联内容。");
    var binary=atob(file.content.replace(/\s/g,""));
    var bytes=Uint8Array.from(binary,function(c){return c.charCodeAt(0);});
    return {path:file.path,sha:file.sha,size:file.size,content:new TextDecoder().decode(bytes)};
  }
  async function publicRead(p) {
    var action=p.get("action"), output;
    if(page==="files") {
      if(action==="list") {
        var path=publicPath(p,true);
        var entries=await githubGet(path);
        if(entries && !Array.isArray(entries))throw new Error("目标不是目录。");
        output={path:path,entries:(entries||[]).map(function(x){return{name:x.name,path:x.path,type:x.type,size:x.size};})};
      }else if(action==="read") {
        var filePath=publicPath(p,false);
        var file=await githubGet(filePath);
        output=decodedFile(file);
      }else return false;
    }else if(page==="room" && (action==="read" || action==="latest")) {
      var room=p.get("room")||"";
      if(!/^[A-Za-z0-9_-]{1,48}$/.test(room))throw new Error("无效房间名。");
      var list=await githubGet("rooms/"+room+"/messages");
      var items=(Array.isArray(list)?list:[]).filter(function(x){return x.type==="file" && /\.json$/.test(x.name);}).slice(-10);
      var messages=await Promise.all(items.map(async function(item){
        var one=await githubGet(item.path);
        try{return JSON.parse(decodedFile(one).content);}catch(_){return null;}
      }));
      messages=messages.filter(Boolean).sort(function(a,b){return String(a.time||"").localeCompare(String(b.time||""));});
      output={room:room,count:messages.length,messages:action==="latest"?messages.slice(-1):messages,partial_history:true,source:"public_github"};
    }else return false;
    response("ok",{protocol:"URL-Agent/2.1",module:page,action:action,status:"ok",output:output});
    return true;
  }

  async function remote() {
    var action=params.get("action");
    if(!action) {
      response("ready",{protocol:"URL-Agent/2.1",status:"ready",module:page,
        actions:page==="files"?["create","read","write","append","list","mkdir"]:["create","send","read","latest"],
        requires:"写操作提供 ai_id、path/room、content/message；request_id 可省略，网页生成稳定 ID。",
        docs:"../guide/"});
      return;
    }
    var base=endpoint();
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(base)) {
      try { if(await publicRead(params))return; }
      catch(e) {fail("public_read_failed",e.message||String(e));return;}
      response("setup_required",{protocol:"URL-Agent/2.1",status:"setup_required",message:"写入后端尚未配置。请部署 backend/Code.gs，并在 assets/config.js 填入公开 Web App /exec URL。",docs:"../guide/"});
      return;
    }
    var p=normalize(params);
    p.set("module",page);
    response("running",{protocol:"URL-Agent/2.1",status:"running",module:page,action:action},"请求执行中……");
    try {
      var value=await jsonp(base,p);
      response(value.status === "ok"?"ok":"error",value);
    } catch(e){ fail("network_error",e.message||String(e));}
  }
  function tool() {
    var name=params.get("tool")||"";
    var val=params.get("text")||"";
    var out;
    try {
      switch(name) {
        case "echo":out={message:params.get("message")||""};break;
        case "text":
          var op=params.get("op")||"upper";
          var fns={upper:function(v){return v.toUpperCase();},lower:function(v){return v.toLowerCase();},reverse:function(v){return Array.from(v).reverse().join("");},trim:function(v){return v.trim();}};
          if(!fns[op])throw new Error("不支持的 op");
          out={result:fns[op](val)};break;
        case "count":
          out={characters:Array.from(val).length,words:val.trim()?val.trim().split(/\s+/).length:0,lines:val?val.split(/\r\n|\r|\n/).length:0,utf8Bytes:new TextEncoder().encode(val).length};break;
        case "random":out={value:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"Browser lacks crypto.randomUUID()"};break;
        case "json":
          var obj=JSON.parse(params.get("data")||"null");
          out={formatted:JSON.stringify(obj,null,2),value:obj};break;
        case "encode":
          var mode=params.get("mode")||"url-encode";
          out={result:mode==="url-encode"?encodeURIComponent(val):mode==="url-decode"?decodeURIComponent(val):"Unsupported mode"};break;
        case "":response("ready",{protocol:"URL-Agent/2.1",status:"ready",tools:["echo","text","count","random","json","encode"],docs:"../guide/"});return;
        default:throw new Error("Unknown tool: "+name);
      }
      response("ok",{protocol:"URL-Agent/2.1",module:"tools",tool:name,status:"ok",output:out});
    } catch(e){fail("tool_error",e.message||String(e));}
  }
  if(page==="tools")tool();
  else if(page==="files"||page==="room")remote();
})();