#!/usr/bin/env python3
"""
Vocal Impact - find coordinates for members' locations (nearest landmarks).

Looks each landmark up on Google Maps (when GOOGLE_MAPS_API_KEY is set), then
OpenStreetMap (Nominatim, then Photon), and stores "lat, lng" next to the
location text. The app does the same automatically whenever a location is
saved; this script lets you run and test it on its own.

  # 1. A Google Form CSV: adds a "Location Coordinates" column next to the
  #    location column. Upload the new file in the app (Members -> Import);
  #    rows with coordinates go straight onto the map.
  python scripts/geocode/geocode_locations.py csv responses.csv

  # 2. The database: fills in coordinates for every location still waiting
  #    to be found (add --retry-failed to try "not found" ones again).
  python scripts/geocode/geocode_locations.py db --dry-run
  python scripts/geocode/geocode_locations.py db

  # 3. Just try one landmark.
  python scripts/geocode/geocode_locations.py lookup "Kohuwala junction"

Settings come from the environment or the project's .env file:
GOOGLE_MAPS_API_KEY (optional), NOMINATIM_USER_AGENT, and for `db`:
DATABASE_URL (or DIRECT_URL) and DATA_ENCRYPTION_KEY.

Requirements: Python 3.10+. `csv` and `lookup` use only the standard library;
`db` needs: pip install -r scripts/geocode/requirements.txt
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional, Protocol

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


def load_dotenv(path: Path = PROJECT_ROOT / ".env") -> None:
    """Minimal .env reader (KEY="value" lines); real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


# ---------------------------------------------------------------------------
# Coordinates (same rules as src/shared/lib/coordinates.ts)
# ---------------------------------------------------------------------------

_NUMBER = r"[-+]?\d+(?:\.\d+)?"
_PAIR = re.compile(rf"^\(?\s*({_NUMBER})\s*[,\s]\s*({_NUMBER})\s*\)?$")
SRI_LANKA = {"min_lat": 5.5, "max_lat": 10.0, "min_lng": 79.4, "max_lng": 82.0}


@dataclass(frozen=True)
class Point:
    latitude: float
    longitude: float


def parse_coordinates(text: str) -> Optional[Point]:
    """'6.8953861, 79.8556737' (as copied from Google Maps) -> Point, else None."""
    match = _PAIR.match(text.strip())
    if not match:
        return None
    lat, lng = float(match.group(1)), float(match.group(2))
    if abs(lat) > 90 or abs(lng) > 180:
        return None
    return Point(lat, lng)


def in_sri_lanka(point: Point) -> bool:
    return (
        SRI_LANKA["min_lat"] <= point.latitude <= SRI_LANKA["max_lat"]
        and SRI_LANKA["min_lng"] <= point.longitude <= SRI_LANKA["max_lng"]
    )


def _round_half_up(value: float, decimals: int) -> float:
    # JavaScript's Math.round rounds .5 up; Python's round() would round to even.
    factor = 10**decimals
    return int(value * factor + (0.5 if value >= 0 else -0.5)) / factor


def round_point(point: Point, decimals: int = 3) -> Point:
    """~100 m precision - never an exact home address (same as the app)."""
    return Point(_round_half_up(point.latitude, decimals), _round_half_up(point.longitude, decimals))


def _number(value: float) -> str:
    # Like JavaScript's number formatting: 6.87 -> "6.87", 80.0 -> "80".
    text = repr(float(value))
    return text[:-2] if text.endswith(".0") else text


def format_point(point: Point, separator: str = ", ") -> str:
    return f"{_number(point.latitude)}{separator}{_number(point.longitude)}"


# ---------------------------------------------------------------------------
# Landmark clean-up (same rules as src/modules/carpool/domain/geocoding.ts)
# ---------------------------------------------------------------------------

