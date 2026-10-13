/**
 * Indigo Lane Motors (fictional) — funnel automation backend (Google Apps Script).
 *
 * Receives two kinds of posts from the website:
 *   event "track" → one row in Events (page views and CTA clicks, tagged by funnel stage)
 *   event "lead"  → one row in Leads, a dealer alert, and a customer email where it fits
 *
 * Time-driven jobs (installed by setup()):
 *   sendTestDriveReminders()  hourly  reminder ~24 h before each booked test drive
 *   sendLoyaltyEmails()       hourly  welcome email when Status = Sold, review request 7 days later
 *   buildReport()             daily   stage-by-stage funnel report in the Report sheet
 *
 * Setup: see README.md. Short version: paste into Extensions → Apps Script on a new Google Sheet,
 * set CONFIG, run setup(), deploy as Web app (Execute as: Me, Who has access: Anyone),
 * paste the /exec URL into assets/funnel.js.
 */

var CONFIG = {
  DEALER: "Indigo Lane Motors (demo)",
  ALERT_EMAIL: "you@example.com",                       // where new-lead alerts go
  SITE_URL: "https://YOUR-SITE.onrender.com/",          // live site root, with trailing slash
  TZ: "America/New_York",
  REMINDER_HOURS_BEFORE: 24,
  REVIEW_REQUEST_DAYS_AFTER_SALE: 7
};

// Which funnel stage each lead type belongs to.
var LEAD_STAGE = {
  checklist: "awareness",
  walkaround: "interest",
  test_drive: "intent", trade_in: "intent", prequal: "intent",
  reserve: "conversion",
  service: "loyalty", referral: "loyalty", review: "loyalty"
};
var STAGE_ORDER = ["awareness", "interest", "intent", "conversion", "loyalty"];
var STAGE_LABEL = {
  awareness: "TOFU – Awareness", interest: "MOFU – Interest & consideration",
  intent: "Intent & evaluation", conversion: "BOFU – Conversion", loyalty: "Loyalty & retention"
};

var LEAD_HEADERS = [
  "Lead ID", "Created", "Type", "Stage", "Car", "First name", "Last name", "Email", "Phone",
  "Details", "UTM source", "UTM campaign", "Visitor ID",
  "Status", "Appointment (ET)", "Appointment ISO", "Reminder sent",
  "Welcome sent", "Review request sent", "Last update"
];
var EVENT_HEADERS = ["Time", "Visitor ID", "Stage", "Action", "Page", "Detail"];

var LC = {}; LEAD_HEADERS.forEach(function (h, i) { LC[h] = i + 1; });

/* ================================================================== */
/* Web app                                                            */
/* ================================================================== */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.event === "track") {
      logEvent_(d);
    } else if (d.event === "lead" && LEAD_STAGE[d.type] && d.leadId) {
      handleLead_(d);
    } else {
      return json_({ ok: false, error: "Unknown event or lead type" });
    }
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: "car-funnel-webhook" });
}

/* ================================================================== */
/* Events (tracking)                                                  */
/* ================================================================== */

function logEvent_(d) {
  var detail = {};
  Object.keys(d).forEach(function (k) {
    if (["event", "action", "stage", "stageCode", "page", "visitorId", "at"].indexOf(k) < 0) detail[k] = d[k];
  });
  sheet_("Events", EVENT_HEADERS).appendRow([
    new Date(), clean_(d.visitorId, 40), clean_(d.stage, 20), clean_(d.action, 60), clean_(d.page, 60),
    cell_(clean_(JSON.stringify(detail), 500))
  ]);
}

/* ================================================================== */
/* Leads                                                              */
/* ================================================================== */

