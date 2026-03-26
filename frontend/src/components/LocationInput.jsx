import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export default function LocationInput({
  label,
  value,
  onChange,
  onClear,
  favourites = [],
  currentLocationOption = null,
  externalError = ""
}) {
  const [query, setQuery] = useState(value?.label || "");
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const selectingRef = useRef(false);

  const suggestionText = (suggestion) => {
    if (suggestion.source === "current_location") {
      return "Use current location";
    }
    if (suggestion.source === "favourite") {
      return `${suggestion.label} (Favourite)`;
    }
    return suggestion.label;
  };

  const chooseSuggestion = async (suggestion) => {
    selectingRef.current = true;
    try {
      const payload =
        suggestion.source === "current_location"
          ? {
              latitude: suggestion.latitude,
              longitude: suggestion.longitude,
              label: suggestion.label
            }
          : {
              label: suggestion.label
            };
      const result = await api.post("/locations/validate/", payload);
      onChange(result.location);
      setQuery(result.location.label);
      setSuggestions([]);
      setError("");
    } catch {
      setError("Invalid Address, try again");
      setSuggestions([]);
    } finally {
      setTimeout(() => {
        selectingRef.current = false;
      }, 0);
    }
  };

  useEffect(() => {
    setQuery(value?.label || "");
  }, [value]);

  useEffect(() => {
    if (!query) {
      setSuggestions(currentLocationOption ? [currentLocationOption] : []);
      return;
    }
    if (value?.label === query) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const results = await api.get(`/locations/autocomplete/?q=${encodeURIComponent(query)}`);
        const favouriteMatches = favourites
          .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.address.toLowerCase().includes(query.toLowerCase()))
          .map((item) => ({
            label: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            source: "favourite"
          }));
        const currentLocationMatches =
          currentLocationOption &&
          currentLocationOption.label.toLowerCase().includes(query.toLowerCase())
            ? [currentLocationOption]
            : [];
        const merged = [...currentLocationMatches, ...favouriteMatches, ...results].filter(
          (item, index, all) => index === all.findIndex((candidate) => candidate.label === item.label)
        );
        setSuggestions(merged);
      } catch {
        setSuggestions(currentLocationOption ? [currentLocationOption] : []);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, value, favourites, currentLocationOption]);

  const handleBlur = () => {
    setTimeout(() => {
      if (selectingRef.current) {
        return;
      }
      if (query && (!value || value.label !== query)) {
        setError("Invalid Address, try again");
      }
      setSuggestions([]);
    }, 150);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="relative">
        <input
          className="w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 pr-12 outline-none transition focus:border-brand-500"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError("");
            if (value?.label && event.target.value !== value.label) {
              onClear?.();
            }
          }}
          onFocus={() => {
            if (!query && currentLocationOption) {
              setSuggestions([currentLocationOption]);
            }
          }}
          onBlur={handleBlur}
          placeholder="Search Singapore address"
        />
        {query && (
          <button
            type="button"
            className="absolute right-3 top-3 text-sm text-slate-500"
            onClick={() => {
              setQuery("");
              setError("");
              setSuggestions(currentLocationOption ? [currentLocationOption] : []);
              onClear?.();
            }}
          >
            X
          </button>
        )}
      </div>
      <div className="text-xs text-slate-500">
        OneMap search is used when configured. If your typed value does not match a selectable result, it will be treated as invalid.
      </div>
      {(error || externalError) && <p className="text-sm text-red-600">{error || externalError}</p>}
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-brand-100 bg-white p-2 shadow-panel">
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={`${suggestion.label}-${suggestion.latitude}-${suggestion.source || "default"}`}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseSuggestion(suggestion)}
            >
              {suggestionText(suggestion)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