_ABBREVIATIONS = [
    (re.compile(r"\bjn\b\.?", re.I), "junction"),
    (re.compile(r"\bjct\b\.?", re.I), "junction"),
    (re.compile(r"\brd\b\.?", re.I), "road"),
    (re.compile(r"\bmw\b\.?", re.I), "mawatha"),
    (re.compile(r"\bstn\b\.?", re.I), "station"),
]
_FILLER = re.compile(r"^(near|close to|around|opposite|behind|next to)\s+", re.I)


def normalise_area(area: str) -> str:
    value = _FILLER.sub("", re.sub(r"\s+", " ", area.strip()))
    for pattern, replacement in _ABBREVIATIONS:
        value = pattern.sub(replacement, value)
    return value.strip()


def geocode_queries(area: str) -> list[str]:
    """Queries to try, most specific first, without duplicates."""
    cleaned = normalise_area(area)
    candidates = [cleaned, f"{cleaned}, Sri Lanka"]
    if "," in cleaned:
        candidates += [part.strip() for part in cleaned.split(",") if len(part.strip()) > 2]
    seen: set[str] = set()
    result = []
    for query in candidates:
        if query and query.lower() not in seen:
            seen.add(query.lower())
            result.append(query)
    return result


# ---------------------------------------------------------------------------
# Geocoders
# ---------------------------------------------------------------------------


class GeocodeError(Exception):
    """The service could not answer (network, quota, bad key) - try the next one."""


class Geocoder(Protocol):
    name: str

    def geocode(self, query: str) -> Optional[Point]: ...


Fetch = Callable[[str, dict], dict]


def http_get_json(url: str, headers: dict) -> dict:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise GeocodeError(str(error)) from error


class GoogleGeocoder:
    """Google Maps Geocoding API - best with local landmarks. Needs an API key with billing enabled."""

    name = "Google Maps"

    def __init__(self, api_key: str, fetch: Fetch = http_get_json):
        self.api_key, self.fetch = api_key, fetch

    def geocode(self, query: str) -> Optional[Point]:
        params = {"address": query, "components": "country:LK", "region": "lk", "key": self.api_key}
        body = self.fetch("https://maps.googleapis.com/maps/api/geocode/json?" + urllib.parse.urlencode(params), {})
        status = body.get("status")
        if status == "ZERO_RESULTS":
            return None
        if status != "OK":
            raise GeocodeError(f"Google: {status} {body.get('error_message', '')}".strip())
        location = body["results"][0]["geometry"]["location"]
        return Point(float(location["lat"]), float(location["lng"]))


class NominatimGeocoder:
    """OpenStreetMap Nominatim (free). Fair use: max 1 request/second with a real User-Agent."""

    name = "OpenStreetMap (Nominatim)"

    def __init__(self, user_agent: str, fetch: Fetch = http_get_json):
        self.user_agent, self.fetch = user_agent, fetch

    def geocode(self, query: str) -> Optional[Point]:
        params = {"q": query, "format": "jsonv2", "limit": "1", "countrycodes": "lk"}
        results = self.fetch(
            "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params),
            {"User-Agent": self.user_agent, "Accept-Language": "en"},
        )
        if not results:
            return None
        return Point(float(results[0]["lat"]), float(results[0]["lon"]))


class PhotonGeocoder:
    """Photon (komoot) - OpenStreetMap search that tolerates typos. Free, fair use."""

    name = "OpenStreetMap (Photon)"

    def __init__(self, user_agent: str, fetch: Fetch = http_get_json):
        self.user_agent, self.fetch = user_agent, fetch

    def geocode(self, query: str) -> Optional[Point]:
        params = {"q": query, "limit": "1", "lang": "en", "bbox": "79.5,5.85,81.95,9.85"}
        body = self.fetch("https://photon.komoot.io/api/?" + urllib.parse.urlencode(params), {"User-Agent": self.user_agent})
        features = body.get("features") or []
        if not features:
            return None
        longitude, latitude = features[0]["geometry"]["coordinates"][:2]
        return Point(float(latitude), float(longitude))


