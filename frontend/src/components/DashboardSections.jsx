import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin } from "lucide-react";
import {
  displayValue,
  formatDistance,
  formatDuration,
  formatFare,
  prettyModeLabel,
  prettyRouteType,
} from "../utils/formatters";
import LocationInput from "./LocationInput";

export function SortableDestinationCard({
  id,
  index,
  destination,
  destinationsLength,
  activeSelectionTarget,
  favourites,
  fieldError,
  onRemove,
  onInteract,
  onChange,
  onClear,
  onQueryChange,
  onPickMap,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">Destination {index + 1}</p>
          <p className="text-xs text-slate-500">Search or choose from the map</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex touch-none items-center cursor-grab rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm active:cursor-grabbing"
            aria-label={`Drag destination ${index + 1}`}
          >
            <GripVertical size={14} />
            Drag
          </button>

          {destinationsLength > 1 && (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <LocationInput
        value={destination}
        onInteract={onInteract}
        onChange={onChange}
        onClear={onClear}
        onQueryChange={onQueryChange}
        favourites={favourites}
        externalError={fieldError}
      />

      <button
        type="button"
        className={`mt-3 flex items-center gap-1 rounded-full border px-4 py-2 text-sm transition ${
          activeSelectionTarget === `destination-${index}`
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 text-slate-600 hover:bg-slate-100"
        }`}
        onClick={onPickMap}
      >
        <MapPin size={14} />
        {activeSelectionTarget === `destination-${index}`
          ? "Cancel map selection"
          : "Pick on map"}
      </button>
    </div>
  );
}

export function DestinationCardPreview({ index, destination }) {
  return (
    <div className="w-[min(420px,calc(100vw-32px))] rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">Destination {index}</p>
          <p className="text-xs text-slate-500">Search or choose from the map</p>
        </div>

        <div className="flex items-center rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm">
          <GripVertical size={14} />
          Drag
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
        {destination?.label || "Empty destination"}
      </div>
    </div>
  );
}

export function RecommendationPanel({ recommendation }) {
  const [isCarparksExpanded, setIsCarparksExpanded] = useState(false);
  const carparks = recommendation.carparks || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Best option
          </p>
          <h3 className="mt-1 text-2xl font-semibold capitalize text-slate-900">
            {recommendation.recommended_mode.replace("_", " ")}
          </h3>
        </div>

        {/* <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium capitalize text-blue-700">
          {recommendation.provider_mode} data
        </span> */}
      </div>

      <div className="grid gap-3 grid-cols-3">
        {Object.entries(recommendation.scores || {}).map(([mode, score]) => (
          <div key={mode} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium capitalize text-slate-500">
              {mode.replace("_", " ")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{score}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-900">Why this was chosen</p>
        <div className="mt-3 space-y-2">
          {(recommendation.justifications || []).map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Traffic snapshot</p>
          <p className="mt-1 text-xs text-slate-500">
            {recommendation.traffic?.camera_location}
            {recommendation.traffic?.captured_at
              ? ` · ${recommendation.traffic.captured_at}`
              : " · Latest available update"}
          </p>

          {recommendation.traffic?.image_url ? (
            <img
              className="mt-4 max-h-56 w-full rounded-2xl object-cover"
              src={recommendation.traffic.image_url}
              alt="Traffic snapshot"
            />
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              Traffic image is currently unavailable. Please try again later.
            </p>
          )}
        </div>

        {recommendation.recommended_mode === "drive" && carparks.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Available car parks</p>
                <p className="mt-1 text-xs text-slate-500">
                  Full list near the selected destination{carparks.length === 1 ? "" : "s"}.
                </p>
              </div>

              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={() => setIsCarparksExpanded((current) => !current)}
              >
                {isCarparksExpanded ? "Minimise" : `Expand (${carparks.length})`}
              </button>
            </div>

            {isCarparksExpanded && (
              <div className="mt-3 space-y-3">
                {carparks.map((carpark) => (
                  <div
                    key={`${carpark.name}-${carpark.latitude}`}
                    className="rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-slate-900">{carpark.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {carpark.available_lots} lots free, {Math.round(carpark.distance_m)}m away
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Weather</p>
          <p className="mt-1 text-sm text-slate-600">
            {recommendation.weather?.label}
            {recommendation.weather?.area ? ` (${recommendation.weather.area})` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MapSectionCard({
  title,
  subtitle,
  trailing = null,
  children,
  cardRef = null,
  className = "",
}) {
  return (
    <div
      ref={cardRef}
      className={`rounded-[1.85rem] border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function Chip({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function JourneyLegCard({
  leg,
  expanded = false,
  onToggleExpand = null,
  fillContainer = false,
}) {
  const [isCarparksExpanded, setIsCarparksExpanded] = useState(false);
  const summary = leg.route_preview?.summary || null;
  const details = leg.route_preview?.details || null;
  const routeType = leg.route_preview?.route_type || null;
  const carparks = leg.carparks || [];
  const carparkRoute = leg.best_carpark_route || null;
  const carparkRouteSummary = carparkRoute?.summary || null;
  const carparkRouteDetails = carparkRoute?.details || null;
  const carparkRouteType = carparkRoute?.route_type || null;

  return (
    <div
      className={`rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4 ${
        fillContainer ? "min-h-full" : ""
      }`}
    >
      <div className="flex flex-col flex-wrap items-start justify-between gap-3">

        
        <div className="flex w-full items-start justify-between">

            <div className="flex items-center gap-2">
                <div className="text-[25px] font-bold uppercase tracking-[0.1em]">
                Trip {leg.segment_index}
                </div>
                
            </div>


            {!expanded && (
                <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                onClick={() => onToggleExpand?.()}
                >
                Expand
                </button>
            )}
        </div>

        <div className="min-w-0 flex-1">
            <Chip tone="blue">
             {prettyModeLabel(leg.recommended_mode).toUpperCase() || "route"}
            </Chip>
          <div className="mt-1 flex flex-col text-sm text-slate-900 gap-3">
            <div>
                <span className="font-semibold">From: </span>
                <span>{leg.origin?.label || "Origin"}</span>
            </div>
            <div>
                <span className="font-semibold">To: </span>
                <span>{leg.destination?.label || "Destination"}</span>
            </div>
            
          </div>

          {Array.isArray(leg.justifications) && leg.justifications.length > 0 && (
            <div className="mt-3 space-y-2">
              {leg.justifications.slice(0, 2).map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {leg.scores && (
        <div className="mt-4 grid gap-2 grid-cols-2 xl:grid-cols-3">
          {Object.entries(leg.scores).map(([mode, score]) => (
            <div key={mode} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                {prettyModeLabel(mode)}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{score}</div>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="mt-4">
          <RouteSummaryGrid summary={summary} />
        </div>
      )}

      {summary?.message && (
        <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
          {summary.message}
        </div>
      )}

      {expanded && details && (
        <div className={`mt-4 pr-1 ${fillContainer ? "" : "max-h-[34vh] overflow-y-auto"}`}>
            
          <RouteDetailsPanel details={details} routeType={routeType} />

          {leg.recommended_mode === "drive" && carparkRouteSummary && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/60 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Best car park access</p>
                  
                  
                </div>
                <div className="rounded-xl bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700">
                  Red route on map
                </div>
              </div>

                <div className="mt-1">
                    <span className="font-semibold">From: </span>
                    <span className="text-m text-slate-600">
                        {leg.destination?.label || "destination"} 
                    </span>
                </div>
                <div>
                    <span className="font-semibold">To: </span>
                    <span className="text-m text-slate-600">
                        {leg.best_carpark?.name || "the selected car park"}
                    </span>
                </div>
            

              <RouteSummaryGrid summary={carparkRouteSummary} />

              {carparkRouteSummary.message && (
                <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                  {carparkRouteSummary.message}
                </div>
              )}

              {carparkRouteDetails && (
                <div className="mt-4">
                  <RouteDetailsPanel
                    details={carparkRouteDetails}
                    routeType={carparkRouteType}
                  />
                </div>
              )}
            </div>
          )}

          {leg.recommended_mode === "drive" && carparks.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Car parks for this leg</p>
                  <p className="text-xs text-slate-500">
                    Full list near {leg.destination?.label || "this destination"}.
                  </p>
                </div>

                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  onClick={() => setIsCarparksExpanded((current) => !current)}
                >
                  {isCarparksExpanded ? "Minimise" : `Expand (${carparks.length})`}
                </button>
              </div>

              {isCarparksExpanded && (
                <div className="mt-3 space-y-3">
                  {carparks.map((carpark) => (
                    <div
                      key={`${leg.segment_index}-${carpark.name}-${carpark.latitude}`}
                      className="rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <p className="text-sm font-medium text-slate-900">{carpark.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {carpark.available_lots} lots free, {Math.round(carpark.distance_m)}m away
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {leg.traffic && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Traffic snapshot</p>
              <p className="mt-1 text-xs text-slate-500">
                {leg.traffic.camera_location || leg.destination?.label || "Route destination"}
                {leg.traffic.captured_at
                  ? ` · ${leg.traffic.captured_at}`
                  : " · Latest available update"}
              </p>

              {leg.traffic.image_url ? (
                <img
                  className="mt-4 max-h-56 w-full rounded-2xl object-cover"
                  src={leg.traffic.image_url}
                  alt={`Traffic snapshot near ${leg.traffic.camera_location || leg.destination?.label || "destination"}`}
                />
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  Traffic image is currently unavailable for this trip.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RouteSummaryGrid({ summary }) {
  return (
    <div className="grid gap-3 grid-cols-2 mt-1">
      <InfoCard label="Route type" value={prettyRouteType(summary.route_type).toUpperCase()} />
      <InfoCard label="Distance" value={formatDistance(summary.distance_m)} />
      <InfoCard label="Duration" value={formatDuration(summary.duration_s)} />
    </div>
  );
}

export function RouteDetailsPanel({ details, routeType }) {
  const primaryItinerary = details.itineraries?.[0] || null;
  const instructionList = details.route_instructions || [];

  return (
    <div className="space-y-3">
      {/*{(details.route_origin || details.route_destination) && (
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {details.route_origin && (
            <div>
              <span className="font-medium text-slate-900">From:</span> {details.route_origin}
            </div>
          )}
          {details.route_destination && (
            <div className="mt-1">
              <span className="font-medium text-slate-900">To:</span> {details.route_destination}
            </div>
          )}
        </div>
      )} */}

      {/* {(details.route_name || details.status) && (
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailItem label="Route name" value={displayValue(details.route_name || "Unavailable")} />
          </div>
        </div>
      )} */} 


      {routeType === "pt" && primaryItinerary && (
        <div className="rounded-2xl bg-slate-50 py-3 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Route Information</p>
          <div className="mt-2 grid gap-2 grid-cols-2">
            <DetailItem label="Fare" value={formatFare(primaryItinerary.fare)} />
            <DetailItem label="Transfers" value={displayValue(primaryItinerary.transfers)} />
            <DetailItem
              label="Walk distance"
              value={formatDistance(primaryItinerary.walk_distance)}
            />
            <DetailItem
              label="Waiting time"
              value={formatDuration(primaryItinerary.waiting_time)}
            />
          </div>


          {primaryItinerary.legs?.length > 0 && (
            <div className="mt-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Route steps ({primaryItinerary.legs.length})
                </div>

                <div className="mt-2 space-y-2">
                {primaryItinerary.legs.map((leg, index) => (
                    <div
                    key={`${leg.mode || "leg"}-${index}`}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {leg.mode || "Leg"}
                        {leg.route ? ` · ${leg.route}` : ""}
                    </div>

                    <div className="mt-1 text-sm font-medium text-slate-900">
                        {leg.from || "Start"} to {leg.to || "End"}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                        {formatDuration(leg.duration)} · {formatDistance(leg.distance)}
                    </div>
                    </div>
                ))}
                </div>
            </div>
            )}
        </div>
      )}

      {routeType !== "pt" && instructionList.length > 0 && (
        <div className="rounded-2xl bg-slate-50 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Route steps ({instructionList.length})
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {instructionList.map((step, index) => (
              <div
                key={`${step.instruction || step.action || "step"}-${index}`}
                className="rounded-xl bg-white px-3 py-2"
              >
                <div className="font-medium text-slate-900">
                  {step.instruction || step.action || "Continue"}
                </div>
                {(step.road || step.distance_text) && (
                  <div className="mt-1 text-xs text-slate-500">
                    {[step.road, step.distance_text].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {details.segment_provider_mode && (
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailItem label="Provider" value={displayValue(details.segment_provider_mode)} />
            <DetailItem label="Fallback" value={displayValue(details.fallback_reason || "None")} />
          </div>
        </div>
      )}

      {details.error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {details.error}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}
