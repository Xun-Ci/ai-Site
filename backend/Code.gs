/**
 * URL-Agent 2.1 — Google Apps Script backend.
 * Deploy as a Web App: Execute as Me, Who has access: Anyone.
 * Script properties (not source code): GITHUB_TOKEN, optional GITHUB_REPO,
 * DATA_BRANCH, ACCESS_KEY, WRITE_LIMIT_DAY, WRITE_LIMIT_AGENT.
 *
 * This endpoint intentionally supports GET + JSONP so a browser-only AI can
 * invoke it via URL. Do NOT use for confidential files or production secrets.
 */
var UAP = {
  protocol: "URL-Agent/2.1",
  repo: "Xun-Ci/ai-Site",
  branch: "uap-data",
  maxContent: 16000,
  maxMessage: 2000,
  maxPath: 180,
  maxEntries: 100,
  maxRoomMessages: 100,
  defaultDaily: 100,
  defaultAgent: 30
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  var callback = String(p.callback || "");
  var result;
  try {
    result = dispatch_(p);
  } catch (error) {
    result = {
      protocol: UAP.protocol,
      status: "error",
      error: { code: error.code || "operation_failed", message: String(error.message || error) }
    };
  }
  var json = JSON.stringify(result);
  if (callback) {
    if (!/^UAP_CB_[A-Za-z0-9_]{1,60}$/.test(callback)) {
      return ContentService.createTextOutput(JSON.stringify({
        protocol: UAP.protocol, status: "error",
        error: { code: "invalid_callback", message: "Invalid JSONP callback." }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function err_(code, message) {
  var e = new Error(message);
  e.code = code;
  throw e;
}

function prop_(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback || "";
}

function id_(value, name) {
  var v = String(value || "");
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(v)) err_("invalid_" + name, name + " must be 1-48 characters [A-Za-z0-9_-].");
  return v;
}

function requestId_(p) {
  return id_(p.request_id, "request_id");
}

function filePath_(value) {
  var v = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!v || v.length > UAP.maxPath || !/^[A-Za-z0-9_.\/-]+$/.test(v)) {
    err_("invalid_path", "Use a relative path of at most 180 characters: letters, numbers, _, -, ., /.");
  }
  var parts = v.split("/");
  if (parts.some(function(s) { return !s || s === "." || s === ".." || s.charAt(0) === "."; })) {
    err_("invalid_path", "Dots, dotfiles and parent segments are not allowed.");
  }
  return v;
}

function resolveFile_(p, forWrite) {
  var path = filePath_(p.path);
  if (path.indexOf("workspace/") === 0 && !forWrite) return path;
  var agent = id_(p.ai_id, "ai_id");
  return "workspace/" + agent + "/" + path;
}

function bodyText_(p, key, limit) {
  if (typeof p[key] !== "string") err_("missing_" + key, key + " is required.");
  var value = String(p[key]);
  if (Utilities.newBlob(value).getBytes().length > limit) err_("too_large", key + " exceeds the byte limit.");
  return value;
}

function config_() {
  var token = prop_("GITHUB_TOKEN", "");
  if (!token) err_("setup_required", "Backend is not configured: set GITHUB_TOKEN in Script Properties.");
  return {
    token: token,
    repo: prop_("GITHUB_REPO", UAP.repo),
    branch: prop_("DATA_BRANCH", UAP.branch)
  };
}

function ghRequest_(cfg, method, path, body) {
  var segments = path.split("/").map(function(s) { return encodeURIComponent(s); }).join("/");
  var url = "https://api.github.com/repos/" + cfg.repo + "/contents/" + segments;
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "URL-Agent-Lab-2.1"
    }
  };
  if (method === "get") {
    url += "?ref=" + encodeURIComponent(cfg.branch);
  } else {
    options.contentType = "application/json";
    options.payload = JSON.stringify(body);
  }
  var response = UrlFetchApp.fetch(url, options);
  var status = response.getResponseCode();
  var data;
  try { data = JSON.parse(response.getContentText()); }
  catch (e) { data = { message: response.getContentText().slice(0, 300) }; }
  if (status === 404) return null;
  if (status < 200 || status > 299) {
    err_("github_" + status, "GitHub rejected operation (HTTP " + status + "): " + String(data.message || "Unknown error"));
  }
  return data;
}

function ghRead_(cfg, path) {
  var data = ghRequest_(cfg, "get", path);
  if (!data) return null;
  if (Object.prototype.toString.call(data) === "[object Array]") err_("not_file", "Path is a directory.");
  if (data.type !== "file") err_("not_file", "Path is not a file.");
  if (!data.content) err_("unsupported_file", "GitHub did not provide inline file content.");
  return {
    path: path, sha: data.sha, size: data.size,
    content: Utilities.newBlob(Utilities.base64Decode(data.content.replace(/\s/g, ""))).getDataAsString("UTF-8")
  };
}

function ghList_(cfg, path) {
  var data = ghRequest_(cfg, "get", path);
  if (!data) return [];
  if (Object.prototype.toString.call(data) !== "[object Array]") err_("not_directory", "Path is not a directory.");
  return data.filter(function(x) { return x.type === "file" || x.type === "dir"; }).slice(0, UAP.maxEntries).map(function(x) {
    return { name: x.name, path: x.path, type: x.type, size: x.size };
  });
}

function ghWrite_(cfg, path, content, sha, message) {
  var payload = {
    message: message,
    branch: cfg.branch,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8)
  };
  if (sha) payload.sha = sha;
  var result = ghRequest_(cfg, "put", path, payload);
  return {
    path: path,
    sha: result.content && result.content.sha,
    commit_sha: result.commit && result.commit.sha,
    commit_url: result.commit && result.commit.html_url
  };
}

function authorize_(p) {
  var expected = prop_("ACCESS_KEY", "");
  if (expected && String(p.access_key || "") !== expected) err_("not_authorized", "Invalid or missing experiment access_key.");
}

function quota_(agent) {
  var props = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd");
  var globalKey = "quota.global." + day;
  var agentKey = "quota.agent." + day + "." + agent;
  var globalNow = Number(props.getProperty(globalKey) || "0");
  var agentNow = Number(props.getProperty(agentKey) || "0");
  var globalMax = Math.min(1000, Math.max(1, Number(prop_("WRITE_LIMIT_DAY", UAP.defaultDaily)) || UAP.defaultDaily));
  var agentMax = Math.min(200, Math.max(1, Number(prop_("WRITE_LIMIT_AGENT", UAP.defaultAgent)) || UAP.defaultAgent));
  if (globalNow >= globalMax || agentNow >= agentMax) err_("quota_exceeded", "Experiment write quota reached; try another day.");
  // Count attempted writes too. No public caller can reset this quota.
  props.setProperties((function() {
    var obj = {};
    obj[globalKey] = String(globalNow + 1);
    obj[agentKey] = String(agentNow + 1);
    return obj;
  })(), false);
}

function isWrite_(module, action) {
  return (module === "files" && ["create","write","append","mkdir"].indexOf(action) !== -1) ||
         (module === "room" && ["create","send"].indexOf(action) !== -1);
}

function dispatch_(p) {
  var module = String(p.module || "");
  var action = String(p.action || "");
  if (!module || !action || action === "help") return {
    protocol: UAP.protocol, status: "ok", output: {
      modules: {
        files: ["list","read","create","write","append","mkdir"],
        room: ["create","send","read","latest"]
      },
      write_requires: ["ai_id","request_id"],
      optional_access_key: true
    }
  };
  if (["files","room"].indexOf(module) === -1) err_("invalid_module", "Unknown module.");
  var cfg = config_();
  if (isWrite_(module, action)) {
    authorize_(p);
    var agent = id_(p.ai_id, "ai_id");
    var request = requestId_(p);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) err_("busy", "Write lock busy; retry with the SAME request_id.");
    try {
      var cache = CacheService.getScriptCache();
      var cacheKey = "uap-" + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, module + "|" + action + "|" + agent + "|" + request)
        .map(function(x) { return ("0" + (x & 255).toString(16)).slice(-2); }).join("").slice(0,40);
      var hit = cache.get(cacheKey);
      if (hit) {
        var duplicate = JSON.parse(hit);
        duplicate.replayed = true;
        return duplicate;
      }
      quota_(agent);
      var out = module === "files" ? files_(cfg, p, true) : room_(cfg, p, true);
      var answer = { protocol: UAP.protocol, module: module, action: action, status: "ok", output: out };
      cache.put(cacheKey, JSON.stringify(answer), 21600);
      return answer;
    } finally { lock.releaseLock(); }
  }
  var output = module === "files" ? files_(cfg, p, false) : room_(cfg, p, false);
  return { protocol: UAP.protocol, module: module, action: action, status: "ok", output: output };
}

