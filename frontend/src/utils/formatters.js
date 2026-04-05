export function prettyRouteType(routeType) {
  if (!routeType) return "Unknown";
  if (routeType === "pt") return "Public transport";
  return routeType.replaceAll("_", " ");
}

export function prettyModeLabel(mode) {
  if (!mode) return "Unknown";
  if (mode === "pt") return "Public transport";
  return mode.replaceAll("_", " ");
}

export function formatDistance(distanceM) {
  if (distanceM == null) return "Unavailable";
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${Math.round(distanceM)} m`;
}

export function formatDuration(durationS) {
  if (durationS == null) return "Unavailable";
  const totalMinutes = Math.round(durationS / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function formatFare(value) {
  if (value == null || value === "") return "Unavailable";
  const amount = Number(value);
  if (Number.isNaN(amount)) return `${value}`;
  return `$${amount.toFixed(2)}`;
}

export function displayValue(value) {
  if (value == null || value === "") return "Unavailable";
  return `${value}`;
}
