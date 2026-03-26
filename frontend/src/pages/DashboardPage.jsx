import { useEffect, useState } from "react";
import LocationInput from "../components/LocationInput";
import RouteMap from "../components/RouteMap";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const emptyDestination = { label: "", latitude: null, longitude: null };

export default function DashboardPage() {
  const { user } = useAuth();
  const [origin, setOrigin] = useState(null);
  const [destinations, setDestinations] = useState([{ ...emptyDestination }]);
  const [recommendation, setRecommendation] = useState(null);
  const [status, setStatus] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [currentLocationOption, setCurrentLocationOption] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ origin: "", destinations: {} });
  const [locatingOrigin, setLocatingOrigin] = useState(false);

  const detectCurrentLocation = (applyToOrigin = false) => {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not available in this browser. Please enter your origin manually.");
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

        let nextLocation = fallbackLocation;
        setCurrentLocationOption(fallbackLocation);

        try {
          const result = await api.get(
            `/locations/reverse-geocode/?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}`
          );
          nextLocation = {
            ...fallbackLocation,
            ...result,
            source: "current_location",
          };
          setCurrentLocationOption(nextLocation);
        } catch {
          setCurrentLocationOption(fallbackLocation);
        } finally {
          setLocatingOrigin(false);
        }

        if (applyToOrigin) {
          try {
            const validated = await api.post("/locations/validate/", {
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              label: nextLocation.label
            });
            setOrigin(validated.location);
            setFieldErrors((current) => ({ ...current, origin: "" }));
            setStatus("Current location applied to origin.");
          } catch {
            setFieldErrors((current) => ({ ...current, origin: "Invalid Address, try again" }));
            setStatus("Invalid Address, try again");
          }
        } else {
          setStatus("Current location detected. You can use the button again to set it as your origin.");
        }
      },
      () => {
        setLocatingOrigin(false);
        setStatus("Location permission denied. Please enter your origin manually.");
      }
    );
  };

  useEffect(() => {
    detectCurrentLocation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validDestinations = destinations.filter((item) => item?.label);

  const addDestination = () => {
    if (destinations.length < 3) {
      setDestinations((current) => [...current, { ...emptyDestination }]);
    }
  };

  const updateDestination = (index, value) =>
    setDestinations((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));

  const removeDestination = (index) => {
    setDestinations((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const runRecommendation = async () => {
    if (!origin?.label || validDestinations.length === 0) {
      setStatus("Please provide a valid origin and at least one destination.");
      return;
    }
    try {
      const data = await api.post("/recommendations/generate/", {
        origin,
        destinations: validDestinations,
        preference_mode: user?.profile?.preference_mode,
        max_walking_distance: user?.profile?.max_walking_distance
      });
      setRecommendation(data);
      setStatus(`Recommendation generated using ${data.provider_mode} transport data.`);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const recommendedRouteType = recommendation
    ? recommendation.recommended_mode === "public_transport"
      ? "pt"
      : recommendation.recommended_mode === "drive"
        ? "drive"
        : recommendation.recommended_mode === "taxi"
          ? "drive"
          : "walk"
    : "drive";

  const mapMarkers =
    recommendation?.recommended_mode === "drive"
      ? recommendation?.map_markers || []
      : (recommendation?.map_markers || []).filter((marker) => !["carpark", "best_carpark"].includes(marker.type));

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Main dashboard</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Build your route</h2>
          </div>
          <div className="rounded-full bg-brand-50 px-4 py-2 text-sm text-brand-700">
            Preference: {user?.profile?.preference_mode === "time" ? "Time priority" : "Cost priority"}
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">{status}</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <LocationInput
              label="Origin"
              value={origin}
              onChange={(next) => {
                setOrigin(next);
                setFieldErrors((current) => ({ ...current, origin: "" }));
              }}
              onClear={() => {
                setOrigin(null);
                setFieldErrors((current) => ({ ...current, origin: "" }));
              }}
              favourites={user?.favourite_locations || []}
              currentLocationOption={currentLocationOption}
              externalError={fieldErrors.origin}
            />
            <button
              type="button"
              className="rounded-full border border-brand-500 px-4 py-2 text-sm text-brand-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              onClick={() => detectCurrentLocation(true)}
              disabled={locatingOrigin}
            >
              {locatingOrigin ? "Getting current location..." : "Use current location"}
            </button>
            <div className="space-y-4">
              {destinations.map((destination, index) => (
                <div
                  key={`destination-${index}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === index) return;
                    setDestinations((current) => {
                      const next = [...current];
                      const [dragged] = next.splice(dragIndex, 1);
                      next.splice(index, 0, dragged);
                      return next;
                    });
                    setDragIndex(null);
                  }}
                  className="rounded-3xl border border-brand-100 bg-brand-50/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium text-ink">Destination {index + 1}</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        className="cursor-grab rounded-full bg-white px-3 py-1 text-xs text-slate-500 active:cursor-grabbing"
                      >
                        Drag to reorder
                      </button>
                      {destinations.length > 1 && (
                        <button type="button" className="text-sm text-red-600" onClick={() => removeDestination(index)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <LocationInput
                    label={`Address ${index + 1}`}
                    value={destination}
                    onChange={(value) => {
                      updateDestination(index, value);
                      setFieldErrors((current) => ({
                        ...current,
                        destinations: { ...current.destinations, [index]: "" }
                      }));
                    }}
                    onClear={() => {
                      updateDestination(index, { ...emptyDestination });
                      setFieldErrors((current) => ({
                        ...current,
                        destinations: { ...current.destinations, [index]: "" }
                      }));
                    }}
                    favourites={user?.favourite_locations || []}
                    externalError={fieldErrors.destinations[index]}
                  />
                </div>
              ))}
            </div>
            {destinations.length < 3 && (
              <button type="button" className="rounded-full border border-brand-500 px-5 py-3 text-sm text-brand-700" onClick={addDestination}>
                Add another destination
              </button>
            )}
            <button type="button" className="w-full rounded-2xl bg-ink px-5 py-4 font-medium text-white" onClick={runRecommendation}>
              Get recommendation
            </button>
          </div>
          <div className="rounded-[2rem] bg-ink p-6 text-white">
            {!recommendation ? (
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.3em] text-brand-100">Recommendation view</p>
                <h3 className="text-2xl font-semibold">Ready when you are</h3>
                <p className="text-slate-300">
                  Once a valid route is entered, GO-LAH will score Drive, Taxi and Public Transport using parking, taxi, traffic and weather inputs.
                </p>
              </div>
            ) : (
              <RecommendationPanel recommendation={recommendation} />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Map display</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">Route and nearby transport context</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {recommendation?.provider_mode && (
              <div className="rounded-full bg-brand-50 px-4 py-2 text-sm text-brand-700">
                Data mode: {recommendation.provider_mode}
              </div>
            )}
          </div>
        </div>
        <RouteMap
          origin={origin}
          destinations={validDestinations}
          markers={mapMarkers}
          routeType={recommendedRouteType}
        />
      </section>

      {!user?.is_guest && user?.favourite_locations?.length > 0 && (
        <section className="rounded-[2rem] bg-white/90 p-6 shadow-panel">
          <h3 className="text-xl font-semibold text-ink">Quick pick favourites</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {user.favourite_locations.map((fav) => (
              <button
                type="button"
                key={fav.id}
                className="rounded-3xl border border-brand-100 bg-brand-50 p-4 text-left"
                onClick={() =>
                  setDestinations((current) =>
                    current.map((item, index) =>
                      index === 0 ? { label: fav.address, latitude: fav.latitude, longitude: fav.longitude } : item
                    )
                  )
                }
              >
                <p className="font-medium text-ink">{fav.name}</p>
                <p className="mt-1 text-sm text-slate-600">{fav.address}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RecommendationPanel({ recommendation }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-100">Primary recommendation</p>
          <h3 className="mt-2 text-3xl font-semibold capitalize">{recommendation.recommended_mode.replace("_", " ")}</h3>
        </div>
        <span className="rounded-full bg-white/10 px-4 py-2 text-sm capitalize text-brand-100">
          {recommendation.provider_mode} data
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(recommendation.scores).map(([mode, score]) => (
          <div key={mode} className="rounded-3xl bg-white/10 p-4">
            <p className="text-sm capitalize text-brand-100">{mode.replace("_", " ")}</p>
            <p className="mt-2 text-3xl font-semibold">{score}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-brand-100">Why this was chosen</p>
        <div className="mt-3 space-y-2">
          {recommendation.justifications.map((item) => (
            <div key={item} className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-100">
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className={`grid gap-4 ${recommendation.recommended_mode === "drive" ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
        <div className="rounded-3xl bg-white/10 p-4">
          <p className="text-sm font-medium text-brand-100">Traffic snapshot</p>
          <p className="mt-2 text-sm text-slate-300">
            {recommendation.traffic.camera_location} · {recommendation.traffic.captured_at || "Latest available update"}
          </p>
          {recommendation.traffic.image_url ? (
            <img className="mt-4 rounded-2xl" src={recommendation.traffic.image_url} alt="Traffic snapshot" />
          ) : (
            <p className="mt-4 rounded-2xl bg-white/10 p-4 text-sm">Traffic image is currently unavailable. Please try again later.</p>
          )}
        </div>

        {recommendation.recommended_mode === "drive" && (
          <div className="rounded-3xl bg-white/10 p-4">
            <p className="text-sm font-medium text-brand-100">Filtered car parks</p>
            <div className="mt-4 space-y-3">
              {recommendation.carparks.map((carpark) => (
                <div key={`${carpark.name}-${carpark.latitude}`} className="rounded-2xl bg-white/10 p-3">
                  <p className="font-medium">{carpark.name}</p>
                  <p className="text-sm text-slate-300">
                    Lots Available: {carpark.available_lots}/{carpark.total_lots} ({Math.round(carpark.occupancy_rate * 100)}%) · {carpark.distance_m}m away
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-white/10 p-4">
        <p className="text-sm font-medium text-brand-100">Weather</p>
        <p className="mt-2 text-sm text-slate-300">
          {recommendation.weather.label}
          {recommendation.weather.area ? ` (${recommendation.weather.area})` : ""}
        </p>
      </div>
    </div>
  );
}
