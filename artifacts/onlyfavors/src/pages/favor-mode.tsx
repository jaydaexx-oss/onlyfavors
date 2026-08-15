/**
 * Favor Mode — the live booking screen that activates when a meetup begins.
 *
 * Features:
 *  - Check-in timer counting up from booking start
 *  - I'm Safe / Check In buttons
 *  - Trust Circle live status
 *  - Discreet Exit ("Change plans" — understated so it doesn't draw attention)
 *  - Extend or End booking
 *  - Location sharing indicator
 *  - Boundaries summary
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, Check, CheckCircle2,
  Clock, Heart, HeartHandshake, LifeBuoy, LockKeyhole, MapPin,
  Navigation, Phone, QrCode, ShieldCheck, TimerReset, Users, X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useParams } from 'wouter';

// Format seconds as mm:ss or h:mm:ss
function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Live booking data is loaded from the authenticated session API.
type LiveFavor = {
  companionName: string;
  activity: string;
  venueName: string;
  venueHint: string;
  venueAgreed: boolean;
  boundaries: string[];
  totalMinutes: number;
};

type TrustContact = { id: string; name: string; phone: string; email?: string; relation: string };

export default function FavorMode() {
  const { id } = useParams<{ id: string }>();
  const [live, setLive] = useState<LiveFavor | null>(null);
  const [loadError, setLoadError] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const [trustContacts, setTrustContacts] = useState<TrustContact[]>([]);
  useEffect(() => {
    fetch('/api/trust-circle', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then(setTrustContacts)
      .catch(() => setTrustContacts([]));
  }, []);

  useEffect(() => {
    if (!id) { setLoadError('This favor is missing a booking.'); return; }
    fetch(`/api/bookings/${id}/session`, { credentials: 'include' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({})) as { error?: string } & Record<string, unknown>;
        if (!res.ok) throw new Error(body.error ?? 'Could not load this favor');
        return body as {
          activity: string;
          durationHours: number;
          checkedInAt: string | null;
          companion: { name: string; boundaries: string[] };
          venue: { name: string; hint: string; agreed?: boolean };
        };
      })
      .then((data) => {
        setLive({
          companionName: data.companion?.name ?? 'Your companion',
          activity: data.activity ?? 'Favor',
          venueName: data.venue?.name ?? 'SafeSpot',
          venueHint: data.venue?.hint ?? '',
          venueAgreed: Boolean(data.venue?.agreed),
          boundaries: data.companion?.boundaries?.length ? data.companion.boundaries : ['Platonic only', 'Public spaces only'],
          totalMinutes: Math.round(Number(data.durationHours ?? 2) * 60),
        });
        if (data.checkedInAt) setCheckedIn(true);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load this favor'));
  }, [id]);

  const [showQr, setShowQr] = useState(false);
  const [safeSignalSent, setSafeSignalSent] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const [shareKind, setShareKind] = useState<'checkin' | 'walk' | 'emergency'>('checkin');
  const [locConsentError, setLocConsentError] = useState('');
  const [trustLink, setTrustLink] = useState('');
  const [trustLinkNote, setTrustLinkNote] = useState('');
  const [missedNote, setMissedNote] = useState('');
  const [emergencyNote, setEmergencyNote] = useState('');
  const [showEmergency, setShowEmergency] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState('');
  const [bonusMinutes, setBonusMinutes] = useState(0);
  const [extending, setExtending] = useState<number | null>(null);
  const missedSent = useRef(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/bookings/${id}/exact-location`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { sharing: false }))
      .then((body: { sharing?: boolean; kind?: string }) => {
        setLocationSharing(Boolean(body.sharing));
        if (body.kind === 'walk' || body.kind === 'emergency' || body.kind === 'checkin') {
          setShareKind(body.kind);
        }
      })
      .catch(() => {});
  }, [id]);

  const storeExactLocation = useCallback((kind: 'checkin' | 'walk' | 'emergency') => {
    if (!id || !navigator.geolocation) {
      setLocConsentError('This device cannot share a location pin. Check-in still works without GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch(`/api/bookings/${id}/exact-location`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, kind }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({})) as { error?: string };
              throw new Error(body.error ?? 'Could not store location');
            }
            setLocationSharing(true);
            setShareKind(kind);
            setLocConsentError('');
          })
          .catch((err) => {
            setLocConsentError(err instanceof Error ? err.message : 'Could not store location');
          });
      },
      () => {
        setLocConsentError('Location permission was declined. Check-in still works without sharing a route or pin.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }, [id]);

  const stopSharing = useCallback(async () => {
    if (!id) return;
    await fetch(`/api/bookings/${id}/exact-location/stop`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    setLocationSharing(false);
    setShareKind('checkin');
  }, [id]);

  const createTrustLink = useCallback(async (purpose: 'trust_circle' | 'walk' = 'trust_circle') => {
    if (!id) return '';
    const res = await fetch(`/api/bookings/${id}/trust-link`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose }),
    });
    const body = await res.json().catch(() => ({})) as { path?: string; error?: string; reason?: string; trustNotified?: number };
    if (!res.ok || !body.path) {
      setTrustLinkNote(body.error ?? 'Could not create a Trust Circle link.');
      return '';
    }
    const url = `${window.location.origin}${body.path}`;
    setTrustLink(url);
    const notified = body.trustNotified ? ` Emailed ${body.trustNotified} contact${body.trustNotified === 1 ? '' : 's'}.` : '';
    setTrustLinkNote((body.reason ? `${body.reason} ` : '') + `Link expires after this booking.${notified} It shows the agreed venue, not a live pin.`);
    return url;
  }, [id]);

  const totalMinutes = (live?.totalMinutes ?? 120) + bonusMinutes;
  const progress = Math.min(elapsed / (totalMinutes * 60), 1);
  const remainingMin = Math.max(0, totalMinutes - Math.floor(elapsed / 60));

  const postCheckIn = async (kind: 'arrival' | 'midpoint' | 'checkout') => {
    if (!id || !live) return;
    await fetch(`/api/bookings/${id}/checkin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venue: live.venueName, kind }),
    });
  };

  useEffect(() => {
    if (!id || !live || checkedIn || missedSent.current || elapsed < 12 * 60) return;
    missedSent.current = true;
    fetch(`/api/bookings/${id}/missed-checkin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({})) as { alerted?: boolean; reason?: string; error?: string };
        setMissedNote(
          body.alerted
            ? 'Trust Circle was emailed about a missed check-in. Call 911 if this is an emergency.'
            : (body.reason ?? body.error ?? 'Trust Circle could not be notified. Call 911 if this is an emergency.'),
        );
      })
      .catch(() => {
        setMissedNote('Trust Circle could not be notified. Call 911 if this is an emergency.');
      });
  }, [id, live, checkedIn, elapsed]);

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#1f0c1b] px-6 text-[#f9efe5]">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">Favor Mode</p>
          <h1 className="mt-3 font-serif text-3xl">Could not open this favor</h1>
          <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">{loadError}</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-[#8F294C] px-5 py-2.5 text-sm font-bold text-white">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#1f0c1b] text-[#f9efe5]">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">Loading this favor…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1f0c1b] text-[#f9efe5]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[#4a2040] bg-[#1f0c1b]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <span className="relative grid h-9 w-9 place-items-center rounded-full border-2 border-[#c695ae] font-serif text-[17px] leading-none text-[#f9efe5]" aria-hidden>
              O
              <ShieldCheck className="absolute h-2.5 w-2.5 text-[#c695ae]" />
            </span>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#c695ae]">Favor in progress</p>
              <p className="text-sm font-bold">{live.companionName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locationSharing && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#2d1228] px-3 py-1.5 text-[10px] font-bold text-[#3dbd8c]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3dbd8c]" />
                Location active
              </span>
            )}
            <Link
              href="/"
              className="rounded-full p-2 text-[#9d7e8e] hover:bg-[#3a1832] hover:text-[#f9efe5]"
              data-testid="link-favor-home"
            >
              <X className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-5 py-6">

        {/* Timer card */}
        <div className="rounded-[24px] bg-[#3d2038] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">Time together</p>
              <p className="mt-1 font-serif text-6xl leading-none text-[#f9efe5]" data-testid="favor-timer">
                {fmt(elapsed)}
              </p>
              <p className="mt-2 text-xs text-[#d9c4cf]">
                {remainingMin > 0 ? `${remainingMin} min remaining` : 'Booking time complete'}
              </p>
            </div>
            <div className="relative grid h-20 w-20 place-items-center">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#4a2842" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={remainingMin === 0 ? '#3dbd8c' : '#7f2e62'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress)}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <Clock className="h-7 w-7 text-[#d897b6]" />
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#4a2842]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7f2e62] to-[#3dbd8c] transition-all duration-1000"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Venue card */}
        <div className="rounded-[20px] bg-[#2d1228] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Meeting place</p>
          <div className="mt-3 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#3dbd8c]/15 text-[#3dbd8c]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-[#f9efe5]">{live.venueName}</p>
              <p className="mt-0.5 text-xs text-[#d9c4cf]">{live.venueHint}</p>
              <p className="mt-1 text-[10px] font-semibold text-[#3dbd8c]">
                {live.venueAgreed ? 'Meet Here · both of you agreed to this public SafeSpot' : 'Proposed public SafeSpot — agreed when your companion accepts'}
              </p>
            </div>
          </div>
        </div>

        {/* Safety actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { if (!checkedIn) setShowQr(true); }}
            className={`rounded-[20px] p-5 text-left transition-all ${
              checkedIn
                ? 'bg-[#3dbd8c]/20 ring-2 ring-[#3dbd8c]'
                : 'bg-[#2d1228] hover:bg-[#3a1832]'
            }`}
            data-testid="button-check-in"
          >
            {checkedIn
              ? <CheckCircle2 className="h-6 w-6 text-[#3dbd8c]" />
              : <QrCode className="h-6 w-6 text-[#9d557e]" />
            }
            <p className="mt-8 text-sm font-bold text-[#f9efe5]">
              {checkedIn ? 'Checked in ✓' : 'Check in'}
            </p>
            <p className="mt-0.5 text-[10px] text-[#d9c4cf]">
              {checkedIn ? 'Arrival recorded at this SafeSpot' : 'Confirm you arrived — no route is stored'}
            </p>
          </button>

          <button
            onClick={async () => {
              if (safeSignalSent) return;
              try { await postCheckIn('midpoint'); } catch {}
              setSafeSignalSent(true);
            }}
            className={`rounded-[20px] p-5 text-left transition-all ${
              safeSignalSent
                ? 'bg-[#477254]/20 ring-2 ring-[#4d8c60]'
                : 'bg-[#2d1228] hover:bg-[#3a1832]'
            }`}
            data-testid="button-im-safe"
          >
            {safeSignalSent
              ? <Heart className="h-6 w-6 fill-[#4d8c60] text-[#4d8c60]" />
              : <HeartHandshake className="h-6 w-6 text-[#9d557e]" />
            }
            <p className="mt-8 text-sm font-bold text-[#f9efe5]">
              {safeSignalSent ? 'Midpoint recorded ✓' : 'Midpoint check-in'}
            </p>
            <p className="mt-0.5 text-[10px] text-[#d9c4cf]">
              {safeSignalSent ? 'Saved on this booking' : 'Quiet all-clear during the favor'}
            </p>
          </button>
        </div>

        {/* Trust Circle */}
        <div className="rounded-[20px] bg-[#2d1228] p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Trust Circle</p>
            {trustContacts.length > 0 ? (
              <span className="flex items-center gap-1 text-[10px] text-[#3dbd8c]">
                On this booking
              </span>
            ) : (
              <a href="/trust-circle" className="text-[10px] font-bold text-[#df9cbd] underline">Add contacts</a>
            )}
          </div>
          {trustContacts.length > 0 ? (
            <>
              {trustContacts.map((contact) => (
                <div key={contact.id} className="mt-4 flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[#4a2842] font-serif text-sm font-bold text-[#c695ae]">
                    {contact.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#f9efe5]">{contact.name}</p>
                    <p className="text-[10px] text-[#d9c4cf]">{contact.relation} · {contact.email || contact.phone || 'Add an email for alerts'}</p>
                  </div>
                  <Users className="h-4 w-4 text-[#3dbd8c]" />
                </div>
              ))}
              <p className="mt-4 text-[10px] leading-5 text-[#9d7e8e]">
                They can be emailed a venue map if they have an email on file. SMS is not configured. A missed check-in alert is sent once if you have not arrived after 12 minutes.
              </p>
              {missedNote && <p className="mt-2 text-[10px] leading-5 text-[#df9cbd]">{missedNote}</p>}
              <button
                type="button"
                onClick={async () => {
                  const url = await createTrustLink('trust_circle');
                  if (url) await navigator.clipboard.writeText(url).catch(() => {});
                }}
                className="mt-4 w-full rounded-[12px] bg-[#4a2842] px-4 py-3 text-left text-xs font-bold text-[#f9efe5]"
                data-testid="button-trust-link"
              >
                Copy expiring Trust Circle map
              </button>
              {trustLink && (
                <p className="mt-2 break-all text-[10px] leading-5 text-[#c695ae]">{trustLink}</p>
              )}
              {trustLinkNote && <p className="mt-1 text-[10px] leading-5 text-[#9d7e8e]">{trustLinkNote}</p>}
            </>
          ) : (
            <div className="mt-4 rounded-[12px] border border-[#4a2040] p-4 text-center">
              <p className="text-xs text-[#d9c4cf]">No Trust Circle set up yet.</p>
              <p className="mt-1 text-[10px] text-[#9d7e8e]">Add trusted contacts before your next booking for automatic safety check-ins.</p>
            </div>
          )}
        </div>

        {/* Boundaries summary */}
        <div className="rounded-[20px] bg-[#2d1228] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Active boundaries</p>
          <ul className="mt-4 space-y-2">
            {live.boundaries.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-[#d9c4cf]">
                <Check className="h-4 w-4 shrink-0 text-[#3dbd8c]" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Extend / End */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowExtend(true)}
            className="rounded-[20px] bg-[#2d1228] p-5 text-left hover:bg-[#3a1832]"
            data-testid="button-extend"
          >
            <TimerReset className="h-5 w-5 text-[#9d557e]" />
            <p className="mt-7 text-sm font-bold text-[#f9efe5]">Extend</p>
            <p className="mt-0.5 text-[10px] text-[#d9c4cf]">Add 30 or 60 min</p>
          </button>
          <button
            onClick={() => setShowEnd(true)}
            className="rounded-[20px] bg-[#2d1228] p-5 text-left hover:bg-[#3a1832]"
            data-testid="button-end-booking"
          >
            <CheckCircle2 className="h-5 w-5 text-[#9d557e]" />
            <p className="mt-7 text-sm font-bold text-[#f9efe5]">End booking</p>
            <p className="mt-0.5 text-[10px] text-[#d9c4cf]">Departure check-in</p>
          </button>
        </div>

        {/* Location toggle */}
        <div className="rounded-[20px] bg-[#2d1228] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Navigation className={`h-5 w-5 ${locationSharing ? 'text-[#3dbd8c]' : 'text-[#9d7e8e]'}`} />
              <div>
                <p className="text-sm font-bold text-[#f9efe5]">Temporary location sharing</p>
                <p className="text-[10px] text-[#d9c4cf]">
                  {locationSharing
                    ? `On for this favor · ${shareKind === 'walk' ? 'Walk me there' : shareKind === 'emergency' ? 'Emergency' : 'encrypted check-in'} · either of you can stop it`
                    : 'Off until you consent'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (locationSharing) void stopSharing();
                else storeExactLocation(shareKind === 'walk' ? 'walk' : 'checkin');
              }}
              className={`h-7 w-12 rounded-full transition-colors ${locationSharing ? 'bg-[#3dbd8c]' : 'bg-[#4a2842]'}`}
              data-testid="toggle-location"
              aria-pressed={locationSharing}
              aria-label={locationSharing ? 'Stop location sharing' : 'Start location sharing'}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${locationSharing ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
          {locConsentError && <p className="mt-3 text-[10px] leading-5 text-[#df9cbd]">{locConsentError}</p>}
          <p className="mt-3 text-[10px] leading-5 text-[#9d7e8e]">
            Precise location is encrypted for this booking only, readable for 24 hours, then deleted. It is never shown as a live pin, never used for ads, and never stored outside an active favor.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                storeExactLocation('walk');
                const url = await createTrustLink('walk');
                if (url) await navigator.clipboard.writeText(url).catch(() => {});
                window.open(`https://www.google.com/maps/search/transit+station+near+${encodeURIComponent(live.venueName)}`, '_blank', 'noopener,noreferrer');
              }}
              className="rounded-[12px] bg-[#4a2842] px-3 py-3 text-left text-[11px] font-bold text-[#f9efe5]"
              data-testid="button-walk-me-there"
            >
              Walk me there
            </button>
            <button
              type="button"
              onClick={() => setShowEmergency(true)}
              className="rounded-[12px] bg-[#5a1d32] px-3 py-3 text-left text-[11px] font-bold text-[#f9efe5]"
              data-testid="button-emergency-share"
            >
              Emergency share
            </button>
          </div>
        </div>

        {/* Discreet Exit — intentionally understated */}
        <div className="rounded-[20px] border border-[#3a1832] p-5">
          <p className="text-xs font-semibold text-[#9d7e8e]">Need to leave?</p>
          <button
            onClick={() => setShowExit(true)}
            className="mt-3 text-sm font-bold text-[#c695ae] hover:text-[#f9efe5]"
            data-testid="button-discreet-exit"
          >
            Help me leave →
          </button>
          <p className="mt-1 text-[10px] text-[#6a4a60]">
            Ends ordinary location sharing after you confirm. Call 911 if this is an emergency — OnlyFavors cannot dispatch help.
          </p>
        </div>

        <p className="pb-8 text-center font-mono text-[9px] uppercase tracking-widest text-[#4a2842]">
          BOOKING {id ?? '—'} · LOCATION EXPIRING AT CHECKOUT
        </p>
      </main>

      {/* Discreet exit modal */}
      {showExit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowExit(false)}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#1f0c1b] p-8" onClick={(e) => e.stopPropagation()}>
            <LifeBuoy className="h-8 w-8 text-[#df9cbd]" />
            <h2 className="mt-4 font-serif text-3xl text-[#f9efe5]">Help me leave.</h2>
            <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">
              You do not need to explain. Call 911 if you are in danger. Ordinary location sharing can stop as soon as you end the booking.
            </p>
            <div className="mt-6 space-y-3">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(live.venueName)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex w-full items-center justify-between rounded-[16px] bg-[#3dbd8c] p-4 text-sm font-bold text-[#1f0c1b]"
                data-testid="button-exit-safespot">
                <span>Directions to this SafeSpot</span><MapPin className="h-4 w-4" />
              </a>
              <a
                href={`https://www.google.com/maps/search/transit+station+near+${encodeURIComponent(live.venueName)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => { storeExactLocation('walk'); void createTrustLink('walk'); }}
                className="flex w-full items-center justify-between rounded-[16px] bg-[#7f2e62] p-4 text-sm font-bold text-white"
                data-testid="button-exit-walk">
                <span>Walk me to transport</span><Navigation className="h-4 w-4" />
              </a>
              {/* Dial first Trust Circle contact, or show trust circle setup */}
              {trustContacts.length > 0 ? (
                <a href={`tel:${trustContacts[0].phone}`}
                  className="flex w-full items-center justify-between rounded-[16px] bg-[#2d1228] p-4 text-sm font-bold text-[#f9efe5]"
                  data-testid="button-exit-contact">
                  <span>Call {trustContacts[0].name}</span><Phone className="h-4 w-4" />
                </a>
              ) : (
                <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/trust-circle`}
                  className="flex w-full items-center justify-between rounded-[16px] bg-[#2d1228] p-4 text-sm font-bold text-[#f9efe5]"
                  data-testid="button-exit-contact">
                  <span>Set up trusted contact</span><Phone className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={async () => {
                  setShowExit(false);
                  setCompleting(true);
                  try {
                    try { await stopSharing(); } catch {}
                    await fetch(`/api/bookings/${id}/complete`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                    });
                  } catch {}
                  setCompletedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  setCompleted(true);
                  setCompleting(false);
                }}
                className="flex w-full items-center justify-between rounded-[16px] bg-[#2d1228] p-4 text-sm font-bold text-[#f9efe5]"
                data-testid="button-exit-end">
                <span>End booking now</span><X className="h-4 w-4" />
              </button>
            </div>
            <button onClick={() => setShowExit(false)} className="mt-5 w-full text-center text-sm text-[#9d7e8e]">
              Stay — I'm fine
            </button>
          </div>
        </div>
      )}

      {/* Extend booking modal */}
      {showExtend && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowExtend(false)}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#1f0c1b] p-8" onClick={(e) => e.stopPropagation()}>
            <TimerReset className="h-8 w-8 text-[#df9cbd]" />
            <h2 className="mt-4 font-serif text-3xl text-[#f9efe5]">Extend the time?</h2>
            <p className="mt-3 text-sm text-[#d9c4cf]">Both you and your companion must agree. Payment is processed immediately.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[30, 60].map((min) => (
                <button key={min}
                  disabled={extending !== null}
                  onClick={async () => {
                    setExtending(min);
                    try {
                      await fetch(`/api/bookings/${id}/extend`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ extraMinutes: min }),
                      });
                    } catch {}
                    setBonusMinutes((b) => b + min);
                    setExtending(null);
                    setShowExtend(false);
                  }}
                  className="rounded-[16px] bg-[#3d2038] p-5 text-center hover:bg-[#4a2842] disabled:opacity-60"
                  data-testid={`button-extend-${min}`}>
                  {extending === min ? (
                    <p className="font-serif text-xl text-[#c695ae]">Adding…</p>
                  ) : (
                    <>
                      <p className="font-serif text-3xl text-[#f9efe5]">+{min}</p>
                      <p className="mt-1 text-xs text-[#c695ae]">minutes</p>
                    </>
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setShowExtend(false)} className="mt-5 w-full text-center text-sm text-[#9d7e8e]">Cancel</button>
          </div>
        </div>
      )}

      {/* QR Check-in modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowQr(false)}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#1f0c1b] p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c695ae]">SafeSpot check-in</p>
                <h2 className="mt-1 font-serif text-3xl text-[#f9efe5]">Show this at the venue.</h2>
              </div>
              <button onClick={() => setShowQr(false)} className="grid h-9 w-9 place-items-center rounded-full bg-[#3d2038] text-[#d9c4cf]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* QR code */}
            <div className="mt-6 flex justify-center">
              <div className="rounded-[20px] bg-white p-5">
                <QRCodeSVG
                  value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/checkin?booking=${id}&venue=${encodeURIComponent(live.venueName)}&ts=${Date.now()}`}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] leading-5 text-[#9d7e8e]">
              Confirming arrival records that you are at this public SafeSpot. It does not share the route you took.
            </p>

            <div className="mt-6 space-y-3">
              <button
                onClick={async () => {
                  try { await postCheckIn('arrival'); } catch {}
                  setCheckedIn(true);
                  setShowQr(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#3dbd8c] px-5 py-3 text-sm font-bold text-white"
                data-testid="button-confirm-checkin"
              >
                <Check className="h-4 w-4" />Confirm I've arrived
              </button>
              <button onClick={() => setShowQr(false)} className="w-full text-center text-sm text-[#9d7e8e]">
                Still on my way
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency share — 911 first */}
      {showEmergency && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowEmergency(false)}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#1f0c1b] p-8" onClick={(e) => e.stopPropagation()}>
            <AlertCircle className="h-8 w-8 text-[#df9cbd]" />
            <h2 className="mt-4 font-serif text-3xl text-[#f9efe5]">Call 911 first.</h2>
            <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">
              OnlyFavors cannot dispatch emergency services. After you are in touch with 911, you can share a temporary map of your last check-in with your Trust Circle. That map is not a live pin.
            </p>
            <div className="mt-6 space-y-3">
              <a
                href="tel:911"
                className="flex w-full items-center justify-between rounded-[16px] bg-[#7f2e62] p-4 text-sm font-bold text-white"
                data-testid="button-call-911"
              >
                <span>Call 911</span><Phone className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => {
                  if (!id) return;
                  const send = (lat?: number, lng?: number) => {
                    fetch(`/api/bookings/${id}/emergency-share`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(lat != null && lng != null ? { lat, lng } : {}),
                    })
                      .then(async (res) => {
                        const body = await res.json().catch(() => ({})) as { path?: string; reason?: string; notified?: number; error?: string };
                        if (body.path) {
                          const url = `${window.location.origin}${body.path}`;
                          setTrustLink(url);
                          await navigator.clipboard.writeText(url).catch(() => {});
                        }
                        setLocationSharing(true);
                        setShareKind('emergency');
                        setEmergencyNote(
                          body.error
                            ?? (body.notified
                              ? `Trust Circle was emailed a temporary map.${body.reason ? ` ${body.reason}` : ''}`
                              : (body.reason ?? 'Could not reach Trust Circle. Call 911 if this is an emergency.')),
                        );
                      })
                      .catch(() => setEmergencyNote('Could not share. Call 911 if this is an emergency.'));
                  };
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => send(pos.coords.latitude, pos.coords.longitude),
                      () => send(),
                      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30_000 },
                    );
                  } else send();
                }}
                className="flex w-full items-center justify-between rounded-[16px] bg-[#2d1228] p-4 text-sm font-bold text-[#f9efe5]"
                data-testid="button-confirm-emergency-share"
              >
                <span>Then share a temporary map</span><MapPin className="h-4 w-4" />
              </button>
            </div>
            {emergencyNote && <p className="mt-4 text-[11px] leading-5 text-[#df9cbd]">{emergencyNote}</p>}
            <button type="button" onClick={() => setShowEmergency(false)} className="mt-5 w-full text-center text-sm text-[#9d7e8e]">
              Close
            </button>
          </div>
        </div>
      )}
      {showEnd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => { if (!completing) setShowEnd(false); }}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#1f0c1b] p-8" onClick={(e) => e.stopPropagation()}>
            <CheckCircle2 className="h-8 w-8 text-[#3dbd8c]" />
            <h2 className="mt-4 font-serif text-3xl text-[#f9efe5]">End this booking?</h2>
            <p className="mt-3 text-sm text-[#d9c4cf]">Checkout is recorded, then payment is captured unless a payout is held. Location sharing stops.</p>
            <button
              disabled={completing}
              onClick={async () => {
                setCompleting(true);
                try {
                  try { await postCheckIn('checkout'); } catch {}
                  try { await stopSharing(); } catch {}
                  await fetch(`/api/bookings/${id}/complete`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                  });
                } catch {}
                setCompletedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                setCompleted(true);
                setShowEnd(false);
                setCompleting(false);
              }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#3dbd8c] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              data-testid="button-confirm-end">
              {completing ? 'Wrapping up…' : (<>Confirm mutual checkout <Check className="h-4 w-4" /></>)}
            </button>
            <button onClick={() => setShowEnd(false)} className="mt-4 w-full text-center text-sm text-[#9d7e8e]">Go back</button>
          </div>
        </div>
      )}

      {/* Memory Card — shown after booking completes */}
      {completed && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-t-[28px] bg-gradient-to-b from-[#2d1128] to-[#1f0c1b] p-8">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#7f2e62]">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#9d7e8e]">Private memory card</p>
                <p className="text-sm font-bold text-[#f9efe5]">Booking complete</p>
              </div>
            </div>

            {/* Memory details */}
            <div className="mt-6 rounded-[18px] border border-[#4a2040] bg-[#2d1128] p-5">
              <p className="font-serif text-2xl text-[#f9efe5]">{live.activity}</p>
              <p className="mt-1 text-xs text-[#9d7e8e]">with {live.companionName} · {live.venueName}</p>
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#4a2040] pt-5">
                <div className="text-center">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#6b4560]">Duration</p>
                  <p className="mt-1 font-serif text-lg text-[#f9efe5]">{fmt(elapsed)}</p>
                </div>
                <div className="text-center">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#6b4560]">Ended at</p>
                  <p className="mt-1 font-serif text-lg text-[#f9efe5]">{completedAt}</p>
                </div>
                <div className="text-center">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#6b4560]">Check-in</p>
                  <p className="mt-1 font-serif text-lg text-[#f9efe5]">{checkedIn ? 'Yes' : '—'}</p>
                </div>
              </div>
            </div>

            {/* Privacy note */}
            <div className="mt-4 flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b4560]" />
              <p className="text-[10px] leading-5 text-[#6b4560]">This card exists only on this device. Nothing is shared without your explicit consent. No names, no places, no timestamps leave this screen.</p>
            </div>

            <div className="mt-6 space-y-3">
              <a
                href={id ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/booking/${id}` : '/'}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] px-5 py-3 text-sm font-bold text-white"
                data-testid="link-memory-card-booking"
              >
                Leave a review <ArrowRight className="h-4 w-4" />
              </a>
              <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/`} className="block w-full text-center text-sm text-[#9d7e8e]">
                Back to home
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
