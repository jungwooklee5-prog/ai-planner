/**
 * parseSchedule.js
 * Robust(ish) parsers for .ics, .csv, and text blobs.
 * Extracts: title, location, start, end, professor (if found), repeatWeekly flag.
 */

const PROF_RE =
  /(Instructor|Professor|Prof\.|Dr\.)\s*[:\-]?\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})/i;

function ymdhmsToLocalDate(s) {
  // "YYYYMMDDTHHMMSS" or "YYYYMMDDTHHMM"
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (!m) return null;
  const [_, Y, M, D, h, m2, s2] = m;
  return new Date(+Y, +M - 1, +D, +h, +m2, s2 ? +s2 : 0, 0); // local time
}

function toISO(d) {
  // store canonical ISO string
  return d ? new Date(d).toISOString() : null;
}

function pickProfessor(str) {
  if (!str) return null;
  const m = str.match(PROF_RE);
  return m ? m[2].trim() : null;
}

function cleanTitle(summary) {
  if (!summary) return "";
  // Strip trailing codes in brackets/parentheses like [FA25] (LEC)
  return summary.replace(/\s*[\[(].*?[\])]\s*$/g, "").trim();
}

function parseICS(text) {
  // Basic ICS unfold (join lines with leading space)
  const lines = text.replace(/\r/g, "").split("\n");
  const unfolded = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (i > 0 && (ln.startsWith(" ") || ln.startsWith("\t"))) {
      unfolded[unfolded.length - 1] += ln.slice(1);
    } else {
      unfolded.push(ln);
    }
  }

  const events = [];
  let cur = null;

  for (const ln of unfolded) {
    if (ln.startsWith("BEGIN:VEVENT")) {
      cur = { raw: {} };
      continue;
    }
    if (ln.startsWith("END:VEVENT")) {
      if (cur) {
        const title = cleanTitle(cur.raw.SUMMARY || "");
        const location = cur.raw.LOCATION || extractParenLocation(cur.raw.SUMMARY);
        const professor = pickProfessor(cur.raw.DESCRIPTION || cur.raw.SUMMARY);

        // DTSTART / DTEND handling (TZID or Z or floating)
        const { start, end } = parseIcsDateTimes(cur.raw);

        // Weekly repeat detection
        const repeatWeekly =
          (cur.raw.RRULE && /FREQ=WEEKLY/i.test(cur.raw.RRULE)) || false;

        events.push({
          id: cryptoRandomId(),
          title: title || "Untitled",
          location: location || null,
          start: start ? toISO(start) : null,
          end: end ? toISO(end) : null,
          professor: professor,
          repeatWeekly,
          allDay: false,
          source: "ics",
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    // Key[:params]=value
    const m = ln.match(/^([A-Z-]+)(;[^:]*)?:(.*)$/);
    if (!m) continue;
    const key = m[1];
    const params = m[2] || "";
    const value = m[3];

    cur.raw[key] = value;
    if (key === "DTSTART" || key === "DTEND") {
      cur.raw[key + "_PARAMS"] = params;
    }
  }
  return events;
}

function parseIcsDateTimes(raw) {
  // DTSTART may be:
  //  - DTSTART:20250902T120000Z     -> UTC
  //  - DTSTART;TZID=America/New_York:20250902T120000 -> local in that TZ (we'll treat as local)
  //  - DTSTART:20250902T120000     -> floating local
  const parseOne = (key) => {
    const v = raw[key];
    if (!v) return null;
    if (/[Z]$/.test(v)) return new Date(v); // UTC form works directly

    const params = raw[key + "_PARAMS"] || "";
    // If TZID present, we still turn it into a local Date from the digits (keeps the local wall time)
    const dt = ymdhmsToLocalDate(v);
    return dt || new Date(v); // fallback
  };
  return { start: parseOne("DTSTART"), end: parseOne("DTEND") };
}

function extractParenLocation(summary) {
  if (!summary) return null;
  // e.g., "Intro Cog Psych (Building 12, Room 201)"
  const m = summary.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

function cryptoRandomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function parseCSV(text) {
  // Expect headers like: Title,Start,End,Location,Professor
  const rows = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!rows.length) return [];
  const headers = rows[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iTitle = idx("title");
  const iStart = idx("start");
  const iEnd = idx("end");
  const iLoc = idx("location");
  const iProf = idx("professor");

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = splitCSVLine(rows[i]);
    const title = cleanTitle(cols[iTitle] || "");
    const location = cols[iLoc] || null;
    const s = cols[iStart] ? new Date(cols[iStart]) : null;
    const e = cols[iEnd] ? new Date(cols[iEnd]) : null;
    out.push({
      id: cryptoRandomId(),
      title: title || "Untitled",
      location,
      start: s ? s.toISOString() : null,
      end: e ? e.toISOString() : null,
      professor: cols[iProf] || null,
      repeatWeekly: false,
      allDay: false,
      source: "csv",
    });
  }
  return out;
}

// basic CSV splitter (handles quoted commas)
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseText(text) {
  // Very loose fallback: try to get a line with times + location + prof
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const ln of lines) {
    const time = ln.match(/\b(\d{1,2}:\d{2}\s*(AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(AM|PM))\b/i);
    if (!time) continue;
    const title = cleanTitle(ln.replace(time[0], "").replace(/\s{2,}/g, " ").trim());
    const professor = pickProfessor(ln);
    const location =
      (ln.match(/\b(Room|Rm\.?|Bldg\.?|Building)\s+[A-Za-z0-9\- ]+\b/i) || [])[0] || null;
    // Build today with those times (user can adjust later)
    const today = new Date();
    const s = parseLocalTimeOnDate(today, time[1]);
    const e = parseLocalTimeOnDate(today, time[3]);
    out.push({
      id: cryptoRandomId(),
      title: title || "Untitled",
      location,
      start: s ? s.toISOString() : null,
      end: e ? e.toISOString() : null,
      professor,
      repeatWeekly: false,
      allDay: false,
      source: "text",
    });
  }
  return out;
}

function parseLocalTimeOnDate(baseDate, hhmmAmPm) {
  const m = hhmmAmPm.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = +m[1] % 12;
  const min = +m[2];
  const pm = /PM/i.test(m[3]);
  if (pm) h += 12;
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    h,
    min,
    0,
    0
  );
}

export function parseScheduleFile(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ics")) return parseICS(text);
  if (lower.endsWith(".csv")) return parseCSV(text);
  return parseText(text);
}
