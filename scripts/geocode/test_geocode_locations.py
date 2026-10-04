"""Tests for geocode_locations.py - no network or database needed.

    python -m unittest discover -s scripts/geocode -v
"""

import csv
import tempfile
import unittest
from pathlib import Path

import geocode_locations as g

TEST_KEY = "dGVzdC1vbmx5LWtleS1kby1ub3QtdXNlLWFueXdoZXI="
# Produced by the app (src/shared/crypto/field-encryption.test.ts): both must agree.
KNOWN_VECTOR = ("v1:AAECAwQFBgcICQoL3uDtZIB3Vbo8t_lOiFE7h4pNn5Zw2lrmQN_vIQ", "+94771234567")


class FakeGeocoder:
    def __init__(self, name, answers, error=None):
        self.name, self.answers, self.error, self.queries = name, answers, error, []

    def geocode(self, query):
        self.queries.append(query)
        if self.error:
            raise g.GeocodeError(self.error)
        return self.answers.get(query.lower())


def chain(*geocoders):
    return g.ChainGeocoder(geocoders, interval_s=0, sleep=lambda _: None)


class CoordinatesTest(unittest.TestCase):
    def test_parses_google_maps_coordinates(self):
        self.assertEqual(g.parse_coordinates("6.8953861, 79.8556737"), g.Point(6.8953861, 79.8556737))
        self.assertEqual(g.parse_coordinates("(6.9 79.86)"), g.Point(6.9, 79.86))
        self.assertIsNone(g.parse_coordinates("Kohuwala"))
        self.assertIsNone(g.parse_coordinates("100, 200"))

    def test_rounds_like_the_app_and_formats_like_javascript(self):
        self.assertEqual(g.round_point(g.Point(6.8665, 79.8774999)), g.Point(6.867, 79.877))
        self.assertEqual(g.format_point(g.Point(6.87, 80.0)), "6.87, 80")
        self.assertEqual(g.format_point(g.Point(6.866, 79.877), ","), "6.866,79.877")


class QueriesTest(unittest.TestCase):
    def test_cleans_up_landmarks(self):
        self.assertEqual(g.normalise_area("near Kohuwala Jn"), "Kohuwala junction")
        self.assertEqual(
            g.geocode_queries("Arpico, Dehiwala"),
            ["Arpico, Dehiwala", "Arpico, Dehiwala, Sri Lanka", "Arpico", "Dehiwala"],
        )


class ChainGeocoderTest(unittest.TestCase):
    def test_google_first_then_openstreetmap(self):
        google = FakeGeocoder("Google", {})
        osm = FakeGeocoder("OSM", {"kohuwala junction": g.Point(6.86645, 79.88512)})
        result = chain(google, osm).lookup("Kohuwala Jn")
        self.assertEqual(result, g.Lookup(g.Point(6.866, 79.885), "OSM"))
        self.assertEqual(google.queries[0], "Kohuwala junction")

    def test_typed_coordinates_need_no_lookup_and_answers_are_cached(self):
        osm = FakeGeocoder("OSM", {"dehiwala": g.Point(6.851, 79.865)})
        geocoder = chain(osm)
        self.assertEqual(geocoder.lookup("6.8664, 79.8774").source, "typed coordinates")
        geocoder.lookup("Dehiwala")
        geocoder.lookup(" dehiwala ")
        self.assertEqual(osm.queries, ["Dehiwala"])

    def test_ignores_answers_outside_sri_lanka(self):
        result = chain(FakeGeocoder("OSM", {"london": g.Point(51.5, -0.12)})).lookup("London")
        self.assertIsNone(result.point)
        self.assertEqual(result.source, "not found")

    def test_reports_failure_only_when_no_service_answered(self):
        down = FakeGeocoder("Google", {}, error="REQUEST_DENIED")
        self.assertTrue(chain(down).lookup("Somewhere").source.startswith("failed: Google: REQUEST_DENIED"))
        self.assertEqual(chain(down, FakeGeocoder("OSM", {})).lookup("Somewhere").source, "not found")


