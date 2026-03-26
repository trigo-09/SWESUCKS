import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";

import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: icon2x,
  iconUrl: icon,
  shadowUrl: shadow
});

function FitBounds({ markers, routeLine }) {
  const map = useMap();

  useEffect(() => {
    if (routeLine.length >= 2) {
      map.fitBounds(routeLine, { padding: [30, 30] });
      return;
    }
    if (markers.length > 0) {
      map.fitBounds(markers.map((item) => [item.latitude, item.longitude]), { padding: [30, 30] });
    }
  }, [map, markers, routeLine]);

  return null;
}

export default function RouteMap({ origin, destinations, markers = [], routeType = "drive" }) {
  const [routeLine, setRouteLine] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeDetails, setRouteDetails] = useState(null);

  const finalDestination = destinations?.[destinations.length - 1];

  useEffect(() => {
    const loadRoute = async () => {
      if (!origin || !finalDestination) {
        setRouteLine([]);
        setRouteInfo(null);
        setRouteDetails(null);
        return;
      }
      try {
        const data = await api.post("/locations/route-preview/", {
          origin,
          destination: finalDestination,
          route_type: routeType
        });
        setRouteLine(data.coords || []);
        setRouteInfo(data.summary || null);
        setRouteDetails(data.details || null);
      } catch {
        setRouteLine([
          [origin.latitude, origin.longitude],
          [finalDestination.latitude, finalDestination.longitude]
        ]);
        setRouteInfo({
          provider_mode: "fallback",
          route_type: routeType,
          distance_m: null,
          duration_s: null,
          message: "Route details are unavailable right now."
        });
        setRouteDetails({ provider_mode: "fallback" });
      }
    };
    loadRoute();
  }, [origin, finalDestination, routeType]);

  const mapMarkers = useMemo(() => {
    if (markers.length > 0) return markers;
    return [
      ...(origin ? [{ type: "origin", label: origin.label, latitude: origin.latitude, longitude: origin.longitude }] : []),
      ...(destinations || []).map((item, index) => ({
        type: "destination",
        label: item.label,
        latitude: item.latitude,
        longitude: item.longitude,
        sequence: index + 1
      }))
    ];
  }, [markers, origin, destinations]);

  return (
    <div className="space-y-4">
      <div className="h-[420px] overflow-hidden rounded-[2rem] border border-brand-100">
        <MapContainer center={[1.3521, 103.8198]} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <FitBounds markers={mapMarkers} routeLine={routeLine} />
          {mapMarkers.map((marker, index) => (
            <Marker key={`${marker.type}-${marker.label}-${index}`} position={[marker.latitude, marker.longitude]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{marker.label}</div>
                  <div className="capitalize text-slate-500">{marker.type.replace("_", " ")}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {routeLine.length >= 2 && <Polyline positions={routeLine} color="#12715d" weight={4} />}
        </MapContainer>
      </div>

      {routeInfo && (
        <div className="grid gap-3 rounded-[2rem] border border-brand-100 bg-brand-50/50 p-5 md:grid-cols-4">
          <InfoCard label="Route type" value={prettyRouteType(routeInfo.route_type)} />
          <InfoCard label="Distance" value={formatDistance(routeInfo.distance_m)} />
          <InfoCard label="Estimated duration" value={formatDuration(routeInfo.duration_s)} />
          <InfoCard label="Provider" value={routeInfo.provider_mode} />
          {routeInfo.message && (
            <div className="md:col-span-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
              {routeInfo.message}
            </div>
          )}
        </div>
      )}

      {routeDetails && (
        <div className="space-y-4 rounded-[2rem] border border-brand-100 bg-white p-5">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Route information</p>
            <h4 className="mt-2 text-xl font-semibold text-ink">OneMap route details</h4>
          </div>

          <KeyValueGrid title="Route summary" data={routeDetails.route_summary || { provider_mode: routeDetails.provider_mode }} />

          {Array.isArray(routeDetails.itineraries) && routeDetails.itineraries.length > 0 && (
            <PtItinerarySection itineraries={routeDetails.itineraries} />
          )}

          {Array.isArray(routeDetails.via_points) && routeDetails.via_points.length > 0 && (
            <Section title="Via points">
              <pre className="overflow-auto rounded-2xl bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(routeDetails.via_points, null, 2)}
              </pre>
            </Section>
          )}

          {Array.isArray(routeDetails.route_instructions) && routeDetails.route_instructions.length > 0 && (
            <Section title={`Route instructions (${routeDetails.route_instructions.length})`}>
              <div className="space-y-3">
                {routeDetails.route_instructions.map((instruction, index) => (
                  <div key={`${instruction.instruction}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-medium text-ink">{index + 1}. {instruction.instruction || "Instruction"}</div>
                    <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                      <MiniField label="Action" value={instruction.action} />
                      <MiniField label="Road" value={instruction.road} />
                      <MiniField label="Distance" value={instruction.distance_text} />
                      <MiniField label="Coordinate" value={instruction.coordinate} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <KeyValueGrid title="Additional fields" data={filterAdditionalFields(routeDetails)} />
        </div>
      )}
    </div>
  );
}

function filterAdditionalFields(details) {
  const clone = { ...details };
  delete clone.route_summary;
  delete clone.route_instructions;
  delete clone.via_points;
  delete clone.itineraries;
  delete clone.plan;
  return clone;
}

function prettyRouteType(routeType) {
  if (routeType === "drive") return "Drive";
  if (routeType === "walk") return "Walk";
  if (routeType === "cycle") return "Cycle";
  if (routeType === "pt") return "Public transport";
  return routeType;
}

function formatDistance(distanceM) {
  if (distanceM == null) return "Unavailable";
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`;
}

function formatDuration(durationS) {
  if (durationS == null) return "Unavailable";
  const minutes = Math.max(1, Math.round(durationS / 60));
  return `${minutes} min`;
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-brand-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-ink capitalize">{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h5 className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-500">{title}</h5>
      {children}
    </section>
  );
}

function MiniField({ label, value }) {
  return (
    <div>
      <div className="uppercase tracking-[0.15em] text-slate-400">{label}</div>
      <div className="mt-1 text-slate-700">{value || "-"}</div>
    </div>
  );
}

function KeyValueGrid({ title, data }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) return null;

  return (
    <Section title={title}>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-400">{formatKey(key)}</div>
            <div className="mt-2 break-words text-sm text-slate-700">
              {typeof value === "object" ? (
                <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre>
              ) : (
                String(value)
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function formatKey(key) {
  return key.replaceAll("_", " ");
}

function PtItinerarySection({ itineraries }) {
  return (
    <Section title={`Public transport itineraries (${itineraries.length})`}>
      <div className="space-y-4">
        {itineraries.map((itinerary, index) => (
          <div key={`itinerary-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">Itinerary {index + 1}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDuration(itinerary.duration)} total
                </div>
              </div>
              <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-4">
                <MiniField label="Fare" value={formatFare(itinerary.fare)} />
                <MiniField label="Transfers" value={itinerary.transfers ?? "-"} />
                <MiniField label="Walk distance" value={formatDistance(itinerary.walk_distance)} />
                <MiniField label="Waiting" value={formatDuration(itinerary.waiting_time)} />
              </div>
            </div>

            {Array.isArray(itinerary.legs) && itinerary.legs.length > 0 && (
              <div className="mt-4 space-y-3">
                {itinerary.legs.map((leg, legIndex) => (
                  <div key={`leg-${index}-${legIndex}`} className="rounded-2xl bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-ink">
                        {prettyLegMode(leg.mode)}
                        {leg.route ? ` ${leg.route}` : ""}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDuration(leg.duration)} • {formatDistance(leg.distance)}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {leg.from || "Origin"} to {leg.to || "Destination"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function prettyLegMode(mode) {
  const value = String(mode || "").toLowerCase();
  if (value === "walk") return "Walk";
  if (value === "bus") return "Bus";
  if (value === "rail" || value === "subway") return "Train";
  return formatKey(String(mode || "leg"));
}

function formatFare(fare) {
  if (fare == null || fare === "") return "Unavailable";
  const numericFare = Number(fare);
  return Number.isFinite(numericFare) ? `$${numericFare.toFixed(2)}` : String(fare);
}