@dataclass
class Lookup:
    point: Optional[Point]
    source: str  # which service answered, "typed coordinates", "not found" or "failed: ..."


class ChainGeocoder:
    """Tries each query variant on each service until one finds the place."""

    def __init__(self, geocoders: Iterable[Geocoder], interval_s: float = 1.1, sleep=time.sleep, clock=time.monotonic):
        self.geocoders = list(geocoders)
        self.interval_s, self.sleep, self.clock = interval_s, sleep, clock
        self._last_call = float("-inf")
        self._cache: dict[str, Lookup] = {}

    def _throttle(self) -> None:
        wait = self._last_call + self.interval_s - self.clock()
        if wait > 0:
            self.sleep(wait)
        self._last_call = self.clock()

    def lookup(self, area: str) -> Lookup:
        typed = parse_coordinates(area)
        if typed:
            return Lookup(round_point(typed), "typed coordinates")
        key = normalise_area(area).lower()
        if key in self._cache:
            return self._cache[key]
        errors: list[str] = []
        answered = False
        result = Lookup(None, "not found")
        for query in geocode_queries(area):
            for geocoder in self.geocoders:
                self._throttle()
                try:
                    point = geocoder.geocode(query)
                except GeocodeError as error:
                    errors.append(f"{geocoder.name}: {error}")
                    continue
                answered = True
                if point and in_sri_lanka(point):
                    result = Lookup(round_point(point), geocoder.name)
                    break
            if result.point:
                break
        if not result.point and not answered and errors:
            result = Lookup(None, "failed: " + "; ".join(dict.fromkeys(errors)))
        self._cache[key] = result
        return result


def build_geocoder() -> ChainGeocoder:
    user_agent = os.environ.get("NOMINATIM_USER_AGENT") or "VocalImpactApp/1.0 (geocode script)"
    services: list[Geocoder] = []
    google_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    if google_key:
        services.append(GoogleGeocoder(google_key))
    services += [NominatimGeocoder(user_agent), PhotonGeocoder(user_agent)]
    return ChainGeocoder(services)


# ---------------------------------------------------------------------------
# Encryption (same format as src/shared/crypto/field-encryption.ts)
# ---------------------------------------------------------------------------

VERSION = "v1:"


def parse_encryption_key(raw: str) -> bytes:
    value = raw.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", value):
        key = bytes.fromhex(value)
    else:
        try:
            key = base64.b64decode(value, validate=True)
        except ValueError:
            key = b""
    if len(key) != 32:
        raise SystemExit("DATA_ENCRYPTION_KEY must be 32 bytes as base64 (the same key the app uses).")
    return key


class FieldCipher:
    """AES-256-GCM: "v1:" + base64url(iv[12] + ciphertext + tag[16]). Plaintext without "v1:" is legacy data."""

    def __init__(self, key: bytes):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # only needed for `db`

        self._aead = AESGCM(key)

    def encrypt(self, plaintext: str, iv: Optional[bytes] = None) -> str:
        iv = iv or secrets.token_bytes(12)
        sealed = self._aead.encrypt(iv, plaintext.encode("utf-8"), None)
        return VERSION + base64.urlsafe_b64encode(iv + sealed).decode("ascii").rstrip("=")

    def decrypt(self, stored: str) -> str:
        if not stored.startswith(VERSION):
            return stored
        body = stored[len(VERSION) :]
        data = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
        return self._aead.decrypt(data[:12], data[12:], None).decode("utf-8")


# ---------------------------------------------------------------------------
# CSV mode
# ---------------------------------------------------------------------------

LOCATION_HEADERS = [
    "Location(Nearerst Landmark)",
    "Location (Nearest Landmark)",
    "Nearest Landmark",
    "Location",
    "Which area do you live in?",
    "Area",
]
COORDINATES_HEADER = "Location Coordinates"


