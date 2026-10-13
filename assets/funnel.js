/*
 * Indigo Lane Motors (fictional) — shared funnel logic.
 *
 *  - track(): every page view and CTA click is tagged with its funnel stage and
 *    pushed to window.dataLayer (for Google Tag Manager / GA4) and to the webhook.
 *  - sendLead(): form submissions go to the Google Apps Script web app.
 *  - Shared UI: window-sticker cards, payment estimate, test-drive slots, funnel map.
 *
 * Set WEBHOOK_URL to the deployed Apps Script web app URL (ends in /exec).
 * While it is empty, events are only logged to the console and the pages still work.
 */
(function () {
  "use strict";

  var WEBHOOK_URL = ""; // e.g. "https://script.google.com/macros/s/XXXX/exec"
  var DEALER_TZ = "America/New_York";
  var DEFAULT_APR = 7.9;   // example rate for estimates only
  var DEFAULT_TERM = 60;   // months
  var DEFAULT_DOWN = 0.10; // 10% down

  var STAGES = {
    awareness:  { code: "TOFU",  name: "Awareness",               page: "index.html" },
    interest:   { code: "MOFU",  name: "Interest & consideration", page: "inventory.html" },
    intent:     { code: "MOFU+", name: "Intent & evaluation",     page: "test-drive.html" },
    conversion: { code: "BOFU",  name: "Conversion",              page: "reserve.html" },
    loyalty:    { code: "Retain", name: "Loyalty & retention",     page: "welcome.html" }
  };

  // ---------------- storage (wrapped: can be blocked in private windows) ----------------
  var mem = {};
  function save(key, value) {
    var json = JSON.stringify(value);
    mem[key] = json;
    try { localStorage.setItem("ilm_" + key, json); } catch (e) { /* memory only */ }
  }
  function load(key) {
    var json = null;
    try { json = localStorage.getItem("ilm_" + key); } catch (e) { json = null; }
    if (json === null && mem[key] !== undefined) json = mem[key];
    try { return json ? JSON.parse(json) : null; } catch (e) { return null; }
  }

  function randomId(prefix) {
    return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  function visitorId() {
    var id = load("visitor");
    if (!id) { id = randomId("V"); save("visitor", id); }
    return id;
  }

  function captureUtm() {
    var params = new URLSearchParams(window.location.search);
    var found = load("utm") || {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"].forEach(function (k) {
      if (params.get(k)) found[k] = params.get(k).slice(0, 200);
    });
    save("utm", found);
    return found;
  }

  // ---------------- webhook + tracking ----------------
  // Apps Script does not send CORS headers, so posts go as text/plain with mode "no-cors".
  function post(body) {
    if (!WEBHOOK_URL) {
      console.info("[funnel] WEBHOOK_URL not set. Not sent:", body);
      return Promise.resolve({ sent: false });
    }
    return fetch(WEBHOOK_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function () { return { sent: true }; })
      .catch(function (err) { console.warn("[funnel] send failed", err); return { sent: false }; });
  }

  var currentStage = document.documentElement.getAttribute("data-stage") || "awareness";

  function track(action, data) {
    var evt = Object.assign({
      event: "track",
      action: action,
      stage: currentStage,
      stageCode: (STAGES[currentStage] || {}).code,
      page: location.pathname.split("/").pop() || "index.html",
      visitorId: visitorId(),
      at: new Date().toISOString()
    }, data || {});
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "funnel_" + action, funnel_stage: evt.stageCode, funnel_page: evt.page, detail: data || {} });
    return post(evt);
  }

  // type: checklist | walkaround | test_drive | trade_in | prequal | reserve | service | referral | review
  function sendLead(type, fields) {
    var lead = Object.assign({
      event: "lead",
      type: type,
      leadId: randomId("ILM"),
      stage: currentStage,
      visitorId: visitorId(),
      utm: load("utm") || {},
      sentAt: new Date().toISOString()
    }, fields);
    // Remember contact details for prefilling later forms; keep earlier values a form didn't ask for.
    var contact = load("contact") || {};
    ["firstName", "lastName", "email", "phone"].forEach(function (k) { if (lead[k]) contact[k] = lead[k]; });
    if (contact.email || contact.phone) save("contact", contact);
    track("lead_" + type, { leadId: lead.leadId });
    return post(lead).then(function () { return lead; });
  }

  // Auto-track any element with data-track="name".
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-track]") : null;
    if (el) track("click", { cta: el.getAttribute("data-track") });
  });

  // ---------------- formatting + money ----------------
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function miles(n) { return Math.round(n).toLocaleString("en-US") + " mi"; }
  function carName(c) { return c.year + " " + c.make + " " + c.model; }

  /**
   * Monthly payment on an amortized loan:
   *   M = P × r / (1 − (1 + r)^−n)
   * P = amount financed, r = APR / 12 / 100, n = months. When APR is 0, M = P / n.
   */
  function monthlyPayment(price, down, aprPct, months) {
    var P = Math.max(0, price - down);
    var n = Math.max(1, Math.round(months));
    var r = aprPct / 12 / 100;
    if (P === 0) return 0;
    if (r === 0) return P / n;
    return P * r / (1 - Math.pow(1 + r, -n));
  }
  function defaultEstimate(price) {
    return monthlyPayment(price, Math.round(price * DEFAULT_DOWN), DEFAULT_APR, DEFAULT_TERM);
  }

  function getCar(id) {
    var list = window.INVENTORY || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function carFromHash() {
    var id = (location.hash || "").replace("#", "");
    return getCar(id) || getCar(load("lastCar")) || null;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ---------------- window-sticker card ----------------
  function stickerHtml(c, opts) {
    opts = opts || {};
    var history = c.accidents === 0 ? "No accidents reported" : c.accidents + " accident reported";
    return '' +
      '<article class="sticker" data-id="' + c.id + '">' +
        '<header class="sticker-head">' +
          '<p class="sticker-year"><span>' + c.year + '</span><span>' + esc(c.body) + '</span></p>' +
          '<h3>' + esc(c.make + " " + c.model) + '</h3>' +
          '<p class="sticker-trim">' + esc(c.trim) + ', ' + esc(c.color) + '</p>' +
        '</header>' +
        '<div class="sticker-price">' +
          '<strong>' + money(c.price) + '</strong>' +
          '<span>about ' + money(defaultEstimate(c.price)) + '/mo*</span>' +
        '</div>' +
        '<dl class="sticker-specs">' +
          '<div><dt>Mileage</dt><dd>' + miles(c.miles) + '</dd></div>' +
          '<div><dt>Drive</dt><dd>' + esc(c.drive) + '</dd></div>' +
          '<div><dt>Fuel</dt><dd>' + esc(c.fuel) + '</dd></div>' +
          '<div><dt>Owners</dt><dd>' + c.owners + '</dd></div>' +
        '</dl>' +
        '<p class="sticker-history ' + (c.accidents === 0 ? "ok" : "warn") + '">' + history + '</p>' +
        '<footer class="sticker-foot">' +
          '<a class="btn btn-violet" href="car.html#' + c.id + '" data-track="view_car_' + c.id + '">View details</a>' +
          (opts.compare ? '<label class="compare-check"><input type="checkbox" data-compare="' + c.id + '"> Compare</label>' : '') +
        '</footer>' +
      '</article>';
  }

  // ---------------- slots (test drives) ----------------
  function partsInZone(date, tz) {
    var out = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).forEach(function (p) { out[p.type] = p.value; });
    return { year: +out.year, month: +out.month, day: +out.day, hour: +out.hour, minute: +out.minute, second: +out.second };
  }
  function zonedToDate(y, m, d, h, mi, tz) {
    var guess = Date.UTC(y, m - 1, d, h, mi, 0);
    var p = partsInZone(new Date(guess), tz);
    var off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
    var result = guess - off;
    var p2 = partsInZone(new Date(result), tz);
    var off2 = Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute, p2.second) - result;
    if (off2 !== off) result = guess - off2;
    return new Date(result);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Next `dayCount` open days after today (dealer time). Closed Sundays. Saturday closes early.
  function buildSlots(dayCount) {
    var today = partsInZone(new Date(), DEALER_TZ);
    var cursor = Date.UTC(today.year, today.month - 1, today.day, 12);
    var days = [];
    while (days.length < (dayCount || 6)) {
      cursor += 86400000;
      var c = new Date(cursor), dow = c.getUTCDay();
      if (dow === 0) continue;
      var y = c.getUTCFullYear(), m = c.getUTCMonth() + 1, d = c.getUTCDate();
      var close = dow === 6 ? 15 : 18;
      var label = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(c);
      var slots = [];
      for (var mins = 10 * 60; mins < close * 60; mins += 60) {
        var h = Math.floor(mins / 60);
        slots.push({
          key: y + "-" + pad(m) + "-" + pad(d) + " " + pad(h) + ":00",
          label: (((h + 11) % 12) + 1) + ":00 " + (h < 12 ? "am" : "pm"),
          iso: zonedToDate(y, m, d, h, 0, DEALER_TZ).toISOString()
        });
      }
      days.push({ label: label, slots: slots });
    }
    return days;
  }

  function renderSlotPicker(root, days, onPick) {
    root.innerHTML = "";
    var dayRow = document.createElement("div"); dayRow.className = "slot-days"; dayRow.setAttribute("role", "tablist");
    var grid = document.createElement("div"); grid.className = "slot-times";
    root.appendChild(dayRow); root.appendChild(grid);
    function show(i) {
      Array.prototype.forEach.call(dayRow.children, function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      grid.innerHTML = "";
      days[i].slots.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "slot-time"; b.textContent = s.label; b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(grid.children, function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          onPick(s, days[i]);
        });
        grid.appendChild(b);
      });
    }
    days.forEach(function (d, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "slot-day"; b.setAttribute("role", "tab");
      var parts = d.label.split(", ");
      b.innerHTML = "<span>" + parts[0] + "</span><strong>" + (parts[1] || "") + "</strong>";
      b.addEventListener("click", function () { show(i); onPick(null, d); });
      dayRow.appendChild(b);
    });
    show(0);
  }

  // ---------------- validation ----------------
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()); }
  function validPhone(v) { return String(v).replace(/\D/g, "").length >= 10; }

  /**
   * Checks required fields in a form. rules: { fieldName: "text" | "email" | "phone" | "check" | "select" }.
   * Marks bad fields with aria-invalid and returns a readable list of what is missing.
   */
  function checkForm(form, rules, labels) {
    var missing = [];
    Object.keys(rules).forEach(function (name) {
      var el = form.elements[name];
      if (!el) return;
      var v = el.type === "checkbox" ? el.checked : String(el.value || "").trim();
      var ok = rules[name] === "email" ? validEmail(v)
        : rules[name] === "phone" ? validPhone(v)
        : rules[name] === "check" ? v === true
        : !!v;
      if (el.setAttribute) el.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok) missing.push(labels[name] || name);
    });
    return missing;
  }

  // Prefill name / email / phone from an earlier form on this device.
  function prefill(form) {
    var c = load("contact");
    if (!c) return;
    ["firstName", "lastName", "email", "phone"].forEach(function (k) {
      if (form.elements[k] && !form.elements[k].value && c[k]) form.elements[k].value = c[k];
    });
  }

  // ---------------- funnel map (demo helper) ----------------
  function renderFunnelMap() {
    var wrap = document.createElement("div");
    wrap.className = "funnel-map";
    var items = Object.keys(STAGES).map(function (k) {
      var s = STAGES[k];
      return '<li' + (k === currentStage ? ' aria-current="step"' : '') + '><a href="' + s.page + '"><b>' + s.code + '</b> ' + s.name + '</a></li>';
    }).join("");
    wrap.innerHTML =
      '<button type="button" class="funnel-map-toggle" aria-expanded="false">Funnel stage: <b>' + STAGES[currentStage].code + '</b></button>' +
      '<div class="funnel-map-panel" hidden><p>Demo guide: the five funnel stages. You are on <b>' + STAGES[currentStage].name + '</b>.</p><ol>' + items + '</ol></div>';
    document.body.appendChild(wrap);
    var btn = wrap.querySelector("button"), panel = wrap.querySelector(".funnel-map-panel");
    btn.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ---------------- boot ----------------
  captureUtm();
  visitorId();
  document.addEventListener("DOMContentLoaded", function () {
    renderFunnelMap();
    track("view");
  });

  window.Funnel = {
    STAGES: STAGES, DEALER_TZ: DEALER_TZ, DEFAULT_APR: DEFAULT_APR, DEFAULT_TERM: DEFAULT_TERM, DEFAULT_DOWN: DEFAULT_DOWN,
    save: save, load: load, track: track, sendLead: sendLead,
    money: money, miles: miles, carName: carName, esc: esc,
    monthlyPayment: monthlyPayment, defaultEstimate: defaultEstimate,
    getCar: getCar, carFromHash: carFromHash, stickerHtml: stickerHtml,
    buildSlots: buildSlots, renderSlotPicker: renderSlotPicker, zonedToDate: zonedToDate,
    validEmail: validEmail, validPhone: validPhone, checkForm: checkForm, prefill: prefill
  };
})();
