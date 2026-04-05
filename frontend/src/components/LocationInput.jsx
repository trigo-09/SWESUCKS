import { useEffect, useRef, useState } from "react";
import {Search} from "lucide-react";
import { api } from "../api/client";

export default function LocationInput({
  label,
  value,
  onChange,
  onClear,
  favourites = [],
  externalError = "",
  onQueryChange = null,
  onInteract = null, 
}) {
  const [query, setQuery] = useState(value?.label || "");
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectingRef = useRef(false);
  const skipBlurValidationRef = useRef(false);
  const requestIdRef = useRef(0);
  const suggestionRefs = useRef([]);

  const mapFavouriteToSuggestion = (item) => ({
    name: item.name,
    label: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    source: "favourite",
  });

  const buildFavouriteSuggestions = (searchQuery = "") => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return favourites
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.address.toLowerCase().includes(normalizedQuery)
        );
      })
      .map(mapFavouriteToSuggestion);
  };  

  const suggestionText = (suggestion) => {
    if (suggestion.source === "current_location") {
      return "Use current location";
    }
    if (suggestion.source === "favourite") {
      return suggestion.name || suggestion.label;
    }
    return suggestion.label;
  };

  const getHoveredSuggestionIndex = () =>
    suggestionRefs.current.findIndex((element) => element?.matches?.(":hover"));

  const getActiveSuggestionIndex = () => {
    const hoveredIndex = getHoveredSuggestionIndex();
    if (hoveredIndex >= 0) {
      return hoveredIndex;
    }

    if (highlightedIndex >= 0) {
      return highlightedIndex;
    }

    return suggestions.length > 0 ? 0 : -1;
  };  

  const chooseSuggestion = async (suggestion) => {
    selectingRef.current = true;
    skipBlurValidationRef.current = true;

    try {
      if (suggestion.source !== "current_location" && suggestion.source !== "favourite") {
        onChange(suggestion);
        setQuery(suggestion.label);
        onQueryChange?.(suggestion.label);
        setSuggestions([]);
        setHighlightedIndex(-1);
        setError("");
        return;
      }

      const payload =
        suggestion.source === "current_location" || suggestion.source === "favourite"
          ? {
              latitude: suggestion.latitude,
              longitude: suggestion.longitude,
              label: suggestion.label,
            }
          : {
              label: suggestion.label,
            };

      const result = await api.post("/locations/validate/", payload);

      onChange(result.location);
      setQuery(result.location.label);
      onQueryChange?.(result.location.label);
      setSuggestions([]);
      setHighlightedIndex(-1);
      setError("");
    } catch {
      setError("Invalid address, try again");
      setSuggestions([]);
      setHighlightedIndex(-1);
    } finally {
      setTimeout(() => {
        selectingRef.current = false;
      }, 0);
    }
  };

  useEffect(() => {
    setQuery(value?.label || "");
    onQueryChange?.(value?.label || "");
  }, [value]);

  useEffect(() => {
    if (!isFocused) {
      setHasSearched(false);
      setSuggestions([]);
      setHighlightedIndex(-1);
      return;
    }

    if (!query) {
      setHasSearched(false);
      setSuggestions(buildFavouriteSuggestions());
      setHighlightedIndex(0);
      return;
    }

    if (value?.label === query) {
      setHasSearched(false);
      setSuggestions([]);
      setHighlightedIndex(-1);
      return;
    }

    const timeout = setTimeout(async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      try {
        const results = await api.get(`/locations/autocomplete/?q=${encodeURIComponent(query)}`);
        if (requestId !== requestIdRef.current || !isFocused) {
          return;
        }
        const favouriteMatches = buildFavouriteSuggestions(query);

        const merged = [...favouriteMatches, ...results].filter(
          (item, index, all) =>
            index === all.findIndex((candidate) => candidate.label === item.label),
        );

        setSuggestions(merged);
        setHasSearched(true);
        setHighlightedIndex(merged.length > 0 ? 0 : -1);
      } catch {
        if (requestId === requestIdRef.current && isFocused) {
          setSuggestions([]);
          setHasSearched(true);
          setHighlightedIndex(-1);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [favourites, isFocused, query, value]);

  const handleFocus = () => {
    setIsFocused(true);
    setHasSearched(false);
    if (!query) {
      setSuggestions(buildFavouriteSuggestions());
      setHighlightedIndex(0);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsFocused(false)
      if (skipBlurValidationRef.current) {
        skipBlurValidationRef.current = false;
        setSuggestions([]);
        setHighlightedIndex(-1);
        return;
      }
      if (selectingRef.current) {
        return;
      }
      if (query.trim() && (!value || value.label !== query.trim())) {
        setError("Invalid address, try again");
        setSuggestions([]);
        setHighlightedIndex(-1);
        return;
      }
      setSuggestions([]);
      setHighlightedIndex(-1);
    }, 150);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-800">{label}</label>

      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
          strokeWidth={2}
        />

        <input
          className="w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 pr-12 pl-7 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={query}
          onChange={(event) => {
            onInteract?.();
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
            setError("");
          }}
          onFocus={() => {
            onInteract?.();
            handleFocus();
          }}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (suggestions.length > 0) {
                const selectedIndex = getActiveSuggestionIndex();
                void chooseSuggestion(suggestions[selectedIndex]);
                return;
              }
              if (query.trim() && (!value || value.label !== query.trim())) {
                setError("Invalid address, try again");
              }
              setHasSearched(false);
              setSuggestions([]);
              setHighlightedIndex(-1);
            }
          }}
          placeholder="Search Singapore address"
        />
        {query && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
            onClick={() => {
              onInteract?.();
              setQuery("");
              onQueryChange?.("");
              setError("");
              setHasSearched(false);
              setSuggestions([]);
              setHighlightedIndex(-1);
              onClear?.();
            }}
          >
            ╳
          </button>
        )}
      </div>


      {(error || externalError) && (
        <p className="text-sm text-red-600">{error || externalError}</p>
      )}

      {isFocused && (suggestions.length > 0 || (hasSearched && query.trim().length > 0)) && (
        <div
          className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
          onMouseLeave={() => {
            if (suggestions.length > 0) {
              setHighlightedIndex(0);
            }
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              key={`${suggestion.label}-${suggestion.latitude}-${suggestion.source || "default"}`}
              className={`block w-full rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition ${
                getActiveSuggestionIndex() === index
                  ? "bg-slate-100 hover:bg-slate-100"
                  : "bg-white hover:bg-slate-50"
              }`}
              ref={(element) => {
                suggestionRefs.current[index] = element;
              }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => chooseSuggestion(suggestion)}
            >
              {suggestion.source === "favourite" ? (
                <span>
                  <strong>{suggestionText(suggestion)}</strong> ({suggestion.label})
                </span>
              ) : (
                suggestionText(suggestion)
              )}
            </button>
          ))}

          {suggestions.length === 0 && hasSearched && query.trim().length > 0 && (
            <div className="rounded-xl px-3 py-3 text-sm text-slate-500">
              No addresses found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