function handleLead_(d) {
  var sh = sheet_("Leads", LEAD_HEADERS);
  var now = new Date();
  var stage = LEAD_STAGE[d.type];
  var utm = d.utm || {};
  var v = {
    "Lead ID": clean_(d.leadId, 60),
    "Created": now,
    "Type": d.type,
    "Stage": stage,
    "Car": clean_(d.car || "", 80),
    "First name": clean_(d.firstName, 60),
    "Last name": clean_(d.lastName, 60),
    "Email": clean_(d.email, 120),
    "Phone": clean_(d.phone, 25),
    "Details": clean_(details_(d), 900),
    "UTM source": clean_(utm.utm_source, 100),
    "UTM campaign": clean_(utm.utm_campaign, 100),
    "Visitor ID": clean_(d.visitorId, 40),
    "Status": d.type === "test_drive" ? "Booked" : d.type === "reserve" ? "Reserved" : "New",
    "Last update": now
  };

  var when = null;
  if (d.type === "test_drive" && d.slotLocal) {
    when = Utilities.parseDate(String(d.slotLocal), CONFIG.TZ, "yyyy-MM-dd HH:mm");
    if (!isNaN(when.getTime())) {
      v["Appointment (ET)"] = Utilities.formatDate(when, CONFIG.TZ, "EEE, MMM d 'at' h:mm a") + " ET";
      v["Appointment ISO"] = when.toISOString();
    } else { when = null; }
  }
  sh.appendRow(LEAD_HEADERS.map(function (h) { return cell_(v[h] !== undefined ? v[h] : ""); }));

  if (d.type !== "checklist") alertDealer_(d, v);
  emailCustomer_(d, v);
}

// A readable one-line summary of the type-specific fields.
function details_(d) {
  switch (d.type) {
    case "test_drive": return "Slot: " + (d.slotLabel || d.slotLocal) + " | License: " + (d.license || "");
    case "trade_in": var t = d.tradeIn || {}; return "Trade-in: " + [t.year, t.make, t.model].join(" ") + ", " + t.miles + " mi, " + t.condition;
    case "prequal": var p = d.prequal || {}; return "Budget $" + p.budget + "/mo, down $" + p.down + ", credit " + p.credit + ", " + p.employment + ", est. max $" + p.maxPrice;
    case "reserve": return "Price $" + d.price + " | Pay: " + d.payment + " | Trade-in: " + d.tradeIn + " | " + d.pickup + " | Hold until " + d.holdUntil;
    case "walkaround": return "Video walkaround requested";
    case "service": return "Mileage " + d.miles + " | Remind by " + d.channel;
    case "referral": var r = d.referral || {}; return "Code " + r.code + " | Friend: " + r.friendName + " " + r.friendPhone;
    case "review": var rv = d.review || {}; return "Rating " + rv.rating + "/5 | " + (rv.feedback || "(no comment)");
    default: return "";
  }
}

function alertDealer_(d, v) {
  var urgent = ["reserve", "test_drive", "walkaround"].indexOf(d.type) >= 0;
  var lowReview = d.type === "review" && d.review && d.review.rating && d.review.rating <= 3;
  var tag = urgent ? "HOT" : lowReview ? "ATTENTION" : "NEW";
  MailApp.sendEmail({
    to: CONFIG.ALERT_EMAIL,
    subject: "[" + tag + "] " + label_(d.type) + ": " + v["First name"] + (v["Car"] ? " – " + v["Car"] : ""),
    body: [
      label_(d.type) + " (" + STAGE_LABEL[v["Stage"]] + ")",
      urgent ? "Contact within 5 minutes." : "",
      "",
      "Name: " + [v["First name"], v["Last name"]].join(" ").trim(),
      "Phone: " + v["Phone"],
      "Email: " + v["Email"],
      v["Car"] ? "Car: " + v["Car"] : "",
      "Details: " + v["Details"],
      "Source: " + (v["UTM source"] || "direct") + (v["UTM campaign"] ? " / " + v["UTM campaign"] : ""),
      "Lead ID: " + v["Lead ID"],
      "",
      "Sheet: " + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].filter(function (line, i, arr) { return line !== "" || arr[i - 1] !== ""; }).join("\n")
  });
}

