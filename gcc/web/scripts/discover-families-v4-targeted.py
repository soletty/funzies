#!/usr/bin/env python3
"""
Targeted family discovery v4 — finds families missed by previous rounds:
1. Government officials, ministers, ambassadors, technocrats
2. Military/security leaders
3. Judiciary and legal families
4. Academic/scientific families
5. Media/cultural figures
6. Sports/entertainment families
7. Transliteration variant catch-all

Usage: python discover-families-v4-targeted.py [--dry-run]
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "src" / "data"
DRY_RUN = "--dry-run" in sys.argv

ENV_PATH = Path(__file__).resolve().parents[3] / "web" / ".env.local"
if not ENV_PATH.exists():
    ENV_PATH = Path(__file__).resolve().parents[1] / ".env.local"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith("ANTHROPIC_API_KEY="):
            os.environ["ANTHROPIC_API_KEY"] = line.split("=", 1)[1].strip()

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    print("ERROR: No ANTHROPIC_API_KEY found")
    sys.exit(1)

RATE_LIMIT_DELAY = 2.0


def call_claude(prompt, max_tokens=8000):
    data = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())["content"][0]["text"]
        except urllib.error.HTTPError as e:
            e.read()
            if e.code in (429, 529):
                time.sleep(15 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < 2:
                time.sleep(5)
                continue
            return None
    return None


def parse_json_array(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
    start = text.find("[")
    end = text.rfind("]") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            fixed = re.sub(r',\s*]', ']', re.sub(r',\s*}', '}', text[start:end]))
            try:
                return json.loads(fixed)
            except Exception:
                return None
    return None


def normalize_name(name):
    name = name.strip()
    name = re.sub(r'^(The |House of |Beit |Bayt )', '', name, flags=re.IGNORECASE)
    name = re.sub(r'^(Al-|Al |Aal |Āl )', 'Al ', name)
    name = re.sub(r'\s+(family|clan|dynasty|house|group)$', '', name, flags=re.IGNORECASE)
    return name.strip()


def make_id(name):
    clean = name.lower().strip()
    clean = re.sub(r'[^a-z0-9\s]', '', clean)
    clean = re.sub(r'\s+', '_', clean)
    return clean


def is_junk(name):
    lower = name.lower()
    junk_words = [
        'stadium', 'airport', 'hotel', 'tower', 'mall', 'hospital',
        'university', 'school', 'mosque', 'street', 'road', 'highway',
        'district', 'province', 'region', 'city', 'village', 'island',
        'company', 'corporation', 'inc.', 'ltd.',
        'ministry', 'government', 'authority',
    ]
    for w in junk_words:
        if w in lower:
            return True
    if len(name) < 3 or len(name) > 60:
        return True
    if name.count(' ') > 5:
        return True
    return False


GOVT_PROMPT = """List ALL families from {country} that are prominent through government service, politics, diplomacy, or public sector leadership. Think about:

- Current and former ministers and their family names
- Ambassadors and diplomats
- Central bank governors, sovereign wealth fund leaders
- Senior government officials and undersecretaries
- Members of parliament / Shura council / National Assembly
- Governors of provinces/regions
- Heads of major government entities (airlines, oil companies, ports, free zones)
- Political advisors and palace officials
- Families known for producing multiple government officials across generations

These are often families NOT known as "merchant families" or "tribal families" but rather as technocratic/political families. Include families of ALL origins (Arab, Persian, Indian, Baloch, etc.).

Examples of the type I mean: Al Rumayyan (PIF governor), Al Ghobash (UAE diplomats), Al Otaiba (UAE ambassador), etc.

Return ONLY a JSON array:
[
  {{"name": "Al Rumayyan", "country": "{country}", "role": "Government/finance leadership", "note": "Yasir Al-Rumayyan, PIF governor"}},
  ...
]

Be EXHAUSTIVE. I need every family you can think of that has produced government officials in {country}. Aim for 80+ families."""


MILITARY_PROMPT = """List ALL families from {country} known through military, security, intelligence, or police leadership.