def normalise_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]", "", header.lower())


def find_location_column(headers: list[str], preferred: Optional[str] = None) -> Optional[str]:
    by_key = {normalise_header(h): h for h in headers}
    for alias in ([preferred] if preferred else []) + LOCATION_HEADERS:
        match = by_key.get(normalise_header(alias))
        if match and normalise_header(match) != normalise_header(COORDINATES_HEADER):
            return match
    return None


@dataclass
class CsvSummary:
    rows: int = 0
    located: int = 0
    already_had: int = 0
    blank: int = 0
    missing: list[str] = None  # type: ignore[assignment]

    def __post_init__(self):
        self.missing = self.missing or []


def geocode_csv(
    input_path: Path,
    output_path: Path,
    geocoder: ChainGeocoder,
    column: Optional[str] = None,
    log: Callable[[str], None] = print,
) -> CsvSummary:
    with input_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = list(reader.fieldnames or [])
        rows = list(reader)
    location_column = find_location_column(headers, column)
    if not location_column:
        raise SystemExit(f"No location column found. Columns: {', '.join(headers)}. Use --column to name it.")

    coordinates_column = next(
        (h for h in headers if normalise_header(h) == normalise_header(COORDINATES_HEADER)), COORDINATES_HEADER
    )
    if coordinates_column not in headers:
        headers.insert(headers.index(location_column) + 1, coordinates_column)

    summary = CsvSummary(rows=len(rows))
    for number, row in enumerate(rows, start=2):
        area = (row.get(location_column) or "").strip()
        existing = (row.get(coordinates_column) or "").strip()
        if existing and parse_coordinates(existing):
            summary.already_had += 1
            continue
        if not area:
            summary.blank += 1
            row[coordinates_column] = ""
            continue
        result = geocoder.lookup(area)
        if result.point:
            row[coordinates_column] = format_point(result.point)
            summary.located += 1
            log(f"  line {number}: {area!r} -> {format_point(result.point)} ({result.source})")
        else:
            row[coordinates_column] = ""
            summary.missing.append(f"line {number}: {area!r} ({result.source})")
            log(f"  line {number}: {area!r} -> {result.source}")

    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return summary


# ---------------------------------------------------------------------------
# Database mode
# ---------------------------------------------------------------------------


def database_url() -> str:
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Set DATABASE_URL (or DIRECT_URL) in .env or the environment.")
    # Prisma-only options (e.g. pgbouncer=true, schema=) are not understood by libpq.
    parts = urllib.parse.urlsplit(url)
    allowed = {"sslmode", "channel_binding", "connect_timeout", "options", "application_name"}
    query = urllib.parse.urlencode([(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if k in allowed])
    return urllib.parse.urlunsplit(parts._replace(query=query))


@dataclass
class DbSummary:
    checked: int = 0
    located: int = 0
    not_found: int = 0
    failed: int = 0


def geocode_database(
    geocoder: ChainGeocoder,
    cipher: FieldCipher,
    connection,
    retry_failed: bool = False,
    dry_run: bool = False,
    limit: Optional[int] = None,
    log: Callable[[str], None] = print,
) -> DbSummary:
    statuses = ["PENDING", "NOT_FOUND", "FAILED"] if retry_failed else ["PENDING"]
    sql = (
        'SELECT l."memberId", l."areaLabelEncrypted", m."firstName", m."lastName" '
        'FROM "member_location" l JOIN "member" m ON m."id" = l."memberId" '
        'WHERE l."geocodeStatus"::text = ANY(%s) ORDER BY m."firstName", m."lastName"'
    )
    params: list = [statuses]
    if limit:
        sql += " LIMIT %s"
        params.append(limit)
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        pending = cursor.fetchall()

    summary = DbSummary()
    for member_id, area_encrypted, first_name, last_name in pending:
        summary.checked += 1
        area = cipher.decrypt(area_encrypted)
        result = geocoder.lookup(area)
        name = f"{first_name} {last_name}"
        if result.point:
            summary.located += 1
            status, coordinates = "OK", cipher.encrypt(format_point(result.point, ","))
            log(f"  {name}: {area!r} -> {format_point(result.point)} ({result.source})")
        else:
            failed = result.source.startswith("failed")
            summary.failed += failed
            summary.not_found += not failed
            status, coordinates = ("FAILED" if failed else "NOT_FOUND"), None
            log(f"  {name}: {area!r} -> {result.source}")
        if dry_run:
            continue
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE "member_location" SET "coordinatesEncrypted" = COALESCE(%s, "coordinatesEncrypted"), '
                '"geocodeStatus" = %s::"GeocodeStatus", "updatedAt" = now() WHERE "memberId" = %s',
                [coordinates, status, member_id],
            )
        connection.commit()
    return summary


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------