function files_(cfg, p, canWrite) {
  var action = String(p.action);
  var agent = String(p.ai_id || "");
  if (action === "list") {
    var listPath;
    if (p.path) {
      listPath = filePath_(p.path);
      if (listPath.indexOf("workspace/") !== 0) listPath = "workspace/" + id_(agent,"ai_id") + "/" + listPath;
    } else if (agent) listPath = "workspace/" + id_(agent,"ai_id");
    else listPath = "workspace";
    return { path: listPath, entries: ghList_(cfg, listPath) };
  }
  var path = resolveFile_(p, canWrite);
  if (action === "read") {
    if (path.indexOf("workspace/") !== 0) err_("invalid_path","Read restricted to workspace.");
    var found = ghRead_(cfg, path);
    if (!found) err_("not_found", "File does not exist: " + path);
    return found;
  }
  if (!canWrite) err_("invalid_action", "Unknown file action.");
  if (action === "mkdir") {
    var marker = path + "/.gitkeep";
    var existingMarker = ghRead_(cfg, marker);
    if (existingMarker) return { path: path, already_exists: true };
    return ghWrite_(cfg, marker, "Created by URL-Agent\n", null, "URL-Agent: mkdir " + agent);
  }
  var content = bodyText_(p, "content", UAP.maxContent);
  var old = ghRead_(cfg, path);
  if (action === "create") {
    if (old) err_("already_exists", "File already exists; use write or append.");
    return ghWrite_(cfg, path, content, null, "URL-Agent: create file " + agent);
  }
  if (action === "write") {
    return ghWrite_(cfg, path, content, old && old.sha, "URL-Agent: write file " + agent);
  }
  if (action === "append") {
    var merged = (old ? old.content : "") + content;
    if (Utilities.newBlob(merged).getBytes().length > UAP.maxContent) err_("too_large","Combined file exceeds maximum size.");
    return ghWrite_(cfg, path, merged, old && old.sha, "URL-Agent: append file " + agent);
  }
  err_("invalid_action","Unknown file action.");
}