Think about:
- Military generals and commanders
- Police/security chiefs
- Intelligence agency leaders
- National guard families
- Coast guard / border security
- Families with multi-generational military service

Return ONLY a JSON array:
[
  {{"name": "Al Example", "country": "{country}", "role": "Military/security", "note": "Brief description"}},
  ...
]"""


CULTURAL_PROMPT = """List ALL families from {country} prominent in:
- Media (TV presenters, journalists, media moguls)
- Sports (athletes, sports administrators)
- Arts and culture (poets, artists, musicians, filmmakers)
- Academia (university presidents, notable professors, researchers)
- Religion (muftis, imams, religious scholars — not already covered as "Al Ash Sheikh")
- Judiciary (chief justices, prominent lawyers, legal families)
- Medicine (prominent doctors, hospital founders)
- Architecture and urban planning

Return ONLY a JSON array:
[
  {{"name": "Al Example", "country": "{country}", "role": "Category", "note": "Brief description"}},
  ...
]

Aim for 50+ families."""


MISSING_PROMPT = """I have a database of {count} Arabian Gulf families. Here are families I know are MISSING that should be there. Based on these gaps, identify similar families I'm also likely missing.

Known missing: Al Rumayyan, Al Ghobash/Gobash, and likely many others.

Here is my existing family list for {country}:
{existing_names}

List families from {country} that are NOT in my list above. Think about:
- Common family names that any local would know
- Families from smaller cities and towns
- Families prominent in the last 20 years (new money, tech, startups)
- Families with unusual transliterations that might have been missed
- Mixed-origin families (half Arab, half Persian/Indian/etc.)
- Families known locally but not internationally

Return ONLY a JSON array:
[
  {{"name": "Al Example", "country": "{country}", "note": "Why they're notable"}},
  ...
]