def describe_services(geocoder: ChainGeocoder) -> str:
    names = [g.name for g in geocoder.geocoders]
    hint = "" if os.environ.get("GOOGLE_MAPS_API_KEY") else "  (set GOOGLE_MAPS_API_KEY to try Google Maps first)"
    return "Looking up with: " + " -> ".join(names) + hint


def main(argv: Optional[list[str]] = None) -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Find coordinates for Vocal Impact members' locations.")
    commands = parser.add_subparsers(dest="command", required=True)

    csv_cmd = commands.add_parser("csv", help="add a 'Location Coordinates' column to a Google Form CSV")
    csv_cmd.add_argument("input", type=Path)
    csv_cmd.add_argument("-o", "--output", type=Path, help="default: <input>-with-coordinates.csv")
    csv_cmd.add_argument("--column", help="name of the location column if it isn't detected")

    db_cmd = commands.add_parser("db", help="fill in coordinates for locations waiting in the database")
    db_cmd.add_argument("--retry-failed", action="store_true", help="also retry 'not found' / failed ones")
    db_cmd.add_argument("--dry-run", action="store_true", help="look up and print, but don't save")
    db_cmd.add_argument("--limit", type=int, help="only this many locations")

    lookup_cmd = commands.add_parser("lookup", help="look up one landmark and print its coordinates")
    lookup_cmd.add_argument("landmark")

    args = parser.parse_args(argv)
    geocoder = build_geocoder()
    print(describe_services(geocoder), file=sys.stderr)

    if args.command == "lookup":
        result = geocoder.lookup(args.landmark)
        if not result.point:
            print(f"{args.landmark!r}: {result.source}")
            return 1
        print(f"{format_point(result.point)}   ({result.source})")
        return 0

    if args.command == "csv":
        output = args.output or args.input.with_name(f"{args.input.stem}-with-coordinates.csv")
        summary = geocode_csv(args.input, output, geocoder, args.column)
        print(
            f"\n{summary.rows} rows: {summary.located} located, {summary.already_had} already had coordinates, "
            f"{summary.blank} without a location, {len(summary.missing)} not found."
        )
        if summary.missing:
            print("Not found (paste coordinates from Google Maps into the new column, or fix the landmark):")
            for line in summary.missing:
                print(f"  {line}")
        print(f"Saved: {output}")
        return 0

    try:
        import psycopg
    except ImportError:
        raise SystemExit("The db command needs: pip install -r scripts/geocode/requirements.txt")
    cipher = FieldCipher(parse_encryption_key(os.environ.get("DATA_ENCRYPTION_KEY", "")))
    with psycopg.connect(database_url()) as connection:
        summary = geocode_database(geocoder, cipher, connection, args.retry_failed, args.dry_run, args.limit)
    note = " (dry run - nothing saved)" if args.dry_run else ""
    print(
        f"\nChecked {summary.checked}: {summary.located} located, {summary.not_found} not found, "
        f"{summary.failed} failed{note}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