function room_(cfg, p, canWrite) {
  var action = String(p.action);
  var room = id_(p.room, "room");
  var base = "rooms/" + room;
  if (action === "create" && canWrite) {
    var metadata = base + "/room.json";
    var exists = ghRead_(cfg, metadata);
    if (exists) return { room: room, already_exists: true };
    return ghWrite_(cfg, metadata, JSON.stringify({room:room, created_at:new Date().toISOString()})+"\n", null, "URL-Agent: create room");
  }
  if (action === "send" && canWrite) {
    var ai = id_(p.ai_id,"ai_id");
    var message = bodyText_(p,"message",UAP.maxMessage);
    var req = requestId_(p);
    var file = base + "/messages/" + req + ".json";
    var existsMessage = ghRead_(cfg, file);
    if (existsMessage) return { room:room, duplicate:true, message: JSON.parse(existsMessage.content) };
    var entry = { id: req, room:room, ai_id:ai, message:message, time:new Date().toISOString() };
    var written = ghWrite_(cfg,file,JSON.stringify(entry)+"\n",null,"URL-Agent: send room message");
    return { room:room, message:entry, commit_sha:written.commit_sha };
  }
  if (action === "read" || action === "latest") {
    var entries = ghList_(cfg, base + "/messages");
    var records = [];
    entries.filter(function(x) { return x.type === "file" && /\.json$/.test(x.name); })
      .slice(-UAP.maxRoomMessages).forEach(function(item) {
        try {
          var raw = ghRead_(cfg, item.path);
          if (raw) records.push(JSON.parse(raw.content));
        } catch (ignore) {}
      });
    records.sort(function(a,b){return String(a.time||"").localeCompare(String(b.time||""));});
    return { room:room, count:records.length, messages: action === "latest" ? records.slice(-1) : records };
  }
  err_("invalid_action", "Unknown room action.");
}