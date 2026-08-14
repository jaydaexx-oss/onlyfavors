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
import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronRight,
  Clock, Heart, HeartHandshake, LifeBuoy, LockKeyhole, MapPin,
  Navigation, Phone, QrCode, Radio, Shield, ShieldCheck, TimerReset, Users, X,
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

// Demo booking data — replaced by real API data once Task #1 auth lands
const DEMO = {
  companion: { name: 'Leilani K.', activity: 'Evening walk & coffee', city: 'Waikīkī' },
  venue: { name: 'The Surfjack Hotel Café', hint: 'Pool deck entrance, ask for the OF table' },
  totalMinutes: 120,
  boundaries: ['Platonic only', 'No photography without asking', 'Public spaces only'],
};

type TrustContact = { id: string; name: string; phone: string; relation: string };

export default function FavorMode() {
  const { id } = useParams<{ id: string }>();

  // Timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Trust Circle — read from localStorage (persisted by TrustCircleSetup page)
  const [trustContacts] = useState<TrustContact[]>(() => {
    try { return JSON.parse(localStorage.getItem('of_trust_circle') ?? '[]'); }
    catch { return []; }
  });

  // Safety state
  const [checkedIn, setCheckedIn] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [safeSignalSent, setSafeSignalSent] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [locationSharing, setLocationSharing] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState('');
  const [bonusMinutes, setBonusMinutes] = useState(0);
  const [extending, setExtending] = useState<number | null>(null);

  const totalMinutes = DEMO.totalMinutes + bonusMinutes;
  const progress = Math.min(elapsed / (totalMinutes * 60), 1);
  const remainingMin = Math.max(0, totalMinutes - Math.floor(elapsed / 60));

  return (
    <div className="min-h-screen bg-[#1f0c1b] text-[#f9efe5]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[#4a2040] bg-[#1f0c1b]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[13px] bg-[#7f2e62] text-sm font-bold text-[#fff5eb]">of</span>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#c695ae]">Favor in progress</p>
              <p className="text-sm font-bold">{DEMO.companion.name}</p>
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
              <p className="font-bold text-[#f9efe5]">{DEMO.venue.name}</p>
              <p className="mt-0.5 text-xs text-[#d9c4cf]">{DEMO.venue.hint}</p>
              <p className="mt-1 text-[10px] text-[#3dbd8c] font-semibold">Verified SafeSpot</p>
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
              {checkedIn ? 'Contacts notified' : 'Scan at SafeSpot'}
            </p>
          </button>

          <button
            onClick={() => setSafeSignalSent(true)}
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
              {safeSignalSent ? 'Signal sent ✓' : "I'm safe"}
            </p>
            <p className="mt-0.5 text-[10px] text-[#d9c4cf]">
              {safeSignalSent ? 'All quiet' : 'Ping Trust Circle'}
            </p>
          </button>
        </div>

        {/* Trust Circle */}
        <div className="rounded-[20px] bg-[#2d1228] p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Trust Circle</p>
            {trustContacts.length > 0 ? (
              <span className="flex items-center gap-1 text-[10px] text-[#3dbd8c]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3dbd8c]" />
                Watching
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
                    <p className="text-[10px] text-[#d9c4cf]">{contact.relation} · {contact.phone}</p>
                  </div>
                  <Users className="h-4 w-4 text-[#3dbd8c]" />
                </div>
              ))}
              <p className="mt-4 text-[10px] leading-5 text-[#9d7e8e]">
                They receive check-in updates. A missed check-in alert fires automatically if you don't respond.
              </p>
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
            {DEMO.boundaries.map((b) => (
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
            <p className="mt-0.5 text-[10px] text-[#d9c4cf]">Mutual checkout</p>
          </button>
        </div>

        {/* Location toggle */}
        <div className="rounded-[20px] bg-[#2d1228] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Navigation className={`h-5 w-5 ${locationSharing ? 'text-[#3dbd8c]' : 'text-[#9d7e8e]'}`} />
              <div>
                <p className="text-sm font-bold text-[#f9efe5]">Location sharing</p>
                <p className="text-[10px] text-[#d9c4cf]">
                  {locationSharing ? 'Shared with Trust Circle only · auto-stops after checkout' : 'Off'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setLocationSharing(!locationSharing)}
              className={`h-7 w-12 rounded-full transition-colors ${locationSharing ? 'bg-[#3dbd8c]' : 'bg-[#4a2842]'}`}
              data-testid="toggle-location"
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${locationSharing ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-[#9d7e8e]">
            Precise location is never stored. Sharing stops automatically after checkout and is deleted within 24 hours.
          </p>
        </div>

        {/* Discreet Exit — intentionally understated */}
        <div className="rounded-[20px] border border-[#3a1832] p-5">
          <p className="text-xs font-semibold text-[#9d7e8e]">Need to step away?</p>
          <button
            onClick={() => setShowExit(true)}
            className="mt-3 text-sm font-bold text-[#c695ae] hover:text-[#f9efe5]"
            data-testid="button-discreet-exit"
          >
            Change plans quietly →
          </button>
          <p className="mt-1 text-[10px] text-[#6a4a60]">
            No explanation needed. We will help you leave gracefully and notify your Trust Circle.
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
            <h2 className="mt-4 font-serif text-3xl text-[#f9efe5]">We will help you leave.</h2>
            <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">
              Your Trust Circle will be notified. You don't need to explain anything to anyone right now.
            </p>
            <div className="mt-6 space-y-3">
              {/* Opens Google Maps walking directions to nearest transit */}
              <a
                href={`https://www.google.com/maps/search/transit+station+near+${encodeURIComponent(DEMO.venue.name)}`}
                target="_blank" rel="noopener noreferrer"
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
                    await fetch(`/api/bookings/${id ?? 'demo'}/complete`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
                      await fetch(`/api/bookings/${id ?? 'demo'}/extend`, {
                        method: 'POST',
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
                  value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/checkin?booking=${id ?? 'demo'}&venue=${encodeURIComponent(DEMO.venue.name)}&ts=${Date.now()}`}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] leading-5 text-[#9d7e8e]">
              Venue staff scan this to log your arrival. Your Trust Circle gets a quiet "arrived safely" — no details shared.
            </p>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => { setCheckedIn(true); setShowQr(false); }}
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

      {/* End booking modal */}
      {showEnd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => { if (!completing) setShowEnd(false); }}>
          <div className="w-full max-w-md rounded-t-[28px] bg-[#1f0c1b] p-8" onClick={(e) => e.stopPropagation()}>
            <CheckCircle2 className="h-8 w-8 text-[#3dbd8c]" />
            <h2 className="mt-4 font-serif text-3xl text-[#f9efe5]">End this booking?</h2>
            <p className="mt-3 text-sm text-[#d9c4cf]">Both parties confirm. Payment releases, location sharing stops, and a private memory card is offered.</p>
            <button
              disabled={completing}
              onClick={async () => {
                setCompleting(true);
                try {
                  const bookingId = id ?? 'demo';
                  await fetch(`/api/bookings/${bookingId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
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
              <p className="font-serif text-2xl text-[#f9efe5]">{DEMO.companion.activity}</p>
              <p className="mt-1 text-xs text-[#9d7e8e]">with {DEMO.companion.name} · {DEMO.venue.name}</p>
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
