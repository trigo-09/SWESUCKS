import { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: icon2x,
  iconUrl: icon,
  shadowUrl: shadow
});

const BEST_CARPARK_ICON = L.divIcon({
  className: "best-carpark-marker",
  html: `
    <div style="
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      background: #dc2626;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.28);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    ">P</div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

const CARPARK_ICON = L.divIcon({
  className: "carpark-marker",
  html: `
    <div style="
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      background: #0f766e;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
    ">P</div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

const ROUTE_COLORS = [
  "#1d4ed8",

];

const SINGAPORE_BOUNDS = [
  [1.20, 103.60],
  [1.48, 104.05],
];

function getRouteColor(segmentIndex) {
  if (!Number.isFinite(segmentIndex)) {
    return ROUTE_COLORS[0];
  }

  return ROUTE_COLORS[(Math.max(1, segmentIndex) - 1) % ROUTE_COLORS.length];
}

function getSegmentColor(segment) {
  if (segment?.variant === "best_carpark") {
    return segment.color || "#dc2626";
  }

  return getRouteColor(segment?.index);
}

function getMarkerIcon(markerType) {
  if (markerType === "best_carpark") {
    return BEST_CARPARK_ICON;
  }

  if (markerType === "carpark") {
    return CARPARK_ICON;
  }

  return undefined;
}

function FitBounds({ markers, routeLine, isMobile }) {
  const map = useMap();
  const lastBoundsKeyRef = useRef("");
  const mobileFitView = useMemo(
    () => ({
      paddingTopLeft: [72, 72],
      paddingBottomRight: [72, 120],
      animate: false,
    }),
    [],
  );
  const desktopSingaporeView = useMemo(
    () => ({
      paddingTopLeft: [360, 48],
      paddingBottomRight: [16, 48],
      maxZoom: 10.5,
      animate: false,
    }),
    [],
  );

  useEffect(() => {
    if (routeLine.length >= 2) {
      const routeBoundsPoints = [
        ...routeLine,
        ...markers
          .filter(
            (item) =>
              Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
          )
          .map((item) => [item.latitude, item.longitude]),
      ];
      const routeKey = routeBoundsPoints.map((point) => point.join(",")).join("|");
      if (lastBoundsKeyRef.current === routeKey) {
        return;
      }
      lastBoundsKeyRef.current = routeKey;

      if (isMobile) {
        map.fitBounds(routeBoundsPoints, mobileFitView);
      } else {
        const viewportWidth =
          typeof window !== "undefined" ? window.innerWidth : map.getSize().x;
        const headerOverlayWidth = Math.round(viewportWidth * 0.36);
        const panelOverlayWidth = 118 + 430 + 24;
        const desktopFitView = {
          paddingTopLeft: [Math.max(headerOverlayWidth, panelOverlayWidth), 132],
          paddingBottomRight: [56, 72],
          maxZoom: 17,
          animate: false,
        };

        map.fitBounds(routeBoundsPoints, desktopFitView);
      }
      return;
    }
    if (markers.length > 0) {
      const markerPoints = markers.map((item) => [item.latitude, item.longitude]);
      const markerKey = markerPoints.map((point) => point.join(",")).join("|");
      if (lastBoundsKeyRef.current === markerKey) {
        return;
      }
      lastBoundsKeyRef.current = markerKey;

      if (isMobile) {
        map.fitBounds(markerPoints, mobileFitView);
      } else if (markerPoints.length === 1) {
        map.setView(markerPoints[0], 17, { animate: false });
      } else {
        map.fitBounds(SINGAPORE_BOUNDS, desktopSingaporeView);
      }
    }
  }, [desktopSingaporeView, isMobile, map, markers, mobileFitView, routeLine]);

  return null;
}

function MapClickSelector({ activeSelectionTarget, onMapSelect }) {
  useMapEvents({
    click(event) {
      if (!activeSelectionTarget || !onMapSelect) {
        return;
      }

      onMapSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function MapResizeFix() {
  const map = useMap();

  useEffect(() => {
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 220);

    return () => clearTimeout(timeout);
  }, [map]);

  return null;
}

function DefaultCenterView({ center, zoom, hasActiveView }) {
  const map = useMap();

  useEffect(() => {
    if (hasActiveView) {
      return;
    }

    map.setView(center, zoom, { animate: false });
  }, [center, hasActiveView, map, zoom]);

  return null;
}

export default function RouteMap({
  origin,
  destinations,
  markers = [],
  segmentRoutes = [],
  activeSelectionTarget = "",
  onMapSelect = null,
  isMobile = false,
}) {
  const defaultZoom = isMobile ? 10.4 : 10.5;
  const defaultCenter = useMemo(
    () => (isMobile ? [1.3521, 103.8198] : [1.3521, 102.5898]),
    [isMobile],
  );
  
  const activeSegmentLines = useMemo(
    () => segmentRoutes.filter((segment) => Array.isArray(segment.coords) && segment.coords.length >= 2),
    [segmentRoutes],
  );
  const displayRouteLine = useMemo(
    () => activeSegmentLines.flatMap((segment) => segment.coords),
    [activeSegmentLines],
  );

  const mapMarkers = useMemo(() => {
    if (markers.length > 0) {
      return markers;
    }

    return [
      ...(origin
        ? [
            {
              type: "origin",
              label: origin.label,
              latitude: origin.latitude,
              longitude: origin.longitude,
            },
          ]
        : []),
      ...(destinations || []).map((item, index) => ({
        type: "destination",
        label: item.label,
        latitude: item.latitude,
        longitude: item.longitude,
        sequence: index + 1,
      })),
    ];
  }, [markers, origin, destinations]);

  const hasActiveView = displayRouteLine.length >= 2 || mapMarkers.length > 0;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        minZoom={10}
        zoomControl={false}
        maxBounds={[
          [1.10, 103.1],
          [1.60, 104.5] 
        ]}
        maxBoundsViscosity={1.0}
        className="h-full w-full"
      >
        
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <ZoomControl position="topright" />
        <MapResizeFix />
        <DefaultCenterView
          center={defaultCenter}
          zoom={defaultZoom}
          hasActiveView={hasActiveView}
        />
        <MapClickSelector
          activeSelectionTarget={activeSelectionTarget}
          onMapSelect={onMapSelect}
        />
        <FitBounds
          markers={mapMarkers}
          routeLine={displayRouteLine}
          isMobile={isMobile}
        />

        {mapMarkers.map((marker, index) => (
          <Marker
            key={`${marker.type}-${marker.label}-${index}`}
            position={[marker.latitude, marker.longitude]}
            {...(getMarkerIcon(marker?.type)
              ? { icon: getMarkerIcon(marker.type) }
              : {})}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{marker.label}</div>
                <div className="capitalize text-slate-500">
                  {marker.type.replace("_", " ")}
                </div>
                {marker.destination_label && (
                  <div className="mt-1 text-xs text-slate-500">
                    Destination {marker.sequence}: {marker.destination_label}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {activeSegmentLines.map((segment) => (
          <Polyline
            key={`segment-${segment.variant || "main"}-${segment.index}-${segment.origin}-${segment.destination}`}
            positions={segment.coords}
            color={getSegmentColor(segment)}
            weight={5}
            opacity={0.92}
          />
        ))}

      </MapContainer>

      {activeSelectionTarget && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-[500] -translate-x-1/2 px-3">
          <div className="rounded-full border border-blue-200 bg-white/96 px-4 py-2 text-sm font-medium text-blue-700 shadow-lg backdrop-blur">
            Click on the map to select{" "}
            {activeSelectionTarget === "origin"
              ? "the origin"
              : `destination ${Number(activeSelectionTarget.split("-")[1]) + 1}`}
          </div>
        </div>
      )}
    </div>
  );
}
