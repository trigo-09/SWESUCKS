from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.recommendations.services import (
    generate_leg_recommendation,
    generate_recommendation,
)


class RecommendationViewBlackBoxTests(TestCase):
    """
    Black-box tests for the Recommendation Controller.

    These tests focus only on request input -> response output behavior.
    Internal service logic is not considered here.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = "/api/v1/recommendations/generate/"

        self.user = User.objects.create_user(
            email="tester@example.com",
            password="testpass123",
            username="tester",
            is_verified=True,
        )
        self.client.force_authenticate(user=self.user)

        self.valid_origin = {
            "label": "NUS",
            "latitude": 1.2966,
            "longitude": 103.7764,
        }

        self.valid_destination = {
            "label": "Orchard",
            "latitude": 1.3048,
            "longitude": 103.8318,
        }

        self.valid_payload = {
            "origin": self.valid_origin,
            "destinations": [self.valid_destination],
            "preference_mode": "cost",
            "max_walking_distance": "500",
        }

    @patch("apps.recommendations.views.generate_recommendation")
    def test_bb_ec_valid_request_returns_200(self, mock_generate):
        """
        Equivalence class:
        valid request with all required fields present
        """
        mock_generate.return_value = {
            "recommended_mode": "drive",
            "scores": {
                "drive": 80.0,
                "taxi": 30.0,
                "public_transport": 20.0,
            },
        }

        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["recommended_mode"], "drive")

    def test_bb_ec_missing_origin_returns_400(self):
        """
        Equivalence class:
        invalid request with missing required field 'origin'
        """
        payload = {
            "destinations": [self.valid_destination],
            "preference_mode": "cost",
            "max_walking_distance": "500",
        }

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("origin", response.data["errors"])

    def test_bb_ec_empty_destination_list_returns_400(self):
        """
        Equivalence class:
        invalid request with empty destination list
        """
        payload = {
            "origin": self.valid_origin,
            "destinations": [],
            "preference_mode": "cost",
            "max_walking_distance": "500",
        }

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("destinations", response.data["errors"])

    def test_bb_ec_invalid_coordinate_type_returns_400(self):
        """
        Equivalence class:
        invalid request with malformed latitude type
        """
        payload = {
            "origin": {
                "label": "NUS",
                "latitude": "not-a-number",
                "longitude": 103.7764,
            },
            "destinations": [self.valid_destination],
            "preference_mode": "cost",
            "max_walking_distance": "500",
        }

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, 400)

    def test_bb_bva_zero_destinations_returns_400(self):
        """
        Boundary value:
        just below the minimum valid number of destinations
        """
        payload = {
            "origin": self.valid_origin,
            "destinations": [],
            "preference_mode": "cost",
            "max_walking_distance": "500",
        }

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, 400)

    @patch("apps.recommendations.views.generate_recommendation")
    def test_bb_bva_one_destination_returns_200(self, mock_generate):
        """
        Boundary value:
        minimum valid number of destinations
        """
        mock_generate.return_value = {
            "recommended_mode": "public_transport",
            "scores": {
                "drive": 20.0,
                "taxi": 30.0,
                "public_transport": 75.0,
            },
        }

        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["recommended_mode"], "public_transport")

    @patch("apps.recommendations.views.generate_recommendation")
    def test_bb_controller_returns_500_if_service_fails(self, mock_generate):
        """
        Robustness case:
        valid input but service layer crashes
        """
        mock_generate.side_effect = Exception("Service failure")

        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Service failure")


class GenerateLegRecommendationWhiteBoxTests(TestCase):
    """
    White-box tests for generate_leg_recommendation().

    These tests cover basis paths, including:
    - exception path (no carparks)
    - normal success path
    - defect-revealing paths for partial snapshot data
    """

    def setUp(self):
        self.origin = {
            "label": "NUS",
            "latitude": 1.2966,
            "longitude": 103.7764,
        }
        self.destination = {
            "label": "Orchard",
            "latitude": 1.3048,
            "longitude": 103.8318,
        }

    @patch("apps.recommendations.services.is_public_transport_available")
    @patch("apps.recommendations.services.get_transport_snapshot")
    def test_wb_leg_path_no_carparks_raises_runtime_error(
        self, mock_snapshot, mock_pt
    ):
        """
        Basis path:
        snapshot available -> no carparks -> RuntimeError
        """
        mock_snapshot.return_value = {
            "provider_mode": "live",
            "carparks": [],
            "taxis_available": 3,
            "traffic": {
                "status": "available",
                "camera_location": "Orchard",
                "image_url": None,
                "captured_at": None,
            },
            "weather": {
                "label": "Cloudy",
                "bad_weather": False,
                "area": "City",
                "updated_at": None,
            },
        }
        mock_pt.return_value = {
            "available": True,
            "route": {"segments": []},
            "fallback_reason": None,
        }

        with self.assertRaises(RuntimeError) as exc:
            generate_leg_recommendation(
                self.origin,
                self.destination,
                preference_mode="cost",
                max_walking_distance="500",
            )

        self.assertEqual(
            str(exc.exception),
            "No car parks available near this destination.",
        )

    @patch("apps.recommendations.services.build_route")
    @patch("apps.recommendations.services.is_public_transport_available")
    @patch("apps.recommendations.services.get_transport_snapshot")
    def test_wb_leg_path_normal_success_drive_selected(
        self, mock_snapshot, mock_pt, mock_build_route
    ):
        """
        Basis path:
        snapshot available -> carparks available -> PT unavailable
        -> normal success path
        """
        mock_snapshot.return_value = {
            "provider_mode": "live",
            "carparks": [
                {
                    "name": "ION Carpark",
                    "latitude": 1.3050,
                    "longitude": 103.8320,
                    "total_lots": 100,
                    "available_lots": 80,
                    "distance_m": 100,
                    "occupancy_rate": 0.8,
                }
            ],
            "taxis_available": 1,
            "traffic": {
                "status": "available",
                "camera_location": "Orchard",
                "image_url": None,
                "captured_at": None,
            },
            "weather": {
                "label": "Cloudy",
                "bad_weather": False,
                "area": "City",
                "updated_at": None,
            },
        }

        mock_pt.return_value = {
            "available": False,
            "route": {"segments": []},
            "fallback_reason": "PT unavailable",
        }

        mock_build_route.side_effect = [
            {
                "route_type": "drive",
                "coords": [[1.2966, 103.7764], [1.3048, 103.8318]],
                "summary": {"distance": 5000, "duration": 900},
                "details": {"route_details": {"provider_mode": "live"}},
            },
            {
                "route_type": "drive",
                "coords": [[1.3048, 103.8318], [1.3050, 103.8320]],
                "summary": {"distance": 100, "duration": 60},
                "details": {"route_details": {"provider_mode": "live"}},
            },
        ]

        result = generate_leg_recommendation(
            self.origin,
            self.destination,
            preference_mode="cost",
            max_walking_distance="500",
        )

        self.assertEqual(result["recommended_mode"], "drive")
        self.assertEqual(result["provider_mode"], "live")
        self.assertFalse(result["public_transport_available"])
        self.assertEqual(result["best_carpark"]["name"], "ION Carpark")
        self.assertIn("drive", result["scores"])

    @patch("apps.recommendations.services.build_route")
    @patch("apps.recommendations.services.is_public_transport_available")
    @patch("apps.recommendations.services.get_transport_snapshot")
    def test_wb_leg_path_missing_traffic_status_reveals_keyerror(
        self, mock_snapshot, mock_pt, mock_build_route
    ):
        """
        Defect-revealing basis path:
        snapshot missing traffic.status -> KeyError during justification building
        """
        mock_snapshot.return_value = {
            "provider_mode": "live",
            "carparks": [
                {
                    "name": "ION Carpark",
                    "latitude": 1.3050,
                    "longitude": 103.8320,
                    "total_lots": 100,
                    "available_lots": 80,
                    "distance_m": 100,
                    "occupancy_rate": 0.8,
                }
            ],
            "taxis_available": 1,
            "traffic": {
                "camera_location": "Orchard",
                "image_url": None,
                "captured_at": None,
            },
            "weather": {
                "label": "Cloudy",
                "bad_weather": False,
                "area": "City",
                "updated_at": None,
            },
        }

        mock_pt.return_value = {
            "available": False,
            "route": {"segments": []},
            "fallback_reason": "PT unavailable",
        }

        mock_build_route.side_effect = [
            {
                "route_type": "drive",
                "coords": [[1.2966, 103.7764], [1.3048, 103.8318]],
                "summary": {"distance": 5000, "duration": 900},
                "details": {"route_details": {"provider_mode": "live"}},
            },
            {
                "route_type": "drive",
                "coords": [[1.3048, 103.8318], [1.3050, 103.8320]],
                "summary": {"distance": 100, "duration": 60},
                "details": {"route_details": {"provider_mode": "live"}},
            },
        ]

        with self.assertRaises(KeyError) as exc:
            generate_leg_recommendation(
                self.origin,
                self.destination,
                preference_mode="cost",
                max_walking_distance="500",
            )

        self.assertEqual(str(exc.exception), "'status'")

    @patch("apps.recommendations.services.build_route")
    @patch("apps.recommendations.services.is_public_transport_available")
    @patch("apps.recommendations.services.get_transport_snapshot")
    def test_wb_leg_path_missing_weather_label_reveals_keyerror(
        self, mock_snapshot, mock_pt, mock_build_route
    ):
        """
        Defect-revealing basis path:
        snapshot missing weather.label -> KeyError during justification building
        """
        mock_snapshot.return_value = {
            "provider_mode": "live",
            "carparks": [
                {
                    "name": "Wheelock Carpark",
                    "latitude": 1.3049,
                    "longitude": 103.8321,
                    "total_lots": 100,
                    "available_lots": 60,
                    "distance_m": 120,
                    "occupancy_rate": 0.6,
                }
            ],
            "taxis_available": 8,
            "traffic": {
                "status": "available",
                "camera_location": "Orchard",
                "image_url": None,
                "captured_at": None,
            },
            "weather": {
                "bad_weather": True,
                "area": "City",
                "updated_at": None,
            },
        }

        mock_pt.return_value = {
            "available": True,
            "route": {"segments": [{"provider_mode": "live"}]},
            "fallback_reason": None,
        }

        mock_build_route.side_effect = [
            {
                "route_type": "drive",
                "coords": [[1.2966, 103.7764], [1.3048, 103.8318]],
                "summary": {"distance": 5000, "duration": 900},
                "details": {"route_details": {"provider_mode": "live"}},
            },
            {
                "route_type": "drive",
                "coords": [[1.3048, 103.8318], [1.3049, 103.8321]],
                "summary": {"distance": 120, "duration": 80},
                "details": {"route_details": {"provider_mode": "live"}},
            },
        ]

        with self.assertRaises(KeyError) as exc:
            generate_leg_recommendation(
                self.origin,
                self.destination,
                preference_mode="time",
                max_walking_distance="500",
            )

        self.assertEqual(str(exc.exception), "'label'")


class GenerateRecommendationWhiteBoxTests(TestCase):
    """
    White-box tests for generate_recommendation().

    These tests cover:
    - single-leg aggregation path
    - multi-leg mixed-provider aggregation path
    - failure propagation path
    """

    def setUp(self):
        self.origin = {
            "label": "NUS",
            "latitude": 1.2966,
            "longitude": 103.7764,
        }
        self.dest1 = {
            "label": "Orchard",
            "latitude": 1.3048,
            "longitude": 103.8318,
        }
        self.dest2 = {
            "label": "Marina Bay",
            "latitude": 1.2823,
            "longitude": 103.8586,
        }

    def fake_leg_result(
        self,
        origin,
        destination,
        recommended_mode="drive",
        provider_mode="live",
        drive=80.0,
        taxi=30.0,
        pt=20.0,
        pt_available=True,
        segment_index=1,
    ):
        return {
            "provider_mode": provider_mode,
            "origin": origin,
            "destination": destination,
            "recommended_mode": recommended_mode,
            "scores": {
                "drive": drive,
                "taxi": taxi,
                "public_transport": pt,
            },
            "raw_scores": {
                "drive": drive,
                "taxi": taxi,
                "public_transport": pt,
            },
            "justifications": [f"Leg {segment_index} justification"],
            "traffic": {},
            "weather": {},
            "carparks": [],
            "best_carpark": None,
            "public_transport_available": pt_available,
            "public_transport_route": {"segments": []},
            "public_transport_fallback_reason": None,
            "route_preview": {},
            "best_carpark_route": {},
        }

    @patch("apps.recommendations.services.generate_leg_recommendation")
    def test_wb_generate_single_leg_aggregation(self, mock_leg):
        """
        Basis path:
        one-leg trip -> single aggregation result
        """
        mock_leg.return_value = self.fake_leg_result(
            self.origin,
            self.dest1,
            recommended_mode="drive",
            provider_mode="live",
            drive=80.0,
            taxi=20.0,
            pt=10.0,
            segment_index=1,
        )

        result = generate_recommendation(
            self.origin,
            [self.dest1],
            preference_mode="cost",
            max_walking_distance="500",
        )

        self.assertEqual(result["recommended_mode"], "drive")
        self.assertEqual(result["scores"]["drive"], 80.0)
        self.assertEqual(len(result["leg_recommendations"]), 1)
        self.assertEqual(result["provider_mode"], "live")

    @patch("apps.recommendations.services.generate_leg_recommendation")
    def test_wb_generate_multi_leg_mixed_provider_aggregation(self, mock_leg):
        """
        Basis path:
        multi-leg trip -> average scores -> mixed provider result
        """
        leg1 = self.fake_leg_result(
            self.origin,
            self.dest1,
            recommended_mode="drive",
            provider_mode="live",
            drive=80.0,
            taxi=20.0,
            pt=10.0,
            pt_available=True,
            segment_index=1,
        )
        leg2 = self.fake_leg_result(
            self.dest1,
            self.dest2,
            recommended_mode="taxi",
            provider_mode="fallback",
            drive=20.0,
            taxi=90.0,
            pt=30.0,
            pt_available=False,
            segment_index=2,
        )
        mock_leg.side_effect = [leg1, leg2]

        result = generate_recommendation(
            self.origin,
            [self.dest1, self.dest2],
            preference_mode="time",
            max_walking_distance="500",
        )

        self.assertEqual(result["provider_mode"], "mixed")
        self.assertEqual(result["scores"]["drive"], 50.0)
        self.assertEqual(result["scores"]["taxi"], 55.0)
        self.assertEqual(result["recommended_mode"], "taxi")
        self.assertEqual(len(result["leg_recommendations"]), 2)
        self.assertFalse(result["public_transport_available"])

    @patch("apps.recommendations.services.generate_leg_recommendation")
    def test_wb_generate_leg_failure_propagates(self, mock_leg):
        """
        Basis path:
        leg generation fails -> exception propagates
        """
        mock_leg.side_effect = RuntimeError("Leg generation failed")

        with self.assertRaises(RuntimeError) as exc:
            generate_recommendation(
                self.origin,
                [self.dest1],
                preference_mode="cost",
                max_walking_distance="500",
            )

        self.assertEqual(str(exc.exception), "Leg generation failed")