function emailCustomer_(d, v) {
  if (!v["Email"]) return;
  var hi = "Hi " + (v["First name"] || "there") + ",";
  var sign = "\n\n— " + CONFIG.DEALER + "\n\nDemo message from a portfolio funnel. No real dealership is involved.";
  var msg = null;
  switch (d.type) {
    case "checklist":
      msg = { s: "Your used-car inspection checklist",
        b: hi + "\n\nHere's the 12-point checklist to take to any dealer:\n" + CONFIG.SITE_URL + "guide.html#checklist\n\nWhen you're ready to look, our inventory is here:\n" + CONFIG.SITE_URL + "inventory.html" };
      break;
    case "test_drive":
      msg = { s: "Test drive booked: " + (v["Appointment (ET)"] || ""),
        b: hi + "\n\nYour test drive is booked.\n\nCar: " + (v["Car"] || "We'll help you choose") + "\nWhen: " + v["Appointment (ET)"] +
           "\n\nBring your driver's license. If you're trading in, bring your current car's keys and title.\nNeed a different time? Reply to this email." };
      break;
    case "trade_in":
      msg = { s: "We got your trade-in details",
        b: hi + "\n\nThanks. An appraiser will send your written offer within one business hour (Mon–Sat).\n\n" + v["Details"] };
      break;
    case "prequal":
      var p = d.prequal || {};
      msg = { s: "Your price range: up to about $" + Number(p.maxPrice || 0).toLocaleString("en-US"),
        b: hi + "\n\nBased on what you told us, you could shop up to about $" + Number(p.maxPrice || 0).toLocaleString("en-US") +
           ". This uses an example rate, not a loan offer. A finance manager will call to confirm your real rate.\n\nCars that fit: " + CONFIG.SITE_URL + "inventory.html" };
      break;
    case "reserve":
      msg = { s: "Reserved: " + v["Car"],
        b: hi + "\n\nYour " + v["Car"] + " is reserved and off the website.\nPrice: $" + Number(d.price || 0).toLocaleString("en-US") +
           " (no dealer fees; tax and registration extra).\n\nYour salesperson will text you within one business hour to set up pickup.\nReference: " + v["Lead ID"] };
      break;
    case "service":
      msg = { s: "Service reminders are on", b: hi + "\n\nWe'll remind you before your next service is due." };
      break;
  }
  if (msg) MailApp.sendEmail({ to: v["Email"], subject: msg.s + " – " + CONFIG.DEALER, body: msg.b + sign });
}

function label_(type) {
  return ({ checklist: "Checklist download", walkaround: "Video walkaround request", test_drive: "Test drive booked",
    trade_in: "Trade-in request", prequal: "Pre-qualification", reserve: "Car reserved", service: "Service reminder sign-up",
    referral: "Referral", review: "Review" })[type] || type;
}

/* ================================================================== */
/* Time-driven jobs                                                   */
/* ================================================================== */

// Hourly: one reminder per booked test drive, once it is within REMINDER_HOURS_BEFORE.
function sendTestDriveReminders() {
  var sh = sheet_("Leads", LEAD_HEADERS);
  var rows = sh.getDataRange().getValues();
  var now = Date.now(), windowMs = CONFIG.REMINDER_HOURS_BEFORE * 3600000;
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[LC["Type"] - 1] !== "test_drive" || r[LC["Status"] - 1] !== "Booked" || r[LC["Reminder sent"] - 1]) continue;
    var start = new Date(r[LC["Appointment ISO"] - 1]).getTime();
    if (isNaN(start) || start <= now || start - now > windowMs) continue;
    if (r[LC["Email"] - 1]) {
      MailApp.sendEmail({
        to: r[LC["Email"] - 1],
        subject: "Reminder: test drive " + r[LC["Appointment (ET)"] - 1] + " – " + CONFIG.DEALER,
        body: "Hi " + r[LC["First name"] - 1] + ",\n\nSee you " + r[LC["Appointment (ET)"] - 1] + " for your test drive of the " +
          (r[LC["Car"] - 1] || "car you picked") + ". Bring your driver's license.\nCan't make it? Reply and we'll move it.\n\n— " + CONFIG.DEALER +
          "\n\nDemo message from a portfolio funnel."
      });
    }
    sh.getRange(i + 1, LC["Reminder sent"]).setValue(new Date());
  }
}

