(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var action = params.get("action") || "";
  var token = params.get("token") || "";
  var path = params.get("path") || "";
  var root = document.getElementById("result");
  var status = document.getElementById("status");

  function show(state, output, error) {
    status.textContent = state === "ok" ? "操作成功" : state === "ready" ? "等待参数" : "操作失败";
    status.setAttribute("data-status", state);
    var payload = { protocol: "URL-Agent/2.0", module: "files", action: action || null, status: state };
    if (state === "error") payload.error = { message: error.message || String(error), httpStatus: error.status || null, details: error.details || null };
    else payload.output = output;
    root.textContent = JSON.stringify(payload, null, 2);
  }

  function need(name) {
    if (!params.has(name)) throw new Error("缺少参数：" + name);
    return params.get(name);
  }

  async function run() {
    var store = window.UAPStorage;
    if (!store) throw new Error("存储模块尚未加载。");
    var output;
    if (action === "list") {
      output = { path: path || "/", entries: await store.listDirectory(path, token) };
    } else if (action === "read") {
      output = await store.readFile(need("path"), token);
      if (!output.exists) throw new Error("文件不存在：" + path);
    } else if (action === "create") {
      output = await store.createFile(need("path"), need("content"), token);
    } else if (action === "write") {
      output = await store.writeFile(need("path"), need("content"), token);
    } else if (action === "append") {
      output = await store.appendFile(need("path"), need("content"), token);
    } else if (action === "mkdir") {
      output = await store.createDirectory(need("path"), token);
    } else {
      show("ready", {
        actions: ["create", "read", "write", "append", "list", "mkdir"],
        examples: {
          create: "/files/?action=create&path=workspace/note.md&content=hello&token=TOKEN",
          read: "/files/?action=read&path=workspace/note.md",
          write: "/files/?action=write&path=workspace/note.md&content=replacement&token=TOKEN",
          append: "/files/?action=append&path=workspace/note.md&content=%0Anew%20line&token=TOKEN",
          list: "/files/?action=list&path=workspace",
          mkdir: "/files/?action=mkdir&path=workspace/new-folder&token=TOKEN"
        }
      });
      return;
    }
    show("ok", output);
  }
  run().catch(function (error) { show("error", null, error); });
})();