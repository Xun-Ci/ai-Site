(function (global) {
  "use strict";

  var REPOSITORY = "Xun-Ci/ai-Site";
  var BRANCH = "main";
  var API_ROOT = "https://api.github.com/repos/" + REPOSITORY + "/contents";

  function makeError(message, status, details) {
    var error = new Error(message);
    error.status = status || 0;
    error.details = details || null;
    return error;
  }

  function cleanPath(path, allowRoot) {
    var value = String(path || "").trim().replace(/^\/+|\/+$/g, "");
    if (!value && allowRoot) return "";
    if (!value) throw makeError("path 参数不能为空。");
    var parts = value.split("/");
    if (parts.some(function (part) {
      return !part || part === "." || part === ".." || part === ".git";
    })) {
      throw makeError("path 必须是仓库内的相对路径，不能包含空目录段、.、.. 或 .git。");
    }
    return parts.join("/");
  }

  function encodedPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function endpoint(path) {
    var suffix = path ? "/" + encodedPath(path) : "";
    return API_ROOT + suffix + "?ref=" + encodeURIComponent(BRANCH) + "&cb=" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  function headers(token, withBody) {
    var result = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) result.Authorization = "Bearer " + token;
    if (withBody) result["Content-Type"] = "application/json";
    return result;
  }

  function decodeBase64(value) {
    var binary = atob(String(value || "").replace(/\s/g, ""));
    var bytes = Uint8Array.from(binary, function (character) {
      return character.charCodeAt(0);
    });
    return new TextDecoder("utf-8").decode(bytes);
  }

  function encodeBase64(value) {
    var bytes = new TextEncoder().encode(String(value));
    var binary = "";
    for (var index = 0; index < bytes.length; index++) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  async function parseResponse(response) {
    var raw = await response.text();
    var data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch (_) { data = { message: raw }; }
    }
    if (!response.ok) {
      var message = data && data.message ? data.message : ("GitHub API HTTP " + response.status);
      throw makeError(message, response.status, data);
    }
    return data;
  }

  async function readFile(path, token) {
    path = cleanPath(path, false);
    var response = await fetch(endpoint(path), {
      method: "GET",
      headers: headers(token, false),
      cache: "no-store"
    });
    if (response.status === 404) return { exists: false, path: path, status: 404 };
    var data = await parseResponse(response);
    if (Array.isArray(data) || data.type === "dir") {
      throw makeError("目标路径是目录，不是文件。", 400);
    }
    return {
      exists: true,
      path: path,
      sha: data.sha,
      size: data.size,
      content: decodeBase64(data.content || ""),
      htmlUrl: data.html_url || null,
      downloadUrl: data.download_url || null
    };
  }

  async function listDirectory(path, token) {
    path = cleanPath(path, true);
    var response = await fetch(endpoint(path), {
      method: "GET",
      headers: headers(token, false),
      cache: "no-store"
    });
    var data = await parseResponse(response);
    if (!Array.isArray(data)) throw makeError("目标路径不是目录。", 400);
    return data.map(function (item) {
      return {
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        htmlUrl: item.html_url || null,
        downloadUrl: item.download_url || null
      };
    });
  }

  async function putFile(path, content, token, message, sha) {
    path = cleanPath(path, false);
    if (!token) throw makeError("写入操作需要 GitHub Token。", 401);
    var body = {
      message: message || ("URL-Agent: update " + path),
      content: encodeBase64(content),
      branch: BRANCH
    };
    if (sha) body.sha = sha;

    var response = await fetch(endpoint(path), {
      method: "PUT",
      headers: headers(token, true),
      body: JSON.stringify(body),
      cache: "no-store"
    });
    var data = await parseResponse(response);
    return {
      httpStatus: response.status,
      commitSha: data.commit && data.commit.sha,
      commitUrl: data.commit && data.commit.html_url,
      contentSha: data.content && data.content.sha,
      path: path
    };
  }

  async function createFile(path, content, token, message) {
    path = cleanPath(path, false);
    if (!token) throw makeError("创建文件需要 GitHub Token。", 401);
    var existing = await readFile(path, token);
    if (existing.exists) throw makeError("文件已存在，请使用 action=write 或 action=append。", 409);
    return putFile(path, content, token, message || ("URL-Agent: create " + path), null);
  }

  async function writeFile(path, content, token, message) {
    path = cleanPath(path, false);
    if (!token) throw makeError("写入文件需要 GitHub Token。", 401);
    for (var attempt = 0; attempt < 5; attempt++) {
      var existing = await readFile(path, token);
      try {
        return await putFile(
          path,
          content,
          token,
          message || ("URL-Agent: write " + path),
          existing.exists ? existing.sha : null
        );
      } catch (error) {
        if ([409, 422].indexOf(error.status) === -1 || attempt === 4) throw error;
      }
    }
    throw makeError("写入冲突，重试次数已用完。", 409);
  }

  async function appendFile(path, content, token, message) {
    path = cleanPath(path, false);
    if (!token) throw makeError("追加文件需要 GitHub Token。", 401);
    for (var attempt = 0; attempt < 6; attempt++) {
      var existing = await readFile(path, token);
      var combined = (existing.exists ? existing.content : "") + String(content);
      try {
        return await putFile(
          path,
          combined,
          token,
          message || ("URL-Agent: append " + path),
          existing.exists ? existing.sha : null
        );
      } catch (error) {
        if ([409, 422].indexOf(error.status) === -1 || attempt === 5) throw error;
      }
    }
    throw makeError("追加冲突，重试次数已用完。", 409);
  }

  async function createDirectory(path, token) {
    path = cleanPath(path, false);
    var marker = path + "/.gitkeep";
    try {
      return await createFile(marker, "Directory created by URL-Agent 2.0\n", token, "URL-Agent: create directory " + path);
    } catch (error) {
      if (error.status === 409) {
        return { path: path, marker: marker, alreadyExists: true };
      }
      throw error;
    }
  }

  global.UAPStorage = {
    repository: REPOSITORY,
    branch: BRANCH,
    cleanPath: cleanPath,
    readFile: readFile,
    listDirectory: listDirectory,
    createFile: createFile,
    writeFile: writeFile,
    appendFile: appendFile,
    createDirectory: createDirectory
  };
})(window);