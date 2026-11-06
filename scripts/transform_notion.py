#!/usr/bin/env python3
"""Turn raw Notion export (data/notion-raw) into seed JSON (data/seed).

Stdlib only (Python 3.9+). Deterministic ids. Run:  python scripts/transform_notion.py
Re-run safe: overwrites data/seed/*.json only after all checks pass.

Storage rules (match docs/TECHNICAL.md §3):
- items: local calendar fields in owner tz (Asia/Kuala_Lumpur): date YYYY-MM-DD, time HH:MM or null,
  end_date YYYY-MM-DD inclusive or null.
- blocks + all *_at timestamps: UTC ISO with Z.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "notion-raw"
OUT = ROOT / "data" / "seed"

OWNER_ID = "usr_jeremy"            # placeholder owner; seed importer remaps with --owner
CALENDAR_ID = "cal_jeremy_main"
TZ_NAME = "Asia/Kuala_Lumpur"
KL = timezone(timedelta(hours=8))  # Malaysia: UTC+8, no DST
EXPORT_AT = "2026-11-06T00:00:00Z"  # used where source has no timestamp

TYPES = {"Work", "Exam", "Event", "Hobby", "Dating"}
STATUS = {"Not Started": "todo", "In Progress": "doing", "Completed": "done"}
COURSE_CODES = {"FYP", "SP", "DS", "SULAM", "SS"}
OPEN_WHEN = {"Morning", "Night", "All Day"}
CLOSED_ON = {"Off Monday": "Mon", "Off Tuesday": "Tue", "Off Wednesday": "Wed", "Off Thursday": "Thu",
             "Off Friday": "Fri", "Off Saturday": "Sat", "Off Sunday": "Sun"}
WEEKDAY = {"Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7}

warnings: list[str] = []
_occ: dict[str, int] = defaultdict(int)


def make_id(prefix: str, *parts: str) -> str:
    """Stable id from content only (never row position). Identical content gets -2, -3 ... in source order."""
    key = "\x1f".join(parts)
    base = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    _occ[prefix + key] += 1
    n = _occ[prefix + key]
    return f"{prefix}_{base}" if n == 1 else f"{prefix}_{base}{n}"


def utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8-sig").splitlines()   # utf-8-sig strips BOM; splitlines eats CRLF


def read_psv(name: str, expect_cols: int) -> list[dict[str, str]]:
    path = RAW / name
    lines = read_lines(path)
    if not lines:
        sys.exit(f"{name}: empty file")
    header = [h.strip() for h in lines[0].split("|")]
    if len(header) != expect_cols:
        sys.exit(f"{name}: header has {len(header)} cols, want {expect_cols}")
    rows = []
    for i, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue
        cells = line.split("|")
        if len(cells) != expect_cols:
            sys.exit(f"{name}:{i}: {len(cells)} cols, want {expect_cols} (a '|' inside text?): {line!r}")
        rows.append(dict(zip(header, (c.strip() for c in cells))))
    return rows


def split_csv(s: str) -> list[str]:
    return [p.strip() for p in s.split(",") if p.strip()]


def notion_created(s: str) -> str:
    """Notion createdTime (UTC) in 'YYYY-MM-DD HH:MM[:SS]' or ISO -> 'YYYY-MM-DDTHH:MM:SSZ'."""
    s = s.strip().replace("T", " ").rstrip("Z")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return utc_iso(datetime.strptime(s, fmt).replace(tzinfo=timezone.utc))
        except ValueError:
            pass
    sys.exit(f"bad created timestamp {s!r}")


def notion_date(s: str) -> tuple[str | None, str | None]:
    """Notion date property -> (local date, local time or None) in owner tz.
    Date-only stays as-is. Datetime with offset -> converted to KL. Naive datetime -> assumed KL."""
    s = s.strip()
    if not s:
        return None, None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s, None
    try:
        dt = datetime.fromisoformat(s.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        sys.exit(f"bad date {s!r}")
    dt = dt.replace(tzinfo=KL) if dt.tzinfo is None else dt.astimezone(KL)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


def main() -> None:
    static = json.loads((RAW / "home_static.json").read_text(encoding="utf-8-sig"))

    users = [{"id": OWNER_ID, "username": "jeremy", "display_name": "Jeremy", "role": "admin",
              "color": "#1C1917", "timezone": TZ_NAME, "created_at": EXPORT_AT}]
    calendars = [{"id": CALENDAR_ID, "owner_id": OWNER_ID, "name": "Jeremy", "is_default": True,
                  "created_at": EXPORT_AT}]

    # ---- courses -----------------------------------------------------------
    course_id, courses = {}, []
    aliases = {"SP": ["sp", "sysprog"], "SS": ["ss", "socsci"], "FYP": ["fyp"], "DS": ["ds"], "SULAM": ["sulam"]}
    for c in static["courses"]:
        cid = make_id("crs", c["code"])
        course_id[c["code"]] = cid
        courses.append({"id": cid, "owner_id": OWNER_ID, "code": c["code"], "name": c["name"],
                        "aliases": aliases.get(c["code"], [c["code"].lower()]),
                        "active": True, "source_ref": f"notion:{c['notion_id']}"})

    # ---- lists -------------------------------------------------------------
    lists, list_items = [], []

    def new_list(name: str, sort: int) -> str:
        lid = make_id("lst", name)
        lists.append({"id": lid, "owner_id": OWNER_ID, "name": name, "sort": sort})
        return lid

    lst_watch = new_list("Watchlist", 1)
    lst_dates = new_list("Date ideas", 2)
    lst_games = new_list("Games to play", 3)
    lst_sound = new_list("Soundtrack inspiration", 4)
    lst_rules = new_list("chicenwangs2 rules", 5)
    sort_in = Counter()

    def add_list_item(lid: str, text: str, done=False, note=None, created=None, link=None):
        list_items.append({"id": make_id("lit", lid, text, created or ""), "list_id": lid,
                           "text": text, "done": done, "note": note, "link": link,
                           "created_at": created or EXPORT_AT, "sort": sort_in[lid]})
        sort_in[lid] += 1

    # ---- items (Main Database) --------------------------------------------
    items = []
    rows = read_psv("main_database.psv", 8)
    dropped = 0
    for idx, r in enumerate(rows):
        title, typ, status = r["title"], r["type"] or None, r["status"]
        created = notion_created(r["created"])
        st = STATUS.get(status)
        if st is None:
            sys.exit(f"unknown status {status!r} row {idx + 2}")
        if typ is not None and typ not in TYPES:
            sys.exit(f"unknown type {typ!r} row {idx + 2}")
        if r["course"] and r["course"] not in COURSE_CODES:
            sys.exit(f"unknown course {r['course']!r} row {idx + 2}")
        if title == "Event" and typ == "Event" and not r["date_start"]:
            dropped += 1
            warnings.append("dropped Notion template row 'Event' (no date, not started)")
            continue
        if not r["date_start"] and typ == "Dating":
            add_list_item(lst_dates, title, done=(st == "done"), note=r["description"] or None, created=created)
            continue
        if typ is None:
            add_list_item(lst_watch, title, done=(st == "done"), note=r["description"] or None, created=created)
            continue
        d, t = notion_date(r["date_start"])
        end_d, _ = notion_date(r["date_end"])
        if end_d and d and end_d < d:
            warnings.append(f"end before start, end dropped: {title!r}")
            end_d = None
        items.append({
            "id": make_id("itm", r["created"], title, r["date_start"]),
            "calendar_id": CALENDAR_ID, "title": title, "type": typ, "status": st,
            "date": d, "time": t, "end_date": end_d,
            "course_id": course_id.get(r["course"]) if r["course"] else None,
            "parent_id": None, "notes": r["description"] or None, "private": False,
            "created_at": created, "updated_at": created,
            "started_at": None, "completed_at": None,   # Notion has no history; left null on purpose
            "source": "notion",
        })
        if d is None:
            warnings.append(f"item without date kept in Unscheduled: {title!r}")
        if st == "doing" and d and d < "2026-01-01":
            warnings.append(f"stale 'doing' item (from Notion In Progress): {title!r} due {d}")

    # ---- blocks (Today planner) --------------------------------------------
    blocks = []
    tp = static["today_planner"]
    for row in tp["rows"]:
        h = int(row["hour"])
        if not 0 <= h <= 23:
            sys.exit(f"planner hour out of range: {h}")
        start_local = datetime.strptime(tp["date"], "%Y-%m-%d").replace(hour=h, tzinfo=KL)
        start, end = utc_iso(start_local), utc_iso(start_local + timedelta(hours=1))
        blocks.append({"id": make_id("blk", start, row["text"]), "calendar_id": CALENDAR_ID,
                       "item_id": None, "label": row["text"], "type": None,
                       "start_at": start, "end_at": end, "status": "todo",
                       "created_at": EXPORT_AT, "updated_at": EXPORT_AT})

    # ---- goals -------------------------------------------------------------
    goals = [{"id": make_id("gol", static["goals"]["period"], g["text"]), "owner_id": OWNER_ID,
              "period": static["goals"]["period"], "text": g["text"], "done": g["done"], "sort": i}
             for i, g in enumerate(static["goals"]["items"])]

    # ---- workouts ----------------------------------------------------------
    def parse_weight(s):
        if not s:
            return None, None
        m = re.match(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(light|moderate|heavy)?\s*$", s, re.I)
        if not m:
            warnings.append(f"workout value not parsed: {s!r}")
            return None, None
        return float(m.group(1)), (m.group(2).lower() if m.group(2) else None)

    split = []
    for w in static["workout"]["rows"]:
        if w["day"] not in WEEKDAY:
            sys.exit(f"workout day must be Mon..Sun, got {w['day']!r}")
        kg, effort = parse_weight(w["current"])
        legacy = {}
        for col in ("week1", "week2", "week3", "week4"):
            wkg, weff = parse_weight(w[col])
            if wkg is not None:
                legacy[col] = {"kg": wkg, "effort": weff}
        split.append({"id": make_id("wsp", w["day"], w["exercise"]), "owner_id": OWNER_ID,
                      "weekday": WEEKDAY[w["day"]], "exercise": w["exercise"], "sort": len(split),
                      "current_kg": kg, "current_effort": effort, "legacy_weeks": legacy or None})

    # ---- places ------------------------------------------------------------
    places = []
    names = Counter()
    for city, fname in (("Kuching", "food_kuching.psv"), ("Johor", "food_johor.psv")):
        for r in read_psv(fname, 8):
            hours = split_csv(r["hours"])
            bad = [h for h in hours if h not in OPEN_WHEN and h not in CLOSED_ON]
            if bad:
                sys.exit(f"unknown hours {bad} for {r['name']}")
            area_list = split_csv(r["areas"])
            if "Pending" in area_list:
                warnings.append(f"place area was 'Pending' (unknown): {r['name']!r}")
            names[(city, re.sub(r"\bkafe\b", "cafe", r["name"].lower()))] += 1
            places.append({
                "id": make_id("plc", city, r["name"], r["notes"]),
                "owner_id": OWNER_ID, "name": r["name"], "city": city,
                "areas": [a for a in area_list if a != "Pending"], "cuisines": split_csv(r["cuisines"]),
                "open_when": [h for h in hours if h in OPEN_WHEN],
                "closed_on": [CLOSED_ON[h] for h in hours if h in CLOSED_ON],
                "halal": r["halal"] == "1", "visited": r["visited"] == "1",
                "approved": r["approved"] == "1", "rating": None,   # Notion had no rating; approved kept as-is
                "notes": r["notes"] or None, "last_visited": None,
            })
    for (city, n), c in names.items():
        if c > 1:
            warnings.append(f"possible duplicate place x{c} in {city}: {n!r} (kept all, merge by hand)")

    # ---- people ------------------------------------------------------------
    person_id = make_id("per", "Neina")
    people = [{"id": person_id, "owner_id": OWNER_ID, "name": "Neina", "aliases": ["Nena"]}]
    cat_map = {"Bucketlist": "bucket_list", "Hates": "hates", "Likes": "likes", "Misc": "misc",
               "Personal Info": "info", "Wants": "wants"}
    facts = []
    for i, r in enumerate(read_psv("neina.psv", 3)):
        if r["category"] not in cat_map:
            sys.exit(f"unknown category {r['category']!r}")
        facts.append({"id": make_id("fct", r["category"], r["name"]), "person_id": person_id,
                      "category": cat_map[r["category"]], "text": r["name"],
                      "detail": r["information"] or None, "sort": i})

    # ---- ideas -------------------------------------------------------------
    ideas = []
    idea_rows = read_psv("ideas.psv", 3)
    ideas_dropped = 0
    for r in idea_rows:
        if not r["text"]:
            ideas_dropped += 1
            warnings.append("dropped empty idea row")
            continue
        ideas.append({"id": make_id("ida", r["source"], r["text"], r["created"]), "owner_id": OWNER_ID,
                      "channel": r["source"], "stage": "idea", "text": r["text"],
                      "created_at": notion_created(r["created"]), "sort": len(ideas)})
        if len(r["text"]) > 70 and r["source"] == "chicenwangs2":
            warnings.append(f"idea title > 70 chars: {r['text'][:40]!r}...")

    # ---- other lists -------------------------------------------------------
    for g in static["creator"]["games_to_play"]:
        add_list_item(lst_games, g)
    for r in read_psv("soundtracks.psv", 2):
        add_list_item(lst_sound, r["text"], created=notion_created(r["created"]),
                      link=r["text"] if r["text"].startswith("http") else None)
    for rule in static["creator"]["channel_rules"]:
        add_list_item(lst_rules, rule["text"])

    # ---- checks BEFORE writing --------------------------------------------
    by_list = Counter(li["list_id"] for li in list_items)
    landed = len(items) + by_list[lst_dates] + by_list[lst_watch] + dropped
    if landed != len(rows):
        sys.exit(f"row count mismatch: {landed} landed vs {len(rows)} source")
    if len(ideas) + ideas_dropped != len(idea_rows):
        sys.exit(f"idea count mismatch: {len(ideas)}+{ideas_dropped} vs {len(idea_rows)} source")
    out = {
        "users.json": users, "calendars.json": calendars, "courses.json": courses,
        "items.json": items, "blocks.json": blocks, "goals.json": goals,
        "workout_split.json": split, "places.json": places, "lists.json": lists,
        "list_items.json": list_items, "people.json": people, "person_facts.json": facts,
        "ideas.json": ideas,
    }
    all_ids = [row["id"] for data in out.values() for row in data]
    dup = [k for k, v in Counter(all_ids).items() if v > 1]
    if dup:
        sys.exit(f"duplicate ids: {dup[:5]}")

    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in out.items():
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts = {k.removesuffix(".json"): len(v) for k, v in out.items()}
    report = {
        "source_rows": {"main_database": len(rows), "ideas": len(idea_rows),
                        "dropped": {"main_database": dropped, "ideas": ideas_dropped}},
        "counts": counts,
        "list_items_per_list": {l["name"]: by_list[l["id"]] for l in lists},
        "items_by_type": Counter(i["type"] for i in items),
        "items_by_status": Counter(i["status"] for i in items),
        "warnings": sorted(set(warnings)),
        "not_exported": static["not_exported"],
    }
    (OUT / "_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"counts": counts, "warnings": len(report["warnings"])}, indent=2))


if __name__ == "__main__":
    main()