class ServiceAdaptersTest(unittest.TestCase):
    def test_google_restricts_to_sri_lanka_and_raises_on_refusal(self):
        seen = []

        def fetch(url, headers):
            seen.append(url)
            return {"status": "OK", "results": [{"geometry": {"location": {"lat": 6.85, "lng": 79.86}}}]}

        self.assertEqual(g.GoogleGeocoder("k", fetch).geocode("Arpico"), g.Point(6.85, 79.86))
        self.assertIn("components=country%3ALK", seen[0])
        self.assertIsNone(g.GoogleGeocoder("k", lambda u, h: {"status": "ZERO_RESULTS"}).geocode("x"))
        with self.assertRaises(g.GeocodeError):
            g.GoogleGeocoder("k", lambda u, h: {"status": "REQUEST_DENIED"}).geocode("x")

    def test_nominatim_and_photon(self):
        nominatim = g.NominatimGeocoder("ua", lambda u, h: [{"lat": "6.9", "lon": "79.8"}])
        self.assertEqual(nominatim.geocode("x"), g.Point(6.9, 79.8))
        photon = g.PhotonGeocoder("ua", lambda u, h: {"features": [{"geometry": {"coordinates": [79.8, 6.9]}}]})
        self.assertEqual(photon.geocode("x"), g.Point(6.9, 79.8))


class CsvTest(unittest.TestCase):
    def test_adds_a_coordinates_column_next_to_the_location(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder, "form.csv")
            source.write_text(
                "\ufeffTimestamp,First Name,Location(Nearerst Landmark),Dietary Preferences\n"
                "1,Nimal,Kohuwala junction,Vegetarian\n"
                "2,Sara,,\n"
                "3,Tharu,\"6.9, 79.86\",\n"
                "4,Kamal,Atlantis,\n",
                encoding="utf-8",
            )
            target = Path(folder, "out.csv")
            osm = FakeGeocoder("OSM", {"kohuwala junction": g.Point(6.8664, 79.8774)})
            summary = g.geocode_csv(source, target, chain(osm), log=lambda _: None)

            with target.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.reader(handle))
            self.assertEqual(
                rows[0], ["Timestamp", "First Name", "Location(Nearerst Landmark)", "Location Coordinates", "Dietary Preferences"]
            )
            self.assertEqual([row[3] for row in rows[1:]], ["6.866, 79.877", "", "6.9, 79.86", ""])
            self.assertEqual((summary.located, summary.blank, len(summary.missing)), (2, 1, 1))


class CipherTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.cipher = g.FieldCipher(g.parse_encryption_key(TEST_KEY))
        except ImportError:
            raise unittest.SkipTest("pip install -r scripts/geocode/requirements.txt")

    def test_reads_what_the_app_writes(self):
        stored, plaintext = KNOWN_VECTOR
        self.assertEqual(self.cipher.decrypt(stored), plaintext)
        self.assertEqual(self.cipher.encrypt(plaintext, bytes(range(12))), stored)

    def test_round_trip_and_legacy_plaintext(self):
        sealed = self.cipher.encrypt("6.866,79.877")
        self.assertTrue(sealed.startswith("v1:"))
        self.assertEqual(self.cipher.decrypt(sealed), "6.866,79.877")
        self.assertEqual(self.cipher.decrypt("Nugegoda"), "Nugegoda")

    def test_rejects_bad_keys(self):
        with self.assertRaises(SystemExit):
            g.parse_encryption_key("short")


class DatabaseUrlTest(unittest.TestCase):
    def test_drops_prisma_only_options(self):
        import os

        os.environ["DIRECT_URL"] = "postgresql://u:p@host/db?sslmode=require&pgbouncer=true&connection_limit=1"
        try:
            self.assertEqual(g.database_url(), "postgresql://u:p@host/db?sslmode=require")
        finally:
            del os.environ["DIRECT_URL"]


if __name__ == "__main__":
    unittest.main()
