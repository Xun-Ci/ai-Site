(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var tool = params.get("tool") || "";
  var input = {};
  params.forEach(function (value, key) {
    if (key !== "tool") input[key] = value;
  });

  var titleNode = document.getElementById("tool-title");
  var descriptionNode = document.getElementById("tool-description");
  var inputNode = document.getElementById("tool-input");
  var statusNode = document.getElementById("tool-status");
  var resultNode = document.getElementById("tool-result");

  var tools = {
    echo: ["Echo 参数回显", "返回 message 参数。"],
    calc: ["数学计算", "计算四则运算、括号、正负号和取余表达式。"],
    text: ["文本转换", "执行大小写转换、反转、去空格或替换。"],
    count: ["文本统计", "统计字符、单词、行数和 UTF-8 字节数。"],
    json: ["JSON 处理", "解析 JSON，并格式化、压缩或列出键名。"],
    encode: ["编码与解码", "执行 URL 编码、URL 解码或 UTF-8 Base64。"],
    random: ["随机值生成", "生成 UUID、随机整数或随机小数。"],
    time: ["时间信息", "返回当前时间、Unix 时间戳和指定时区时间。"],
    convert: ["单位换算", "支持长度、质量和温度单位换算。"],
    hash: ["SHA-256 摘要", "计算输入文本的 SHA-256 摘要。"],
    read: ["读取实验记录", "读取公开的 data.txt 或 data/records.json。"]
  };

  function render(state, output, error) {
    var payload = {
      protocol: "URL-Agent/0.1",
      tool: tool || null,
      status: state,
      input: input
    };
    if (state === "error") payload.error = { message: String(error || "Unknown error") };
    else payload.output = output;
    statusNode.textContent = state === "ok" ? "执行完成" : (state === "ready" ? "等待必要参数" : "执行失败");
    statusNode.setAttribute("data-status", state);
    resultNode.textContent = JSON.stringify(payload, null, 2);
  }

  function required(name) {
    if (!params.has(name)) throw new Error("缺少参数：" + name);
    return params.get(name);
  }

  function encodeBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decodeBase64(text) {
    var binary = atob(text);
    var bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
    return new TextDecoder().decode(bytes);
  }

  function calculate(source) {
    var tokens = source.match(/(?:\d+\.?\d*|\.\d+)|[()+*/%-]/g) || [];
    if (tokens.join("") !== source.replace(/\s/g, "")) throw new Error("表达式包含不支持的字符。");
    var index = 0;

    function factor() {
      var token = tokens[index++];
      if (token === "+" || token === "-") {
        var signed = factor();
        return token === "-" ? -signed : signed;
      }
      if (token === "(") {
        var nested = expression();
        if (tokens[index++] !== ")") throw new Error("括号不匹配。");
        return nested;
      }
      var number = Number(token);
      if (!Number.isFinite(number)) throw new Error("数字格式无效。");
      return number;
    }

    function term() {
      var value = factor();
      while (["*", "/", "%"].indexOf(tokens[index]) !== -1) {
        var operator = tokens[index++];
        var right = factor();
        if ((operator === "/" || operator === "%") && right === 0) throw new Error("不能除以零。");
        if (operator === "*") value *= right;
        else if (operator === "/") value /= right;
        else value %= right;
      }
      return value;
    }

    function expression() {
      var value = term();
      while (tokens[index] === "+" || tokens[index] === "-") {
        var operator = tokens[index++];
        var right = term();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }

    var result = expression();
    if (index !== tokens.length || !Number.isFinite(result)) throw new Error("表达式无法计算。");
    return result;
  }

  async function execute() {
    var output;

    if (tool === "echo") {
      output = { message: params.get("message") || "" };
    } else if (tool === "calc") {
      var expression = required("expr");
      output = { expression: expression, value: calculate(expression) };
    } else if (tool === "text") {
      var text = required("text");
      var operation = params.get("op") || "upper";
      var transformed;
      if (operation === "upper") transformed = text.toUpperCase();
      else if (operation === "lower") transformed = text.toLowerCase();
      else if (operation === "reverse") transformed = Array.from(text).reverse().join("");
      else if (operation === "trim") transformed = text.trim();
      else if (operation === "replace") {
        var find = required("find");
        if (!find) throw new Error("find 不能是空字符串。");
        transformed = text.split(find).join(params.get("with") || "");
      } else throw new Error("op 只支持 upper、lower、reverse、trim、replace。");
      output = { operation: operation, result: transformed };
    } else if (tool === "count") {
      var source = params.get("text") || "";
      var trimmed = source.trim();
      output = {
        characters: Array.from(source).length,
        words: trimmed ? trimmed.split(/\s+/).length : 0,
        lines: source ? source.split(/\r\n|\r|\n/).length : 0,
        utf8Bytes: new TextEncoder().encode(source).length
      };
    } else if (tool === "json") {
      var parsed = JSON.parse(required("data"));
      var mode = params.get("mode") || "pretty";
      if (mode === "keys") {
        output = { keys: parsed !== null && typeof parsed === "object" ? Object.keys(parsed) : [], valueType: Array.isArray(parsed) ? "array" : typeof parsed };
      } else if (mode === "pretty" || mode === "minify") {
        output = { formatted: JSON.stringify(parsed, null, mode === "pretty" ? 2 : 0), value: parsed };
      } else throw new Error("mode 只支持 pretty、minify、keys。");
    } else if (tool === "encode") {
      var sourceText = required("text");
      var encodeMode = params.get("mode") || "url-encode";
      var encoded;
      if (encodeMode === "url-encode") encoded = encodeURIComponent(sourceText);
      else if (encodeMode === "url-decode") encoded = decodeURIComponent(sourceText);
      else if (encodeMode === "base64-encode") encoded = encodeBase64(sourceText);
      else if (encodeMode === "base64-decode") encoded = decodeBase64(sourceText);
      else throw new Error("mode 只支持 url-encode、url-decode、base64-encode、base64-decode。");
      output = { mode: encodeMode, result: encoded };
    } else if (tool === "random") {
      var randomType = params.get("type") || "uuid";
      if (randomType === "uuid") {
        var uuid = window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
              var random = Math.random() * 16 | 0;
              return (char === "x" ? random : (random & 3 | 8)).toString(16);
            });
        output = { type: randomType, value: uuid };
      } else if (randomType === "float") {
        output = { type: randomType, value: Math.random() };
      } else if (randomType === "int") {
        var min = Number(params.get("min") || 0);
        var max = Number(params.get("max") || 100);
        if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error("min 和 max 必须是有效整数，且 max 不小于 min。");
        output = { type: randomType, min: min, max: max, value: Math.floor(Math.random() * (max - min + 1)) + min };
      } else throw new Error("type 只支持 uuid、int、float。");
    } else if (tool === "time") {
      var now = new Date();
      var zone = params.get("tz") || "UTC";
      output = {
        iso: now.toISOString(),
        unixMilliseconds: now.getTime(),
        unixSeconds: Math.floor(now.getTime() / 1000),
        timeZone: zone,
        formatted: new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "long", timeZone: zone }).format(now)
      };
    } else if (tool === "convert") {
      var value = Number(required("value"));
      var from = required("from");
      var to = required("to");
      if (!Number.isFinite(value)) throw new Error("value 必须是有效数字。");
      var lengths = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254 };
      var masses = { kg: 1, g: 0.001, mg: 0.000001, lb: 0.45359237, oz: 0.028349523125 };
      var converted;
      if (lengths[from] && lengths[to]) converted = value * lengths[from] / lengths[to];
      else if (masses[from] && masses[to]) converted = value * masses[from] / masses[to];
      else if (["C", "F", "K"].indexOf(from) !== -1 && ["C", "F", "K"].indexOf(to) !== -1) {
        var celsius = from === "C" ? value : (from === "F" ? (value - 32) * 5 / 9 : value - 273.15);
        converted = to === "C" ? celsius : (to === "F" ? celsius * 9 / 5 + 32 : celsius + 273.15);
      } else throw new Error("单位不匹配或不支持。");
      output = { value: value, from: from, to: to, result: Number(converted.toPrecision(12)) };
    } else if (tool === "hash") {
      if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器不支持 Web Crypto SHA-256。");
      var hash = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(required("text")));
      output = {
        algorithm: "SHA-256",
        hex: Array.from(new Uint8Array(hash)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("")
      };
    } else if (tool === "read") {
      var path = params.get("path") || "data.txt";
      if (path !== "data.txt" && path !== "data/records.json") throw new Error("path 只支持 data.txt 或 data/records.json。");
      var response = await fetch("https://raw.githubusercontent.com/Xun-Ci/ai-Site/main/" + path + "?v=" + Date.now(), { cache: "no-store" });
      var raw = await response.text();
      if (!response.ok) throw new Error("读取文件失败（HTTP " + response.status + "）。");
      var records;
      if (path === "data.txt") {
        records = raw.split(/\r?\n/).filter(Boolean).map(function (line) {
          try { return JSON.parse(line); } catch (_) { return { raw: line }; }
        });
      } else {
        records = JSON.parse(raw).records || [];
      }
      output = { path: path, count: records.length, records: records };
    } else {
      throw new Error("工具不存在。可用工具：" + Object.keys(tools).join("、"));
    }

    render("ok", output);
  }

  if (!titleNode || !descriptionNode || !inputNode || !statusNode || !resultNode) return;
  titleNode.textContent = tools[tool] ? tools[tool][0] : "URL 工具执行器";
  descriptionNode.textContent = tools[tool] ? tools[tool][1] : "使用 tool 参数选择工具。";
  inputNode.textContent = JSON.stringify(input, null, 2);

  if (!tool) {
    render("ready", { available: Object.keys(tools), example: "/tools/?tool=calc&expr=2%2B3" });
  } else if (!tools[tool]) {
    render("error", null, "未知工具。可用工具：" + Object.keys(tools).join("、"));
  } else {
    var requiredByTool = {
      calc: ["expr"],
      text: ["text"],
      json: ["data"],
      encode: ["text"],
      convert: ["value", "from", "to"],
      hash: ["text"]
    };
    var missing = (requiredByTool[tool] || []).filter(function (name) { return !params.has(name); });
    if (missing.length) {
      render("ready", { required: requiredByTool[tool], missing: missing });
    } else {
      execute().catch(function (error) { render("error", null, error && error.message ? error.message : error); });
    }
  }
})();