import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {useLocation, useNavigate} from 'react-router-dom'
import LocationInput from "../components/LocationInput";
import RouteMap from "../components/RouteMap";
import {
  DestinationCardPreview,
  JourneyLegCard,
  MapSectionCard,
  RecommendationPanel,
  RouteDetailsPanel,
  RouteSummaryGrid,
  SortableDestinationCard,
} from "../components/DashboardSections";
import { api } from "../api/client";
import { useAuth } from "../context/useAuth";
import {
  applyDuplicateErrors,
  buildLegRecommendations,
  buildLocationKey,
  createEmptyDestination,
  findDuplicateLocations,
  mapRecommendationModeToRouteType,
} from "../utils/tripPlanning";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  MapPin,
  LocateFixed,
  Plus,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [origin, setOrigin] = useState(null);
  const [originDraft, setOriginDraft] = useState("");
  const [destinations, setDestinations] = useState([createEmptyDestination()]);
  const [destinationDrafts, setDestinationDrafts] = useState([""]);
  const [recommendation, setRecommendation] = useState(null);
  const [routePreviewData, setRoutePreviewData] = useState(null);
  const [status, setStatus] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ origin: "", destinations: {} });
  const [locatingOrigin, setLocatingOrigin] = useState(false);

  const [activeSelectionTarget, setActiveSelectionTarget] = useState("");
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isDesktopWide, setIsDesktopWide] = useState(false);
  const [isRouteInfoExpanded, setIsRouteInfoExpanded] = useState(false);
  const [isGeneratingRecommendation, setIsGeneratingRecommendation] = useState(false);
  const [expandedLegIndex, setExpandedLegIndex] = useState(null);
  const [dashboardPreferenceMode, setDashboardPreferenceMode] = useState(
    user?.profile?.preference_mode || "cost",
  );
  const [dashboardMaxWalkingDistance, setDashboardMaxWalkingDistance] = useState(
    user?.profile?.max_walking_distance || "500",
  );
  const [activeDragId, setActiveDragId] = useState(null);

  const previousDesktopWideRef = useRef(null);
  const processedRerunKeyRef = useRef("");
  const recommendationSectionRef = useRef(null);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const validDestinations = useMemo(
    () => destinations.filter((item) => item?.label),
    [destinations],
  );

  const duplicateCheck = useMemo(
    () => findDuplicateLocations(origin, destinations),
    [destinations, origin],
  );

  const areAllDestinationFieldsFilled = useMemo(
    () => destinations.length > 0 && destinations.every((item) => Boolean(item?.label)),
    [destinations],
  );

  const canGenerateRecommendation =
    Boolean(origin?.label) && areAllDestinationFieldsFilled && !duplicateCheck.hasDuplicates;

  useEffect(() => {
    setFieldErrors((current) => applyDuplicateErrors(origin, destinations, current));
  }, [destinations, origin]);

  const detectCurrentLocation = (applyToOrigin = false) => {
    if (!navigator.geolocation) {
      setStatus(
        "Geolocation is not available in this browser. Please enter your origin manually.",
      );
      return;
    }

    setLocatingOrigin(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const fallbackLocation = {
          label: `Current location (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "current_location",
        };

        if (applyToOrigin) {
          setOrigin(fallbackLocation);
          setOriginDraft(fallbackLocation.label);
          setFieldErrors((current) => ({ ...current, origin: "" }));
          setStatus("Current coordinates detected. Resolving address...");
        }

        let nextLocation = fallbackLocation;

        try {
          const result = await api.get(
            `/locations/reverse-geocode/?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}`,
          );

          nextLocation = {
            ...fallbackLocation,
            ...result,
            source: "current_location",
          };
        } finally {
          setLocatingOrigin(false);
        }

        if (applyToOrigin) {
          try {
            const data = await api.post("/locations/validate/", {
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              label: nextLocation.label,
            });

            setOrigin(data.location);
            setOriginDraft(data.location.label);
            setFieldErrors((current) => ({ ...current, origin: "" }));
            setStatus("Current location applied to origin.");
          } catch {
            setOrigin(nextLocation);
            setOriginDraft(nextLocation.label);
            setFieldErrors((current) => ({ ...current, origin: "" }));
            setStatus("Current coordinates applied. Address validation is unavailable right now.");
          }
        } else {
          setStatus(
            "Current location detected. You can use the button again to set it as your origin.",
          );
        }
      },
      () => {
        setLocatingOrigin(false);
        setStatus("Location permission denied. Please enter your origin manually.");
      },
    );
  };

  useEffect(() => {
    setDashboardPreferenceMode(user?.profile?.preference_mode || "cost");
    setDashboardMaxWalkingDistance(user?.profile?.max_walking_distance || "500");
  }, [user?.profile?.preference_mode, user?.profile?.max_walking_distance]);

  useEffect(() => {
    setIsRouteInfoExpanded(false);
    setExpandedLegIndex(null);
  }, [recommendation]);

  useEffect(() => {
    const syncViewport = () => {
      //const mobile = window.innerWidth < 768;
      const desktopWide = window.innerWidth >= 1280;
      //setIsMobile(mobile);
      setIsDesktopWide(desktopWide);

      if (previousDesktopWideRef.current === true && desktopWide === false) {
        setIsPanelExpanded(false);
      }

      previousDesktopWideRef.current = desktopWide;
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const addDestination = () => {
    if (destinations.length < 3) {
      setDestinations((current) => [...current, createEmptyDestination()]);
      setDestinationDrafts((current) => [...current, ""]);
    }
  };

  const updateDestination = (index, value) => {
    setDestinations((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...value,
              id: item.id,
            }
          : item,
      ),
    );

    setDestinationDrafts((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? value?.label || "" : item)),
    );
  };

  const removeDestination = (index) => {
    setDestinations((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setDestinationDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setFieldErrors((current) => ({
      ...current,
      destinations: {},
    }));

    if (activeSelectionTarget === `destination-${index}`) {
      setActiveSelectionTarget("");
    }
  };

  const handleMapSelect = async ({ latitude, longitude }) => {
    if (!activeSelectionTarget) {
      return;
    }

    try {
      let resolvedLabel = "Selected location";

      try {
        const reverseGeocoded = await api.get(
          `/locations/reverse-geocode/?latitude=${latitude}&longitude=${longitude}`,
        );
        if (reverseGeocoded?.label) {
          resolvedLabel = reverseGeocoded.label;
        }
      } catch {
        // Fall back to generic label.
      }

      const validated = await api.post("/locations/validate/", {
        latitude,
        longitude,
        label: resolvedLabel,
        strict: true,
      });

      const selectedLocation = validated.location;

      if (activeSelectionTarget === "origin") {
        setOrigin(selectedLocation);
        setOriginDraft(selectedLocation.label);
        setFieldErrors((current) =>
          applyDuplicateErrors(selectedLocation, destinations, { ...current, origin: "" }),
        );
        setStatus(`Origin updated from map: ${selectedLocation.label}`);
      } else if (activeSelectionTarget.startsWith("destination-")) {
        const index = Number(activeSelectionTarget.split("-")[1]);
        const nextDestinations = destinations.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...selectedLocation,
                id: item.id,
              }
            : item,
        );

        updateDestination(index, selectedLocation);
        setFieldErrors((current) =>
          applyDuplicateErrors(origin, nextDestinations, {
            ...current,
            destinations: { ...current.destinations, [index]: "" },
          }),
        );
        setStatus(`Destination ${index + 1} updated from map: ${selectedLocation.label}`);
      }

      setActiveSelectionTarget("");

      if (!isDesktopWide){ //isMobile) {
        setIsPanelExpanded(true);
      }
    } catch {
      if (activeSelectionTarget === "origin") {
        setFieldErrors((current) => ({
          ...current,
          origin: "Invalid address, try again",
        }));
      } else if (activeSelectionTarget.startsWith("destination-")) {
        const index = Number(activeSelectionTarget.split("-")[1]);
        setFieldErrors((current) => ({
          ...current,
          destinations: {
            ...current.destinations,
            [index]: "Invalid address, try again",
          },
        }));
      }

      setActiveSelectionTarget("");
      setStatus(
        "Invalid address from map selection. Type the address manually or start map selection again.",
      );

      if (!isDesktopWide){ //isMobile) {
        setIsPanelExpanded(true);
      }
    }
  };

  const runRecommendation = useCallback(
    async (overrideOrigin = null, overrideDestinations = null) => {
      let requestOrigin = overrideOrigin || origin;
      let requestDestinations = overrideDestinations || validDestinations;

      if (!requestOrigin?.label && originDraft.trim()) {
        try {
          const validatedOrigin = await api.post("/locations/validate/", {
            label: originDraft.trim(),
          });
          requestOrigin = validatedOrigin.location;
          setOrigin(validatedOrigin.location);
          setOriginDraft(validatedOrigin.location.label);
          setFieldErrors((current) => ({ ...current, origin: "" }));
        } catch {
          requestOrigin = null;
        }
      }

      if (!overrideDestinations) {
        const nextDestinations = [...requestDestinations];

        for (let index = 0; index < destinations.length; index += 1) {
          if (nextDestinations[index]?.label) {
            continue;
          }

          const draftValue = destinationDrafts[index]?.trim();
          if (!draftValue) {
            continue;
          }

          try {
            const validatedDestination = await api.post("/locations/validate/", {
              label: draftValue,
            });

            nextDestinations[index] = validatedDestination.location;
            updateDestination(index, validatedDestination.location);
            setFieldErrors((current) => ({
              ...current,
              destinations: { ...current.destinations, [index]: "" },
            }));
          } catch {
            // Keep invalid.
          }
        }

        requestDestinations = nextDestinations.filter((item) => item?.label);
      }

      if (!requestOrigin?.label || requestDestinations.length === 0) {
        setFieldErrors((current) => ({
          ...current,
          origin: requestOrigin?.label ? current.origin : "Please choose a valid origin.",
          destinations:
            requestDestinations.length > 0
              ? current.destinations
              : { ...current.destinations, 0: "Please choose at least one valid destination." },
        }));
        setStatus("Please provide a valid origin and at least one destination.");
        recommendationSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      const duplicateResult = findDuplicateLocations(requestOrigin, requestDestinations);
      if (duplicateResult.hasDuplicates) {
        setFieldErrors((current) => ({
          ...current,
          origin: duplicateResult.originError || current.origin,
          destinations: {
            ...current.destinations,
            ...duplicateResult.duplicateDestinations,
          },
        }));
        setStatus("Duplicate addresses are not allowed. Choose different locations.");
        recommendationSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      try {
        setIsGeneratingRecommendation(true);
        setStatus("Generating recommendation...");
        setRecommendation(null);
        setRoutePreviewData(null);

        const data = await api.post("/recommendations/generate/", {
          origin: requestOrigin,
          destinations: requestDestinations,
          preference_mode: dashboardPreferenceMode,
          max_walking_distance: dashboardMaxWalkingDistance,
        });

        const routeType = mapRecommendationModeToRouteType(data.recommended_mode);

        try {
          const routeData = await api.post("/locations/route-preview/", {
            origin: requestOrigin,
            destinations: requestDestinations,
            route_type: routeType,
          });
          setRoutePreviewData(routeData);
        } catch {
          setRoutePreviewData(null);
        }

        setRecommendation(data);
        setStatus(`Recommendation generated using ${data.provider_mode} transport data.`);
      } catch (error) {
        setStatus(error.message || "Unable to generate recommendation.");
      } finally {
        setIsGeneratingRecommendation(false);
        requestAnimationFrame(() => {
          recommendationSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    },
    [
      dashboardMaxWalkingDistance,
      dashboardPreferenceMode,
      destinationDrafts,
      destinations.length,
      origin,
      originDraft,
      validDestinations,
    ],
  );

  useEffect(() => {
    const rerunOrigin = location.state?.rerunOrigin;
    const rerunDestinations = location.state?.rerunDestinations;
    const rerunHistoryId = location.state?.rerunHistoryId;

    if (!rerunOrigin || !Array.isArray(rerunDestinations) || rerunDestinations.length === 0) {
      return;
    }

    const rerunKey = `${rerunHistoryId || "adhoc"}:${rerunOrigin.label}:${rerunDestinations
      .map((item) => item.label)
      .join("|")}`;

    if (processedRerunKeyRef.current === rerunKey) {
      return;
    }

    processedRerunKeyRef.current = rerunKey;
    setOrigin(rerunOrigin);
    setOriginDraft(rerunOrigin.label);
    setDestinations(
      rerunDestinations.map((item) => ({
        id: createDestinationId(),
        ...item,
      })),
    );
    setDestinationDrafts(rerunDestinations.map((item) => item.label || ""));
    setRecommendation(null);
    setStatus("Re-running recommendation with your current settings...");
    setFieldErrors({ origin: "", destinations: {} });
    setActiveSelectionTarget("");
    setIsPanelExpanded(true);

    runRecommendation(rerunOrigin, rerunDestinations);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate, runRecommendation]);

  const mapMarkers = useMemo(() => {
    const liveFormMarkers = [
      ...(origin?.label
        ? [
            {
              type: "origin",
              label: origin.label,
              latitude: origin.latitude,
              longitude: origin.longitude,
            },
          ]
        : []),
      ...validDestinations.map((destination, index) => ({
        type: "destination",
        label: destination.label,
        latitude: destination.latitude,
        longitude: destination.longitude,
        sequence: index + 1,
      })),
    ];

    if (!recommendation?.map_markers?.length) {
      return liveFormMarkers;
    }

    const isDrive = recommendation.recommended_mode === "drive";

    const decorationMarkers = recommendation.map_markers.filter((marker) => {
      if (["origin", "destination"].includes(marker.type)) {
        return false;
      }

      if (["carpark", "best_carpark"].includes(marker.type)) {
        return isDrive;
      }

      return true;
    });

    return [...liveFormMarkers, ...decorationMarkers];
  }, [origin, recommendation, validDestinations]);

  const segmentRoutes = useMemo(() => {
    const routes =
      Array.isArray(recommendation?.segment_routes) &&
      recommendation.segment_routes.length > 0
        ? recommendation.segment_routes
        : routePreviewData?.segments || [];

    if (recommendation?.recommended_mode !== "drive") {
      return routes.filter((segment) => segment?.variant !== "best_carpark");
    }

    return routes;
  }, [recommendation, routePreviewData]);


  const legRecommendations = useMemo(() => {
    if (
      Array.isArray(recommendation?.leg_recommendations) &&
      recommendation.leg_recommendations.length > 0
    ) {
      return recommendation.leg_recommendations;
    }

    return buildLegRecommendations(recommendation, routePreviewData);
  }, [recommendation, routePreviewData]);

  const mobileSummary =
    recommendation?.recommended_mode
      ? `${recommendation.recommended_mode.replace("_", " ")} recommended`
      : validDestinations.length > 0
        ? `${validDestinations.length} destination${validDestinations.length > 1 ? "s" : ""} selected`
        : "Add a route to get started";

  const routePreview = useMemo(() => {
    if (!recommendation) {
      return null;
    }

    if (
      Array.isArray(recommendation.leg_recommendations) &&
      recommendation.leg_recommendations.length === 1
    ) {
      const singleLeg = recommendation.leg_recommendations[0];
      if (singleLeg?.route_preview) {
        return {
          summary: singleLeg.route_preview.summary || null,
          details: singleLeg.route_preview.details || null,
          routeType: singleLeg.route_preview.route_type || null,
        };
      }
    }

    if (!routePreviewData) {
      return null;
    }

    const publicTransportRoute = recommendation.public_transport_route;
    const isSingleLeg = legRecommendations.length === 1;
    const usePublicTransportDetails =
      isSingleLeg &&
      recommendation.recommended_mode === "public_transport" &&
      publicTransportRoute?.summary;

    if (usePublicTransportDetails) {
      return {
        summary: publicTransportRoute.summary || null,
        details: publicTransportRoute.details || null,
        routeType: publicTransportRoute.route_type || null,
      };
    }

    const backendRouteDetails = Array.isArray(routePreviewData.route_details)
      ? routePreviewData.route_details[0] || null
      : routePreviewData.route_details || null;

    return {
      summary: backendRouteDetails
        ? {
            provider_mode:
              backendRouteDetails.provider_mode ||
              (routePreviewData.segments.some((segment) => segment.provider_mode === "live")
                ? "live"
                : "fallback"),
            route_type: backendRouteDetails.route_type || routePreviewData.route_type,
            distance_m:
              backendRouteDetails.route_summary?.total_distance ?? routePreviewData.total_distance_m,
            duration_s:
              backendRouteDetails.route_summary?.total_time ?? routePreviewData.total_duration_s,
            message: `${routePreviewData.num_stops} stop${routePreviewData.num_stops === 1 ? "" : "s"} in this trip.`,
          }
        : {
            provider_mode: routePreviewData.segments.some((segment) => segment.provider_mode === "live")
              ? "live"
              : "fallback",
            route_type: routePreviewData.route_type,
            distance_m: routePreviewData.total_distance_m,
            duration_s: routePreviewData.total_duration_s,
            message: `${routePreviewData.num_stops} stop${routePreviewData.num_stops === 1 ? "" : "s"} in this trip.`,
          },
      details: {
        ...(backendRouteDetails || {}),
        segments: routePreviewData.segments,
        total_distance_m: routePreviewData.total_distance_m,
        total_duration_s: routePreviewData.total_duration_s,
        num_stops: routePreviewData.num_stops,
      },
      routeType: routePreviewData.route_type,
    };
  }, [legRecommendations.length, recommendation, routePreviewData]);

  const expandedLeg = useMemo(
    () =>
      legRecommendations.find((leg) => leg.segment_index === expandedLegIndex) || null,
    [expandedLegIndex, legRecommendations],
  );

  useEffect(() => {
    if (!recommendation) {
      return;
    }

    const currentOriginKey = buildLocationKey(origin);
    const recommendationOriginKey = buildLocationKey(recommendation.origin);
    const currentDestinationKeys = validDestinations.map(buildLocationKey).join("::");
    const recommendationDestinationKeys = (recommendation.destinations || [])
      .map(buildLocationKey)
      .join("::");

    if (
      currentOriginKey !== recommendationOriginKey ||
      currentDestinationKeys !== recommendationDestinationKeys
    ) {
      setRecommendation(null);
      setRoutePreviewData(null);
      setIsRouteInfoExpanded(false);
      setStatus("Route cleared. Generate a new recommendation for the updated markers.");
    }
  }, [origin, recommendation, validDestinations]);

  const activeDragDestination = useMemo(
    () => destinations.find((item) => item.id === activeDragId) || null,
    [activeDragId, destinations],
  );

  return (
  <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <RouteMap
          origin={origin}
          destinations={validDestinations}
          markers={mapMarkers}
          segmentRoutes={segmentRoutes}
          activeSelectionTarget={activeSelectionTarget}
          onMapSelect={handleMapSelect}
          isMobile={!isDesktopWide}
        />
      </div>

      <section
        className={`absolute z-[1000] rounded-[1rem] border border-slate-200/90 bg-white/94 shadow-2xl backdrop-blur transition-all duration-300 ${
          isPanelExpanded
            ? "bottom-[140px] left-3 right-3 h-[69vh] overflow-visible md:h-[52vh] xl:bottom-4 xl:left-[118px] xl:right-auto xl:top-24 xl:h-auto xl:w-[430px]"
            : "bottom-[140px] left-3 right-3 h-[78px] overflow-hidden xl:bottom-4 xl:left-[118px] xl:right-auto xl:top-24 xl:h-auto xl:w-[78px]"
        }`}
      >
        {isPanelExpanded ? (
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setRecommendation(null);
                    setRoutePreviewData(null);
                    setStatus("Recommendation cleared.");
                  }}
                  className="rounded-full border border-slate-200 bg-white p-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Clear
                </button>

                <select
                  className="rounded-full border border-slate-200 bg-white p-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  value={dashboardPreferenceMode}
                  onChange={(event) => setDashboardPreferenceMode(event.target.value)}
                >
                  <option value="cost">Cost priority</option>
                  <option value="time">Time priority</option>
                </select>

                <select
                  className="rounded-full border border-slate-200 bg-white p-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  value={dashboardMaxWalkingDistance}
                  onChange={(event) => setDashboardMaxWalkingDistance(event.target.value)}
                >
                  <option value="200">Less than 200m</option>
                  <option value="500">Less than 500m</option>
                  <option value="1000">Less than 1km</option>
                  <option value="2000">Less than 2km</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsPanelExpanded(false)}
                className="hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-100 active:scale-95 xl:flex"
              >
                ←
              </button>

              <button
                type="button"
                onClick={() => setIsPanelExpanded(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-100 active:scale-95 xl:hidden"
              >
                ↓
              </button>
            </div>

            <div className={expandedLeg ? "min-h-0 flex-1" : "flex-1 overflow-y-auto"}>
              <div className={`px-4 py-4 sm:px-5 ${expandedLeg ? "h-full" : ""}`}>
                {expandedLeg ? (
                  <MapSectionCard
                    title={`Leg ${expandedLeg.segment_index} details`}
                    subtitle="Expanded recommendation view"
                    className="flex h-full min-h-0 flex-col overflow-hidden"
                    trailing={
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                        onClick={() => setExpandedLegIndex(null)}
                      >
                        Minimise
                      </button>
                    }
                  >
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <JourneyLegCard
                        leg={expandedLeg}
                        expanded={true}
                        fillContainer={true}
                        onToggleExpand={() => setExpandedLegIndex(null)}
                      />
                    </div>
                  </MapSectionCard>
                ) : (
                  <div className="space-y-4">
                    <MapSectionCard
                      title="Origin"
                      subtitle="Pick where your trip starts"
                      trailing={
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => detectCurrentLocation(true)}
                          disabled={locatingOrigin}
                        >
                          <LocateFixed size={14} />
                          {locatingOrigin ? "Locating..." : "Your location"}
                        </button>
                      }
                    >
                      <LocationInput
                        value={origin}
                        onInteract={() => {
                          if (activeSelectionTarget === "origin") {
                            setActiveSelectionTarget("");
                          }
                          setFieldErrors((current) => ({ ...current, origin: "" }));
                        }}
                        onChange={(next) => {
                          setOrigin(next);
                          setOriginDraft(next?.label || "");
                          setFieldErrors((current) => ({ ...current, origin: "" }));
                        }}
                        onClear={() => {
                          setOrigin(null);
                          setOriginDraft("");
                          setFieldErrors((current) => ({ ...current, origin: "" }));
                        }}
                        onQueryChange={setOriginDraft}
                        favourites={user?.favourite_locations || []}
                        externalError={fieldErrors.origin}
                      />

                      <button
                        type="button"
                        className={`mt-3 flex items-center gap-1 rounded-full border px-4 py-2 text-sm transition ${
                          activeSelectionTarget === "origin"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          const nextTarget = activeSelectionTarget === "origin" ? "" : "origin";
                          setActiveSelectionTarget(nextTarget);

                          if (!isDesktopWide && nextTarget) {  //isMobile && nextTarget) {
                            setIsPanelExpanded(false);
                          }
                        }}
                      >
                        <MapPin size={14} />
                        {activeSelectionTarget === "origin"
                          ? "Cancel map selection"
                          : "Pick on map"}
                      </button>
                    </MapSectionCard>

                    <MapSectionCard
                      title="Destination"
                      subtitle="Add up to 3 destinations and drag to reorder them"
                      trailing={
                        destinations.length < 3 ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            onClick={addDestination}
                          >
                            <Plus size={14} />
                            Add stop
                          </button>
                        ) : null
                      }
                    >
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={({ active }) => {
                          setActiveDragId(active.id);
                        }}
                        onDragEnd={({ active, over }) => {
                          setActiveDragId(null);

                          if (!over || active.id === over.id) {
                            return;
                          }

                          const oldIndex = destinations.findIndex((item) => item.id === active.id);
                          const newIndex = destinations.findIndex((item) => item.id === over.id);

                          if (oldIndex === -1 || newIndex === -1) {
                            return;
                          }

                          setDestinations((current) => arrayMove(current, oldIndex, newIndex));
                          setDestinationDrafts((current) => arrayMove(current, oldIndex, newIndex));
                          setFieldErrors((current) => ({
                            ...current,
                            destinations: {},
                          }));
                          setActiveSelectionTarget("");
                        }}
                        onDragCancel={() => {
                          setActiveDragId(null);
                        }}
                      >
                        <SortableContext
                          items={destinations.map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-4">
                            {destinations.map((destination, index) => (
                              <SortableDestinationCard
                                key={destination.id}
                                id={destination.id}
                                index={index}
                                destination={destination}
                                destinationsLength={destinations.length}
                                activeSelectionTarget={activeSelectionTarget}
                                favourites={user?.favourite_locations || []}
                                fieldError={fieldErrors.destinations[index]}
                                onRemove={() => removeDestination(index)}
                                onInteract={() => {
                                  if (activeSelectionTarget === `destination-${index}`) {
                                    setActiveSelectionTarget("");
                                  }
                                  setFieldErrors((current) => ({
                                    ...current,
                                    destinations: { ...current.destinations, [index]: "" },
                                  }));
                                }}
                                onChange={(value) => {
                                  updateDestination(index, value);
                                  setFieldErrors((current) => ({
                                    ...current,
                                    destinations: { ...current.destinations, [index]: "" },
                                  }));
                                }}
                                onClear={() => {
                                  setDestinations((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            label: "",
                                            latitude: null,
                                            longitude: null,
                                          }
                                        : item,
                                    ),
                                  );
                                  setDestinationDrafts((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? "" : item,
                                    ),
                                  );
                                  setFieldErrors((current) => ({
                                    ...current,
                                    destinations: { ...current.destinations, [index]: "" },
                                  }));
                                }}
                                onQueryChange={(nextQuery) =>
                                  setDestinationDrafts((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? nextQuery : item,
                                    ),
                                  )
                                }
                                onPickMap={() => {
                                  const nextTarget =
                                    activeSelectionTarget === `destination-${index}`
                                      ? ""
                                      : `destination-${index}`;

                                  setActiveSelectionTarget(nextTarget);

                                  if (!isDesktopWide && nextTarget) { //isMobile && nextTarget) {
                                    setIsPanelExpanded(false);
                                  }
                                }}
                              />
                            ))}
                          </div>
                        </SortableContext>

                        <DragOverlay>
                          {activeDragDestination ? (
                            <DestinationCardPreview
                              index={
                                destinations.findIndex((item) => item.id === activeDragId) + 1
                              }
                              destination={activeDragDestination}
                            />
                          ) : null}
                        </DragOverlay>
                      </DndContext>

                      <button
                        type="button"
                        className="mt-4 w-full rounded-[1.5rem] bg-brand-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-100"
                        onClick={runRecommendation}
                        disabled={isGeneratingRecommendation || !canGenerateRecommendation}
                      >
                        {isGeneratingRecommendation ? "Generating..." : "Get recommendation"}
                      </button>

                      {!canGenerateRecommendation && (
                        <p className="mt-3 text-xs text-slate-500">
                          Select one valid origin, fill in every destination field, and avoid
                          consecutive duplicate addresses.
                        </p>
                      )}
                    </MapSectionCard>

                    {(recommendation && <MapSectionCard
                      title="Recommendation"
                      subtitle="A live summary that stays close to the map"
                      cardRef={recommendationSectionRef}
                    >
                      <RecommendationPanel recommendation={recommendation} />
                      {/* {!recommendation ? (
                        <div className="rounded-[1.6rem] bg-slate-50 p-4">
                          <h2 className="text-xl font-semibold text-slate-900">
                            {isGeneratingRecommendation ? "Working on it..." : "Ready when you are"}
                          </h2>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {isGeneratingRecommendation
                              ? "Pulling the latest route, parking, taxi, traffic and weather inputs now."
                              : "Once you enter a valid origin and destination, GO-LAH will compare Drive, Taxi and Public Transport using parking, taxi, traffic and weather inputs."}
                          </p>
                        </div>
                      ) : (
                        <RecommendationPanel recommendation={recommendation} />
                      )} */}
                    </MapSectionCard>)}

                    {legRecommendations.length > 0 && (
                      <MapSectionCard
                        title="Trip-by-trip breakdown"
                        subtitle="Each leg gets its own recommendation and route details"
                      >
                        <div className="space-y-4">
                          {legRecommendations.map((leg) => (
                            <JourneyLegCard
                              key={`leg-${leg.segment_index}`}
                              leg={leg}
                              expanded={expandedLegIndex === leg.segment_index}
                              onToggleExpand={() =>
                                setExpandedLegIndex((current) =>
                                  current === leg.segment_index ? null : leg.segment_index,
                                )
                              }
                            />
                          ))}
                        </div>
                      </MapSectionCard>
                    )}

                    {/*{routePreview?.summary && (
                      <MapSectionCard
                        title="Route info"
                        subtitle="Expand for the full route summary and step details"
                        trailing={
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            onClick={() => setIsRouteInfoExpanded((current) => !current)}
                          >
                            {isRouteInfoExpanded ? "Minimise" : "Expand"}
                          </button>
                        }
                      >
                        <RouteSummaryGrid summary={routePreview.summary} />

                        {routePreview.summary.message && (
                          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            {routePreview.summary.message}
                          </div>
                        )}

                        {isRouteInfoExpanded && routePreview.details && (
                          <div className="mt-4 max-h-[38vh] overflow-y-auto pr-1">
                            <RouteDetailsPanel
                              details={routePreview.details}
                              routeType={routePreview.routeType}
                            />
                          </div>
                        )}
                      </MapSectionCard>
                    )} */} 
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-between gap-3 px-4 py-3 xl:flex-col xl:items-center xl:justify-between xl:px-0 xl:py-4">
            {!isDesktopWide ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    Route Planner
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-800">
                    {mobileSummary}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPanelExpanded(true)}
                  className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-brand-700"
                >
                  Open
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsPanelExpanded(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-100 active:scale-95"
                >
                  →
                </button>

                <div className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400 xl:pl-80">
                  Route Planner
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <div
        className={`absolute right-3 z-[1000] flex flex-col gap-3 xl:bottom-6 xl:right-4 ${
          !isDesktopWide
            ? isPanelExpanded
              ? "bottom-[calc(52vh+108px)] md:bottom-[calc(52vh+96px)]"
              : "bottom-[176px] md:bottom-[160px]"
            : "bottom-[96px]"
        }`}
      />
    </div>
  );
}