// Hourly: the dealer sets Status to "Sold" on a lead row after the sale.
// That sends the welcome email once, then a review request REVIEW_REQUEST_DAYS_AFTER_SALE days later.
function sendLoyaltyEmails() {
  var sh = sheet_("Leads", LEAD_HEADERS);
  var rows = sh.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[LC["Status"] - 1] !== "Sold" || !r[LC["Email"] - 1]) continue;
    var name = r[LC["First name"] - 1], email = r[LC["Email"] - 1], car = r[LC["Car"] - 1] || "your car";
    var welcomed = r[LC["Welcome sent"] - 1];

    if (!welcomed) {
      MailApp.sendEmail({
        to: email,
        subject: "Welcome to the family, " + name + " – " + CONFIG.DEALER,
        body: "Hi " + name + ",\n\nCongratulations on your " + car + ". Your first-30-days guide, service reminders and referral code are here:\n" +
          CONFIG.SITE_URL + "welcome.html\n\nGive $200, get $200 when a friend buys with your code.\n\n— " + CONFIG.DEALER + "\n\nDemo message from a portfolio funnel."
      });
      sh.getRange(i + 1, LC["Welcome sent"]).setValue(now);
      sh.getRange(i + 1, LC["Last update"]).setValue(now);
      continue;
    }
    var due = new Date(welcomed).getTime() + CONFIG.REVIEW_REQUEST_DAYS_AFTER_SALE * 86400000;
    if (!r[LC["Review request sent"] - 1] && now.getTime() >= due) {
      MailApp.sendEmail({
        to: email,
        subject: "How's the " + car + "? – " + CONFIG.DEALER,
        body: "Hi " + name + ",\n\nYou've had your car for a week. Would you share how buying it went? It takes a minute:\n" +
          CONFIG.SITE_URL + "welcome.html\n\n— " + CONFIG.DEALER + "\n\nDemo message from a portfolio funnel."
      });
      sh.getRange(i + 1, LC["Review request sent"]).setValue(now);
      sh.getRange(i + 1, LC["Last update"]).setValue(now);
    }
  }
}

// Daily (or run by hand): stage-by-stage report so you can see where prospects stall.
function buildReport() {
  var events = sheet_("Events", EVENT_HEADERS).getDataRange().getValues().slice(1);
  var leads = sheet_("Leads", LEAD_HEADERS).getDataRange().getValues().slice(1);

  var visitors = {}; STAGE_ORDER.forEach(function (s) { visitors[s] = {}; });
  events.forEach(function (e) {
    if (e[3] === "view" && visitors[e[2]]) visitors[e[2]][e[1]] = true;
  });
  var leadCount = {}; STAGE_ORDER.forEach(function (s) { leadCount[s] = 0; });
  var sold = 0;
  leads.forEach(function (l) {
    if (leadCount[l[LC["Stage"] - 1]] !== undefined) leadCount[l[LC["Stage"] - 1]]++;
    if (l[LC["Status"] - 1] === "Sold") sold++;
  });

  var top = Object.keys(visitors.awareness).length;
  var out = [["Stage", "Unique visitors", "% of top-of-funnel visitors", "% of previous stage", "Leads / actions captured"]];
  var prev = null;
  STAGE_ORDER.forEach(function (s) {
    var n = Object.keys(visitors[s]).length;
    out.push([
      STAGE_LABEL[s], n,
      top ? Math.round(n / top * 1000) / 10 + "%" : "–",
      prev === null ? "–" : prev ? Math.round(n / prev * 1000) / 10 + "%" : "–",
      leadCount[s]
    ]);
    prev = n;
  });
  out.push(["Cars sold (Status = Sold)", "", "", "", sold]);
  out.push(["Report built", Utilities.formatDate(new Date(), CONFIG.TZ, "yyyy-MM-dd HH:mm") + " ET", "", "", ""]);

  var rep = sheet_("Report", out[0]);
  rep.clearContents();
  rep.getRange(1, 1, out.length, out[0].length).setValues(out);
  rep.getRange(1, 1, 1, out[0].length).setFontWeight("bold");
}

/* ================================================================== */
/* One-time setup                                                     */
/* ================================================================== */

function setup() {
  var leads = sheet_("Leads", LEAD_HEADERS);
  leads.getRange(1, 1, 1, LEAD_HEADERS.length).setValues([LEAD_HEADERS]).setFontWeight("bold");
  leads.setFrozenRows(1);
  var ev = sheet_("Events", EVENT_HEADERS);
  ev.getRange(1, 1, 1, EVENT_HEADERS.length).setValues([EVENT_HEADERS]).setFontWeight("bold");
  ev.setFrozenRows(1);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["New", "Contacted", "Booked", "Showed", "No-show", "Reserved", "Sold", "Lost"], true)
    .setAllowInvalid(false).build();
  leads.getRange(2, LC["Status"], leads.getMaxRows() - 1, 1).setDataValidation(rule);

  var handlers = ["sendTestDriveReminders", "sendLoyaltyEmails", "buildReport"];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendTestDriveReminders").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("sendLoyaltyEmails").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("buildReport").timeBased().everyDays(1).atHour(6).create();
  buildReport();
}

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function clean_(v, max) {
  return String(v === undefined || v === null ? "" : v).trim().slice(0, max || 200);
}

// Text starting with = + - @ is stored as plain text, not run as a spreadsheet formula.
function cell_(v) {
  return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
