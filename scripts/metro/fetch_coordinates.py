"""Fill a metro file's coordinates from OpenStreetMap through Geoapify, and cross-check with Mappls.

Usage: python scripts/metro/fetch_coordinates.py docs/metro-data/kolkata.json [--write]

Prints a review table. With --write, stations that matched are saved with source "osm". Stations
already marked "manual" are kept as they are. The keys are read from .env and never printed.
"""
import json, math, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEARCH_RADIUS_M = 45000
CROSS_CHECK_M = 300

# A station's name in our file, against the spellings OpenStreetMap uses.
ALIASES = {
    "kol-shobhabazar-sutanuti": ["sovabazar sutanuti", "shobhabazar", "sovabazar", "shobabazar", "shobabazar sutanuti"],
    "kol-mahanayak-uttam-kumar": ["uttam kumar", "tollygunge"],
    "kol-masterda-surya-sen": ["masterda suryasen", "bansdroni"],
    "kol-kavi-nazrul": ["garia bazar"],
    "kol-shahid-khudiram": ["briji", "shaheed khudiram", "sahid khudiram", "shahid kshudiram"],
    "kol-mahatma-gandhi-road": ["mg road", "m g road", "mahatma gandhi rd"],
    "kol-netaji": ["kudghat"],
    "kol-gitanjali": ["naktala", "geetanjali"],
    "kol-salt-lake-sector-v": ["sector v", "salt lake sector 5", "sector 5"],
    "kol-karunamoyee": ["karunamayee", "karunamoyi"],
    "kol-jai-hind-biman-bandar": ["jai hind", "biman bandar", "jaihind bimanbandar", "jai hind bimanbandar", "airport"],
    "kol-hemanta-mukhopadhyay": ["hemanta mukherjee", "ruby"],
    "kol-kavi-subhash": ["new garia", "kavi subhas", "kavi subhash blue line"],
    "kol-phoolbagan": ["phool bagan"],
    "kol-sakher-bazar": ["sakherbazar", "sakher bazaar"],
    "kol-behala-chowrasta": ["behala chaurasta"],
    "kol-behala-bazar": ["behala bazaar"],
    "kol-dakshineswar": ["dakshineshwar"],
    "kol-shyambazar": ["shyam bazar", "shyambazaar"],
    "kol-chandni-chowk": ["chandni chawk"],
    "kol-thakurpukur": ["thakur pukur"],
    "kol-dum-dum": ["dumdum"],
    "kol-dum-dum-cantonment": ["dumdum cantonment", "dum dum cantt"],
}


def env(name):
    for raw in (ROOT / ".env").read_text(encoding="utf8").splitlines():
        if raw.startswith(name + "="):
            return raw.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"{name} is not in .env")


def get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "khatiyan-metro-seed"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:  # The URL holds the key, so only the status is reported.
        raise RuntimeError(f"HTTP {error.code}") from None
    except urllib.error.URLError:
        raise RuntimeError("network error") from None


def normal(text):
    text = re.sub(r"\b(metro|station|line \d|line-\d|kolkata)\b", " ", (text or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def km(a_lat, a_lng, b_lat, b_lng):
    p = math.pi / 180
    h = math.sin((b_lat - a_lat) * p / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lng - a_lng) * p / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def osm_stations(doc, key):
    query = urllib.parse.urlencode({
        "categories": "public_transport.subway",
        "filter": f"circle:{doc['centreLongitude']},{doc['centreLatitude']},{SEARCH_RADIUS_M}",
        "limit": 500,
        "apiKey": key,
    })
    found = get_json("https://api.geoapify.com/v2/places?" + query).get("features", [])
    return [{"name": f["properties"].get("name") or "", "lat": f["properties"]["lat"], "lng": f["properties"]["lon"]} for f in found]


def matches_for(station, found):
    wanted = {normal(station["name"])} | {normal(a) for a in ALIASES.get(station["code"], [])}
    return [f for f in found if normal(f["name"]) in wanted]


def mappls_flag(station, key):
    """None when Mappls names the same station within the cross-check distance, otherwise what it found."""
    query = urllib.parse.urlencode({
        "keywords": "TRNMET",
        "refLocation": f"{station['latitude']},{station['longitude']}",
        "radius": 1000,
        "access_token": key,
    })
    try:
        places = get_json("https://search.mappls.com/search/places/nearby/json?" + query).get("suggestedLocations") or []
    except RuntimeError as error:
        return f"no answer ({error})"
    wanted = set(normal(station["name"]).split()) | {w for a in ALIASES.get(station["code"], []) for w in normal(a).split()}
    near = [p for p in places if float(p.get("distance") or 99999) <= CROSS_CHECK_M]
    if any(wanted & set(normal(p.get("placeName")).split()) for p in near):
        return None
    closest = min(places, key=lambda p: float(p.get("distance") or 99999), default=None)
    return f"closest {closest.get('placeName')} {closest.get('distance')} m" if closest else "nothing within 1 km"


def main():
    path = Path(sys.argv[1])
    write = "--write" in sys.argv
    doc = json.loads(path.read_text(encoding="utf8"))
    found = osm_stations(doc, env("GEOAPIFY_API_KEY"))
    mappls_key = env("MAPPLS_REST_KEY")
    print(f"OpenStreetMap stations returned: {len(found)}")

    used = set()
    resolved = {}
    for line in doc["lines"]:
        for station in line["stations"]:
            if station["code"] in resolved:
                continue
            if station.get("source") == "manual":
                resolved[station["code"]] = {"lat": station["latitude"], "lng": station["longitude"], "source": "manual", "spread": 0, "matched": "manual"}
                continue
            hits = matches_for(station, found)
            if not hits:
                resolved[station["code"]] = None
                continue
            for hit in hits:
                used.add(id(hit))
            lat = sum(h["lat"] for h in hits) / len(hits)
            lng = sum(h["lng"] for h in hits) / len(hits)
            spread = max(km(lat, lng, h["lat"], h["lng"]) for h in hits)
            resolved[station["code"]] = {"lat": lat, "lng": lng, "source": "osm", "spread": spread, "matched": " + ".join(sorted({h["name"] for h in hits}))}

    missing = []
    flags = {}
    for line in doc["lines"]:
        print(f"\n## {line['name']} {line['colour']} ({len(line['stations'])})")
        for position, station in enumerate(line["stations"], 1):
            result = resolved[station["code"]]
            if result is None:
                missing.append(station["name"])
                print(f"{position:>2} {station['name']:<26} NO MATCH")
                continue
            station.update(latitude=round(result["lat"], 7), longitude=round(result["lng"], 7), source=result["source"])
            if station["code"] not in flags:
                flags[station["code"]] = mappls_flag(station, mappls_key)
                time.sleep(0.2)
            notes = []
            if result["spread"] > 0.3:
                notes.append(f"entries {result['spread']:.2f} km apart")
            if flags[station["code"]]:
                notes.append("Mappls: " + flags[station["code"]])
            print(f"{position:>2} {station['name']:<26} {station['latitude']:.5f},{station['longitude']:.5f} [{result['matched']}]" + (" FLAG " + "; ".join(notes) if notes else ""))

    print("\nNo OpenStreetMap match:", ", ".join(sorted(set(missing))) or "none")
    print("Unused OpenStreetMap names:", ", ".join(sorted({f["name"] for f in found if id(f) not in used})) or "none")
    if write:
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf8", newline="\n")
        print("Saved", path)


if __name__ == "__main__":
    main()