Be exhaustive — aim for 50+ families."""


COUNTRIES = [
    "Saudi Arabia", "United Arab Emirates", "Kuwait", "Bahrain", "Qatar", "Oman"
]


def main():
    families = json.loads((DATA_DIR / "families.json").read_text())
    existing_ids = {f["id"] for f in families}
    existing_names = {normalize_name(f["name"]).lower() for f in families}
    for f in families:
        name = f["name"]
        existing_names.add(name.lower())
        existing_names.add(normalize_name(name).lower())
        bare = re.sub(r'^(Al |Aal |Al-)', '', name)
        existing_names.add(bare.lower())

    # Group existing names by country for the "missing" prompt
    names_by_country = {}
    for f in families:
        c = f.get("country") or "Unknown"
        names_by_country.setdefault(c, []).append(f["name"])

    all_discovered = {}

    def add_family(name, info):
        if is_junk(name):
            return
        norm = normalize_name(name)
        if norm.lower() in existing_names:
            return
        fid = make_id(norm)
        if fid in all_discovered:
            return
        bare = re.sub(r'^(al_|aal_)', '', fid)
        for eid in existing_ids:
            if bare == re.sub(r'^(al_|aal_)', '', eid):
                return
        all_discovered[fid] = {
            "name": norm,
            "country": info.get("country", ""),
            "note": info.get("note", ""),
            "role": info.get("role", ""),
        }

    # ── Round 1: Government/Political ────────────────────────────────────
    print("=" * 60)
    print("ROUND 1: Government & political families")
    print("=" * 60)

    for country in COUNTRIES:
        print(f"\n[Govt] {country}...", flush=True)
        response = call_claude(GOVT_PROMPT.format(country=country))
        if not response:
            print("  FAILED")
            continue
        results = parse_json_array(response)
        if not results:
            print("  BAD JSON")
            continue
        before = len(all_discovered)
        for r in results:
            name = r.get("name", "").strip()
            if name:
                add_family(name, {**r, "country": country})
        print(f"  Got {len(results)}, {len(all_discovered) - before} new, total: {len(all_discovered)}")
        time.sleep(RATE_LIMIT_DELAY)

    # ── Round 2: Military/Security ───────────────────────────────────────
    print("\n" + "=" * 60)
    print("ROUND 2: Military & security families")
    print("=" * 60)

    for country in COUNTRIES:
        print(f"\n[Military] {country}...", flush=True)
        response = call_claude(MILITARY_PROMPT.format(country=country))
        if not response:
            print("  FAILED")
            continue
        results = parse_json_array(response)
        if not results:
            print("  BAD JSON")
            continue
        before = len(all_discovered)
        for r in results:
            name = r.get("name", "").strip()
            if name:
                add_family(name, {**r, "country": country})
        print(f"  Got {len(results)}, {len(all_discovered) - before} new, total: {len(all_discovered)}")
        time.sleep(RATE_LIMIT_DELAY)

    # ── Round 3: Cultural/Academic/Media ─────────────────────────────────
    print("\n" + "=" * 60)
    print("ROUND 3: Cultural, academic, media families")
    print("=" * 60)

    for country in COUNTRIES:
        print(f"\n[Cultural] {country}...", flush=True)
        response = call_claude(CULTURAL_PROMPT.format(country=country))
        if not response:
            print("  FAILED")
            continue
        results = parse_json_array(response)
        if not results:
            print("  BAD JSON")
            continue
        before = len(all_discovered)
        for r in results:
            name = r.get("name", "").strip()
            if name:
                add_family(name, {**r, "country": country})
        print(f"  Got {len(results)}, {len(all_discovered) - before} new, total: {len(all_discovered)}")
        time.sleep(RATE_LIMIT_DELAY)

    # ── Round 4: Gap analysis per country ────────────────────────────────
    print("\n" + "=" * 60)
    print("ROUND 4: Gap analysis — what's missing?")
    print("=" * 60)

    for country in COUNTRIES:
        print(f"\n[Gaps] {country}...", flush=True)
        country_names = names_by_country.get(country, [])
        # Also include "Unknown" country names
        all_names = country_names + names_by_country.get("Unknown", [])
        names_str = ", ".join(sorted(set(all_names)))
        if len(names_str) > 12000:
            names_str = names_str[:12000] + "..."

        response = call_claude(MISSING_PROMPT.format(
            count=len(families),
            country=country,
            existing_names=names_str,
        ))
        if not response:
            print("  FAILED")
            continue
        results = parse_json_array(response)
        if not results:
            print("  BAD JSON")
            continue
        before = len(all_discovered)
        for r in results:
            name = r.get("name", "").strip()
            if name:
                add_family(name, {**r, "country": country})
        print(f"  Got {len(results)}, {len(all_discovered) - before} new, total: {len(all_discovered)}")
        time.sleep(RATE_LIMIT_DELAY)

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"TOTAL DISCOVERED: {len(all_discovered)} new families")
    print("=" * 60)

    if DRY_RUN:
        print("\n[DRY RUN] Would add:")
        for fid, info in sorted(all_discovered.items()):
            print(f"  {info['name']} ({info.get('country', '?')}) - {info.get('note', '')[:60]}")
        return

    new_families = []
    for fid, info in all_discovered.items():
        family = {
            "id": fid,
            "name": info["name"],
            "nameAr": None,
            "country": info.get("country") or None,
            "city": None,
            "familyType": "political" if "gov" in info.get("role", "").lower() else "merchant",
            "isRuling": 0,
            "rulesOver": None,
            "tribeId": None,
            "history": None,
            "description": info.get("note") or None,
            "originStory": None,
            "tribalOrigin": None,
            "modernStatus": None,
            "folkLegends": [],
            "nameEtymology": None,
            "migrationPath": [],
            "timelineEvents": [],
            "connections": [],
            "notableFigures": [],
        }
        new_families.append(family)

    families.extend(new_families)
    (DATA_DIR / "families.json").write_text(
        json.dumps(families, indent=2, ensure_ascii=False) + "\n"
    )
    print(f"\nAdded {len(new_families)} new families to families.json")
    print(f"Total families: {len(families)}")


if __name__ == "__main__":
    main()
