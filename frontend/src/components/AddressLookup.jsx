import { useEffect, useRef, useState } from 'react';

/**
 * Address autocomplete powered by Google Places. The Maps JS library is
 * loaded on demand the first time this component mounts. If
 * VITE_GOOGLE_MAPS_API_KEY isn't configured, the component quietly
 * falls back to a plain text input so the form still works.
 *
 * Props:
 *   value        — current address_line1 string
 *   onChange(v)  — called as the user types
 *   onSelect({line1, city, state, postal_code}) — called when the user
 *                picks a suggestion; the caller fills the other fields.
 */

let scriptLoadPromise = null;
function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (!apiKey) return Promise.resolve(false);
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.id = 'google-maps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      console.warn('[AddressLookup] Google Maps failed to load');
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return scriptLoadPromise;
}

function parseAddressComponents(components = []) {
  const byType = {};
  for (const c of components) {
    for (const t of c.types) byType[t] = c;
  }
  const number = byType.street_number?.long_name || '';
  const route = byType.route?.long_name || '';
  return {
    address_line1: [number, route].filter(Boolean).join(' '),
    city:
      byType.locality?.long_name
      || byType.postal_town?.long_name
      || byType.sublocality?.long_name
      || byType.administrative_area_level_3?.long_name
      || '',
    state: byType.administrative_area_level_1?.short_name || '',
    postal_code: byType.postal_code?.long_name || '',
  };
}

export default function AddressLookup({ value, onChange, onSelect, placeholder, disabled }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const inputRef = useRef(null);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey).then((ok) => { if (!cancelled) setMapsReady(ok); });
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    if (!mapsReady || !inputRef.current) return;
    const Autocomplete = window.google.maps.places.Autocomplete;
    if (!Autocomplete) return;

    const ac = new Autocomplete(inputRef.current, {
      types: ['address'],
      fields: ['address_components', 'formatted_address'],
      componentRestrictions: { country: ['us'] },
    });

    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;
      const parsed = parseAddressComponents(place.address_components);
      onSelect?.(parsed);
    });

    return () => {
      if (listener?.remove) listener.remove();
      // The container for pac-container lingers — not leaking, just a
      // detail of Google's widget. Not worth fighting.
    };
  }, [mapsReady, onSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder || (mapsReady ? 'Start typing an address…' : 'Street address')}
      autoComplete="off"
      disabled={disabled}
    />
  );
}
