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
let lastLoadError = null;

function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') return Promise.resolve({ ok: false, reason: 'ssr' });
  if (window.google?.maps?.places?.Autocomplete) return Promise.resolve({ ok: true });
  if (!apiKey) {
    console.warn('[AddressLookup] VITE_GOOGLE_MAPS_API_KEY is not set — autocomplete disabled.');
    return Promise.resolve({ ok: false, reason: 'no_key' });
  }
  if (scriptLoadPromise) return scriptLoadPromise;

  // Capture Google's auth-failure hook before the script loads so it's
  // already in place when Google evaluates the key.
  window.gm_authFailure = () => {
    lastLoadError = 'Google Maps auth failed (check key restrictions / billing)';
    console.warn('[AddressLookup]', lastLoadError);
  };

  scriptLoadPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.id = 'google-maps-script';
    // Note: do NOT pass loading=async unless you also use importLibrary().
    // With loading=async, `libraries=places` loads on its own schedule and
    // window.google.maps.places.Autocomplete may not exist when onload fires.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=quarterly`;
    s.async = true;
    s.defer = true;
    s.onload = async () => {
      try {
        // Belt-and-braces: if importLibrary is available, await the places
        // module explicitly. On classic loading paths it's a no-op.
        if (window.google?.maps?.importLibrary) {
          try { await window.google.maps.importLibrary('places'); } catch { /* fall through */ }
        }
        if (window.google?.maps?.places?.Autocomplete) {
          console.info('[AddressLookup] Google Maps Places loaded');
          resolve({ ok: true });
        } else {
          lastLoadError = 'Places library loaded but Autocomplete class missing';
          console.warn('[AddressLookup]', lastLoadError);
          resolve({ ok: false, reason: 'autocomplete_missing' });
        }
      } catch (err) {
        lastLoadError = `Places import failed: ${err.message}`;
        console.warn('[AddressLookup]', lastLoadError);
        resolve({ ok: false, reason: 'import_failed' });
      }
    };
    s.onerror = () => {
      lastLoadError = 'Google Maps script failed to load';
      console.warn('[AddressLookup]', lastLoadError);
      resolve({ ok: false, reason: 'script_error' });
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
  const [status, setStatus] = useState({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey).then((res) => {
      if (cancelled) return;
      if (res.ok) setStatus({ state: 'ready' });
      else setStatus({ state: 'unavailable', reason: res.reason });
    });
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    if (status.state !== 'ready' || !inputRef.current) return;
    const Autocomplete = window.google?.maps?.places?.Autocomplete;
    if (!Autocomplete) {
      setStatus({ state: 'unavailable', reason: 'autocomplete_missing' });
      return;
    }

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

    return () => { if (listener?.remove) listener.remove(); };
  }, [status.state, onSelect]);

  const reasonLabel = {
    no_key: 'API key not set',
    script_error: 'script blocked',
    autocomplete_missing: 'Places library not loaded',
    import_failed: 'Places library failed to import',
    ssr: 'server side',
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder || (status.state === 'ready' ? 'Start typing an address…' : 'Street address')}
        autoComplete="off"
        disabled={disabled}
      />
      <span className="muted small" style={{ marginTop: 2 }}>
        {status.state === 'ready' && '✓ Google address suggestions enabled'}
        {status.state === 'loading' && 'Loading address suggestions…'}
        {status.state === 'unavailable' && (
          <>⚠ Address autocomplete unavailable ({reasonLabel[status.reason] || status.reason}). Type the address manually.</>
        )}
      </span>
    </>
  );
}
