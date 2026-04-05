function createDestinationId() {
  return `destination-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyDestination() {
  return {
    id: createDestinationId(),
    label: "",
    latitude: null,
    longitude: null,
  };
}

export function mapRecommendationModeToRouteType(mode) {
  if (mode === "public_transport") {
    return "pt";
  }

  if (mode === "taxi") {
    return "drive";
  }

  if (mode === "drive" || mode === "walk" || mode === "cycle" || mode === "pt") {
    return mode;
  }

  return "drive";
}

export function buildLegRecommendations(recommendation, routePreviewData) {
  if (!recommendation || !routePreviewData?.segments?.length) {
    return [];
  }

  return routePreviewData.segments.map((segment, index) => {
    const routeDetails = segment.route_details || null;

    return {
      segment_index: index + 1,
      origin: segment.from,
      destination: segment.to,
      recommended_mode: recommendation.recommended_mode,
      provider_mode: segment.provider_mode || routePreviewData.route_type || "fallback",
      justifications:
        index === routePreviewData.segments.length - 1
          ? recommendation.justifications || []
          : [],
      scores:
        index === routePreviewData.segments.length - 1
          ? recommendation.scores || null
          : null,
      route_preview: {
        route_type: routePreviewData.route_type,
        summary: {
          provider_mode: segment.provider_mode || routePreviewData.route_type || "fallback",
          route_type: routePreviewData.route_type,
          distance_m: segment.distance_m,
          duration_s: segment.duration_s,
          message:
            segment.fallback_reason && segment.fallback_reason !== "unknown"
              ? `Fallback route: ${segment.fallback_reason}.`
              : "",
        },
        details: routeDetails
          ? {
              ...routeDetails,
              segment_provider_mode:
                segment.provider_mode || routePreviewData.route_type || "fallback",
              fallback_reason:
                segment.fallback_reason && segment.fallback_reason !== "unknown"
                  ? segment.fallback_reason
                  : "",
            }
          : {
              route_origin: segment.from?.label || "",
              route_destination: segment.to?.label || "",
              segment_provider_mode:
                segment.provider_mode || routePreviewData.route_type || "fallback",
              fallback_reason:
                segment.fallback_reason && segment.fallback_reason !== "unknown"
                  ? segment.fallback_reason
                  : "",
            },
      },
    };
  });
}

export function buildLocationKey(location) {
  if (!location?.label) {
    return "";
  }

  return [location.label, location.latitude ?? "", location.longitude ?? ""].join("|");
}

export function findDuplicateLocations(origin, destinations) {
  const duplicateDestinations = {};
  let originError = "";

  const orderedStops = [
    { type: "origin", index: null, location: origin },
    ...destinations.map((destination, index) => ({
      type: "destination",
      index,
      location: destination,
    })),
  ];

  for (let index = 1; index < orderedStops.length; index += 1) {
    const previousStop = orderedStops[index - 1];
    const currentStop = orderedStops[index];
    const previousKey = buildLocationKey(previousStop.location);
    const currentKey = buildLocationKey(currentStop.location);

    if (!previousKey || !currentKey || previousKey !== currentKey) {
      continue;
    }

    if (previousStop.type === "origin") {
      originError = "Origin cannot be the same as the next destination.";
    } else {
      duplicateDestinations[previousStop.index] =
        "Consecutive stops cannot use the same address.";
    }

    if (currentStop.type === "destination") {
      duplicateDestinations[currentStop.index] =
        "Consecutive stops cannot use the same address.";
    }
  }

  return {
    hasDuplicates: Boolean(originError) || Object.keys(duplicateDestinations).length > 0,
    originError,
    duplicateDestinations,
  };
}

export function applyDuplicateErrors(origin, destinations, currentErrors) {
  const duplicateCheck = findDuplicateLocations(origin, destinations);

  if (!duplicateCheck.hasDuplicates) {
    return {
      ...currentErrors,
      origin:
        currentErrors.origin === "Origin cannot be the same as the next destination."
          ? ""
          : currentErrors.origin,
      destinations: Object.fromEntries(
        Object.entries(currentErrors.destinations || {}).filter(
          ([, message]) => message !== "Consecutive stops cannot use the same address.",
        ),
      ),
    };
  }

  const nextDestinationErrors = Object.fromEntries(
    Object.entries(currentErrors.destinations || {}).filter(
      ([, message]) => message !== "Consecutive stops cannot use the same address.",
    ),
  );

  Object.entries(duplicateCheck.duplicateDestinations).forEach(([index, message]) => {
    nextDestinationErrors[index] = message;
  });

  return {
    ...currentErrors,
    origin: duplicateCheck.originError || currentErrors.origin,
    destinations: nextDestinationErrors,
  };
}
