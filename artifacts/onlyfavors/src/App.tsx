import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe, type Stripe as StripeType } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Bell, BookOpen, Building2, CalendarDays, Camera, Check, ChevronDown, ChevronRight,
  CircleAlert, ClipboardCheck, Clock3, Coffee, Compass, EyeOff, FileText, Gift, Heart, HeartHandshake, HelpCircle,
  KeyRound, Landmark, LifeBuoy, LockKeyhole, LogIn, Mail, Map, MapPin, Menu, MessageCircle, MessageSquare,
  Navigation2, PanelLeft, Pencil, Plus, RefreshCw, Search, Send, Share2, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Star, Sunrise, TrendingUp, User, UserPlus, Users, UsersRound, UtensilsCrossed, WalletCards, X, Zap, Lock, Lightbulb,
  Mountain, Wine,
} from 'lucide-react';
import SafeSpotMap from '@/components/safe-spot-map';
import FavorMode from '@/pages/favor-mode';
import LocationShare from '@/pages/location-share';
import { approxMiles, isInNewOrleans, neighborhoodCenter, NOLA_AREAS, MAX_NEAR_ME_MILES, NEAR_ME_RADIUS_OPTIONS } from '@/lib/nola-areas';
import {
  getGetCompanionQueryKey, getGetCustomerDashboardQueryKey, getGetCompanionDashboardQueryKey,
  getGetAdminOverviewQueryKey, getGetSafetyResourcesQueryKey, getListCompanionsQueryKey,
  getListSafeSpotsQueryKey, getGetBookingQuoteQueryKey,
  useCreateBookingIntent, useGetAdminOverview, useGetCompanion,
  useGetCompanionDashboard, useGetCustomerDashboard, useGetSafetyResources, useHealthCheck,
  useListCompanions, useListSafeSpots, useGetBookingQuote, useCreateFavorRequest,
  useAuthorizeDeposit, useAuthorizeFullPayment,
  type BookingInput, type Companion, type SafeSpot, type Booking,
} from '@workspace/api-client-react';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, confirmAge, dashboardPath, requestOtp, useAuth, verifyOtp, type LoginIntent } from '@/lib/auth-session';
// NotFound defined inline below to match design system
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={cn('inline-flex items-center gap-2.5 group', dark ? 'text-[#f9efe5]' : 'text-[#48213d')} data-testid="link-brand">
      <span className={cn('relative grid h-9 w-9 place-items-center rounded-full border-2 font-serif text-[17px] leading-none transition-transform group-hover:rotate-6', dark ? 'border-[#f9efe5] text-[#f9efe5]' : 'border-[#7f2e62] text-[#7f2e62]')} aria-hidden>
        O
        <Shield className={cn('absolute h-2.5 w-2.5', dark ? 'text-[#c45b8f]' : 'text-[#7f2e62]')} strokeWidth={2.6} />
      </span>
      <span className="font-serif text-[25px] leading-none tracking-tight">
        <span className="relative inline-block">
          O
          <Shield className={cn('absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-[42%]', dark ? 'text-[#c45b8f]' : 'text-[#7f2e62]')} strokeWidth={2.6} aria-hidden />
        </span>
        nlyFavors
      </span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const dashboard = dashboardPath(user);
  return <header className="sticky top-0 z-40 border-b border-[#ddcfc6] bg-[#f8f1e9]/90 backdrop-blur-md">
    <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-5 lg:px-8">
      <Brand />
      <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
        <Link href="/explore" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-explore">Explore</Link>
        <Link href="/safety" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-safety">Safety</Link>
        <Link href="/safespots" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-safespots">SafeSpots</Link>
        <Link href={user ? '/companion/apply' : '/login?intent=companion'} className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-apply">Become a companion</Link>
      </nav>
      <div className="hidden items-center gap-3 md:flex">
        <button type="button"
          onClick={() => (document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })))}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#dfd2c9] bg-[#f0e4db]/80 px-3 text-[11px] font-semibold text-[#9b6b88] transition hover:border-[#9d557e] hover:text-[#7f2e62]"
          aria-label="Open command palette" data-testid="button-cmd-k">
          <Search className="h-3 w-3" /><span className="font-mono">⌘K</span>
        </button>
        {user && <NotificationBell role={user.roles.includes('companion') ? 'companion' : 'customer'} />}
        <SavedNavIcon />
        {user ? (
          <>
            {user.roles.includes('customer') && user.roles.includes('companion') && (
              <div className="flex overflow-hidden rounded-full border border-[#dfd2c9]">
                <Link href="/dashboard/customer" className="px-3 py-2 text-[11px] font-bold text-[#654c5f] hover:bg-[#eee2d9]" data-testid="link-switch-customer">Customer</Link>
                <Link href="/dashboard/companion" className="px-3 py-2 text-[11px] font-bold text-[#654c5f] hover:bg-[#eee2d9]" data-testid="link-switch-companion">Companion</Link>
              </div>
            )}
            <Link href={dashboard} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-[#654c5f] transition hover:bg-[#eee2d9]" data-testid="link-account">{user.displayName || user.email.split('@')[0]}</Link>
            <button type="button" onClick={() => void logout()} className="inline-flex h-10 items-center rounded-full px-3 text-[13px] font-semibold text-[#654c5f] transition hover:bg-[#eee2d9]" data-testid="button-logout">Sign out</button>
          </>
        ) : (
          <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-[#654c5f] transition hover:bg-[#eee2d9]" data-testid="link-login"><LogIn className="h-4 w-4" />Sign in</Link>
        )}
        <Link href="/messages" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#654c5f] transition hover:bg-[#eee2d9] hover:text-[#7f2e62]" data-testid="link-nav-messages" aria-label="Messages">
          <MessageCircle className="h-5 w-5" />
        </Link>
        <Link href="/explore" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-[13px] font-bold text-[#fff5eb] shadow-[0_7px_18px_rgba(127,46,98,.18)] transition hover:-translate-y-0.5 hover:bg-[#65234e]" data-testid="link-find-companion">Find a companion <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="rounded-xl p-2 text-[#48213d] md:hidden" data-testid="button-mobile-menu" aria-label="Open menu">{open ? <X /> : <Menu />}</button>
    </div>
    {open && <div className="border-t border-[#ddcfc6] bg-[#f8f1e9] px-5 py-4 md:hidden">
      <div className="flex flex-col gap-1">
        <Link href="/explore" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-explore">Explore companions</Link>
        <Link href="/saved" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-saved">Saved companions</Link>
        <Link href="/pricing" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-pricing">Pricing</Link>
        <Link href="/about" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-about">About</Link>
        <Link href="/help" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-help">Help centre</Link>
        <Link href="/safety" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-safety">Safety center</Link>
        <Link href="/safespots" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-safespots">SafeSpot Network</Link>
        <Link href={user ? '/companion/apply' : '/login?intent=companion'} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-apply">Become a companion</Link>
        <div className="my-1 h-px bg-[#ddcfc6]" />
        {user ? (
          <>
            <Link href={dashboard} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-account">Your workspace</Link>
            <button type="button" onClick={() => { setOpen(false); void logout(); }} className="rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-button-logout">Sign out</button>
          </>
        ) : (
          <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-login">Sign in</Link>
        )}
      </div>
    </div>}
  </header>;
}

function Footer() {
  return <footer className="border-t border-[#ddcfc6] bg-[#f0e4db]">
    <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
      <div><Brand /><p className="mt-4 max-w-xs text-sm leading-6 text-[#725e69]">Good company for the moments that matter. Built with privacy at the center.</p></div>
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#9a7d8c]">Discover</p><div className="space-y-2 text-sm text-[#654c5f]"><Link href="/explore" className="block hover:text-[#7f2e62]" data-testid="footer-link-explore">Explore</Link><Link href="/saved" className="block hover:text-[#7f2e62]" data-testid="footer-link-saved">Saved companions</Link><Link href="/safety" className="block hover:text-[#7f2e62]" data-testid="footer-link-safety">Safety center</Link><Link href="/safespots" className="block hover:text-[#7f2e62]" data-testid="footer-link-safespots">SafeSpot Network</Link><Link href="/cities" className="block hover:text-[#7f2e62]" data-testid="footer-link-cities">City guides</Link><Link href="/companion/apply" className="block hover:text-[#7f2e62]" data-testid="footer-link-apply">Apply to join</Link><Link href="/refer" className="block hover:text-[#7f2e62]" data-testid="footer-link-refer">Refer a friend</Link><Link href="/gift" className="block hover:text-[#7f2e62]" data-testid="footer-link-gift">Gift a favor</Link><Link href="/redeem" className="block hover:text-[#7f2e62]" data-testid="footer-link-redeem">Redeem a gift card</Link><Link href="/how-it-works" className="block hover:text-[#7f2e62]" data-testid="footer-link-how">How it works</Link><Link href="/cities/san-francisco" className="block hover:text-[#7f2e62]" data-testid="footer-link-sf">San Francisco</Link><Link href="/cities/new-york" className="block hover:text-[#7f2e62]" data-testid="footer-link-ny">New York</Link><Link href="/activities" className="block hover:text-[#7f2e62]" data-testid="footer-link-activities">Activity directory</Link><Link href="/stories" className="block hover:text-[#7f2e62]" data-testid="footer-link-stories">Stories & journal</Link><Link href="/newsletter" className="block hover:text-[#7f2e62]" data-testid="footer-link-newsletter">Companion newsletter</Link><Link href="/compare" className="block hover:text-[#7f2e62]" data-testid="footer-link-compare">Compare companions</Link></div></div>
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#9a7d8c]">Policies</p><div className="space-y-2 text-sm text-[#654c5f]"><Link href="/about" className="block hover:text-[#7f2e62]" data-testid="footer-link-about">About</Link><Link href="/help" className="block hover:text-[#7f2e62]" data-testid="footer-link-help">Help centre</Link><Link href="/pricing" className="block hover:text-[#7f2e62]" data-testid="footer-link-pricing">Pricing</Link><Link href="/membership" className="block hover:text-[#7f2e62]" data-testid="footer-link-membership">Membership</Link><Link href="/privacy" className="block hover:text-[#7f2e62]" data-testid="footer-link-privacy">Privacy</Link><Link href="/terms" className="block hover:text-[#7f2e62]" data-testid="footer-link-terms">Terms & community</Link><Link href="/cancellation" className="block hover:text-[#7f2e62]" data-testid="footer-link-cancellation">Cancellations</Link><Link href="/community" className="block hover:text-[#7f2e62]" data-testid="footer-link-community">Community</Link><Link href="/faq" className="block hover:text-[#7f2e62]" data-testid="footer-link-faq">FAQ</Link><Link href="/press" className="block hover:text-[#7f2e62]" data-testid="footer-link-press">Press</Link><Link href="/careers" className="block hover:text-[#7f2e62]" data-testid="footer-link-careers">Careers</Link><Link href="/accessibility" className="block hover:text-[#7f2e62]" data-testid="footer-link-accessibility">Accessibility</Link><Link href="/admin/login" className="block text-[#c6aeb8] hover:text-[#7f2e62]" data-testid="footer-link-admin">Trust team ↗</Link></div></div>
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#9a7d8c]">Need a hand?</p><div className="space-y-2 text-sm text-[#654c5f]"><p>Our trust team is here every day.</p><Link href="/help" className="inline-flex items-center gap-1 font-bold text-[#7f2e62]" data-testid="footer-link-support">Help centre <ArrowRight className="h-3.5 w-3.5" /></Link></div></div>
    </div>
    <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-[#ddcfc6] px-5 py-5 text-[11px] text-[#927e87] md:flex-row md:justify-between lg:px-8"><span>© 2025 OnlyFavors, Inc.</span><span>Private by design. Human by nature.</span></div>
  </footer>;
}

/** Saved companions — server-backed when signed in, localStorage when not. */
function useSavedCompanionIds() {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('of_saved_companions') ?? '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    if (!user) return;
    fetch('/api/saved', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((list: string[]) => {
        if (!Array.isArray(list)) return;
        setIds(list);
        try { localStorage.setItem('of_saved_companions', JSON.stringify(list)); } catch {}
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const sync = () => {
      try { setIds(JSON.parse(localStorage.getItem('of_saved_companions') ?? '[]')); }
      catch { setIds([]); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const persistLocal = (next: string[]) => {
    try { localStorage.setItem('of_saved_companions', JSON.stringify(next)); } catch {}
  };

  const add = useCallback(async (id: string) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistLocal(next);
      return next;
    });
    if (user) await fetch(`/api/saved/${id}`, { method: 'POST', credentials: 'include' });
  }, [user]);

  const remove = useCallback(async (id: string) => {
    setIds((prev) => {
      const next = prev.filter((x) => x !== id);
      persistLocal(next);
      return next;
    });
    if (user) await fetch(`/api/saved/${id}`, { method: 'DELETE', credentials: 'include' });
  }, [user]);

  const toggle = useCallback(async (id: string) => {
    const has = ids.includes(id);
    if (has) await remove(id);
    else await add(id);
    return !has;
  }, [ids, add, remove]);

  return { ids, add, remove, toggle };
}

const FAVOR_INTENT_KEY = 'of_favor_intent';

type FavorIntent = {
  activity: string;
  date: string;
  durationHours: number;
  vibe: string;
  area: string;
};

function chicagoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function readFavorIntent(): FavorIntent | null {
  try {
    const raw = sessionStorage.getItem(FAVOR_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FavorIntent;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeFavorIntent(intent: FavorIntent) {
  try { sessionStorage.setItem(FAVOR_INTENT_KEY, JSON.stringify(intent)); } catch {}
}

function bookHref(companionId: string, intent?: FavorIntent | null): string {
  const q = new URLSearchParams({ companion: companionId });
  const saved = intent ?? readFavorIntent();
  if (saved?.activity) q.set('activity', saved.activity);
  if (saved?.date) q.set('date', saved.date);
  if (saved?.durationHours) q.set('duration', String(saved.durationHours));
  return `/book?${q.toString()}`;
}

function intentExplorePath(intent: FavorIntent): string {
  const q = new URLSearchParams();
  if (intent.activity) q.set('activity', intent.activity);
  if (intent.date) q.set('date', intent.date);
  if (intent.durationHours) q.set('duration', String(intent.durationHours));
  if (intent.vibe) q.set('vibe', intent.vibe);
  if (intent.area && intent.area !== 'New Orleans') q.set('area', intent.area);
  const s = q.toString();
  return s ? `/explore?${s}` : '/explore';
}

const INTENT_EXAMPLES: Array<{ label: string; activity: string; vibe: string; area: string }> = [
  { label: 'I need a wedding plus-one.', activity: 'Event plus-one', vibe: 'social', area: 'New Orleans' },
  { label: 'Coffee and conversation tonight.', activity: 'Coffee conversations', vibe: 'low-key', area: 'French Quarter' },
  { label: 'Come to this concert with me.', activity: 'Concerts', vibe: 'social', area: 'New Orleans' },
  { label: 'A museum afternoon.', activity: 'Museum visits', vibe: 'cultural', area: 'Warehouse District' },
];

const INTENT_VIBE_KEYWORDS: Record<string, string[]> = {
  adventurous: ['hiking', 'climbing', 'outdoor', 'adventure', 'walk', 'cycling'],
  cultural: ['museum', 'gallery', 'art', 'theatre', 'history', 'architecture'],
  'low-key': ['coffee', 'conversation', 'walk', 'quiet', 'bookstore', 'reading'],
  foodie: ['dinner', 'cooking', 'food', 'restaurant', 'dining', 'brunch'],
  creative: ['art', 'photography', 'craft', 'sketch', 'painting', 'writing'],
  social: ['event', 'plus-one', 'concert', 'festival', 'meetup', 'party'],
};

function GuestMatchCard({
  companion, durationHours, intent,
}: {
  companion: DirectoryCompanion;
  durationHours: number;
  intent: FavorIntent;
}) {
  const { user } = useAuth();
  const quoteParams = { companionId: companion.id, durationHours };
  const quoteQuery = useGetBookingQuote(quoteParams, {
    query: { enabled: durationHours >= 1, queryKey: getGetBookingQuoteQueryKey(quoteParams) },
  });
  const quote = quoteQuery.data;
  const requestHref = user
    ? bookHref(companion.id, intent)
    : `/login?intent=customer&next=${encodeURIComponent(bookHref(companion.id, intent))}`;
  return (
    <article className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5" data-testid={`guest-match-${companion.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-2xl text-[#48213d]">{companion.displayName}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-[#806c76]"><MapPin className="h-3 w-3" />{companion.serviceArea}, New Orleans</p>
        </div>
        {companion.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-[#7f2e62]" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {companion.activities.slice(0, 3).map((act) => (
          <span key={act} className="rounded-full bg-[#ead0dd] px-2.5 py-1 text-[10px] font-semibold text-[#7f2e62]">{act}</span>
        ))}
      </div>
      <div className="mt-4 border-t border-[#ece1d9] pt-4">
        {quote ? (
          <>
            <p className="font-serif text-2xl text-[#48213d]">{money(quote.totalCents)}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#806c76]">{durationHours} hr · includes 5% safety fee · $10 deposit credited</p>
          </>
        ) : (
          <p className="text-xs text-[#806c76]">{money(companion.hourlyRate * 100)} / hr · total calculated on the server</p>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Link href={`/companions/${companion.id}`} className="inline-flex h-10 items-center justify-center rounded-full border border-[#dfd2c9] text-xs font-bold text-[#654c5f]" data-testid={`link-guest-profile-${companion.id}`}>
          {user ? 'View profile' : 'View profile — signup to request'}
        </Link>
        <Link href={requestHref} className="inline-flex h-10 items-center justify-center rounded-full bg-[#7f2e62] text-xs font-bold text-[#fff5eb]" data-testid={`link-guest-request-${companion.id}`}>
          {user ? 'Send a request' : 'Sign in to send a request'}
        </Link>
      </div>
    </article>
  );
}

function HomeIntentPreview() {
  const saved = readFavorIntent();
  const [activity, setActivity] = useState(saved?.activity ?? '');
  const [date, setDate] = useState(saved?.date ?? chicagoToday());
  const [durationHours, setDurationHours] = useState(saved?.durationHours ?? 2);
  const [vibe, setVibe] = useState(saved?.vibe ?? '');
  const [area, setArea] = useState(saved?.area ?? 'New Orleans');
  const [submitted, setSubmitted] = useState(Boolean(saved?.activity));

  const intent: FavorIntent = { activity, date, durationHours, vibe, area };

  const applyExample = (example: (typeof INTENT_EXAMPLES)[number]) => {
    setActivity(example.activity);
    setVibe(example.vibe);
    setArea(example.area);
    setDate(chicagoToday());
    setSubmitted(true);
    writeFavorIntent({ activity: example.activity, date: chicagoToday(), durationHours, vibe: example.vibe, area: example.area });
  };

  const search = () => {
    writeFavorIntent(intent);
    setSubmitted(true);
  };

  const listParams = useMemo(() => ({
    city: 'New Orleans',
    ...(area && area !== 'New Orleans' ? { area } : {}),
    ...(activity ? { activity } : {}),
    ...(date ? { when: date } : {}),
  }), [area, activity, date]);

  const query = useListCompanions(listParams as Parameters<typeof useListCompanions>[0], {
    query: {
      enabled: submitted,
      queryKey: getListCompanionsQueryKey(listParams as Parameters<typeof getListCompanionsQueryKey>[0]),
      retry: false,
    },
  });

  const matches = useMemo(() => {
    const rows = (query.data ?? []) as DirectoryCompanion[];
    const kw = vibe ? INTENT_VIBE_KEYWORDS[vibe] ?? [] : [];
    const vibeFiltered = kw.length
      ? rows.filter((c) => {
          const hay = [...c.activities, ...(c.interviewAnswers ?? []), c.biography ?? ''].join(' ').toLowerCase();
          return kw.some((k) => hay.includes(k)) || c.activities.some((a) => a.toLowerCase().includes(activity.toLowerCase()));
        })
      : rows;
    return (vibeFiltered.length ? vibeFiltered : rows).slice(0, 3);
  }, [query.data, vibe, activity]);

  return (
    <section className="relative overflow-hidden border-b border-[#ddcfc6] bg-[#efe1dc]">
      <div className="mx-auto grid max-w-7xl items-start gap-10 px-5 py-16 md:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-20">
        <div>
          <p className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8e4b75]">New Orleans pilot</p>
          <h1 className="font-serif text-[52px] leading-[.92] tracking-[-.04em] text-[#48213d] md:text-[72px]">What don’t you want<br /><em className="text-[#8e416e]">to do alone?</em></h1>
          <p className="mt-6 max-w-md text-[17px] leading-7 text-[#654c5f]">Tell us the plan. We’ll show who is actually available — with the full price — before you create an account.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {INTENT_EXAMPLES.map((example) => (
              <button key={example.label} type="button" onClick={() => applyExample(example)}
                className="rounded-full border border-[#dfd2c9] bg-white px-3.5 py-2 text-left text-xs font-semibold text-[#654c5f] hover:border-[#7f2e62] hover:text-[#7f2e62]"
                data-testid={`intent-example-${example.activity.toLowerCase().replace(/\s+/g, '-')}`}>
                {example.label}
              </button>
            ))}
          </div>
          <form className="mt-8 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); search(); }} data-testid="form-home-intent">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#9b858e]">Activity</span>
              <input value={activity} onChange={(e) => setActivity(e.target.value)} required placeholder="Coffee, museum, concert, plus-one…"
                className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-intent-activity" />
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#9b858e]">Neighborhood</span>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-intent-area">
                {NOLA_AREAS.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#9b858e]">Date (Central Time)</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-intent-date" />
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#9b858e]">Duration</span>
              <select value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-intent-duration">
                {[1, 1.5, 2, 3, 4, 7].map((h) => <option key={h} value={h}>{h === 7 ? 'Full day (7 hr)' : `${h} hour${h === 1 ? '' : 's'}`}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#9b858e]">Vibe</span>
              <select value={vibe} onChange={(e) => setVibe(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-intent-vibe">
                <option value="">Any</option>
                <option value="low-key">Low-key</option>
                <option value="cultural">Cultural</option>
                <option value="social">Social</option>
                <option value="foodie">Foodie</option>
                <option value="creative">Creative</option>
              </select>
            </label>
            <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-[#fff5eb] sm:col-span-2" data-testid="button-intent-search">
              Show who is available <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-4 text-xs leading-5 text-[#856c79]">Signup is only required to send a request or open masked chat. Browse and this preview stay free. We never invent companions to fill three slots.</p>
        </div>
        <div>
          {!submitted ? (
            <div className="rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
              <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Personalized preview</p>
              <h2 className="mt-3 font-serif text-3xl text-[#48213d]">Tell us the moment.</h2>
              <p className="mt-3 text-sm leading-6 text-[#725e69]">Up to three approved people with a real availability window for that date, and a server-calculated total. Empty means empty.</p>
            </div>
          ) : query.isLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Looking at real availability…</p>
          ) : matches.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[#c6aeb8] bg-[#fdf9f6] p-8" data-testid="guest-matches-empty">
              <p className="font-serif text-3xl text-[#48213d]">No one is listed for that plan yet.</p>
              <p className="mt-3 text-sm leading-6 text-[#725e69]">OnlyFavors does not invent matches. Try another activity or date, or browse the directory when companions are approved.</p>
              <Link href="/explore" className="mt-6 inline-flex text-xs font-bold text-[#7f2e62]">Open Explore <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </div>
          ) : (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">{matches.length} available preview{matches.length === 1 ? '' : 's'}</p>
              <div className="mt-4 grid gap-3">
                {matches.map((c) => (
                  <GuestMatchCard key={c.id} companion={c} durationHours={durationHours} intent={intent} />
                ))}
              </div>
              <Link href={intentExplorePath(intent)} className="mt-4 inline-flex text-xs font-bold text-[#7f2e62]" data-testid="link-intent-explore">
                See everyone who matches <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
              <p className="mt-3 text-[11px] leading-5 text-[#806c76]">If a companion cancels or no-shows, the customer is refunded. We do not promise a replacement person.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notification bell
// ---------------------------------------------------------------------------

type Notif = {
  id: string; kind: string; title: string; body: string;
  href: string; createdAt: string; read: boolean; audience: string;
};

const NOTIF_ICONS: Record<string, typeof Bell> = {
  booking_request: CalendarDays,
  booking_accepted: Check,
  booking_declined: AlertTriangle,
  new_message: MessageSquare,
  payout_ready: Send,
};

function useNotifications(role: 'customer' | 'companion') {
  return useQuery<Notif[]>({
    queryKey: ['notifications', role],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?role=${role}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: false,
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotificationBell({ role = 'customer' }: { role?: 'customer' | 'companion' }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useNotifications(role);
  const notifs = data ?? [];
  const unread = notifs.filter((n) => !n.read).length;
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    qc.invalidateQueries({ queryKey: ['notifications', role] });
  };

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
    qc.invalidateQueries({ queryKey: ['notifications', role] });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#654c5f] transition hover:bg-[#eee2d9] hover:text-[#7f2e62]"
        aria-label="Notifications"
        data-testid="button-notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#7f2e62] font-mono text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-[20px] border border-[#dfd2c9] bg-white shadow-[0_20px_50px_rgba(61,32,56,.15)]" data-testid="panel-notifications">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#ece1d9] bg-[#fbf7f1] px-4 py-3">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-[10px] font-bold text-[#7f2e62] hover:underline" data-testid="button-mark-all-read">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[340px] divide-y divide-[#f0e8e2] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-7 w-7 text-[#c6aeb8]" />
                <p className="text-sm font-semibold text-[#806c76]">All caught up</p>
                <p className="text-xs text-[#9b858e]">New booking and message alerts appear here.</p>
              </div>
            ) : notifs.map((n) => {
              const Icon = NOTIF_ICONS[n.kind] ?? Bell;
              const accentClass = n.kind === 'booking_declined' ? 'bg-[#fdf3f1] text-[#a64742]'
                : n.kind === 'booking_accepted' || n.kind === 'payout_ready' ? 'bg-[#e8f0e8] text-[#477254]'
                : 'bg-[#ead0dd] text-[#7f2e62]';
              return (
                <a
                  key={n.id}
                  href={n.href}
                  onClick={() => { markRead(n.id); setOpen(false); }}
                  className={`flex gap-3 px-4 py-3.5 transition hover:bg-[#fdf9f6] ${n.read ? 'opacity-60' : ''}`}
                  data-testid={`notif-${n.id}`}
                >
                  <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${accentClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-[#48213d]">{n.title}</p>
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7f2e62]" />}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-[#725e69]">{n.body}</p>
                    <p className="mt-1 font-mono text-[9px] text-[#9b858e]">{timeAgo(n.createdAt)}</p>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-[#ece1d9] bg-[#fbf7f1] px-4 py-2.5 flex items-center justify-between">
            <p className="text-[9px] text-[#9b858e]">Refreshes every 30s</p>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-[10px] font-bold text-[#7f2e62] hover:underline" data-testid="link-all-notifications">
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SavedNavIcon() {
  const { ids } = useSavedCompanionIds();
  return (
    <Link href="/saved" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#654c5f] transition hover:bg-[#eee2d9] hover:text-[#7f2e62]" data-testid="link-nav-saved" aria-label="Saved companions">
      <Heart className="h-4 w-4" />
      {ids.length > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#7f2e62] font-mono text-[9px] font-bold text-white">
          {ids.length > 9 ? '9+' : ids.length}
        </span>
      )}
    </Link>
  );
}

function MobileBottomNav() {
  const path = window.location.pathname;
  const active = (href: string) =>
    path === href || (href !== '/' && path.startsWith(href));

  const tabs = [
    { href: '/explore',              icon: Compass,         label: 'Explore'   },
    { href: '/safespots',            icon: MapPin,          label: 'SafeSpots' },
    { href: '/messages',             icon: MessageCircle,   label: 'Messages'  },
    { href: '/saved',                icon: Heart,           label: 'Saved'     },
    { href: '/dashboard/customer',   icon: CalendarDays,    label: 'Bookings'  },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-[#ddd1c8] bg-[#f8f1e9]/95 backdrop-blur-md md:hidden"
      data-testid="mobile-bottom-nav"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ href, icon: Icon, label }) => (
        <Link key={href} href={href}
          className={`flex flex-1 flex-col items-center gap-1 px-1 py-2.5 transition-colors ${active(href) ? 'text-[#7f2e62]' : 'text-[#9b858e] hover:text-[#7f2e62]'}`}
          data-testid={`mobile-nav-${label.toLowerCase()}`}>
          <Icon className="h-5 w-5" />
          <span className="text-[9px] font-bold">{label}</span>
          {active(href) && <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-[#7f2e62]" />}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Global command palette — Cmd+K / Ctrl+K
// ---------------------------------------------------------------------------

const PALETTE_LINKS = [
  { label: 'Explore companions', href: '/explore', icon: Search, keywords: ['find', 'browse', 'search', 'directory'] },
  { label: 'My bookings', href: '/dashboard/customer/bookings', icon: CalendarDays, keywords: ['booking', 'reservation', 'upcoming'] },
  { label: 'Messages', href: '/messages', icon: MessageSquare, keywords: ['chat', 'message', 'inbox'] },
  { label: 'Saved companions', href: '/saved', icon: Heart, keywords: ['saved', 'favourite', 'wishlist'] },
  { label: 'SafeSpot Network', href: '/safespots', icon: MapPin, keywords: ['venue', 'location', 'safespot', 'meetup'] },
  { label: 'Activities directory', href: '/activities', icon: Sparkles, keywords: ['activity', 'things to do', 'museum', 'coffee'] },
  { label: 'How it works', href: '/how-it-works', icon: BookOpen, keywords: ['intro', 'guide', 'start'] },
  { label: 'Pricing', href: '/pricing', icon: WalletCards, keywords: ['cost', 'fee', 'price', 'rate'] },
  { label: 'Compare companions', href: '/compare', icon: UsersRound, keywords: ['compare', 'side by side', 'vs'] },
  { label: 'Gift a favor', href: '/gift', icon: Gift, keywords: ['gift', 'present', 'give'] },
  { label: 'Redeem gift card', href: '/redeem', icon: Gift, keywords: ['redeem', 'code', 'voucher'] },
  { label: 'City guides', href: '/cities', icon: Building2, keywords: ['city', 'san francisco', 'new york', 'location'] },
  { label: 'Stories & journal', href: '/stories', icon: BookOpen, keywords: ['story', 'article', 'blog', 'read'] },
  { label: 'Newsletter', href: '/newsletter', icon: Mail, keywords: ['subscribe', 'email', 'newsletter'] },
  { label: 'Safety center', href: '/safety', icon: ShieldCheck, keywords: ['safety', 'trust', 'help', 'emergency'] },
  { label: 'Report a concern', href: '/safety/report', icon: ShieldCheck, keywords: ['report', 'incident', 'violation', 'flag', 'abuse', 'unsafe'] },
  { label: 'Community stories', href: '/community', icon: Users, keywords: ['community', 'stories', 'testimonials', 'reviews', 'people'] },
  { label: 'Companion stats', href: '/companion/stats', icon: TrendingUp, keywords: ['stats', 'analytics', 'earnings', 'performance', 'chart'] },
  { label: 'Export your data', href: '/dashboard/customer/settings', icon: FileText, keywords: ['export', 'data', 'download', 'gdpr', 'privacy'] },
  { label: 'FAQ', href: '/faq', icon: HelpCircle, keywords: ['faq', 'questions', 'answers', 'how', 'help', 'guide'] },
  { label: 'Help centre', href: '/help', icon: HelpCircle, keywords: ['faq', 'support', 'question'] },
  { label: 'Apply as companion', href: '/companion/apply', icon: UserPlus, keywords: ['apply', 'join', 'companion', 'work'] },
  { label: 'Companion workspace', href: '/dashboard/companion', icon: UsersRound, keywords: ['dashboard', 'companion', 'earnings'] },
  { label: 'Customer workspace', href: '/dashboard/customer', icon: User, keywords: ['dashboard', 'account', 'booking'] },
  { label: 'Settings', href: '/dashboard/customer/settings', icon: SlidersHorizontal, keywords: ['settings', 'preferences', 'account'] },
  { label: 'Refer a friend', href: '/refer', icon: HeartHandshake, keywords: ['refer', 'invite', 'credit'] },
  { label: 'Notifications', href: '/notifications', icon: Bell, keywords: ['notification', 'alert', 'update'] },
  { label: 'Careers', href: '/careers', icon: Sparkles, keywords: ['job', 'work', 'career', 'hire'] },
  { label: 'Companion onboarding', href: '/companion/onboarding', icon: Check, keywords: ['onboard', 'setup', 'profile'] },
  { label: 'Membership', href: '/membership', icon: BadgeCheck, keywords: ['membership', 'plan', 'insider', 'upgrade', 'subscribe'] },
  { label: 'Accessibility', href: '/accessibility', icon: HelpCircle, keywords: ['accessibility', 'wcag', 'a11y', 'screen reader'] },
  { label: 'Welcome / onboarding', href: '/welcome', icon: Sparkles, keywords: ['welcome', 'onboard', 'new', 'start'] },
];

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const q = query.toLowerCase().trim();
  const results = q
    ? PALETTE_LINKS.filter((l) =>
        l.label.toLowerCase().includes(q) || l.keywords.some((k) => k.includes(q))
      )
    : PALETTE_LINKS.slice(0, 8);

  useEffect(() => { setCursor(0); }, [q]);

  const go = (href: string) => { navigate(href); onClose(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) go(results[cursor].href);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[12vh]" data-testid="command-palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#281223]/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-[22px] border border-[#dfd2c9] bg-white shadow-[0_40px_80px_rgba(0,0,0,.25)]">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[#dfd2c9] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#9b858e]" />
          <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, features, actions…"
            className="flex-1 bg-transparent text-sm text-[#48213d] outline-none placeholder:text-[#b0929f]"
            data-testid="command-palette-input" />
          <kbd className="hidden rounded-md border border-[#dfd2c9] bg-[#f5ede6] px-1.5 py-0.5 font-mono text-[9px] text-[#9b858e] sm:block">esc</kbd>
        </div>
        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[#9b858e]">No results for "{query}"</p>
            </div>
          ) : results.map((item, i) => {
            const Icon = item.icon;
            return (
              <button key={item.href} type="button"
                onClick={() => go(item.href)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${i === cursor ? 'bg-[#fdf5fa]' : 'hover:bg-[#fbf7f1]'}`}
                data-testid={`palette-item-${item.href.replace(/\//g, '-')}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition ${i === cursor ? 'bg-[#ead0dd] text-[#7f2e62]' : 'bg-[#f0e4db] text-[#9b6b88]'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className={`flex-1 text-sm font-semibold ${i === cursor ? 'text-[#7f2e62]' : 'text-[#48213d]'}`}>{item.label}</span>
                {i === cursor && <ArrowRight className="h-3.5 w-3.5 text-[#9d557e]" />}
              </button>
            );
          })}
        </div>
        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-[#dfd2c9] px-4 py-2">
          <span className="font-mono text-[9px] text-[#c6aeb8]">↑↓ navigate</span>
          <span className="font-mono text-[9px] text-[#c6aeb8]">↵ open</span>
          <span className="font-mono text-[9px] text-[#c6aeb8]">esc close</span>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="noise min-h-[100dvh] bg-[#f8f1e9]">
      {!bare && <Header />}
      {children}
      {!bare && <Footer />}
      {!bare && <MobileBottomNav />}
      {/* Spacer so mobile content isn't hidden behind the bottom nav */}
      {!bare && <div className="h-16 md:hidden" aria-hidden />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function Button({ children, variant = 'primary', onClick, type = 'button', disabled = false, className = '', testId = 'button-action' }: { children: ReactNode; variant?: 'primary' | 'outline' | 'quiet' | 'dark'; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string; testId?: string }) {
  const styles = { primary: 'bg-[#7f2e62] text-[#fff5eb] hover:bg-[#65234e] shadow-[0_7px_18px_rgba(127,46,98,.17)]', outline: 'border border-[#cbbab5] bg-transparent text-[#542642] hover:border-[#7f2e62] hover:bg-[#f0e4db]', quiet: 'text-[#7f2e62] hover:bg-[#eee2d9]', dark: 'bg-[#3d2038] text-[#fff5eb] hover:bg-[#281426]' };
  return <button type={type} onClick={onClick} disabled={disabled} className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-bold transition-all duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0', styles[variant], className)} data-testid={testId}>{children}</button>;
}

function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return <div className="mb-9 max-w-2xl"><p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#9d557e]">{eyebrow}</p><h2 className="font-serif text-4xl leading-[.98] tracking-tight text-[#48213d] md:text-5xl">{title}</h2>{body && <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#725e69]">{body}</p>}</div>;
}

function Initials({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  return <div className={cn('grid place-items-center rounded-full bg-[#ead0dd] font-serif text-[#7f2e62]', large ? 'h-24 w-24 text-3xl' : 'h-11 w-11 text-lg')}>{initials || 'OF'}</div>;
}

function Avatar({ companion, large = false }: { companion: Companion; large?: boolean }) {
  return companion.photoUrl ? <img src={companion.photoUrl} alt="" className={cn('rounded-full object-cover', large ? 'h-24 w-24' : 'h-11 w-11')} data-testid={`img-avatar-${companion.id}`} /> : <Initials name={companion.displayName} large={large} />;
}

function LoadingState({ label = 'Gathering the details' }: { label?: string }) {
  return <div className="space-y-4" data-testid="state-loading"><div className="skeleton h-28 rounded-2xl" /><div className="skeleton h-5 w-2/5 rounded-full" /><div className="skeleton h-4 w-4/5 rounded-full" /><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9c8790]">{label}</p></div>;
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div className="rounded-2xl border border-[#e7bdb7] bg-[#fbebe7] p-7" data-testid="state-error"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 text-[#a64742]" /><div><p className="font-bold text-[#6d2d31]">We couldn't load that just now.</p><p className="mt-1 text-sm leading-6 text-[#86555a]">Nothing is lost. Please try again, or return to the previous page.</p>{onRetry && <Button variant="outline" onClick={onRetry} className="mt-4 h-9 px-4" testId="button-retry"><RefreshCw className="h-3.5 w-3.5" />Try again</Button>}</div></div></div>;
}

function EmptyState({ icon: Icon = Search, title, body, action }: { icon?: typeof Search; title: string; body: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#cbbab5] bg-[#fbf6f0] px-6 py-14 text-center" data-testid="state-empty"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ead0dd] text-[#7f2e62]"><Icon className="h-5 w-5" /></div><h3 className="mt-5 font-serif text-2xl text-[#48213d]">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#725e69]">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function HomeFeaturedCard({ companion, tag }: { companion: Companion; tag?: string }) {
  const initials = companionInitials(companion.displayName);
  return (
    <Link href={`/companions/${companion.id}`} className="group block rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:-translate-y-1 hover:border-[#bc83a6] hover:shadow-[0_18px_34px_rgba(88,37,70,.09)]" data-testid={`home-companion-${companion.id}`}>
      <div className="flex items-start justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ead0dd] font-serif text-xl text-[#7f2e62]">{initials}</div>
        {tag && <span className="rounded-full bg-[#e8f0e8] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#477254]">{tag}</span>}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="font-serif text-[26px] leading-none text-[#48213d]">{companion.displayName}</h3>
        {companion.verified && <BadgeCheck className="h-4 w-4 text-[#7f2e62]" />}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-[#806c76]"><MapPin className="h-3.5 w-3.5 text-[#9b6b88]" />{companion.city}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {companion.rating > 0 ? (
          <>
            <StarDisplay rating={Math.round(companion.rating)} size="xs" />
            <span className="font-mono text-[10px] font-bold text-[#48213d]">{companion.rating.toFixed(1)}</span>
            <span className="text-[10px] text-[#9b858e]">· {companion.reviewCount} {companion.reviewCount === 1 ? 'review' : 'reviews'}</span>
          </>
        ) : (
          <span className="text-[10px] text-[#9b858e]">New to OnlyFavors</span>
        )}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {companion.activities.slice(0, 3).map((a) => <span key={a} className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[10px] font-semibold text-[#72566a]">{a}</span>)}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-[#ece1d9] pt-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">${companion.hourlyRate}/hr</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#7f2e62] group-hover:underline">View profile <ChevronRight className="h-3 w-3" /></span>
      </div>
    </Link>
  );
}

function companionInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function relativeJoined(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return 'Recently approved';
  if (days === 0) return 'Joined today';
  if (days === 1) return 'Joined yesterday';
  if (days < 14) return `Joined ${days} days ago`;
  return 'Recently approved';
}

function useDirectoryCompanions() {
  return useListCompanions(undefined, {
    query: { queryKey: getListCompanionsQueryKey(), retry: false, staleTime: 60_000 },
  });
}

function usePublicStats() {
  return useQuery<{ companionCount: number; completedBookings: number; averageRating: number; cityCount: number }>({
    queryKey: ['public-stats'],
    queryFn: async () => {
      const res = await fetch('/api/stats', { credentials: 'include' });
      if (!res.ok) return { companionCount: 0, completedBookings: 0, averageRating: 0, cityCount: 0 };
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });
}

type PublicStory = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  companionId: string;
  companionName: string;
  city: string;
};

function useRecentReviews() {
  return useQuery<PublicStory[]>({
    queryKey: ['recent-reviews'],
    queryFn: async () => {
      const res = await fetch('/api/reviews/recent');
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });
}

function HomeTrustPillar({ icon: Icon, title, body, accent }: { icon: typeof ShieldCheck; title: string; body: string; accent: string }) {
  return (
    <div className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 font-serif text-2xl text-[#48213d]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#725e69]">{body}</p>
    </div>
  );
}

function usePlatformAnnouncement() {
  return useQuery<{ message: string; kind: string; active: boolean }>({
    queryKey: ['platform-announcement'],
    queryFn: () => fetch('/api/announcement').then((r) => r.json()),
    refetchInterval: 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// First-time customer welcome flow  /welcome
// ---------------------------------------------------------------------------

function WelcomePage() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<'customer' | 'companion' | null>(null);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [city, setCity] = useState('');
  const [, navigate] = useLocation();

  const ACTIVITIES = ['Museum visits', 'Coffee conversations', 'Gallery tours', 'Evening walks', 'Restaurant dining', 'Bookstore visits', 'Hiking', 'Cooking classes', 'Architecture walks', 'Conversation partner'];

  const toggleInterest = (a: string) => setInterests((prev) => {
    const next = new Set(prev);
    if (next.has(a)) next.delete(a); else next.add(a);
    return next;
  });

  const STEPS = [
    {
      key: 'role',
      title: 'What brings you here?',
      eyebrow: 'Step 1 of 3 · Welcome',
      content: (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            { key: 'customer' as const, label: 'I want to book a companion', desc: 'Find thoughtful company for activities, meals, and more.', icon: HeartHandshake },
            { key: 'companion' as const, label: 'I want to be a companion', desc: 'Set your own hours and earn by spending time with interesting people.', icon: Sparkles },
          ].map(({ key, label, desc, icon: Icon }) => (
            <button key={key} type="button" onClick={() => { setRole(key); setTimeout(() => setStep(1), 300); }}
              className={`rounded-[22px] border-2 p-6 text-left transition hover:-translate-y-0.5 ${role === key ? 'border-[#7f2e62] bg-[#fdf5fa]' : 'border-[#dfd2c9] bg-[#fbf7f1] hover:border-[#bc83a6]'}`}
              data-testid={`welcome-role-${key}`}>
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#ead0dd]">
                <Icon className="h-6 w-6 text-[#7f2e62]" />
              </div>
              <p className="mt-5 text-base font-bold text-[#48213d]">{label}</p>
              <p className="mt-2 text-sm leading-5 text-[#725e69]">{desc}</p>
            </button>
          ))}
        </div>
      ),
    },
    {
      key: 'interests',
      title: role === 'companion' ? 'What do you enjoy doing?' : 'What kind of company are you looking for?',
      eyebrow: 'Step 2 of 3 · Your preferences',
      content: (
        <div className="mt-8">
          <div className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => (
              <button key={a} type="button" onClick={() => toggleInterest(a)}
                className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${interests.has(a) ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9d557e]'}`}
                data-testid={`welcome-interest-${a.toLowerCase().replace(/ /g, '-')}`}>
                {a}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setStep(2)}
            disabled={interests.size === 0}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white transition hover:bg-[#65234e] disabled:opacity-40"
            data-testid="welcome-next-interests">
            Continue <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setStep(2)} className="ml-4 text-xs font-semibold text-[#9b858e] hover:text-[#7f2e62]">Skip for now</button>
        </div>
      ),
    },
    {
      key: 'city',
      title: 'Which city are you in?',
      eyebrow: 'Step 3 of 3 · Almost there',
      content: (
        <div className="mt-8">
          <div className="flex flex-wrap gap-2">
            {['San Francisco', 'New York', 'Chicago', 'Los Angeles', 'Austin', 'Seattle', 'Boston', 'Denver', 'Miami', 'Other'].map((c) => (
              <button key={c} type="button" onClick={() => setCity(c)}
                className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${city === c ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9d557e]'}`}
                data-testid={`welcome-city-${c.toLowerCase().replace(/ /g, '-')}`}>
                {c}
              </button>
            ))}
          </div>
          <button type="button"
            onClick={() => {
              try {
                localStorage.setItem('of_welcomed', '1');
                if (city) localStorage.setItem('of_preferred_city', city);
                if (interests.size) localStorage.setItem('of_interests', JSON.stringify([...interests]));
              } catch {}
              navigate(role === 'companion' ? '/login?intent=companion&next=/companion/apply' : '/explore');
            }}
            disabled={!city}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white transition hover:bg-[#65234e] disabled:opacity-40"
            data-testid="welcome-finish">
            {role === 'companion' ? 'Start my application' : 'Find companions near me'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const current = STEPS[step];

  return (
    <Shell bare>
      <div className="noise min-h-[100dvh] bg-[#f8f1e9]">
        <div className="mx-auto max-w-xl px-5 py-16 lg:px-8">
          {/* Logo */}
          <Link href="/" className="inline-block"><Brand /></Link>

          {/* Progress */}
          <div className="mt-10 flex gap-2">
            {STEPS.map((s, i) => (
              <div key={s.key} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-[#7f2e62]' : 'bg-[#dfd2c9]'}`} />
            ))}
          </div>

          {/* Content */}
          <div className="mt-10">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">{current.eyebrow}</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-[#48213d]">{current.title}</h1>
            {current.content}
          </div>

          {/* Back */}
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}
              className="mt-8 inline-flex items-center gap-2 text-xs font-bold text-[#9b858e] hover:text-[#7f2e62]">
              <ArrowLeft className="h-3.5 w-3.5" />Back
            </button>
          )}

          {/* Safety note */}
          <div className="mt-16 flex items-center gap-2 text-[10px] text-[#b0929f]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#477254]" />
            OnlyFavors is platonic-only, adults-only, and built with your privacy at the center.
          </div>
        </div>
      </div>
    </Shell>
  );
}

function FirstVisitBanner() {
  const KEY = 'of_welcomed';
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(KEY); } catch { return false; } });
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    setShow(false);
  };
  return (
    <div className="relative overflow-hidden border-b border-[#dfd2c9] bg-[#3d2038] px-6 py-5 text-[#f9efe5]" data-testid="first-visit-banner">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#7f2e62] text-[#f0c8dc]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">Welcome to OnlyFavors</p>
            <p className="text-[11px] text-[#d3b6c4]">A privacy-first, adults-only platonic companion marketplace. All companions are verified — no surprises.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/welcome" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#7f2e62] px-3 text-xs font-bold text-white hover:bg-[#65234e]" data-testid="link-welcome">Get started <ArrowRight className="h-3 w-3" /></Link>
          <Link href="/how-it-works" className="text-xs font-semibold text-[#df9cbd] hover:text-white">How it works</Link>
          <button type="button" onClick={dismiss} className="grid h-7 w-7 place-items-center rounded-full bg-[#5a2550] text-[#d3b6c4] hover:bg-[#7f2e62]" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlatformAnnouncementBanner() {
  const { data } = usePlatformAnnouncement();
  const [dismissed, setDismissed] = useState(false);
  if (!data?.active || !data.message || dismissed) return null;

  const STYLES: Record<string, string> = {
    info:    'bg-[#dce8f5] text-[#2a5280] border-[#b0ccec]',
    warning: 'bg-[#f3ead7] text-[#7a5a12] border-[#d5bc8c]',
    success: 'bg-[#e8f0e8] text-[#31533f] border-[#a9c9af]',
  };
  const style = STYLES[data.kind] ?? STYLES.info;

  return (
    <div className={`flex items-center gap-3 border-b px-5 py-2.5 text-sm ${style}`} data-testid="platform-announcement">
      <span className="flex-1">{data.message}</span>
      <button type="button" onClick={() => setDismissed(true)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function HomeUpcomingBookingBanner() {
  const { data } = useCustomerBookings();
  const upcoming = useMemo(
    () => (data ?? [])
      .filter((b) => b.status === 'confirmed')
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );
  const next = upcoming[0];
  if (!next) return null;

  const bookingDate = new Date(next.date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((bookingDate.getTime() - today.getTime()) / 86400000);
  const when = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;

  return (
    <div className="border-b border-[#c7d9cb] bg-[#e8f0e8] px-5 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 lg:px-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#477254] text-white">
            <CalendarDays className="h-4 w-4" />
          </div>
          <p className="text-sm text-[#31533f]">
            <strong className="font-bold">{when}:</strong>{' '}
            {next.activity}
            {next.companionName && <> with {next.companionName}</>}
            {' · '}{next.startTime}
          </p>
        </div>
        <Link href={`/booking/${next.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#477254] px-4 text-xs font-bold text-white transition hover:bg-[#31533f]"
          data-testid="link-home-upcoming-booking">
          View booking <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function Home() {
  const health = useHealthCheck();
  const directory = useDirectoryCompanions();
  const stats = usePublicStats();
  const spotsQuery = useListSafeSpots({ city: 'New Orleans' }, {
    query: { queryKey: getListSafeSpotsQueryKey({ city: 'New Orleans' }), retry: false },
  });
  const live = directory.data ?? [];
  const featured = live.slice(0, 3);
  const spotlight = [...live].sort((a, b) => (b.reviewCount - a.reviewCount) || (b.rating - a.rating))[0] ?? featured[0];
  const spotlightAnswers = ((spotlight as { interviewAnswers?: string[] } | undefined)?.interviewAnswers ?? []).filter(Boolean).slice(0, 3);
  const publicStats = stats.data ?? { companionCount: 0, completedBookings: 0, averageRating: 0, cityCount: 0 };
  const safeSpotCount = spotsQuery.data?.length ?? 0;
  return (
    <Shell>
      <main className="page-enter">

        <FirstVisitBanner />
        <PlatformAnnouncementBanner />
        <HomeUpcomingBookingBanner />

        <HomeIntentPreview />

        {/* ── How it works mini-strip ── */}
        <section className="border-b border-[#ddcfc6] bg-[#fdf9f5] px-5 py-8 lg:px-8" data-testid="home-how-it-works-strip">
          <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-4">
            {([
              { n: '1', label: 'Tell us the plan', desc: 'Activity, date, duration, and vibe — no account needed.' },
              { n: '2', label: 'See who is free', desc: 'Up to three approved people with real windows and a full price.' },
              { n: '3', label: 'Sign in to request', desc: 'Email code only. Your plan is waiting after signup.' },
              { n: '4', label: 'Boundaries, then chat', desc: 'Sign a Boundary Receipt. $10 deposit unlocks masked chat.' },
            ] as const).map(({ n, label, desc }) => (
              <div key={n} className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-mono text-xs font-bold text-[#7f2e62]">{n}</div>
                <div>
                  <p className="font-serif text-base text-[#48213d]">{label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#806c76]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust principles strip ── */}
        <section className="border-b border-[#ddcfc6] bg-[#FFF7ED]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-6 px-5 py-5 lg:px-8 sm:gap-10">
            {([
              { label: 'A person approves each companion before they appear in Explore', value: '18+' },
              { label: 'Public SafeSpot meetings, never a published home address', value: 'SafeSpot' },
              { label: 'Trust team reviews every safety report', value: 'Human review' },
              { label: 'Sexual services, minors, and off-platform payments are prohibited', value: 'Zero tolerance' },
            ] as const).map(({ value, label }) => (
              <div key={label} className="flex items-center gap-3">
                <p className="font-serif text-2xl text-[#48213d]">{value}</p>
                <p className="max-w-[160px] text-[10px] leading-4 text-[#806c76]">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Neighborhoods ── */}
        <section className="border-b border-[#ddcfc6] bg-[#fbf7f1] px-5 py-6 lg:px-8" data-testid="home-cities-strip">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">New Orleans neighborhoods</span>
              {NOLA_AREAS.filter((a) => a.name !== 'New Orleans').map((area) => (
                <Link key={area.name} href={`/explore?area=${encodeURIComponent(area.name)}`}
                  className="rounded-full border border-[#dfd2c9] bg-white px-3 py-1 text-xs font-semibold text-[#654c5f] transition hover:border-[#9d557e] hover:text-[#7f2e62]"
                  data-testid={`city-chip-${area.name.toLowerCase().replace(/\s+/g, '-')}`}>
                  {area.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Activity quick-filter strip ── */}
        <section className="border-b border-[#ddcfc6] bg-[#f8f1e9] px-5 py-5 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-3">
            {/* Activity row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e] mr-2">Browse by</span>
              {([
                { icon: Coffee,          label: 'Coffee',        q: 'Coffee conversations' },
                { icon: Landmark,        label: 'Museums',       q: 'Museum visits'         },
                { icon: UtensilsCrossed, label: 'Dining',        q: 'Restaurant dining'     },
                { icon: Navigation2,     label: 'Walking',       q: 'Evening walks'         },
                { icon: Sparkles,        label: 'Cooking',       q: 'Cooking classes'       },
                { icon: Star,            label: 'Gallery',       q: 'Gallery tours'         },
                { icon: Mountain,        label: 'Hiking',        q: 'Hiking'                },
                { icon: Wine,            label: 'Wine',          q: 'Wine tasting'          },
                { icon: BookOpen,        label: 'Bookshops',     q: 'Bookstore visits'      },
                { icon: Sunrise,         label: 'Brewery tours', q: 'Brewery tours'         },
              ] as const).map(({ icon: Icon, label, q }) => (
                <Link key={label}
                  href={`/explore?activity=${encodeURIComponent(q)}`}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-[#dfd2c9] bg-white px-3.5 py-2 text-xs font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
                  data-testid={`quick-filter-${label.toLowerCase().replace(/ /g, '-')}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </Link>
              ))}
            </div>
            {/* Neighborhood row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e] mr-2">Around town</span>
              {NOLA_AREAS.filter((a) => a.name !== 'New Orleans').map((area) => (
                <Link key={area.name}
                  href={`/explore?area=${encodeURIComponent(area.name)}`}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-[#dfd2c9] bg-white px-3.5 py-2 text-xs font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
                  data-testid={`city-link-${area.name.toLowerCase().replace(/ /g, '-')}`}>
                  <MapPin className="h-3 w-3" />{area.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── The difference ── */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <SectionIntro eyebrow="The OnlyFavors difference" title="Connection without the guesswork." body="A considered way to find company — not a feed to scroll, a profile to perform, or a stranger to decode." />
          <div className="grid gap-4 md:grid-cols-[1.15fr_.85fr]">
            <div className="min-h-[270px] rounded-[24px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-10"><div className="flex items-start justify-between"><Shield className="h-7 w-7 text-[#d897b6]" /><span className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">01 / Private by default</span></div><h3 className="mt-16 max-w-md font-serif text-4xl leading-none">Identity before.<br />Safety during.<br />Privacy after.</h3><p className="mt-4 max-w-sm text-sm leading-6 text-[#d9c4cf]">First name and neighborhood only. Phone, email, and home stay hidden. Location exists only during an active booking, then it is deleted.</p></div>
            <div className="min-h-[270px] rounded-[24px] bg-[#d9e1d7] p-8 text-[#31533f] md:p-10"><div className="flex items-start justify-between"><BadgeCheck className="h-7 w-7 text-[#477254]" /><span className="font-mono text-[10px] uppercase tracking-widest text-[#63816a]">02 / Carefully verified</span></div><h3 className="mt-16 max-w-md font-serif text-4xl leading-none">Real people.<br />Clear boundaries.</h3><p className="mt-4 max-w-sm text-sm leading-6 text-[#53725d]">Every approved companion shares their way of working, the activities they enjoy, and what stays out of bounds.</p></div>
          </div>
        </section>

        {/* ── Featured companions ── */}
        <section className="border-t border-[#ddcfc6] bg-[#f8f2eb] py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionIntro eyebrow="Meet a few" title={"Good company,\ncloser than you think."} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {directory.isLoading && [0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-[22px]" />)}
              {!directory.isLoading && featured.map((c, i) => (
                <HomeFeaturedCard key={c.id} companion={c} tag={i === 0 && c.reviewCount > 0 ? 'Most reviewed' : undefined} />
              ))}
              {!directory.isLoading && featured.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-[#c6aeb8] bg-transparent p-8 text-center sm:col-span-2">
                  <p className="font-serif text-2xl text-[#48213d]">No companions are live yet.</p>
                  <p className="mt-2 text-xs text-[#806c76]">Approved profiles appear here as they go live. We do not invent names or ratings.</p>
                </div>
              )}
              <Link href="/explore" className="group flex flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#c6aeb8] bg-transparent p-8 text-center transition hover:border-[#9d557e] hover:bg-[#f0e4db]" data-testid="link-home-explore-all">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ead0dd] text-[#7f2e62]"><Compass className="h-5 w-5" /></div>
                <p className="font-serif text-2xl text-[#48213d]">Browse all companions</p>
                <p className="text-xs text-[#806c76]">Filter by city, activity, language, and more.</p>
                <span className="mt-2 flex items-center gap-1 text-xs font-bold text-[#7f2e62]">Explore <ArrowRight className="h-3.5 w-3.5" /></span>
              </Link>
            </div>
          </div>
        </section>

        {spotlight && (
        <section className="border-t border-[#ddcfc6] bg-[#fbf7f1] px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Companion spotlight</p>
                <h2 className="mt-2 font-serif text-4xl text-[#48213d]">From the directory.</h2>
              </div>
              <Link href="/explore" className="hidden items-center gap-1 text-xs font-bold text-[#7f2e62] hover:underline sm:flex">
                Browse all companions <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.6fr]">
              <div className="rounded-[26px] bg-[#3d2038] p-8 text-[#f9efe5]">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#c695ae]/20 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c695ae]" />
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#c695ae]">Live profile</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] bg-[#ead0dd] font-serif text-3xl text-[#7f2e62]">{companionInitials(spotlight.displayName)}</div>
                  <div>
                    <p className="font-serif text-3xl text-[#f9efe5]">{spotlight.displayName}</p>
                    <p className="text-sm text-[#c695ae]">{spotlight.city} · ${spotlight.hourlyRate}/hr</p>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  {spotlight.rating > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full bg-[#5a2550] px-3 py-1.5">
                      <Star className="h-3.5 w-3.5 fill-[#c695ae] text-[#c695ae]" />
                      <span className="font-mono text-xs font-bold text-[#f9efe5]">{spotlight.rating.toFixed(1)}</span>
                    </div>
                  )}
                  {spotlight.verified && (
                    <div className="flex items-center gap-1.5 rounded-full bg-[#5a2550] px-3 py-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-[#c695ae]" />
                      <span className="font-mono text-xs text-[#f9efe5]">Identity verified</span>
                    </div>
                  )}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {spotlight.activities.slice(0, 4).map((act) => (
                    <span key={act} className="rounded-full border border-[#6a3858] px-3 py-1 text-[10px] text-[#d9c4cf]">{act}</span>
                  ))}
                </div>
                <Link href={`/companions/${spotlight.id}`}
                  className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e]"
                  data-testid="link-spotlight-view-profile">
                  View profile <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-5">
                <p className="font-serif text-[22px] leading-snug text-[#48213d]">
                  {spotlight.biography || 'This companion has not added a biography yet.'}
                </p>
                {spotlightAnswers.length > 0 ? (
                  <div className="space-y-4">
                    {spotlightAnswers.map((answer, i) => (
                      <div key={i} className="rounded-[18px] border border-[#e8ddd6] bg-white p-5">
                        <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">In their words</p>
                        <p className="mt-2 text-sm leading-6 text-[#654c5f]">{answer}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[#725e69]">Their full profile has activities, boundaries, and availability — nothing invented for this page.</p>
                )}
                <Link href={`/companions/${spotlight.id}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#7f2e62] hover:underline"
                  data-testid="link-spotlight-full-profile">
                  Read full profile <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* ── SafeSpot Network ── */}
        <section className="border-y border-[#ddcfc6] bg-[#3d2038]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 md:grid-cols-[1fr_1fr] lg:px-8">
            <div>
              <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]"><ShieldCheck className="h-4 w-4" />Safety network</p>
              <h2 className="font-serif text-5xl leading-[.93] text-[#f9efe5]">Every favor starts<br /><em>at a SafeSpot.</em></h2>
              <p className="mt-6 max-w-sm text-[15px] leading-7 text-[#d9c4cf]">Approved public venues in New Orleans. First meetings start here. We never list a home or workplace, and we do not invent a venue partnership program.</p>
              <div className="mt-6 flex items-center gap-6">
                <div><p className="font-serif text-4xl text-[#f9efe5]">{safeSpotCount}</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">Approved venues in New Orleans</p></div>
                <div className="h-10 w-px bg-[#5e3458]" />
                <div><p className="font-serif text-4xl text-[#f9efe5]">1</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">Pilot city</p></div>
              </div>
              <Link href="/safespots" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#f9efe5] px-5 text-sm font-bold text-[#48213d] transition hover:bg-white" data-testid="link-home-safespots">Browse SafeSpots <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([['Café', Coffee, '#ead0dd', '#7f2e62'], ['Restaurant', UtensilsCrossed, '#d9e1d7', '#477254'], ['Library', Landmark, '#f0e4db', '#7a5a12'], ['Hotel', Building2, '#dce8f5', '#2a5280']] as const).map(([label, Icon, bg, color]) => (
                <div key={label} className="rounded-[18px] p-5" style={{ background: 'rgba(255,245,235,0.06)' }}>
                  <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: bg + '33' }}>
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>
                  <p className="mt-3 font-serif text-xl text-[#f9efe5]">{label}</p>
                  <p className="mt-1 text-[10px] text-[#c695ae]">Public meeting point</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="bg-[#f0e4db]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 md:grid-cols-[.9fr_1.1fr] lg:px-8">
            <div>
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">A simple ritual</p>
              <h2 className="font-serif text-5xl leading-[.95] text-[#48213d]">From "maybe"<br /><em>to "see you there."</em></h2>
            </div>
            <div className="space-y-3">
              <Step n="01" icon={Compass} title="Browse by feeling" body="Filter by city, activity, language, or an instant booking preference." />
              <Step n="02" icon={ClipboardCheck} title="Set boundaries together" body="A Boundary Receipt stores activity, SafeSpot, time, transportation, contact, photos, and alcohol expectations. Both people sign. Chat is masked, not end-to-end encrypted." />
              <Step n="03" icon={MessageSquare} title="Chat once the deposit clears" body="A private, masked thread opens after the $10 deposit. Phone numbers and emails are stripped. Reported threads can be reviewed by the safety team." />
              <Step n="04" icon={MapPin} title="Meet at a SafeSpot" body="Check in at the agreed public venue. Trust Circle can get a venue notice — never a companion name or live pin." />
            </div>
          </div>
        </section>

        {/* ── Curated collections ── */}
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8" data-testid="curated-collections">
          <SectionIntro eyebrow="Curated for you" title={"Find your kind of favor."} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
              { title: 'Great for first timers', desc: 'Low-key activities with companions who love newcomers.', href: '/explore?activity=Coffee+conversations', bg: '#ead0dd', text: '#48213d', emoji: '👋', tag: 'Approachable' },
              { title: 'Available this weekend', desc: 'Companions with instant booking and open schedules.', href: '/explore', bg: '#d3e1d8', text: '#253d2b', emoji: '📅', tag: 'Weekend picks' },
              { title: 'Museum & gallery lovers', desc: 'Companions who know their way around a great exhibition.', href: '/explore?activity=Museum+visits', bg: '#dce4f5', text: '#1e3460', emoji: '🖼️', tag: 'Cultural' },
              { title: 'Conversation companions', desc: 'For when you just need someone good to talk to.', href: '/explore?activity=Coffee+conversations', bg: '#f0e4db', text: '#5a3520', emoji: '☕', tag: 'Low-key' },
              { title: 'Foodies & dining', desc: 'Companions who make any restaurant feel like a celebration.', href: '/explore?activity=Restaurant+dining', bg: '#f3ded0', text: '#6b3110', emoji: '🍽️', tag: 'Foodie' },
              { title: 'Evening city walks', desc: 'Explore your city — or a new one — with great company.', href: '/explore?activity=Evening+walks', bg: '#e4e0f5', text: '#2c1f60', emoji: '🌆', tag: 'Active' },
            ] as const).map(({ title, desc, href, bg, text, emoji, tag }) => (
              <Link key={title} href={href}
                className="group relative flex flex-col justify-between overflow-hidden rounded-[22px] p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
                style={{ background: bg, color: text }}
                data-testid={`collection-${tag.toLowerCase()}`}>
                <div>
                  <p className="mb-2 text-3xl">{emoji}</p>
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[.18em] opacity-60">{tag}</p>
                  <h3 className="mt-1.5 font-serif text-2xl leading-tight">{title}</h3>
                  <p className="mt-2 text-[12px] leading-5 opacity-70">{desc}</p>
                </div>
                <div className="mt-5 flex items-center gap-1 text-xs font-bold opacity-80 group-hover:opacity-100">
                  Browse <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Trust pillars ── */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <SectionIntro eyebrow="Built-in safety" title="Four layers that protect every favor." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HomeTrustPillar icon={ShieldCheck} title="SafeSpot Network" body="Every booking starts at a verified public venue — no private addresses, ever." accent="bg-[#e8f0e8] text-[#477254]" />
            <HomeTrustPillar icon={ClipboardCheck} title="Boundary Receipt" body="Both sides agree in writing before any booking is confirmed." accent="bg-[#ead0dd] text-[#7f2e62]" />
            <HomeTrustPillar icon={Users} title="Trust Circle" body="Up to 3 contacts can get a venue check-in or missed-check-in notice — never a companion name or live pin." accent="bg-[#f3ead7] text-[#7a5a12]" />
            <HomeTrustPillar icon={MessageCircle} title="Protected Chat" body="Chat unlocks after the $10 deposit. Phone numbers stay hidden. Messages are masked, not end-to-end encrypted." accent="bg-[#fdf3e3] text-[#bf8750]" />
          </div>
        </section>

        {/* ── Why book ── */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <SectionIntro eyebrow="Why people book" title={"Company without the performance."} />
          <div className="grid gap-4 md:grid-cols-3">
            {([
              { quote: "A museum, a meal, a long walk — with someone who agreed to show up. No dating script, no private addresses.", name: "Always platonic", city: "Written into every booking" },
              { quote: "You choose a public SafeSpot before anything is confirmed. Exact meeting details stay between you, your companion, and trust staff.", name: "Public places only", city: "SafeSpot Network" },
              { quote: "A companion can decline. You can cancel. Nothing moves forward until both people say yes.", name: "Mutual yes", city: "No auto-confirms" },
            ] as const).map(({ quote, name, city }) => (
              <div key={name} className="flex flex-col gap-5 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-7">
                <p className="flex-1 text-[15px] leading-7 text-[#654c5f]">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3 border-t border-[#ece1d9] pt-5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-base text-[#7f2e62]">
                    {name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#48213d]">{name}</p>
                    <p className="text-[10px] text-[#9b858e]">{city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Live activity ticker ── */}
        <section className="mx-auto max-w-7xl px-5 pb-6 lg:px-8" data-testid="activity-ticker">
          <div className="overflow-hidden rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1]">
            <div className="flex items-center gap-3 border-b border-[#ece1d9] px-4 py-2.5">
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#6f9a79]" />
              <p className="font-mono text-[8px] uppercase tracking-[.2em] text-[#9b858e]">Happening now</p>
            </div>
            <LiveActivityTicker />
          </div>
        </section>

        {/* ── Companion spotlight ── */}
        <section className="mx-auto max-w-7xl px-5 pb-8 lg:px-8" data-testid="home-companion-spotlight">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Featured companions</p>
              <h2 className="mt-1 font-serif text-3xl text-[#48213d]">In the directory.</h2>
            </div>
            <Link href="/explore" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7f2e62] hover:underline">
              Browse all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c) => (
              <Link key={c.id} href={`/companions/${c.id}`}
                className="group flex flex-col rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:-translate-y-0.5 hover:border-[#9d557e] hover:shadow-md"
                data-testid={`home-spotlight-${c.id}`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-xl text-[#7f2e62]">{companionInitials(c.displayName)}</div>
                  <div>
                    <p className="font-serif text-lg text-[#48213d]">{c.displayName}</p>
                    <p className="flex items-center gap-1 text-[10px] text-[#806c76]"><MapPin className="h-3 w-3" />{c.city}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  {c.rating > 0 ? (
                    <>
                      <StarDisplay rating={Math.round(c.rating)} size="xs" />
                      <span className="ml-1 font-mono text-[9px] font-bold text-[#48213d]">{c.rating.toFixed(1)}</span>
                      <span className="text-[9px] text-[#9b858e]">· {c.reviewCount} {c.reviewCount === 1 ? 'review' : 'reviews'}</span>
                    </>
                  ) : (
                    <span className="text-[9px] text-[#9b858e]">New to OnlyFavors</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.activities.slice(0, 3).map((a) => (
                    <span key={a} className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[9px] text-[#654c5f]">{a}</span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#ece1d9] pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">${c.hourlyRate} / hour</span>
                  <span className="text-[9px] font-bold text-[#7f2e62] opacity-0 transition group-hover:opacity-100">Book →</span>
                </div>
              </Link>
            ))}
            {!directory.isLoading && featured.length === 0 && (
              <div className="rounded-[22px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-8 text-center sm:col-span-2 lg:col-span-3">
                <p className="font-serif text-xl text-[#48213d]">The directory is empty.</p>
                <p className="mt-2 text-sm text-[#806c76]">Approved companions will show here.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Gift a favor callout ── */}
        <section className="mx-auto max-w-7xl px-5 pb-8 lg:px-8">
          <div className="flex flex-col items-start gap-4 rounded-[22px] border border-[#ece1d9] bg-[#ead0dd]/30 px-7 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#7f2e62] text-white">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#48213d]">Give the gift of good company</p>
                <p className="text-xs text-[#806c76]">Gift cards are not live yet. You can still leave a note for someone who should know about OnlyFavors.</p>
              </div>
            </div>
            <Link href="/gift"
              className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white transition hover:bg-[#65234e]"
              data-testid="link-home-gift">
              Gift a favor <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* ── Companion CTA ── */}
        <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
          <div className="rounded-[28px] bg-[#d3e1d8] p-8 md:flex md:items-end md:justify-between md:p-12">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#50725d]">For the people behind the profiles</p>
              <h2 className="mt-4 max-w-lg font-serif text-5xl leading-[.94] text-[#31533f]">Bring your good<br />energy to the room.</h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-[#53725d]">Set your pace, name your boundaries, and offer the kind of company you are proud to give. Earn on your schedule with full Stripe payouts.</p>
            </div>
            <Link href="/companion/apply" className="mt-8 inline-flex h-11 items-center gap-2 self-end rounded-full bg-[#31533f] px-5 text-sm font-bold text-[#eef6ef] transition hover:-translate-y-0.5 hover:bg-[#24442f]" data-testid="link-home-apply">Learn about applying <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        {/* ── Platform stats strip ── */}
        <section className="border-y border-[#ddcfc6] bg-[#f8f1e9]" data-testid="platform-stats">
          <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {([
                { value: String(publicStats.companionCount), label: 'Live companions', icon: Users },
                { value: String(publicStats.completedBookings), label: 'Favors completed', icon: HeartHandshake },
                { value: publicStats.averageRating > 0 ? publicStats.averageRating.toFixed(2) : '—', label: 'Average rating', icon: Star },
                { value: String(publicStats.cityCount), label: 'Cities with companions', icon: MapPin },
              ] as const).map(({ value, label, icon: Icon }) => (
                <div key={label} className="flex flex-col items-center gap-2 text-center">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#ead0dd] text-[#7f2e62]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="font-serif text-4xl leading-none text-[#48213d]">{value}</p>
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#9b858e]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Footer bar ── */}
        <div className="border-t border-[#ddcfc6] bg-[#3d2038] px-5 py-5 text-center text-xs text-[#ddc4d0]">
          <span className="inline-flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" />OnlyFavors is for platonic connection. We do not facilitate dating or sexual services.</span>
          <span className="ml-4 inline-flex items-center gap-1.5 text-[#c695ae]" data-testid="status-health"><span className="h-1.5 w-1.5 rounded-full bg-[#8fc69a]" />{health.data?.status === 'ok' ? 'Systems online' : 'Privacy systems ready'}</span>
        </div>

      </main>
    </Shell>
  );
}

function EarningsCalc() {
  const [rate, setRate] = useState(65);
  const [bookingsPerWeek, setBookingsPerWeek] = useState(3);
  const [hoursPerBooking, setHoursPerBooking] = useState(2);
  const gross = rate * hoursPerBooking * bookingsPerWeek * 4;
  const net = Math.round(gross * 0.85);
  return (
    <div className="mt-3 space-y-4" data-testid="earnings-calc">
      <div>
        <div className="flex justify-between">
          <label className="text-[10px] text-[#c08eae]">Hourly rate</label>
          <span className="font-mono text-xs font-bold text-[#f9efe5]">${rate}/hr</span>
        </div>
        <input type="range" min={40} max={200} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))}
          className="mt-1 w-full accent-[#9d557e]" data-testid="calc-rate" />
      </div>
      <div>
        <div className="flex justify-between">
          <label className="text-[10px] text-[#c08eae]">Bookings per week</label>
          <span className="font-mono text-xs font-bold text-[#f9efe5]">{bookingsPerWeek}</span>
        </div>
        <input type="range" min={1} max={10} step={1} value={bookingsPerWeek} onChange={(e) => setBookingsPerWeek(Number(e.target.value))}
          className="mt-1 w-full accent-[#9d557e]" data-testid="calc-bookings" />
      </div>
      <div>
        <div className="flex justify-between">
          <label className="text-[10px] text-[#c08eae]">Hours per booking</label>
          <span className="font-mono text-xs font-bold text-[#f9efe5]">{hoursPerBooking}h</span>
        </div>
        <input type="range" min={1} max={8} step={0.5} value={hoursPerBooking} onChange={(e) => setHoursPerBooking(Number(e.target.value))}
          className="mt-1 w-full accent-[#9d557e]" data-testid="calc-hours" />
      </div>
      <div className="rounded-xl bg-[#562048] px-4 py-3 text-center">
        <p className="text-[10px] text-[#c08eae]">Est. monthly take-home (85%)</p>
        <p className="mt-1 font-serif text-4xl text-[#f9efe5]">${net.toLocaleString()}</p>
        <p className="mt-0.5 text-[9px] text-[#c08eae]">After 15% platform fee · {bookingsPerWeek * 4} bookings/mo</p>
      </div>
    </div>
  );
}

function Step({ n, icon: Icon, title, body }: { n: string; icon: typeof Compass; title: string; body: string }) {
  return <div className="group flex items-center gap-4 rounded-2xl border border-[#dfd2c9] bg-[#f8f1e9] p-4 transition hover:-translate-y-0.5 hover:border-[#c89bb5]"><span className="font-mono text-[10px] text-[#a47e8f]">{n}</span><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]"><Icon className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-[#543d50]">{title}</h3><p className="mt-0.5 text-xs leading-5 text-[#806c76]">{body}</p></div><ChevronRight className="ml-auto h-4 w-4 text-[#b0929f] transition group-hover:translate-x-1" /></div>;
}

type DirectoryCompanion = Companion & {
  dayRate?: number | null;
  identityVerified?: boolean;
  availabilityHint?: 'now' | 'tonight' | 'weekend' | null;
  interviewAnswers?: string[];
  approvedAreas?: string[];
};

function companionAreaLabels(companion: DirectoryCompanion): string[] {
  if (companion.approvedAreas?.length) return companion.approvedAreas;
  return companion.serviceArea ? [companion.serviceArea] : [companion.city];
}

function minNeighborhoodMiles(companion: DirectoryCompanion, coords: [number, number]): number {
  const miles = companionAreaLabels(companion).map((label) => {
    const area = neighborhoodCenter(label);
    return approxMiles(coords[0], coords[1], area.lat, area.lng);
  });
  return miles.length ? Math.min(...miles) : Number.POSITIVE_INFINITY;
}

const AVAIL_LABEL: Record<'now' | 'tonight' | 'weekend', string> = {
  now: 'Available now',
  tonight: 'Available tonight',
  weekend: 'Available this weekend',
};

function companionDayRate(companion: DirectoryCompanion): number {
  return companion.dayRate && companion.dayRate > 0 ? companion.dayRate : companion.hourlyRate * 7;
}

function availabilityHint(companion: DirectoryCompanion): 'now' | 'tonight' | 'weekend' | null {
  if (companion.availabilityHint) return companion.availabilityHint;
  return companion.availableNow ? 'now' : null;
}

function formatApproxMiles(miles: number): string {
  if (miles < 1) return 'Under a mile away';
  return `${Math.round(miles)} mile${Math.round(miles) === 1 ? '' : 's'} away`;
}

function CompanionCard({ companion, saved = false, onSave, onActivityFilter, distanceMiles }: {
  companion: DirectoryCompanion;
  saved?: boolean;
  onSave?: (id: string) => void;
  onActivityFilter?: (act: string) => void;
  distanceMiles?: number;
}) {
  const hint = availabilityHint(companion);
  const identityVerified = companion.identityVerified ?? companion.verified;
  return (
    <Link href={`/companions/${companion.id}`} className="group relative block rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition duration-300 hover:-translate-y-1 hover:border-[#bc83a6] hover:shadow-[0_18px_34px_rgba(88,37,70,.09)]" data-testid={`card-companion-${companion.id}`}>
      <div className="flex items-start justify-between">
        <Avatar companion={companion} />
        {onSave && (
          <button type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave(companion.id); }}
            className={cn('grid h-8 w-8 place-items-center rounded-full transition',
              saved ? 'bg-[#ead0dd] text-[#7f2e62]' : 'bg-[#f0e4db] text-[#9b858e] hover:bg-[#ead0dd] hover:text-[#7f2e62]')}
            aria-label={saved ? 'Unsave' : 'Save companion'}
            data-testid={`button-save-${companion.id}`}>
            <Heart className={cn('h-3.5 w-3.5 transition', saved && 'fill-current')} />
          </button>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="font-serif text-[26px] leading-none text-[#48213d]">{companion.displayName}</h3>
        {identityVerified && <BadgeCheck className="h-4 w-4 text-[#7f2e62]" />}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-[#806c76]">
        <MapPin className="h-3.5 w-3.5 text-[#9b6b88]" />
        {companionAreaLabels(companion).slice(0, 2).join(' · ')}
        {typeof distanceMiles === 'number' ? ` · ${formatApproxMiles(distanceMiles)}` : `, ${companion.city}`}
      </p>
      {companion.rating > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <StarDisplay rating={Math.round(companion.rating)} size="xs" />
          <span className="font-mono text-[10px] font-bold text-[#48213d]">{companion.rating.toFixed(1)}</span>
          <span className="text-[10px] text-[#9b858e]">· {companion.reviewCount} reviews</span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hint && (
          <span className="flex items-center gap-1 rounded-full bg-[#e8f5ef] px-2.5 py-1 text-[10px] font-bold text-[#267a5a]">
            <Zap className="h-3 w-3" />{AVAIL_LABEL[hint]}
          </span>
        )}
        {companion.responseTime ? (
          <span className="text-[10px] text-[#9b858e]">Usually replies in {companion.responseTime}</span>
        ) : null}
        {identityVerified && (
          <span className="rounded-full bg-[#e8f0e8] px-2 py-0.5 text-[9px] font-bold text-[#477254]">Identity verified</span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#725e69]">{companion.biography || 'A thoughtful companion for time well spent.'}</p>
      <div className="mt-4 flex min-h-[28px] flex-wrap gap-1.5">
        {companion.activities.slice(0, 3).map((a) => onActivityFilter
          ? <button key={a} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onActivityFilter(a); }}
              className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[10px] font-semibold text-[#72566a] transition-colors hover:bg-[#ead0dd]">{a}</button>
          : <span key={a} className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[10px] font-semibold text-[#72566a]">{a}</span>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-[#ece1d9] pt-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">From {money(companion.hourlyRate * 100)}/hour</span>
          <span className="ml-2 text-[10px] text-[#b0929f]">· {money(companionDayRate(companion) * 100)}/day</span>
        </div>
        {companion.instantBook && <span className="flex items-center gap-1 text-[10px] font-bold text-[#477254]"><Check className="h-3 w-3" />Instant book</span>}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Companion compare page /compare
// ---------------------------------------------------------------------------

function CompareCompanions() {
  const list = useListCompanions(undefined, { query: { queryKey: getListCompanionsQueryKey(), retry: false } });
  const companions = list.data ?? [];

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const companionA = companions.find((c) => c.id === selected[0]);
  const companionB = companions.find((c) => c.id === selected[1]);

  type CompareKey = 'hourlyRate' | 'rating' | 'reviewCount' | 'responseTime' | 'instantBook' | 'languages';
  const ROWS: Array<{ label: string; key: CompareKey; fmt?: (v: unknown) => string }> = [
    { label: 'Hourly rate', key: 'hourlyRate', fmt: (v) => `$${Number(v)}/hr` },
    { label: 'Rating', key: 'rating', fmt: (v) => Number(v) > 0 ? `${Number(v).toFixed(1)} ★` : 'No ratings yet' },
    { label: 'Reviews', key: 'reviewCount', fmt: (v) => `${Number(v)} ${Number(v) === 1 ? 'review' : 'reviews'}` },
    { label: 'Response time', key: 'responseTime' },
    { label: 'Instant book', key: 'instantBook', fmt: (v) => v ? '✓ Yes' : '✗ No' },
    { label: 'Languages', key: 'languages', fmt: (v) => Array.isArray(v) && v.length ? v.join(', ') : '—' },
  ];

  const getBetter = (key: CompareKey) => {
    if (!companionA || !companionB) return null;
    const a = companionA[key], b = companionB[key];
    if (key === 'hourlyRate') return Number(a) <= Number(b) ? 'A' : 'B';
    if (key === 'rating' || key === 'reviewCount') return Number(a) >= Number(b) ? 'A' : 'B';
    if (key === 'responseTime') {
      const toMin = (s: string) => { const m = s.match(/(\d+)\s*h/); return m ? Number(m[1]) * 60 : 999; };
      return toMin(String(a)) <= toMin(String(b)) ? 'A' : 'B';
    }
    if (key === 'instantBook') return a ? 'A' : b ? 'B' : null;
    return null;
  };

  const shown = companions.filter((c) =>
    !search || c.displayName.toLowerCase().includes(search.toLowerCase()) || c.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        <Link href="/explore" className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]">
          <ArrowLeft className="h-3.5 w-3.5" />Back to explore
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Side by side</p>
        <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Compare companions</h1>
        <p className="mt-3 text-sm leading-6 text-[#725e69]">Choose up to two companions to see how they stack up.</p>

        {/* Companion picker */}
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <label className="flex flex-1 items-center gap-2 rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-2">
              <Search className="h-4 w-4 text-[#9b6b88]" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or city"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#b0929f]" />
            </label>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f] hover:border-[#9d557e]">
                <X className="h-3.5 w-3.5" />Clear
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.isLoading && [0, 1].map((i) => <div key={i} className="skeleton h-20 rounded-[18px]" />)}
            {!list.isLoading && shown.length === 0 && (
              <div className="col-span-full rounded-[18px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-8 text-center">
                <p className="font-serif text-xl text-[#48213d]">{search ? 'No companions match that search.' : 'No companions to compare yet.'}</p>
                <p className="mt-2 text-sm text-[#806c76]">Approved companions appear here as they go live.</p>
              </div>
            )}
            {shown.map((c) => {
              const isSelected = selected.includes(c.id);
              const slot = selected.indexOf(c.id) + 1;
              return (
                <button key={c.id} type="button" onClick={() => toggleSelect(c.id)}
                  className={`flex items-center gap-4 rounded-[18px] border p-4 text-left transition ${isSelected ? 'border-[#7f2e62] bg-[#fdf5fa]' : 'border-[#dfd2c9] bg-[#fbf7f1] hover:border-[#bc83a6]'}`}
                  data-testid={`compare-pick-${c.id}`}>
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif text-sm transition ${isSelected ? 'bg-[#7f2e62] text-white' : 'bg-[#ead0dd] text-[#7f2e62]'}`}>
                    {isSelected ? slot : c.displayName.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#48213d]">{c.displayName}</p>
                    <p className="text-[10px] text-[#9b858e]">{c.city} · ${c.hourlyRate}/hr{c.rating > 0 ? ` · ${c.rating.toFixed(1)}★` : ''}</p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-[#7f2e62]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Comparison table */}
        {companionA && companionB ? (
          <div className="mt-10">
            {/* Header */}
            <div className="grid grid-cols-3 gap-4 rounded-t-[20px] border border-[#dfd2c9] bg-[#3d2038] p-5">
              <div className="text-[10px] font-mono uppercase tracking-[.15em] text-[#c695ae]">Category</div>
              {[companionA, companionB].map((c) => (
                <div key={c.id} className="text-center">
                  <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#7f2e62] font-serif text-lg text-white">{c.displayName[0]}</div>
                  <p className="mt-2 text-sm font-bold text-[#f9efe5]">{c.displayName}</p>
                  <p className="text-[10px] text-[#c695ae]">{c.city}</p>
                </div>
              ))}
            </div>
            {/* Rows */}
            <div className="overflow-hidden rounded-b-[20px] border-x border-b border-[#dfd2c9] bg-white">
              {ROWS.map(({ label, key, fmt }, i) => {
                const better = getBetter(key);
                const valA = fmt ? fmt(companionA[key]) : String(companionA[key]);
                const valB = fmt ? fmt(companionB[key]) : String(companionB[key]);
                return (
                  <div key={key} className={`grid grid-cols-3 gap-4 p-4 ${i % 2 === 0 ? 'bg-white' : 'bg-[#fbf7f1]'}`}>
                    <div className="flex items-center text-xs font-semibold text-[#654c5f]">{label}</div>
                    {[{ val: valA, side: 'A' }, { val: valB, side: 'B' }].map(({ val, side }) => (
                      <div key={side} className={`flex items-center justify-center rounded-[10px] px-3 py-2 text-sm font-semibold transition ${better === side ? 'bg-[#e8f0e8] text-[#31533f]' : 'text-[#48213d]'}`}>
                        {val}
                        {better === side && <Check className="ml-1.5 h-3.5 w-3.5 text-[#477254]" />}
                      </div>
                    ))}
                  </div>
                );
              })}
              {/* Activities row */}
              <div className="grid grid-cols-3 gap-4 border-t border-[#dfd2c9] p-4">
                <div className="flex items-start pt-1 text-xs font-semibold text-[#654c5f]">Activities</div>
                {[companionA, companionB].map((c) => (
                  <div key={c.id} className="flex flex-wrap gap-1">
                    {c.activities.map((a) => (
                      <span key={a} className="rounded-full bg-[#ead0dd] px-2 py-0.5 text-[9px] font-semibold text-[#7f2e62]">{a}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Book buttons */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              {[companionA, companionB].map((c) => (
                <Link key={c.id} href={`/book?companion=${c.id}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e]"
                  data-testid={`compare-book-${c.id}`}>
                  Book {c.displayName.split(' ')[0]} <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-12 text-center">
            <UsersRound className="mx-auto h-8 w-8 text-[#c6aeb8]" />
            <p className="mt-4 font-serif text-2xl text-[#48213d]">Select two companions</p>
            <p className="mt-2 text-sm text-[#806c76]">Choose two from the list above to see a full side-by-side breakdown.</p>
            {selected.length === 1 && <p className="mt-2 text-xs font-semibold text-[#9d557e]">One selected — pick one more.</p>}
          </div>
        )}
      </main>
    </Shell>
  );
}

function Explore() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [city, setCity] = useState(() => { try { return new URLSearchParams(window.location.search).get('area') ?? 'New Orleans'; } catch { return 'New Orleans'; } });
  const [activity, setActivity] = useState(() => { try { return new URLSearchParams(window.location.search).get('activity') ?? ''; } catch { return ''; } });
  const [language, setLanguage] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [instant, setInstant] = useState(false);
  const [timeWindow, setTimeWindow] = useState<'now' | 'tonight' | 'weekend' | null>(null);
  const [customDate, setCustomDate] = useState(() => { try { return new URLSearchParams(window.location.search).get('date') ?? ''; } catch { return ''; } });
  const [customTime, setCustomTime] = useState('');
  const { ids: savedIdList, toggle: toggleSaved } = useSavedCompanionIds();
  const savedIds = useMemo(() => new Set(savedIdList), [savedIdList]);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'best' | 'price_asc' | 'price_desc' | 'near'>('best');
  const [filters, setFilters] = useState(false);
  const [vibe, setVibe] = useState<string | null>(() => { try { return new URLSearchParams(window.location.search).get('vibe'); } catch { return null; } });

  const [view, setView] = useState<'list' | 'map'>('list');

  const [nearMe, setNearMe] = useState(false);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState<typeof NEAR_ME_RADIUS_OPTIONS[number]>(MAX_NEAR_ME_MILES);

  const handleNearMe = useCallback(() => {
    if (nearMe) { setNearMe(false); setUserCoords(null); setLocError(null); setSortBy((s) => (s === 'near' ? 'best' : s)); return; }
    if (!navigator.geolocation) { setLocError('Your browser does not support location. Search New Orleans or a neighborhood instead.'); return; }
    setLocLoading(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isInNewOrleans(lat, lng)) {
          setNearMe(false);
          setUserCoords(null);
          setLocError('OnlyFavors is live in New Orleans. Search a neighborhood — we do not store your location.');
          return;
        }
        setUserCoords([lat, lng]);
        setNearMe(true);
        setCity('New Orleans');
        setView('map');
        setSortBy('near');
      },
      () => {
        setLocError('Location is optional. Search New Orleans or a neighborhood instead.');
        setLocLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
    );
  }, [nearMe]);

  const handleSave = useCallback(async (id: string) => {
    const wasSaved = savedIds.has(id);
    await toggleSaved(id);
    if (!wasSaved) {
      setSaveToast(id);
      setTimeout(() => setSaveToast((t) => (t === id ? null : t)), 3500);
    }
  }, [savedIds, toggleSaved]);

  const whenValue = customDate && customTime
    ? `${customDate}T${customTime}`
    : customDate || timeWindow || undefined;
  const place = city.trim();
  const placeIsPilot = !place || /new orleans|^nola$/i.test(place);
  const params = useMemo(() => ({
    city: 'New Orleans',
    ...(place && !placeIsPilot ? { area: place } : {}),
    ...(activity ? { activity } : {}),
    ...(language ? { language } : {}),
    ...(maxRate ? { maxRate: Number(maxRate) } : {}),
    ...(instant ? { instantBook: true } : {}),
    ...(whenValue ? { when: whenValue } : {}),
  }), [place, placeIsPilot, activity, language, maxRate, instant, whenValue]);

  const query = useListCompanions(params as Parameters<typeof useListCompanions>[0], { query: { queryKey: getListCompanionsQueryKey(params as Parameters<typeof getListCompanionsQueryKey>[0]), retry: false } });
  const spotsQuery = useListSafeSpots({ city: 'New Orleans' }, {
    query: { queryKey: getListSafeSpotsQueryKey({ city: 'New Orleans' }), retry: false },
  });

  const companions = (query.data ?? []) as DirectoryCompanion[];
  const safeSpots = spotsQuery.data ?? [];

  const VIBE_KEYWORDS: Record<string, string[]> = {
    adventurous: ['hiking', 'climbing', 'outdoor', 'adventure', 'walk', 'cycling'],
    cultural:    ['museum', 'gallery', 'art', 'theatre', 'history', 'architecture', 'exhibitions'],
    'low-key':   ['coffee', 'conversation', 'walk', 'quiet', 'bookstore', 'reading'],
    foodie:      ['dinner', 'cooking', 'food', 'restaurant', 'cuisine', 'dining', 'brunch', 'lunch'],
    creative:    ['art', 'photography', 'craft', 'sketch', 'creative', 'painting', 'writing'],
    social:      ['event', 'networking', 'party', 'social', 'concert', 'festival', 'meetup', 'plus-one'],
  };

  const vibeFiltered = vibe
    ? companions.filter((c) => {
        const kw = VIBE_KEYWORDS[vibe] ?? [];
        const hay = [...c.activities, ...(c.interviewAnswers ?? []), c.biography ?? ''].join(' ').toLowerCase();
        return kw.some((k) => hay.includes(k));
      })
    : companions;
  const radiusFiltered = userCoords
    ? vibeFiltered.filter((c) => minNeighborhoodMiles(c, userCoords) <= radiusMiles)
    : vibeFiltered;
  const shownCompanions = [...radiusFiltered].sort((a, b) => {
    if (sortBy === 'near' && userCoords) {
      return minNeighborhoodMiles(a, userCoords) - minNeighborhoodMiles(b, userCoords);
    }
    if (sortBy === 'price_asc') return a.hourlyRate - b.hourlyRate;
    if (sortBy === 'price_desc') return b.hourlyRate - a.hourlyRate;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  const eveningCompanions = shownCompanions.filter((c) => {
    const hint = availabilityHint(c);
    return hint === 'now' || hint === 'tonight';
  });

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">

        {/* Header row */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Explore nearby</p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d] md:text-6xl">
              Find your kind<br /><em>of company.</em>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#725e69]">
              Browse verified companions available in New Orleans. Browsing is free. Save a profile or send a Favor Request when you are ready to create an account.
            </p>
          </div>
          {/* Controls: Near Me · Time window · View toggle */}
          <div className="flex flex-col items-end gap-2.5">
            {/* Row 1: Near Me + List/Map */}
            <div className="flex items-center gap-2">
              <button onClick={handleNearMe} disabled={locLoading}
                className={cn('inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold transition',
                  nearMe ? 'border-[#3dbd8c] bg-[#3dbd8c]/10 text-[#267a5a]' : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9b6b88]')}
                data-testid="button-near-me">
                <Navigation2 className={cn('h-3.5 w-3.5', nearMe && 'fill-[#3dbd8c] text-[#3dbd8c]')} />
                {locLoading ? 'Locating…' : nearMe ? 'Near me ✓' : 'Near me'}
              </button>
              {nearMe && (
                <div className="flex overflow-hidden rounded-full border border-[#dfd2c9] bg-[#fbf7f1]">
                  {NEAR_ME_RADIUS_OPTIONS.map((miles) => (
                    <button
                      key={miles}
                      type="button"
                      onClick={() => setRadiusMiles(miles)}
                      className={cn('h-10 px-3 text-[11px] font-bold transition', radiusMiles === miles ? 'bg-[#3d2038] text-white' : 'text-[#654c5f] hover:bg-[#eee2d9]')}
                      data-testid={`button-radius-${miles}`}
                    >
                      {miles} mi
                    </button>
                  ))}
                </div>
              )}
              <div className="flex overflow-hidden rounded-full border border-[#dfd2c9] bg-[#fbf7f1]">
                <button onClick={() => setView('list')} className={cn('inline-flex h-10 items-center gap-1.5 px-4 text-xs font-bold transition', view === 'list' ? 'bg-[#3d2038] text-white' : 'text-[#654c5f] hover:bg-[#eee2d9]')} data-testid="button-view-list"><UsersRound className="h-3.5 w-3.5" />List</button>
                <button onClick={() => setView('map')} className={cn('inline-flex h-10 items-center gap-1.5 px-4 text-xs font-bold transition', view === 'map' ? 'bg-[#3d2038] text-white' : 'text-[#654c5f] hover:bg-[#eee2d9]')} data-testid="button-view-map"><Map className="h-3.5 w-3.5" />Map</button>
              </div>
            </div>
            {/* Row 2: Time window chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['now', 'tonight', 'weekend'] as const).map((key) => {
                const label = { now: 'Now', tonight: 'Tonight', weekend: 'This weekend' }[key];
                return (
                  <button key={key}
                    onClick={() => { setTimeWindow(timeWindow === key ? null : key); setCustomDate(''); setCustomTime(''); }}
                    className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-bold transition',
                      timeWindow === key ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9b6b88]')}
                    data-testid={`button-time-${key}`}>
                    <Zap className="h-3 w-3" />{label}
                  </button>
                );
              })}
              <label className={cn('relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-bold transition',
                customDate ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9b6b88]')}>
                <CalendarDays className="h-3 w-3" />{customDate || 'Custom date'}
                <input type="date" value={customDate}
                  onChange={(e) => { setCustomDate(e.target.value); setTimeWindow(null); }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  data-testid="input-custom-date" />
              </label>
              {customDate && (
                <label className={cn('relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-bold transition',
                  customTime ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9b6b88]')}>
                  {customTime || 'Any time'}
                  <input type="time" value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    data-testid="input-custom-time" />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Location error */}
        {locError && (
          <p className="mt-4 rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">{locError}</p>
        )}

        {/* Search / filter bar */}
        <div className="mt-8 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-3 shadow-[0_10px_25px_rgba(88,37,70,.04)]">
          <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
            <label className="flex items-center gap-2 rounded-xl bg-[#f0e4db] px-4">
              <MapPin className="h-4 w-4 text-[#9b6b88]" />
              <input value={city} onChange={(e) => setCity(e.target.value)}
                list="nola-areas"
                placeholder={nearMe ? 'Near you in New Orleans' : 'City, neighborhood, or venue'}
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[#a38c95]"
                data-testid="input-city" />
              <datalist id="nola-areas">
                {NOLA_AREAS.map((area) => <option key={area.name} value={area.name} />)}
              </datalist>
            </label>
            <label className="flex items-center gap-2 rounded-xl bg-[#f0e4db] px-4">
              <Search className="h-4 w-4 text-[#9b6b88]" />
              <input value={activity} onChange={(e) => setActivity(e.target.value)}
                placeholder="Activity, like museums"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[#a38c95]"
                data-testid="input-activity" />
            </label>
            <Button variant={filters ? 'dark' : 'outline'} onClick={() => setFilters(!filters)}
              className="h-11" testId="button-toggle-filters">
              <SlidersHorizontal className="h-4 w-4" />Filters
            </Button>
          </div>
          {filters && (
            <div className="mt-2 grid gap-2 border-t border-[#e7dbd3] pt-3 md:grid-cols-[1fr_1fr_auto]">
              <input value={language} onChange={(e) => setLanguage(e.target.value)}
                placeholder="Language"
                className="h-10 rounded-xl border border-[#dfd2c9] bg-[#fffaf4] px-3 text-sm outline-none focus:border-[#a85b88]"
                data-testid="input-language" />
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between text-[10px] text-[#806c76]">
                  <span>Max hourly rate</span>
                  <span className="font-bold text-[#48213d]">
                    {maxRate ? `Up to $${maxRate}/hr` : 'Any rate'}
                  </span>
                </label>
                <input
                  type="range" min="0" max="200" step="5"
                  value={maxRate || '200'}
                  onChange={(e) => setMaxRate(e.target.value === '200' ? '' : e.target.value)}
                  className="h-2 w-full cursor-pointer accent-[#7f2e62]"
                  data-testid="range-max-rate"
                />
                <div className="flex justify-between font-mono text-[9px] text-[#c6aeb8]">
                  <span>$0</span><span>$50</span><span>$100</span><span>$200+</span>
                </div>
              </div>
              <label className="flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[#654c5f]">
                <input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)}
                  className="accent-[#7f2e62]" data-testid="checkbox-instant-book" /> Instant book only
              </label>
            </div>
          )}
        </div>

        {/* Vibe filter strip */}
        {!activity && (
          <div className="mt-6 flex flex-wrap gap-2" data-testid="vibe-filter-strip">
            {([
              { key: 'adventurous', label: '🧗 Adventurous', match: ['hiking', 'climbing', 'outdoor', 'adventure'] },
              { key: 'cultural', label: '🎭 Cultural', match: ['museum', 'gallery', 'art', 'theatre', 'history'] },
              { key: 'low-key', label: '☕ Low-key', match: ['coffee', 'conversation', 'walk', 'quiet', 'bookstore'] },
              { key: 'foodie', label: '🍜 Foodie', match: ['dinner', 'cooking', 'food', 'restaurant', 'cuisine'] },
              { key: 'creative', label: '🎨 Creative', match: ['art', 'photography', 'craft', 'sketch', 'creative'] },
              { key: 'social', label: '🎉 Social', match: ['event', 'networking', 'party', 'social', 'concert'] },
            ] as const).map(({ key, label }) => (
              <button key={key} type="button"
                onClick={() => setVibe(vibe === key ? null : key)}
                className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${vibe === key ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-white text-[#654c5f] hover:border-[#9d557e]'}`}
                data-testid={`vibe-${key}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Seasonal activity suggestions */}
        {!city && !activity && !vibe && !nearMe && (
          <div className="mt-6 overflow-hidden rounded-[22px] bg-[#3d2038] p-6 text-[#f9efe5]" data-testid="seasonal-activities">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-[#c695ae]" />
              <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c695ae]">Perfect for August</p>
            </div>
            <h2 className="mt-2 font-serif text-2xl leading-none">Summer in the city.</h2>
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
              {[
                { activity: 'Evening walks', desc: 'Cool evenings, warm conversation.', emoji: '🌆' },
                { activity: 'Gallery tours', desc: 'Beat the heat in beautiful spaces.', emoji: '🖼️' },
                { activity: 'Restaurant dining', desc: 'Rooftops and outdoor terraces.', emoji: '🍜' },
                { activity: 'Coffee conversations', desc: 'Start slow, end inspired.', emoji: '☕' },
                { activity: 'Museum visits', desc: 'A/C and art — never a bad idea.', emoji: '🏛️' },
              ].map(({ activity: act, desc, emoji }) => (
                <button key={act} type="button" onClick={() => setActivity(act)}
                  className="flex shrink-0 flex-col rounded-[16px] border border-[#6a3858] bg-[#4a2842] p-4 text-left transition hover:border-[#c695ae]"
                  data-testid={`seasonal-${act.toLowerCase().replace(/ /g, '-')}`}>
                  <span className="text-2xl">{emoji}</span>
                  <p className="mt-3 text-sm font-bold text-[#f9efe5]">{act}</p>
                  <p className="mt-1 text-[10px] leading-4 text-[#c695ae]">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New companions spotlight */}
        {!city && !activity && !nearMe && (() => {
          const newest = [...companions]
            .sort((a, b) => String((b as { createdAt?: string }).createdAt ?? '').localeCompare(String((a as { createdAt?: string }).createdAt ?? '')))
            .slice(0, 5);
          if (!newest.length) return null;
          return (
          <div className="mt-8" data-testid="new-companions-strip">
            <p className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">
              <Sparkles className="h-3.5 w-3.5" />Recently approved
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {newest.map((c) => {
                const createdAt = (c as { createdAt?: string }).createdAt;
                const joined = createdAt ? relativeJoined(createdAt) : 'In the directory';
                return (
                <Link key={c.id} href={`/companions/${c.id}`}
                  className="group flex shrink-0 w-[160px] flex-col rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-4 transition hover:border-[#9d557e] hover:shadow-md"
                  data-testid={`new-companion-${c.id}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-bold text-[10px] text-[#7f2e62]">{companionInitials(c.displayName)}</div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#48213d]">{c.displayName}</p>
                      <p className="truncate text-[9px] text-[#9b858e]">{c.city}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-[#ead0dd] px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#7f2e62]">New</span>
                    <span className="font-mono text-[10px] font-bold text-[#48213d]">${c.hourlyRate}/hr</span>
                  </div>
                  <p className="mt-1.5 text-[9px] text-[#b0929f]">{joined}</p>
                </Link>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Trending activities this week */}
        {!city && !activity && !vibe && !nearMe && (
          <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="trending-activities">
            <p className="font-mono text-[8px] uppercase tracking-[.2em] text-[#b0929f]">Trending</p>
            {[
              { label: 'Museum visits', emoji: '🏛️' },
              { label: 'Coffee conversations', emoji: '☕' },
              { label: 'Gallery tours', emoji: '🖼️' },
              { label: 'Evening walks', emoji: '🌆' },
              { label: 'Cooking together', emoji: '🍳' },
            ].map(({ label, emoji }) => (
              <button key={label} type="button"
                onClick={() => setActivity(label)}
                className="flex items-center gap-1.5 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-3 py-1 text-[10px] font-semibold text-[#725e69] transition hover:border-[#9d557e] hover:text-[#7f2e62]"
                data-testid={`trending-${label.toLowerCase().replace(/ /g, '-')}`}>
                <span>{emoji}</span>{label}
              </button>
            ))}
          </div>
        )}

        {/* Results header */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-[#dfd2c9] pb-4">
          <p className="flex-1 font-mono text-[10px] uppercase tracking-[.16em] text-[#9b858e]">
            {query.isLoading ? 'Searching…'
              : view === 'map'
                ? `${shownCompanions.length} approved companion${shownCompanions.length === 1 ? '' : 's'} · neighborhood view`
                : vibe ? `${shownCompanions.length} ${vibe} companions` : `${shownCompanions.length} approved companions`}
          </p>
          {view === 'list' && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-8 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-3 font-mono text-[10px] uppercase tracking-[.1em] text-[#654c5f] focus:outline-none"
              data-testid="select-sort-by"
            >
              <option value="best">Best rated</option>
              {userCoords && <option value="near">Nearest neighborhood</option>}
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
            </select>
          )}
          {(city !== 'New Orleans' || activity || language || maxRate || instant || nearMe || timeWindow || customDate || customTime || vibe) && (
            <button type="button"
              onClick={() => { setCity('New Orleans'); setActivity(''); setLanguage(''); setMaxRate(''); setInstant(false); setNearMe(false); setUserCoords(null); setTimeWindow(null); setCustomDate(''); setCustomTime(''); setVibe(null); setSortBy('best'); setLocError(null); setRadiusMiles(MAX_NEAR_ME_MILES); }}
              className="text-xs font-bold text-[#7f2e62]" data-testid="button-clear-filters">
              Clear all
            </button>
          )}
        </div>

        {/* Map view */}
        {view === 'map' && (
          <div className="mt-7">
            {/* Available now rail */}
            {eveningCompanions.length > 0 && !timeWindow && !customDate && (
              <div className="mb-5">
                <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e] flex items-center gap-2">
                  <Zap className="h-3 w-3" />{eveningCompanions.length} approved companion{eveningCompanions.length === 1 ? '' : 's'} available this evening in New Orleans
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {eveningCompanions.map((c) => (
                    <Link key={c.id} href={`/companions/${c.id}`}
                      className="flex shrink-0 items-center gap-3 rounded-[16px] border border-[#3dbd8c]/30 bg-[#e8f5ef] px-4 py-3 hover:border-[#3dbd8c]">
                      <Avatar companion={c} />
                      <div>
                        <p className="text-sm font-bold text-[#31533f]">{c.displayName}</p>
                        <p className="text-[10px] text-[#688370]">{c.serviceArea}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <SafeSpotMap
              safeSpots={safeSpots}
              companions={shownCompanions}
              userCoords={userCoords}
              height="560px"
            />
            <div className="mt-4 flex items-start gap-2 rounded-[16px] bg-[#f0e4db] p-4 text-xs leading-5 text-[#725e69]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />
              Companions appear at neighborhood centers — never as live pins, homes, or routes. Distance is approximate from those neighborhoods, capped at 15 miles. The meeting venue is shared only after both people confirm.
            </div>
          </div>
        )}

        {/* List view */}
        {view === 'list' && (
          <div className="mt-7">
            {/* Recently viewed rail */}
            {(() => {
              try {
                const recent: Array<{ id: string; name: string; city: string; rate: number }> =
                  JSON.parse(localStorage.getItem('of_recently_viewed') ?? '[]');
                if (!recent.length) return null;
                return (
                  <div className="mb-5 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-4">
                    <p className="mb-3 font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Recently viewed</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {recent.map((r) => (
                        <Link key={r.id} href={`/companions/${r.id}`}
                          className="flex shrink-0 items-center gap-2.5 rounded-[12px] border border-[#ece1d9] bg-white px-3 py-2.5 transition hover:border-[#c6aeb8]"
                          data-testid={`recent-${r.id}`}>
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-sm text-[#7f2e62]">
                            {r.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#48213d]">{r.name}</p>
                            <p className="text-[9px] text-[#9b858e]">{r.city} · ${r.rate}/hr</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {/* Available now spotlight strip — always shown when anyone is available */}
            {!query.isLoading && !query.isError && !timeWindow && !customDate && eveningCompanions.length > 0 && (
              <div className="mb-7 rounded-[20px] border border-[#3dbd8c]/25 bg-[#eaf6f1] p-5">
                <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#2a7d59]">
                  <Zap className="h-3.5 w-3.5" />{eveningCompanions.length} approved companion{eveningCompanions.length === 1 ? '' : 's'} available this evening in New Orleans
                </p>
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {eveningCompanions.map((c) => (
                    <Link key={c.id} href={`/companions/${c.id}`}
                      className="group flex shrink-0 items-center gap-3 rounded-[14px] border border-[#3dbd8c]/20 bg-white px-4 py-3 transition hover:border-[#3dbd8c] hover:shadow-sm"
                      data-testid={`avail-spotlight-${c.id}`}>
                      <Avatar companion={c} />
                      <div>
                        <p className="text-sm font-bold text-[#31533f]">{c.displayName}</p>
                        <p className="text-[10px] text-[#5a8e70]">{c.serviceArea} · ${c.hourlyRate}/hr</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-[#2a7d59] group-hover:underline">
                          View profile <ChevronRight className="h-3 w-3" />
                        </p>
                      </div>
                    </Link>
                  ))}
                  <button type="button" onClick={() => { setTimeWindow('tonight'); setCustomDate(''); }}
                    className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[#3dbd8c]/30 bg-transparent px-6 py-3 text-center transition hover:border-[#3dbd8c] hover:bg-white"
                    data-testid="button-show-avail-only">
                    <Zap className="h-4 w-4 text-[#2a7d59]" />
                    <p className="text-[10px] font-bold text-[#2a7d59]">Show only tonight</p>
                  </button>
                </div>
              </div>
            )}

            {query.isLoading
              ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><LoadingState /><LoadingState /><LoadingState /></div>
              : query.isError
              ? <ErrorState onRetry={() => query.refetch()} />
              : shownCompanions.length === 0
              ? <EmptyState icon={UsersRound} title="A quiet directory, for now."
                  body={nearMe
                    ? `No approved companions have a neighborhood center within ${radiusMiles} miles. Try 15 miles, or search a New Orleans neighborhood. We do not show live pins.`
                    : whenValue
                    ? 'No approved companions have published hours for that window yet. Try another time, or browse everyone who is listed.'
                    : 'We do not fill this space with invented profiles. Try another New Orleans neighborhood, or check back as companions are approved.'}
                  action={<Button variant="outline" onClick={() => { setCity('New Orleans'); setActivity(''); setTimeWindow(null); setCustomDate(''); setVibe(null); }} testId="button-browse-all">Browse New Orleans</Button>} />
              : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {shownCompanions.map((companion) => {
                    const distanceMiles = userCoords
                      ? minNeighborhoodMiles(companion, userCoords)
                      : undefined;
                    return (
                      <CompanionCard
                        key={companion.id}
                        companion={companion}
                        saved={savedIds.has(companion.id)}
                        onSave={handleSave}
                        onActivityFilter={(a) => setActivity(a)}
                        distanceMiles={distanceMiles}
                      />
                    );
                  })}
                </div>
            }
          </div>
        )}
      </main>

      {/* Save toast */}
      {saveToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#3d2038] px-5 py-3 text-xs font-semibold text-[#f9efe5] shadow-xl">
          Saved to your account
        </div>
      )}
    </Shell>
  );
}

const REPORT_REASONS = [
  'Inappropriate messages',
  'Request to meet privately',
  'Fake or misleading profile',
  'Safety concern during booking',
  'Other',
];

function ReportButton({ companionId, companionName }: { companionId: string; companionName: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/companions/${companionId}/report`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Could not submit report');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report');
    } finally { setLoading(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="text-[10px] font-semibold text-[#b09aa8] underline-offset-2 hover:text-[#7f2e62] hover:underline"
        data-testid="button-report-concern">
        Report a concern
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="relative w-full max-w-md rounded-[24px] bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} className="absolute right-5 top-5 text-[#9b858e] hover:text-[#48213d]"><X className="h-5 w-5" /></button>
            {done ? (
              <div className="py-4 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-[#477254]" />
                <h3 className="mt-4 font-serif text-2xl text-[#48213d]">Thank you for letting us know.</h3>
                <p className="mt-3 text-sm leading-6 text-[#725e69]">The report was saved. We do not promise a 24-hour review. For an emergency, call local services.</p>
                <button type="button" onClick={() => setOpen(false)}
                  className="mt-6 inline-flex h-10 items-center rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white">Close</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#9d557e]">Safety concern</p>
                <h3 className="mt-2 font-serif text-2xl text-[#48213d]">Report a concern</h3>
                <p className="mt-1 text-xs text-[#725e69]">About {companionName}. This is stored for the trust team — there is no published review SLA.</p>
                <div className="mt-5 space-y-2">
                  {REPORT_REASONS.map((r) => (
                    <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 transition ${reason === r ? 'border-[#7f2e62] bg-[#fbf0f7]' : 'border-[#dfd2c9] hover:border-[#c695ae]'}`}>
                      <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="sr-only" />
                      <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${reason === r ? 'border-[#7f2e62] bg-[#7f2e62]' : 'border-[#c4a5b5]'}`} />
                      <span className="text-sm text-[#48213d]">{r}</span>
                    </label>
                  ))}
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional: additional context for our team"
                  rows={3} className="mt-4 w-full resize-none rounded-[12px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3 text-sm outline-none placeholder:text-[#b09aa8] focus:border-[#9d557e]" />
                {error && <p className="mt-3 text-xs text-[#a64742]">{error}</p>}
                <button type="submit" disabled={!reason || loading}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#7f2e62] text-sm font-bold text-white disabled:opacity-40"
                  data-testid="button-submit-report">
                  {loading ? 'Sending…' : 'Submit report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BlockButton({ companionId }: { companionId: string }) {
  const { user } = useAuth();
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;
  if (done) return <p className="text-[10px] font-semibold text-[#477254]">Blocked</p>;
  return (
    <button
      type="button"
      onClick={async () => {
        setError('');
        const res = await fetch('/api/blocks', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companionId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          setError(body.error ?? 'Could not block');
          return;
        }
        setDone(true);
      }}
      className="text-[10px] font-semibold text-[#b09aa8] underline-offset-2 hover:text-[#7f2e62] hover:underline"
      data-testid="button-block-companion"
    >
      {error || 'Block this companion'}
    </button>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: document.title, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <button type="button" onClick={share}
      className="flex items-center gap-1.5 text-xs font-semibold text-[#9b858e] transition hover:text-[#7f2e62]"
      data-testid="button-share-profile">
      {copied ? <Check className="h-3.5 w-3.5 text-[#477254]" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? 'Link copied' : 'Share profile'}
    </button>
  );
}

function GiftSessionButton({ companionName, companionId }: { companionName: string; companionId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const profileUrl = `${window.location.origin}/companions/${companionId}`;
  const giftUrl = note.trim()
    ? `${profileUrl}?gift=${encodeURIComponent(note.trim())}`
    : profileUrl;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(giftUrl);
    } catch {
      const el = document.createElement('textarea');
      el.value = giftUrl; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    setSent(true);
    setTimeout(() => { setSent(false); setOpen(false); }, 2000);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[#9b858e] transition hover:text-[#7f2e62]"
        data-testid="button-gift-session">
        <HeartHandshake className="h-3.5 w-3.5" />Gift a session
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-md rounded-[24px] bg-[#fbf7f1] p-7 shadow-[0_30px_70px_rgba(0,0,0,.2)]" data-testid="modal-gift">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Share as a gift</p>
                <h3 className="mt-1.5 font-serif text-2xl text-[#48213d]">Gift time with {companionName.split(' ')[0]}</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-[#9b858e] hover:text-[#48213d]"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#725e69]">
              Add a personal note and share a link — the recipient clicks it to book directly. The note is included in the link URL.
            </p>
            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold text-[#654c5f]">Personal note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder={`I thought you'd enjoy some time with ${companionName.split(' ')[0]}…`}
                className="w-full resize-none rounded-xl border border-[#cbbab5] bg-white px-4 py-3 text-sm outline-none focus:border-[#7f2e62]"
                data-testid="input-gift-note"
              />
              <p className="mt-1 text-right font-mono text-[9px] text-[#c6aeb8]">{note.length}/200</p>
            </div>
            <div className="mt-4 rounded-xl bg-[#f0e4db] p-3">
              <p className="truncate font-mono text-[9px] text-[#9b858e]">{giftUrl}</p>
            </div>
            <button type="button" onClick={copy}
              className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full h-11 text-sm font-bold transition ${sent ? 'bg-[#e8f0e8] text-[#477254]' : 'bg-[#7f2e62] text-white hover:bg-[#65234e]'}`}
              data-testid="button-copy-gift-link">
              {sent ? <><Check className="h-4 w-4" />Link copied! Share it with someone.</> : <><HeartHandshake className="h-4 w-4" />Copy gift link</>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

type AvailDay = { day: string; hours: string };
// ---------------------------------------------------------------------------
// Customer messages page  /messages
// ---------------------------------------------------------------------------

function CustomerMessagesPage() {
  const { data, isLoading, isError, refetch } = useCustomerBookings();

  // Bookings where chat is unlocked
  const CHAT_STATUSES = new Set(['deposit_paid', 'authorized', 'confirmed', 'completed']);
  const threads = useMemo(
    () => (data ?? [])
      .filter((b) => CHAT_STATUSES.has(b.status))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );

  const STATUS_LABEL: Record<string, string> = {
    deposit_paid: 'Deposit paid',
    authorized: 'Authorized',
    confirmed: 'Confirmed',
    completed: 'Completed',
  };
  const STATUS_DOT: Record<string, string> = {
    deposit_paid: 'bg-[#d897b6]',
    authorized: 'bg-[#80b895]',
    confirmed: 'bg-[#5a9bc4]',
    completed: 'bg-[#b09aa8]',
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-3xl px-5 py-10 pb-24 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Your conversations</p>
            <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Messages</h1>
          </div>
          <button type="button" onClick={() => refetch()}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
            data-testid="button-refresh-messages">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Notice */}
        <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-[#dce8f5] bg-[#eaf0f8] p-4">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-[#2a5280]" />
          <p className="text-xs leading-5 text-[#2a5280]">
            All messages are masked — phone numbers, email addresses, and personal contact info are automatically removed to protect both parties.
          </p>
        </div>

        {/* Thread list */}
        <div className="mt-6">
          {isLoading && (
            <div className="space-y-2">
              {[0,1,2].map((i) => <div key={i} className="skeleton h-24 rounded-[20px]" />)}
            </div>
          )}

          {isError && <ErrorState onRetry={() => refetch()} />}

          {!isLoading && !isError && threads.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-14 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-[#c6aeb8]" />
              <p className="mt-4 font-serif text-xl text-[#48213d]">No messages yet.</p>
              <p className="mt-2 max-w-xs mx-auto text-sm leading-6 text-[#806c76]">
                Chat unlocks after your $10 deposit is paid. Browse companions to get started.
              </p>
              <Link href="/explore"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white"
                data-testid="link-messages-explore">
                Browse companions <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}

          {threads.length > 0 && (
            <div className="overflow-hidden rounded-[22px] border border-[#dfd2c9]">
              <div className="divide-y divide-[#f0e8e2]">
                {threads.map((b) => {
                  const isActive = b.status !== 'completed';
                  const firstName = (b.companionName ?? 'Companion').split(' ')[0];
                  return (
                    <Link key={b.id} href={`/booking/${b.id}`}
                      className="flex items-center gap-4 bg-white px-5 py-4 transition hover:bg-[#fbf7f1]"
                      data-testid={`message-thread-${b.id}`}>
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ead0dd] font-serif text-lg text-[#7f2e62]">
                          {firstName.charAt(0)}
                        </div>
                        {isActive && (
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${STATUS_DOT[b.status] ?? 'bg-[#c6aeb8]'}`} />
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-bold text-[#48213d]">{b.companionName ?? 'Your companion'}</p>
                          <p className="shrink-0 font-mono text-[10px] text-[#9b858e]">{b.date}</p>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[#725e69]">{b.activity}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className={`inline-flex h-1.5 w-1.5 rounded-full ${STATUS_DOT[b.status] ?? 'bg-[#c6aeb8]'}`} />
                          <span className="text-[10px] font-medium text-[#9b858e]">{STATUS_LABEL[b.status] ?? b.status}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-[11px] font-bold text-[#7f2e62] sm:block">Open chat</span>
                        <ChevronRight className="h-4 w-4 text-[#b0929f]" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        {threads.length > 0 && (
          <div className="mt-8 space-y-2">
            {[
              { icon: ShieldCheck, text: 'Companions can only be contacted through this platform. Never share personal contact details.' },
              { icon: Clock3, text: 'Most companions reply within a few hours. Tap a thread to open the full conversation.' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#9d557e]" />
                <p className="text-xs leading-5 text-[#725e69]">{text}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion Q&A interview display
// ---------------------------------------------------------------------------

const COMPANION_QA_QUESTIONS = [
  'What draws you to companion work?',
  'Describe your ideal afternoon with a customer.',
  'What should customers know before booking you?',
] as const;

function CompanionQA({ companionId, name }: { companionId: string; name: string }) {
  const query = useGetCompanion(companionId, {
    query: { enabled: Boolean(companionId), queryKey: getGetCompanionQueryKey(companionId), retry: false },
  });
  const answers = ((query.data as { interviewAnswers?: string[] } | undefined)?.interviewAnswers ?? []).filter(Boolean);

  const STARTERS = [
    `Ask ${name.split(' ')[0]} about their favourite hidden gem in their city.`,
    `Find out what ${name.split(' ')[0]} is reading or watching right now.`,
    `Ask which activity they most enjoy showing first-time visitors.`,
  ];

  if (!answers.length) {
    // Show conversation starters even if no Q&A
    return (
      <div className="mt-10 border-t border-[#dfd2c9] pt-8">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Conversation starters</p>
        <p className="mt-2 text-xs text-[#806c76]">Once you book and unlock chat, try one of these to break the ice.</p>
        <ul className="mt-4 space-y-2">
          {STARTERS.map((s) => (
            <li key={s} className="flex items-start gap-2.5 rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3 text-xs leading-5 text-[#654c5f]">
              <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9d557e]" />{s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-10 border-t border-[#dfd2c9] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">In {name.split(' ')[0]}'s own words</p>
      <div className="mt-5 space-y-4">
        {COMPANION_QA_QUESTIONS.map((question, i) => {
          const answer = answers[i]?.trim();
          if (!answer) return null;
          return (
            <div key={question} className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[.12em] text-[#9b858e]">{question}</p>
              <p className="mt-2.5 text-[15px] leading-7 text-[#48213d]">{answer}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompanionBadges({ rating, reviewCount, totalBookings, responseTime, verified }: {
  rating: number; reviewCount: number; totalBookings: number; responseTime: string; verified?: boolean;
}) {
  const badges: Array<{ icon: typeof Star; label: string; desc: string; color: string; bg: string }> = [];

  if (rating >= 4.8 && reviewCount >= 3) {
    badges.push({ icon: Star, label: '5-star quality', desc: `${rating.toFixed(1)} avg rating`, color: 'text-[#bf8750]', bg: 'bg-[#fdf3e3]' });
  }
  if (totalBookings >= 20) {
    badges.push({ icon: HeartHandshake, label: 'Experienced', desc: `${totalBookings}+ bookings`, color: 'text-[#7f2e62]', bg: 'bg-[#ead0dd]' });
  } else if (totalBookings >= 5) {
    badges.push({ icon: HeartHandshake, label: 'Established', desc: `${totalBookings}+ bookings`, color: 'text-[#7f2e62]', bg: 'bg-[#ead0dd]' });
  }
  if (responseTime && (responseTime.includes('1h') || responseTime.includes('2h') || responseTime.includes('30m') || responseTime.includes('1 h') || responseTime.includes('2 h'))) {
    badges.push({ icon: Clock3, label: 'Fast responder', desc: `Replies within ${responseTime}`, color: 'text-[#2a5280]', bg: 'bg-[#dce8f5]' });
  }
  if (verified) {
    badges.push({ icon: ShieldCheck, label: 'Verified', desc: 'Identity confirmed', color: 'text-[#477254]', bg: 'bg-[#e8f0e8]' });
  }

  if (!badges.length) return null;

  return (
    <div className="mt-8 border-t border-[#dfd2c9] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Achievements</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {badges.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.label} title={b.desc}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${b.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${b.color}`} />
              <span className={`text-xs font-bold ${b.color}`}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompanionAvailability({ availability }: { availability: AvailDay[] }) {
  if (!availability?.length) return null;
  return (
    <div className="mt-10 border-t border-[#dfd2c9] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Typical availability</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {availability.map((a) => (
          <div key={a.day} className="rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#9d557e]">{a.day}</p>
            <p className="mt-1 text-xs text-[#654c5f]">{a.hours}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#9b858e]">Actual availability confirmed at time of booking.</p>
    </div>
  );
}

function SimilarCompanions({ currentId, city, activities }: { currentId: string; city: string; activities: string[] }) {
  const companions = useListCompanions({ query: { queryKey: getListCompanionsQueryKey(), staleTime: 120_000, retry: false } });
  const similar = (companions.data ?? [])
    .filter((c) => c.id !== currentId)
    .sort((a, b) => {
      // Score: shared activities (2pts each) + same city (3pts)
      const aScore = (a.activities?.filter((x: string) => activities.includes(x)).length ?? 0) * 2 + (a.city === city ? 3 : 0);
      const bScore = (b.activities?.filter((x: string) => activities.includes(x)).length ?? 0) * 2 + (b.city === city ? 3 : 0);
      return bScore - aScore;
    })
    .slice(0, 3);

  if (companions.isLoading || similar.length === 0) return null;

  return (
    <div className="mt-12 border-t border-[#dfd2c9] pt-10">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">You might also like</p>
      <h2 className="mt-2 font-serif text-3xl text-[#48213d]">Similar companions</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((s: any) => (
          <Link key={s.id} href={`/companions/${s.id}`}
            className="group flex flex-col gap-3 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:border-[#c695ae] hover:shadow-md"
            data-testid={`similar-companion-${s.id}`}>
            <div className="flex items-center gap-3">
              <Avatar companion={s} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-serif text-lg leading-none text-[#48213d]">{s.displayName}</p>
                  {s.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#7f2e62]" />}
                </div>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[#806c76]">
                  <MapPin className="h-3 w-3" />{s.serviceArea ?? s.city}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(s.activities ?? []).slice(0, 2).map((a: string) => (
                <span key={a} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${activities.includes(a) ? 'bg-[#ead0dd] text-[#7f2e62]' : 'bg-[#f0e4db] text-[#806c76]'}`}>{a}</span>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-[#9b858e]">
                <Star className="h-3 w-3 fill-[#bf8750] text-[#bf8750]" />
                {s.rating?.toFixed(1) ?? '—'} · {money(s.hourlyRate * 100)}/hr
              </div>
              <span className="text-[10px] font-bold text-[#9d557e] opacity-0 transition group-hover:opacity-100">View profile →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function useRecentlyViewed() {
  const read = (): Array<{ id: string; name: string; city: string; rate: number }> => {
    try { return JSON.parse(localStorage.getItem('of_recently_viewed') ?? '[]'); } catch { return []; }
  };
  const record = (id: string, name: string, city: string, rate: number) => {
    const prev = read().filter((x) => x.id !== id);
    const next = [{ id, name, city, rate }, ...prev].slice(0, 5);
    try { localStorage.setItem('of_recently_viewed', JSON.stringify(next)); } catch {}
  };
  return { read, record };
}

function Profile() {
  const { id = '' } = useParams<{ id: string }>();
  const query = useGetCompanion(id, { query: { queryKey: getGetCompanionQueryKey(id), enabled: Boolean(id) } });
  const { record } = useRecentlyViewed();

  useEffect(() => {
    const c = query.data;
    if (c) record(c.id, c.displayName, c.city, c.hourlyRate);
  }, [query.data?.id]);

  if (query.isLoading) return <Shell><main className="mx-auto max-w-6xl px-5 py-16"><LoadingState /></main></Shell>;
  if (query.isError || !query.data) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => query.refetch()} /></main></Shell>;
  const c = query.data;
  return <Shell><><main className="page-enter mx-auto max-w-6xl px-5 py-10 pb-28 lg:px-8 lg:py-16 lg:pb-16"><Link href="/explore" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-back-explore"><ArrowLeft className="h-4 w-4" />Back to explore</Link><div className="grid gap-10 lg:grid-cols-[1fr_340px]"><div><div className="flex flex-wrap items-center gap-5"><Avatar companion={c} large /><div><div className="flex items-center gap-2"><h1 className="font-serif text-5xl leading-none text-[#48213d]">{c.displayName}</h1>{c.verified && <BadgeCheck className="h-5 w-5 text-[#7f2e62]" />}</div><p className="mt-2 flex items-center gap-1.5 text-sm text-[#806c76]"><MapPin className="h-4 w-4 text-[#9b6b88]" />{c.serviceArea}, {c.city}</p><p className="mt-2 flex items-center gap-2 text-xs text-[#806c76]"><Star className="h-3.5 w-3.5 fill-[#bf8750] text-[#bf8750]" />{c.rating > 0 ? `${c.rating.toFixed(1)} from ${c.reviewCount} reviews` : 'New to OnlyFavors'}{c.responseTime ? <><span className="text-[#c6aeb8]">·</span><Clock3 className="h-3.5 w-3.5" />Usually replies in {c.responseTime}</> : null}</p></div></div><div className="mt-12 border-t border-[#dfd2c9] pt-8"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">A little about {c.displayName}</p><p className="mt-4 max-w-2xl whitespace-pre-line text-[16px] leading-8 text-[#654c5f]">{c.biography || 'This companion has not added a biography yet.'}</p></div><div className="mt-10 grid gap-8 border-t border-[#dfd2c9] pt-8 sm:grid-cols-2"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">They enjoy</p><div className="mt-4 flex flex-wrap gap-2">{c.activities.length ? c.activities.map((x) => <Link key={x} href={`/explore?activity=${encodeURIComponent(x)}`} className="rounded-full bg-[#ead0dd] px-3 py-2 text-xs font-semibold text-[#7f2e62] transition-colors hover:bg-[#c695ae] hover:text-white">{x}</Link>) : <p className="text-sm text-[#806c76]">No activities listed yet.</p>}</div><p className="mt-7 font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Languages</p><p className="mt-3 text-sm text-[#654c5f]">{c.languages.length ? c.languages.join(' · ') : 'Not listed'}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Clear boundaries</p><ul className="mt-4 space-y-3">{(c.boundaries?.length ? c.boundaries : ['Platonic connection only', 'Public meeting places only', 'Mutual respect at every step']).map((x) => <li key={x} className="flex items-start gap-2 text-sm leading-5 text-[#654c5f]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />{x}</li>)}</ul></div></div><CompanionBadges rating={c.rating} reviewCount={c.reviewCount} totalBookings={(c as any).totalBookings ?? 0} responseTime={c.responseTime} verified={c.verified} /><CompanionQA companionId={c.id} name={c.displayName} /><CompanionReviews companionId={c.id} /><CompanionAvailability availability={(c as any).availability ?? []} /><SimilarCompanions currentId={c.id} city={c.city} activities={c.activities} /></div><aside className="h-fit rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 shadow-[0_15px_35px_rgba(88,37,70,.07)] lg:sticky lg:top-28"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">Starting at</span><span className="font-serif text-3xl text-[#48213d]">{money(c.hourlyRate * 100)}<small className="font-sans text-xs text-[#806c76]"> / hr</small></span></div>
        <p className="mt-1 text-right text-[11px] text-[#9b858e]">Full day {money(companionDayRate(c as DirectoryCompanion) * 100)}</p>
        <div className="my-6 space-y-3 border-y border-[#e9ddd6] py-5 text-sm text-[#654c5f]"><p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#477254]" />{c.verified ? 'Identity verified by OnlyFavors' : 'Public SafeSpot meetings'}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#477254]" />SafeSpot meeting options</p><p className="flex items-center gap-2"><EyeOff className="h-4 w-4 text-[#477254]" />Approximate area only</p></div>{(c as any).away?.enabled && (
  <p className="mb-3 rounded-xl bg-[#ead0dd] px-3 py-2 text-center text-xs font-semibold text-[#7f2e62]">{(c as any).away.note || `Currently away${(c as any).away.returnDate ? ` · back ${(c as any).away.returnDate}` : ''}`}</p>
)}
{(c as any).paused ? (
  <p className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#dfd2c9] text-sm font-bold text-[#654c5f]" data-testid="companion-paused-notice">Not accepting bookings right now</p>
) : (
  <Link href={bookHref(c.id)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-[#fff5eb] transition hover:bg-[#65234e]" data-testid="link-book-companion">Plan time with {c.displayName.split(' ')[0]} <ArrowRight className="h-4 w-4" /></Link>
)}<p className="mt-4 text-center text-[11px] leading-5 text-[#9b858e]">You will choose an activity, date, and public SafeSpot next.</p><div className="mt-5 flex items-center justify-center gap-4 border-t border-[#ece1d9] pt-4"><ShareButton /><GiftSessionButton companionName={c.displayName} companionId={c.id} /></div>{(c as any).acceptanceRate && (
  <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-[#9b858e]">
    <span className="flex items-center gap-1">
      <Check className="h-3 w-3 text-[#477254]" />
      <span className="font-bold text-[#477254]">{(c as any).acceptanceRate}%</span> acceptance
    </span>
    <span className="text-[#c6aeb8]">·</span>
    <span>{(c as any).totalBookings ?? 0} bookings</span>
  </div>
)}
{(c as any).memberSince && <p className="text-center text-[10px] text-[#9b858e]">Member since {(c as any).memberSince}</p>}<div className="mt-4 flex justify-center gap-4"><ReportButton companionId={c.id} companionName={c.displayName} /><BlockButton companionId={c.id} /></div></aside></div>
</main>
<div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-[#dfd2c9] bg-[#fbf7f1]/96 px-5 py-3 backdrop-blur-sm lg:hidden" data-testid="mobile-booking-bar">
  <div>
    <p className="font-mono text-[9px] uppercase tracking-wider text-[#9b858e]">Starting at</p>
    <p className="font-serif text-xl text-[#48213d]">{money(c.hourlyRate * 100)}<small className="font-sans text-xs text-[#806c76]"> / hr</small></p>
  </div>
  {(c as any).paused ? (
    <p className="flex-1 text-right text-xs font-bold text-[#654c5f]">Not accepting bookings</p>
  ) : (
    <Link href={bookHref(c.id)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-[#fff5eb] transition hover:bg-[#65234e]" data-testid="link-mobile-book-companion">
      Plan time with {c.displayName.split(' ')[0]} <ArrowRight className="h-4 w-4" />
    </Link>
  )}
</div>
</></Shell>;
}

// ---------------------------------------------------------------------------
// Stripe checkout modal
// ---------------------------------------------------------------------------

function CheckoutForm({ amountCents, label, onSuccess, onClose }: {
  amountCents: number; label: string; onSuccess: () => void; onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setErr(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    setBusy(false);
    if (error) { setErr(error.message ?? 'Payment failed. Please try again.'); }
    else { onSuccess(); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement options={{ layout: 'tabs' }} />
      {err && <p className="rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">{err}</p>}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={busy || !stripe}
          className="flex-1 h-11 rounded-full bg-[#7f2e62] text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Processing…' : `Pay ${money(amountCents)}`}
        </button>
        <button type="button" onClick={onClose}
          className="h-11 px-5 rounded-full border border-[#cbbab5] text-sm font-bold text-[#654c5f]">
          Cancel
        </button>
      </div>
    </form>
  );
}

function CheckoutModal({ clientSecret, amountCents, label, onSuccess, onClose }: {
  clientSecret: string; amountCents: number; label: string; onSuccess: () => void; onClose: () => void;
}) {
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null> | null>(null);

  useEffect(() => {
    fetch('/api/stripe/config')
      .then((r) => r.json())
      .then((d: { publishableKey?: string }) => {
        if (d.publishableKey) setStripePromise(loadStripe(d.publishableKey));
      })
      .catch(() => {/* Stripe config unavailable — form stays loading */});
  }, []);

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#7f2e62',
      colorBackground: '#fbf7f1',
      colorText: '#3d2038',
      colorDanger: '#a64742',
      fontFamily: 'DM Sans, sans-serif',
      borderRadius: '12px',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-[28px] bg-[#f8f1e9] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Secure payment</p>
            <h2 className="mt-1 font-serif text-3xl text-[#3d2038]">{label}</h2>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-[#efe5de] text-[#654c5f]"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-5 rounded-[16px] bg-[#3d2038] p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">Amount</span>
            <span className="font-serif text-2xl text-[#f9efe5]">{money(amountCents)}</span>
          </div>
        </div>
        {!stripePromise ? (
          <div className="space-y-3">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
            <p className="text-center text-xs text-[#9d7e8e]">Loading payment form…</p>
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
            <CheckoutForm amountCents={amountCents} label={label} onSuccess={onSuccess} onClose={onClose} />
          </Elements>
        )}
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-[#9d7e8e]">
          <LockKeyhole className="h-3 w-3" />Payments are processed by Stripe. OnlyFavors never stores your card details.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Companion booking inbox
// ---------------------------------------------------------------------------

const INBOX_STATUS: Record<string, { label: string; tone: string; canAccept: boolean; canDecline: boolean }> = {
  requested:    { label: 'Deposit needed',       tone: 'amber',  canAccept: false, canDecline: true  },
  deposit_paid: { label: 'Ready to confirm',     tone: 'green',  canAccept: true,  canDecline: true  },
  authorized:   { label: 'Payment held',         tone: 'green',  canAccept: true,  canDecline: true  },
  confirmed:    { label: 'Confirmed',            tone: 'plum',   canAccept: false, canDecline: false },
  completed:    { label: 'Completed',            tone: 'gray',   canAccept: false, canDecline: false },
  cancelled:    { label: 'Cancelled',            tone: 'gray',   canAccept: false, canDecline: false },
  expired:      { label: 'Hold expired',         tone: 'gray',   canAccept: false, canDecline: false },
};

function useCompanionBookings(enabled = true) {
  return useQuery<BookingDetail[]>({
    queryKey: ['companion-bookings'],
    queryFn: async () => {
      const res = await fetch('/api/companion/bookings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json() as Promise<BookingDetail[]>;
    },
    refetchInterval: 30_000,
    enabled,
  });
}

function useAcceptBooking() {
  const qc = useQueryClient();
  return useMutation<BookingDetail, Error, { id: string; welcomeMessage?: string; agreeReceipt?: boolean }>({
    mutationFn: async ({ id, welcomeMessage, agreeReceipt }) => {
      const res = await fetch(`/api/bookings/${id}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreeReceipt: Boolean(agreeReceipt) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to accept');
      const booking = await res.json();
      // Optionally post a welcome message into the chat
      if (welcomeMessage?.trim()) {
        await fetch(`/api/bookings/${id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: welcomeMessage.trim() }),
        }).catch(() => {});
      }
      return booking;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion-bookings'] }),
  });
}

function useDeclineBooking() {
  const qc = useQueryClient();
  return useMutation<BookingDetail, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/bookings/${id}/decline`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to decline');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion-bookings'] }),
  });
}

function InboxStatusBadge({ status }: { status: string }) {
  const s = INBOX_STATUS[status] ?? { label: status, tone: 'gray' };
  const cls: Record<string, string> = {
    green: 'bg-[#e8f0e8] text-[#31533f]',
    amber: 'bg-[#f3ead7] text-[#7a5a12]',
    plum:  'bg-[#ead0dd] text-[#7f2e62]',
    gray:  'bg-[#f0e4db] text-[#725e69]',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.15em] ${cls[s.tone]}`}>
      {s.label}
    </span>
  );
}

function CompanionInbox() {
  const { data, isLoading, isError, refetch } = useCompanionBookings();
  const accept = useAcceptBooking();
  const decline = useDeclineBooking();
  const [confirming, setConfirming] = useState<{ id: string; action: 'accept' | 'decline' } | null>(null);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [agreeReceipt, setAgreeReceipt] = useState(false);

  const active = (data ?? []).filter((b) => !['completed', 'cancelled'].includes(b.status));
  const past   = (data ?? []).filter((b) =>  ['completed', 'cancelled'].includes(b.status)).slice(0, 3);

  const handleAction = (id: string, action: 'accept' | 'decline') => {
    if (action === 'accept') {
      accept.mutate({ id, welcomeMessage: welcomeMsg, agreeReceipt }, { onSuccess: () => { setConfirming(null); setWelcomeMsg(''); setAgreeReceipt(false); } });
    } else {
      decline.mutate(id, { onSuccess: () => setConfirming(null) });
    }
  };

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Booking requests</p>
        <button type="button" onClick={() => refetch()} className="flex items-center gap-1 text-[10px] text-[#9b858e] hover:text-[#7f2e62]">
          <RefreshCw className="h-3 w-3" />Refresh
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-[18px]" />)}
        </div>
      )}

      {isError && (
        <div className="rounded-[18px] bg-[#fbebe7] p-5 text-sm text-[#86555a]">
          Could not load bookings. <button type="button" onClick={() => refetch()} className="font-bold underline">Try again</button>
        </div>
      )}

      {!isLoading && !isError && active.length === 0 && (
        <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-[#c6aeb8]" />
          <p className="mt-4 font-serif text-xl text-[#48213d]">Your inbox is clear.</p>
          <p className="mt-2 text-xs text-[#806c76]">New booking requests from customers will appear here. Keep your profile current so the right ones find you.</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((b) => {
            const s = INBOX_STATUS[b.status] ?? { canAccept: false, canDecline: false };
            const isActing = (accept.isPending || decline.isPending) && confirming?.id === b.id;
            return (
              <div key={b.id} className={`rounded-[20px] border p-5 transition ${
                s.canAccept ? 'border-[#c7d9cb] bg-[#f4faf5]' : 'border-[#dfd2c9] bg-[#fbf7f1]'
              }`} data-testid={`inbox-booking-${b.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <InboxStatusBadge status={b.status} />
                    <p className="mt-3 font-serif text-2xl leading-none text-[#48213d]">{b.activity}</p>
                    <p className="mt-1.5 text-xs text-[#806c76]">{b.date} · {b.startTime} · {b.durationHours}h</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#9b858e]">You receive</p>
                    <p className="mt-1 font-serif text-3xl text-[#48213d]">{money(b.companionPayoutCents)}</p>
                  </div>
                </div>

                {b.status === 'requested' && (
                  <p className="mt-3 rounded-[10px] bg-[#f3ead7] px-3 py-2 text-[10px] text-[#7a5a12]">
                    Customer hasn't paid yet — you'll be able to confirm once their deposit arrives.
                  </p>
                )}

                {(s.canAccept || s.canDecline) && (
                  <div className="mt-4">
                    {/* Accept expand panel */}
                    {s.canAccept && confirming?.id === b.id && confirming.action === 'accept' ? (
                      <div className="rounded-[14px] border border-[#c7d9cb] bg-[#eef6ef] p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#477254]">
                          Add a welcome message <span className="font-normal text-[#63816a]">(optional)</span>
                        </p>
                        {/* Quick reply chips */}
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {[
                            "Looking forward to it! I'll confirm the spot shortly.",
                            "Great! Let's connect — any dietary or accessibility needs?",
                            "Excited! What time works best for you to arrive?",
                            "Perfect — I know a great spot for this. See you then!",
                          ].map((tpl) => (
                            <button key={tpl} type="button"
                              onClick={() => setWelcomeMsg(tpl)}
                              className="rounded-full border border-[#b9d4be] bg-white px-2.5 py-1 text-[9px] font-semibold text-[#477254] hover:border-[#477254] transition"
                              data-testid="quick-reply-chip">
                              {tpl.length > 40 ? tpl.slice(0, 40) + '…' : tpl}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          value={welcomeMsg}
                          onChange={(e) => setWelcomeMsg(e.target.value)}
                          placeholder="Looking forward to meeting you! I'll confirm the exact spot shortly…"
                          className="w-full resize-none rounded-xl border border-[#b9d4be] bg-white px-3 py-2 text-sm text-[#31533f] outline-none placeholder:text-[#90b597] focus:border-[#477254]"
                          maxLength={280}
                          data-testid={`input-welcome-msg-${b.id}`}
                          autoFocus
                        />
                        <p className="mt-1 text-right font-mono text-[9px] text-[#90b597]">{welcomeMsg.length}/280</p>
                        <label className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-[#31533f]">
                          <input type="checkbox" checked={agreeReceipt} onChange={(e) => setAgreeReceipt(e.target.checked)}
                            className="mt-0.5 accent-[#477254]" data-testid={`checkbox-agree-receipt-${b.id}`} />
                          I agree to the Boundary Receipt — public SafeSpot, platonic contact, no photos without consent, each person keeps their own transportation.
                        </label>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button type="button" disabled={isActing || !agreeReceipt} onClick={() => handleAction(b.id, 'accept')}
                            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#477254] px-4 text-xs font-bold text-white disabled:opacity-60 transition"
                            data-testid={`button-confirm-accept-${b.id}`}>
                            {isActing ? 'Accepting…' : welcomeMsg.trim() ? 'Accept & send welcome' : 'Accept booking'} <Check className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => { setConfirming(null); setWelcomeMsg(''); }}
                            className="text-xs text-[#9b858e] hover:text-[#48213d]">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {s.canAccept && (
                          <button type="button" onClick={() => setConfirming({ id: b.id, action: 'accept' })}
                            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#e8f0e8] px-4 text-xs font-bold text-[#31533f] hover:bg-[#477254] hover:text-white transition"
                            data-testid={`button-accept-${b.id}`}>
                            <Check className="h-3.5 w-3.5" />Accept booking
                          </button>
                        )}
                        {s.canDecline && (
                          confirming?.id === b.id && confirming.action === 'decline' ? (
                            <button type="button" disabled={isActing} onClick={() => handleAction(b.id, 'decline')}
                              className="inline-flex h-9 items-center gap-2 rounded-full bg-[#a64742] px-4 text-xs font-bold text-white disabled:opacity-60"
                              data-testid={`button-confirm-decline-${b.id}`}>
                              {isActing ? 'Declining…' : 'Tap again to decline'} <X className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button type="button" onClick={() => setConfirming({ id: b.id, action: 'decline' })}
                              className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#725e69] hover:border-[#a64742] hover:text-[#a64742] transition"
                              data-testid={`button-decline-${b.id}`}>
                              <X className="h-3.5 w-3.5" />Decline
                            </button>
                          )
                        )}
                        {confirming?.id === b.id && confirming.action === 'decline' && (
                          <button type="button" onClick={() => setConfirming(null)}
                            className="text-xs text-[#9b858e] hover:text-[#48213d]">
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {CHAT_ENABLED_STATUSES.has(b.status) && (
                  <Link href={`/companion/booking/${b.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold text-[#7f2e62] hover:underline"
                    data-testid={`link-chat-${b.id}`}>
                    <MessageSquare className="h-3 w-3" />Open thread
                  </Link>
                )}
                <p className="mt-3 font-mono text-[9px] text-[#b0929f]">BOOKING {b.id.toUpperCase()}</p>
              </div>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[#b0929f]">Recent</p>
          <div className="space-y-2">
            {past.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-[14px] border border-[#ece1d9] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#48213d]">{b.activity}</p>
                  <p className="text-[10px] text-[#9b858e]">{b.date}</p>
                </div>
                <InboxStatusBadge status={b.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust Circle — safety net contacts
// ---------------------------------------------------------------------------

type TrustContact = { id: string; name: string; phone: string; email?: string; relation: string };

function useTrustCircle() {
  const { user } = useAuth();
  const query = useQuery<TrustContact[]>({
    queryKey: ['trust-circle'],
    queryFn: async () => {
      const res = await fetch('/api/trust-circle', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(user),
    retry: false,
  });
  const qc = useQueryClient();
  const add = useCallback(async (c: Omit<TrustContact, 'id'>) => {
    const res = await fetch('/api/trust-circle', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'Could not add contact');
    }
    await qc.invalidateQueries({ queryKey: ['trust-circle'] });
  }, [qc]);
  const remove = useCallback(async (id: string) => {
    await fetch(`/api/trust-circle/${id}`, { method: 'DELETE', credentials: 'include' });
    await qc.invalidateQueries({ queryKey: ['trust-circle'] });
  }, [qc]);
  return { contacts: query.data ?? [], add, remove, loading: query.isLoading };
}

/** Inline panel shown on the booking confirmation screen. */
function TrustCircleBookingPanel() {
  const { contacts } = useTrustCircle();
  const hasContacts = contacts.length > 0;
  return (
    <div className={`rounded-[16px] p-4 ${hasContacts ? 'bg-[#e8f0e8]' : 'bg-[#f3ead7]'}`}>
      <div className="flex items-center justify-between">
        <p className={`flex items-center gap-2 text-xs font-bold ${hasContacts ? 'text-[#31533f]' : 'text-[#7a5a12]'}`}>
          <Users className="h-3.5 w-3.5" />Trust Circle
          <span className="font-normal">{hasContacts ? '· active on this booking' : '· no contacts yet'}</span>
        </p>
        <Link href="/trust-circle"
          className={`text-[10px] font-bold underline ${hasContacts ? 'text-[#477254]' : 'text-[#7f2e62]'}`}
          data-testid="link-manage-trust-circle">
          {hasContacts ? 'Manage' : 'Add contacts'}
        </Link>
      </div>
      {hasContacts ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {contacts.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-[11px] font-semibold text-[#31533f]">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#c5d8c8] font-mono text-[8px] font-bold">{c.name[0]}</span>
              {c.name.split(' ')[0]}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-[#7a5a12]">
          Your Trust Circle can be emailed at check-in or if you miss one — if they have an email. SMS is not configured.
        </p>
      )}
    </div>
  );
}

function TrustCircleSetup() {
  const { contacts, add, remove } = useTrustCircle();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('Friend');
  const [addedName, setAddedName] = useState<string | null>(null);
  const [trustError, setTrustError] = useState('');

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (!phone.trim() && !email.trim()) || contacts.length >= 3) return;
    setTrustError('');
    try {
      await add({ name: name.trim(), phone: phone.trim(), email: email.trim(), relation });
      setAddedName(name.trim());
      setName(''); setPhone(''); setEmail(''); setRelation('Friend');
      setTimeout(() => setAddedName(null), 3500);
    } catch (err) {
      setTrustError(err instanceof Error ? err.message : 'Could not add contact');
    }
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/dashboard/customer" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-trust-back">
          <ArrowLeft className="h-4 w-4" />Back to workspace
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-[16px] bg-[#ead0dd] text-[#7f2e62]">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Safety network</p>
            <h1 className="font-serif text-4xl leading-none text-[#48213d]">Trust Circle</h1>
          </div>
        </div>
        <p className="mt-5 max-w-lg text-sm leading-7 text-[#725e69]">
          Add up to 3 people who care about you. They can be emailed when you check in, miss a check-in, or share an emergency map — if they have an email. SMS is not configured. They never receive a live companion pin or a home address.
        </p>

        {/* Contact list */}
        {contacts.length > 0 && (
          <div className="mt-8 space-y-3">
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Your contacts ({contacts.length}/3)</p>
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-4 rounded-[20px] border border-[#dfd2c9] bg-white p-5">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-xl text-[#7f2e62]">
                  {c.name[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#48213d]">{c.name}</p>
                  <p className="text-xs text-[#806c76]">{c.relation} · {c.email || c.phone || 'No contact method'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden items-center gap-1 text-[10px] font-bold text-[#477254] sm:flex">
                    <Check className="h-3 w-3" />Active
                  </span>
                  <button type="button" onClick={() => remove(c.id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-[#9b858e] transition hover:bg-[#f0e4db] hover:text-[#7f2e62]"
                    data-testid={`button-remove-contact-${c.id}`} aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {contacts.length === 0 && (
          <div className="mt-8 rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#f0e4db] text-[#9b6b88]">
              <Users className="h-7 w-7" />
            </div>
            <p className="mt-5 font-serif text-2xl text-[#48213d]">No one is watching yet.</p>
            <p className="mt-2 text-sm text-[#725e69]">Add at least one contact before your first booking to activate the safety net.</p>
          </div>
        )}

        {/* Add form */}
        {contacts.length < 3 && (
          <form onSubmit={handleAdd} className="mt-6 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Add a contact</p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Chen"
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-white px-4 text-sm outline-none focus:border-[#7f2e62]"
                  data-testid="input-trust-name" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Phone number</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (504) 555-0123"
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-white px-4 text-sm outline-none focus:border-[#7f2e62]"
                  data-testid="input-trust-phone" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Email (needed for alerts until SMS is live)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-white px-4 text-sm outline-none focus:border-[#7f2e62]"
                  data-testid="input-trust-email" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Relationship</span>
                <select value={relation} onChange={(e) => setRelation(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-white px-4 text-sm text-[#654c5f] outline-none focus:border-[#7f2e62]"
                  data-testid="select-trust-relation">
                  {['Friend', 'Family', 'Partner', 'Colleague', 'Other'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <Button type="submit" variant="primary" className="w-full" testId="button-add-trust-contact">
                <UserPlus className="h-4 w-4" />Add to Trust Circle
              </Button>
              {addedName && (
                <p className="flex items-center gap-2 text-xs font-bold text-[#477254]">
                  <Check className="h-3.5 w-3.5" />{addedName} added to your Trust Circle
                </p>
              )}
              {trustError && <p className="text-xs text-[#a64742]">{trustError}</p>}
            </div>
          </form>
        )}

        {contacts.length >= 3 && (
          <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-[#e8f0e8] px-4 py-3 text-xs font-semibold text-[#31533f]">
            <Check className="h-4 w-4" />Trust Circle is full — three contacts is the maximum.
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 grid gap-5 rounded-[20px] bg-[#f0e4db] p-6 sm:grid-cols-3">
          {([
            { icon: Bell, label: 'Favor check-in', desc: 'If they have an email, they can be told you arrived at the public venue — no companion name or live pin' },
            { icon: Clock3, label: 'Missed check-in', desc: 'Favor Mode sends one alert after 12 minutes without arrival. SMS is not configured yet' },
            { icon: AlertTriangle, label: 'Emergency map', desc: 'Call 911 first. Then a temporary venue map can be emailed. It expires after the booking' },
          ] as { icon: typeof Bell; label: string; desc: string }[]).map(({ icon: Icon, label, desc }) => (
            <div key={label}>
              <Icon className="h-4 w-4 text-[#9b6b88]" />
              <p className="mt-3 text-xs font-bold text-[#48213d]">{label}</p>
              <p className="mt-1 text-[10px] leading-5 text-[#725e69]">{desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[10px] leading-5 text-[#a38c95]">
          Contacts only know you are at a verified public venue. No names, routes, or companion details are shared. Contacts can opt out of notifications at any time.
        </p>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Boundary Receipt — mutual consent before payment
// ---------------------------------------------------------------------------

const DEFAULT_BOUNDARIES = [
  'All time together is strictly platonic — no physical contact beyond a polite greeting',
  'Meetings happen only at the agreed SafeSpot — never a private address',
  'Either party may end the favor at any time without explanation or penalty',
  'No recording, photographing, or identifying the companion without explicit consent',
  'Both parties treat each other with full dignity and respect throughout',
];

function BoundaryReceipt({
  companion, booking, safeSpotName, onAgree,
}: {
  companion: Companion;
  booking: Booking;
  safeSpotName: string;
  onAgree: (timestamp: string) => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [clauses, setClauses] = useState<string[]>(
    companion.boundaries?.length ? companion.boundaries : DEFAULT_BOUNDARIES,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [endTime, setEndTime] = useState('');
  const firstName = companion.displayName.split(' ')[0];

  useEffect(() => {
    fetch(`/api/bookings/${booking.id}/boundary-receipt`, { credentials: 'include' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({})) as { clauses?: string[]; endTime?: string; customerAgreedAt?: string | null; error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Could not load the Boundary Receipt');
        if (body.clauses?.length) setClauses(body.clauses);
        if (body.endTime) setEndTime(body.endTime);
        if (body.customerAgreedAt) onAgree(new Date(body.customerAgreedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the Boundary Receipt'));
  }, [booking.id]);

  const sign = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/bookings/${booking.id}/boundary-receipt`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreed: true }),
      });
      const body = await res.json().catch(() => ({})) as { customerAgreedAt?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not sign');
      onAgree(body.customerAgreedAt
        ? new Date(body.customerAgreedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign the Boundary Receipt');
      setBusy(false);
    }
  };
  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        {/* Title */}
        <div className="flex items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#ead0dd] text-[#7f2e62]">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Required before payment</p>
            <h1 className="font-serif text-3xl leading-none text-[#48213d]">Boundary Receipt</h1>
          </div>
        </div>
        <p className="mt-5 text-sm leading-7 text-[#725e69]">
          This receipt is stored on the booking. Your companion must sign the same clauses to accept. Changing time, venue, or activity means a new request — both people would sign again.
        </p>

        {/* Booking summary */}
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-[20px] border border-[#dfd2c9] bg-white p-6">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#b0929f]">Companion</p>
            <p className="mt-1.5 font-semibold text-[#48213d]">{companion.displayName}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#b0929f]">Activity</p>
            <p className="mt-1.5 font-semibold text-[#48213d]">{booking.activity}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#b0929f]">Date &amp; time</p>
            <p className="mt-1.5 font-semibold text-[#48213d]">{booking.date} · {booking.startTime}{endTime ? `–${endTime}` : ''} CT</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#b0929f]">SafeSpot</p>
            <p className="mt-1.5 font-semibold text-[#48213d]">{safeSpotName}</p>
          </div>
        </div>

        {/* Mutual boundaries */}
        <div className="mt-5 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Mutual agreements</p>
          <ul className="mt-5 space-y-4">
            {clauses.map((b, i) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-5 text-[#654c5f]">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-mono text-[9px] font-bold text-[#7f2e62]">
                  {i + 1}
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Platform protections */}
        <div className="mt-5 rounded-[20px] bg-[#e8f0e8] p-6">
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#477254]">Platform protections active on this booking</p>
          <div className="mt-4 space-y-2.5">
            {[
              'Companion location stays approximate — never a home or work pin',
              'Payment is captured at checkout, not at this signature',
              'Trust Circle is emailed venue check-ins if they have an email — never a companion name or live pin',
              'Chat is masked, not end-to-end encrypted. Reported threads can be reviewed by the safety team',
            ].map((p) => (
              <p key={p} className="flex items-start gap-2 text-xs leading-5 text-[#31533f]">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" />{p}
              </p>
            ))}
          </div>
        </div>

        {/* Agreement checkbox + CTA */}
        <div className="mt-8 rounded-[20px] border border-[#dfd2c9] bg-white p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-[#7f2e62]" data-testid="checkbox-boundary-agree" />
            <span className="text-sm leading-6 text-[#654c5f]">
              I have read and agree to every point above. I understand that OnlyFavors connections are strictly platonic,
              and I commit to treating {firstName} with full respect for our entire time together.
            </span>
          </label>
          <button type="button" disabled={!agreed || busy}
            onClick={() => void sign()}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e] disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-boundary-continue">
            {busy ? 'Saving receipt…' : 'Sign receipt and continue'} <ArrowRight className="h-4 w-4" />
          </button>
          {error && <p className="mt-3 text-xs text-[#a64742]">{error}</p>}
        </div>

        <p className="mt-5 text-center font-mono text-[10px] text-[#a38c95]">
          RECEIPT FOR BOOKING {booking.id.toUpperCase()} · PENDING SIGNATURE
        </p>
      </main>
    </Shell>
  );
}

function Book() {
  const search = new URLSearchParams(window.location.search); const companionId = search.get('companion') || '';
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?intent=customer&next=${encodeURIComponent(`/book${window.location.search}`)}`);
    }
  }, [authLoading, user, navigate]);
  const companionQuery = useGetCompanion(companionId, { query: { queryKey: getGetCompanionQueryKey(companionId), enabled: Boolean(companionId) } });
  const companion = companionQuery.data;
  const spotsQuery = useListSafeSpots(companion?.city ? { city: companion.city } : undefined, { query: { queryKey: getListSafeSpotsQueryKey(companion?.city ? { city: companion.city } : undefined), enabled: Boolean(companion?.city), retry: false } });
  const [activity, setActivity] = useState(search.get('activity') ?? '');
  const [date, setDate] = useState(search.get('date') ?? '');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(search.get('duration') ?? '2');
  const [spot, setSpot] = useState(''); const [created, setCreated] = useState<Booking | null>(null);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutLabel, setCheckoutLabel] = useState('');
  const [checkoutAmount, setCheckoutAmount] = useState(0);
  const [receiptAgreed, setReceiptAgreed] = useState(false);
  const [receiptTimestamp, setReceiptTimestamp] = useState<string | null>(null);
  const mutation = useCreateBookingIntent();
  const depositMutation = useAuthorizeDeposit();
  const authorizeMutation = useAuthorizeFullPayment();
  const quoteParams = { companionId, durationHours: Number(duration) };
  const quoteQuery = useGetBookingQuote(quoteParams, { query: { enabled: Boolean(companionId && duration), queryKey: getGetBookingQuoteQueryKey(quoteParams) } });
  const quote = quoteQuery.data;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!companionId || !activity || !date || !time || !spot) return; const input: BookingInput = { companionId, activity, date, startTime: time, durationHours: Number(duration), safeSpotId: spot }; mutation.mutate({ data: input }, { onSuccess: (booking) => setCreated(booking) }); };
  const openDeposit = () => {
    if (!created) return;
    depositMutation.mutate({ id: created.id }, {
      onSuccess: (r: any) => {
        if (!r.clientSecret) return;
        setCheckoutLabel('$10 refundable deposit');
        setCheckoutAmount(1000);
        setCheckoutSecret(r.clientSecret);
      },
    });
  };
  const openFullPayment = () => {
    if (!created) return;
    authorizeMutation.mutate({ id: created.id }, {
      onSuccess: (r: any) => {
        if (!r.clientSecret) return;
        setCheckoutLabel('Full payment');
        setCheckoutAmount(created.totalCents);
        setCheckoutSecret(r.clientSecret);
      },
    });
  };
  if (authLoading || !user) return <Shell><main className="mx-auto max-w-5xl px-5 py-16"><LoadingState label="Opening booking details" /></main></Shell>;
  if (companionQuery.isLoading) return <Shell><main className="mx-auto max-w-5xl px-5 py-16"><LoadingState label="Opening booking details" /></main></Shell>;
  if (!companionId || companionQuery.isError || !companion) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><EmptyState icon={CalendarDays} title="Start with a companion." body="Choose an approved companion first, then come back here to plan your time together." action={<Link href="/explore" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-[#fff5eb]" data-testid="link-book-explore">Explore companions <ArrowRight className="h-4 w-4" /></Link>} /></main></Shell>;
  const bookingStep = !created ? 1 : !receiptAgreed ? 2 : 3;
  const selectedSpotName = (spotsQuery.data as SafeSpot[] | undefined)?.find((s) => s.id === spot)?.name ?? 'SafeSpot venue';
  if (created && !receiptAgreed) return (
    <BoundaryReceipt
      companion={companion}
      booking={created}
      safeSpotName={selectedSpotName}
      onAgree={(ts) => { setReceiptAgreed(true); setReceiptTimestamp(ts); }}
    />
  );
  if (created) return (
    <Shell>
      {checkoutSecret && (
        <CheckoutModal
          clientSecret={checkoutSecret}
          amountCents={checkoutAmount}
          label={checkoutLabel}
          onClose={() => setCheckoutSecret(null)}
          onSuccess={() => {
            setCheckoutSecret(null);
            // Navigate to the persistent booking page — it polls for real status
            navigate(`/booking/${created.id}`);
          }}
        />
      )}
      <main className="page-enter mx-auto max-w-2xl px-5 py-20">
        <div className="rounded-[26px] border border-[#c7d9cb] bg-[#e8f0e8] p-8 md:p-12">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#477254] text-white"><Check /></div>
          <p className="mt-8 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#477254]">Request received</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#31533f]">Your time with {companion.displayName.split(' ')[0]} is in motion.</h1>
          <p className="mt-5 text-sm leading-7 text-[#53725d]">These figures were calculated by our server. Nothing was estimated in your browser.</p>
          {/* Price breakdown */}
          <div className="mt-8 space-y-2 border-t border-[#c7d9cb] pt-5">
            <div className="flex items-center justify-between text-sm text-[#53725d]"><span>Activity total</span><span>{money(created.subtotalCents)}</span></div>
            <div className="flex items-center justify-between text-sm text-[#53725d]"><span>Safety &amp; service fee (5%)</span><span>+{money(created.customerFeeCents)}</span></div>
            <div className="my-2 border-t border-[#c7d9cb]" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#688370]">You pay</span>
              <span className="font-serif text-3xl text-[#31533f]">{money(created.totalCents)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#688370]"><span>Companion receives</span><span>{money(created.companionPayoutCents)}</span></div>
          </div>
          {/* Trust Circle */}
          <div className="mt-6">
            <TrustCircleBookingPanel />
          </div>

          {/* Payment actions */}
          <div className="mt-4 space-y-3">
            <p className="text-xs font-bold text-[#53725d]">How would you like to proceed?</p>
            <button onClick={openDeposit} disabled={depositMutation.isPending}
              className="flex w-full items-center justify-between rounded-[16px] border border-[#c7d9cb] bg-white p-4 text-left hover:border-[#7f2e62] disabled:opacity-50"
              data-testid="button-pay-deposit">
              <div>
                <p className="text-sm font-bold text-[#31533f]">Pay $10 deposit · Unlock chat</p>
                <p className="mt-0.5 text-xs text-[#688370]">Chat with {companion.displayName.split(' ')[0]} first. Credited toward your total.</p>
              </div>
              <MessageSquare className="h-5 w-5 shrink-0 text-[#7f2e62]" />
            </button>
            <button onClick={openFullPayment} disabled={authorizeMutation.isPending}
              className="flex w-full items-center justify-between rounded-[16px] bg-[#31533f] p-4 text-left hover:bg-[#254030] disabled:opacity-50"
              data-testid="button-pay-full">
              <div>
                <p className="text-sm font-bold text-white">Authorize {money(created.totalCents)}</p>
                <p className="mt-0.5 text-xs text-white/60">Stripe holds the rest. The booking is confirmed only after the webhook and companion accept (or Instant Book).</p>
              </div>
              <WalletCards className="h-5 w-5 shrink-0 text-white/60" />
            </button>
            {(depositMutation.isError || authorizeMutation.isError) && (
              <p className="text-xs text-[#a64742]">Could not start payment. Please try again.</p>
            )}
          </div>
          <div className="mt-5 space-y-1">
            <p className="font-mono text-[10px] text-[#688370]">REQUEST {created.id} · {created.status.toUpperCase()}</p>
            {receiptTimestamp && (
              <p className="flex items-center gap-1.5 font-mono text-[10px] text-[#477254]">
                <Check className="h-3 w-3" />Boundary Receipt signed at {receiptTimestamp}
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/booking/${created.id}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#31533f] px-5 text-sm font-bold text-white" data-testid="link-book-status">View booking status <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/safety" className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-[#477254]" data-testid="link-book-safety"><ShieldCheck className="h-4 w-4" />Review safety plan</Link>
          </div>
        </div>
      </main>
    </Shell>
  );
  const spots = spotsQuery.data ?? [];
  const BOOK_STEPS = [
    { n: 1, label: 'Plan your time' },
    { n: 2, label: 'Agree to boundaries' },
    { n: 3, label: 'Send request' },
  ];
  return <Shell><main className="page-enter mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-16"><Link href={`/companions/${companion.id}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="link-back-profile"><ArrowLeft className="h-4 w-4" />Back to profile</Link>
    <div className="mt-6 flex items-center gap-0" aria-label="Booking progress" data-testid="booking-stepper">
      {BOOK_STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center gap-0">
          <div className="flex items-center gap-2">
            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold transition-colors ${bookingStep >= s.n ? 'bg-[#7f2e62] text-white' : 'bg-[#ece1d9] text-[#9b858e]'}`}>
              {bookingStep > s.n ? <Check className="h-3.5 w-3.5" /> : s.n}
            </div>
            <span className={`hidden text-xs font-semibold sm:block ${bookingStep === s.n ? 'text-[#48213d]' : bookingStep > s.n ? 'text-[#9d557e]' : 'text-[#c6aeb8]'}`}>{s.label}</span>
          </div>
          {i < BOOK_STEPS.length - 1 && <div className={`mx-3 h-px w-8 sm:w-16 transition-colors ${bookingStep > s.n ? 'bg-[#7f2e62]' : 'bg-[#ece1d9]'}`} />}
        </div>
      ))}
    </div>
    <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">A thoughtful plan</p><h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Book time with<br /><em>{companion.displayName}.</em></h1><p className="mt-4 max-w-lg text-sm leading-6 text-[#725e69]">Tell us the shape of your time together. Times are in New Orleans (Central Time). Minimum 1 hour, in 30-minute steps.</p><form onSubmit={submit} className="mt-10 space-y-5" data-testid="form-booking"><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">What would you like to do?</span><select required value={activity} onChange={(e) => setActivity(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-booking-activity"><option value="">Choose an activity</option>{companion.activities.map((x) => <option key={x} value={x}>{x}</option>)}</select></label><div className="grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-booking-date" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Start time</span><input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-booking-time" /></label></div><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">How long?</span><select required value={duration} onChange={(e) => setDuration(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-booking-duration">{[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map((h) => <option key={h} value={String(h)}>{h === 7 ? 'Full day (7 hours)' : h === 1 ? '1 hour' : `${h} hours`}</option>)}</select></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Meet Here — public SafeSpot in {companion.city}</span>{spotsQuery.isLoading ? <div className="skeleton h-12 rounded-xl" /> : spotsQuery.isError ? <p className="rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">SafeSpots are unavailable. Try again in a moment.</p> : spots.length === 0 ? <p className="rounded-xl border border-dashed border-[#cbbab5] p-3 text-xs text-[#806c76]">No public SafeSpots are listed for this area yet.</p> : <select required value={spot} onChange={(e) => setSpot(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-safe-spot"><option value="">Choose a public place</option>{spots.map((s: SafeSpot) => <option key={s.id} value={s.id}>{s.name} · {s.addressHint}{s.openLate ? ' · Open late' : ''}</option>)}</select>}<p className="mt-2 text-[11px] leading-5 text-[#806c76]">Your companion agrees to this venue by accepting. Home and work addresses are never used.</p></label><div className="flex items-start gap-2 rounded-xl bg-[#f0e4db] p-4 text-xs leading-5 text-[#725e69]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />Your booking is only a request until your companion accepts. Exact details stay private.</div><Button type="submit" disabled={mutation.isPending || spots.length === 0} className="w-full sm:w-auto" testId="button-submit-booking">{mutation.isPending ? 'Pricing your request…' : 'Review server-priced request'} <ArrowRight className="h-4 w-4" /></Button>{mutation.isError && <p className="text-sm text-[#a64742]" data-testid="status-booking-error">We could not create this request. Please check the details and try again.</p>}</form></div><aside className="h-fit rounded-[24px] bg-[#3d2038] p-7 text-[#f9efe5] lg:sticky lg:top-28"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">Your companion</p><div className="mt-5 flex items-center gap-3"><Avatar companion={companion} /><div><p className="font-serif text-2xl">{companion.displayName}</p><p className="text-xs text-[#d3b6c4]">{companion.serviceArea}, {companion.city}</p></div></div><div className="mt-7 rounded-[16px] border border-[#65445d] bg-[#4a2842] p-5">{quoteQuery.isLoading ? <><div className="skeleton h-3 w-24 rounded-full opacity-30" /><div className="skeleton mt-3 h-8 w-32 rounded-full opacity-30" /><div className="skeleton mt-2 h-3 w-full rounded-full opacity-20" /></> : quote ? <><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#c695ae]">Price estimate</p><div className="mt-4 space-y-2 text-xs text-[#d8c1cc]"><div className="flex items-center justify-between"><span>{Number(duration) === 7 && (companion as { dayRate?: number | null }).dayRate ? `Full day rate` : `${duration} hr × ${money(companion.hourlyRate * 100)}/hr`}</span><span>{money(quote.subtotalCents)}</span></div><div className="flex items-center justify-between text-[#b39dad]"><span>Safety &amp; service fee (5%)</span><span>+{money(quote.customerFeeCents)}</span></div></div><div className="my-3 border-t border-[#65445d]" /><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">You pay</span><span className="font-serif text-3xl text-[#f9efe5]" data-testid="value-quote-total">{money(quote.totalCents)}</span></div><p className="mt-1 text-right text-[10px] text-[#b39dad]">Companion receives {money(quote.companionPayoutCents)}</p><div className="mt-4 rounded-[10px] border border-[#8a4070] bg-[#5a2550] p-3"><div className="flex items-start gap-2"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#df9cbd]" /><p className="text-[10px] leading-4 text-[#dbc3cf]">Or pay a <strong className="text-[#f0c8dc]">$10 deposit</strong> to unlock chat first — credited toward your booking total.</p></div></div></> : <p className="text-xs text-[#b39dad]">Select a duration to see your price.</p>}</div><div className="mt-5 border-t border-[#65445d] pt-5"><p className="flex items-center gap-2 text-xs leading-5 text-[#d8c1cc]"><LockKeyhole className="h-4 w-4 text-[#df9cbd]" />All prices are calculated server-side. Your browser never sets amounts.</p></div></aside></div></main></Shell>;
}

// ---------------------------------------------------------------------------
// Booking detail hook + status page
// ---------------------------------------------------------------------------

type BookingDetail = {
  id: string; status: string; companionId: string; activity: string; date: string;
  startTime: string; durationHours: number; safeSpotId: string | null;
  subtotalCents: number; customerFeeCents: number; totalCents: number;
  companionPayoutCents: number; depositCents: number;
  depositPaidAt: string | null; confirmedAt: string | null; authorizedAt: string | null;
  createdAt: string;
  reviewed?: boolean;
  companionName?: string;
  boundaryReceipt?: {
    clauses: string[];
    venueName: string;
    endTime: string;
    customerAgreedAt: string | null;
    companionAgreedAt: string | null;
  } | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: 'green' | 'amber' | 'plum' | 'gray' }> = {
  requested:    { label: 'Pending',           tone: 'amber' },
  authorized:   { label: 'Authorised',        tone: 'amber' },
  deposit_paid: { label: 'Deposit paid',      tone: 'plum' },
  confirmed:    { label: 'Confirmed',         tone: 'green' },
  completed:    { label: 'Completed',         tone: 'green' },
  cancelled:    { label: 'Cancelled',         tone: 'gray'  },
};

function useBooking(id: string) {
  return useQuery<BookingDetail>({
    queryKey: ['booking', id],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Booking not found');
      return res.json() as Promise<BookingDetail>;
    },
    enabled: Boolean(id),
    retry: 1,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'confirmed' || s === 'completed' || s === 'cancelled' ? false : 4000;
    },
  });
}

// ---------------------------------------------------------------------------
// In-booking chat
// ---------------------------------------------------------------------------

type ChatMessage = { id: string; bookingId: string; senderId: string; senderRole: string; body: string; createdAt: string };

function useMessages(bookingId: string, enabled: boolean) {
  return useQuery<ChatMessage[]>({
    queryKey: ['messages', bookingId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/messages`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled,
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
}

function useSendMessage(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<ChatMessage, Error, string>({
    mutationFn: async (body) => {
      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to send');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', bookingId] }),
  });
}

const CHAT_ENABLED_STATUSES = new Set(['deposit_paid', 'authorized', 'confirmed', 'completed']);

function BookingChat({ bookingId, status, viewerRole = 'customer' }: { bookingId: string; status: string; viewerRole?: 'customer' | 'companion' }) {
  const enabled = CHAT_ENABLED_STATUSES.has(status);
  const msgs = useMessages(bookingId, enabled);
  const sendMessage = useSendMessage(bookingId);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.data?.length]);

  const handleSend = () => {
    const body = input.trim();
    if (!body || sendMessage.isPending) return;
    sendMessage.mutate(body, { onSuccess: () => setInput('') });
  };

  if (!enabled) {
    return (
      <div className="mt-6 rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-5 text-center">
        <Lock className="mx-auto h-5 w-5 text-[#c6aeb8]" />
        <p className="mt-2 text-sm font-semibold text-[#48213d]">Chat unlocks after deposit</p>
        <p className="mt-1 text-xs text-[#806c76]">Pay the $10 deposit to open a private thread. Messages are masked, not end-to-end encrypted. If someone reports this booking, the safety team can read the thread.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[20px] border border-[#dfd2c9] bg-white shadow-sm">
      {/* Banner */}
      <div className="flex items-center gap-2 border-b border-[#ece1d9] bg-[#fbf7f1] px-4 py-2.5">
        <Lock className="h-3 w-3 shrink-0 text-[#9d557e]" />
        <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Private · Phone numbers and emails are blocked · Not end-to-end encrypted</p>
      </div>

      {/* Thread */}
      <div className="max-h-72 space-y-3 overflow-y-auto p-4">
        {msgs.isLoading && <p className="py-4 text-center text-xs text-[#9b858e]">Loading…</p>}
        {!msgs.isLoading && (msgs.data ?? []).length === 0 && (
          <p className="py-6 text-center text-xs text-[#9b858e]">
            No messages yet. Start the conversation — your companion will reply here.
          </p>
        )}
        {(msgs.data ?? []).map((msg) => {
          const isMe = msg.senderRole === viewerRole;
          const otherLabel = viewerRole === 'customer' ? 'Companion' : 'Customer';
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[76%] rounded-[14px] px-3.5 py-2.5 ${isMe ? 'bg-[#7f2e62] text-white' : 'bg-[#e8f0e8] text-[#31533f]'}`}>
                <p className="text-sm leading-5">{msg.body}</p>
                <p className={`mt-0.5 text-[9px] ${isMe ? 'text-[#e2b3c9]' : 'text-[#63816a]'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{isMe ? 'You' : otherLabel}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[#ece1d9] p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Send a message…"
          maxLength={500}
          disabled={status === 'completed' || status === 'cancelled'}
          className="flex-1 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-2 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none disabled:opacity-50"
          data-testid="input-chat-message"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sendMessage.isPending || status === 'completed' || status === 'cancelled'}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#7f2e62] text-white transition hover:bg-[#9d3a78] disabled:opacity-40"
          data-testid="button-send-message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {sendMessage.isError && (
        <p className="border-t border-[#ece1d9] px-4 pb-3 text-[10px] text-[#a64742]">Failed to send. Try again.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer booking list
// ---------------------------------------------------------------------------

function useCustomerBookings(enabled = true) {
  return useQuery<BookingDetail[]>({
    queryKey: ['customer-bookings'],
    queryFn: async () => {
      const res = await fetch('/api/bookings', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
    refetchInterval: 30_000,
    enabled,
  });
}

function CustomerBookingList() {
  const { data, isLoading, refetch } = useCustomerBookings();
  const active = (data ?? []).filter((b) => !['completed', 'cancelled'].includes(b.status));
  const past   = (data ?? []).filter((b) =>  ['completed', 'cancelled'].includes(b.status)).slice(0, 3);

  const STATUS_PILL: Record<string, string> = {
    requested: 'bg-[#f3ead7] text-[#7a5a12]',
    deposit_paid: 'bg-[#ead0dd] text-[#7f2e62]',
    authorized: 'bg-[#e8f0e8] text-[#31533f]',
    confirmed: 'bg-[#dce8f5] text-[#2a5280]',
    completed: 'bg-[#ece1d9] text-[#725e69]',
    cancelled: 'bg-[#ece1d9] text-[#9b858e]',
  };

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Your bookings</p>
        <button type="button" onClick={() => refetch()} className="flex items-center gap-1 text-[10px] text-[#9b858e] hover:text-[#7f2e62]">
          <RefreshCw className="h-3 w-3" />Refresh
        </button>
      </div>

      {isLoading && <div className="space-y-3">{[0,1].map(i => <div key={i} className="skeleton h-16 rounded-[16px]" />)}</div>}

      {!isLoading && active.length === 0 && past.length === 0 && (
        <div className="space-y-3" data-testid="onboarding-guide">
          <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-8 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-[#c6aeb8]" />
            <p className="mt-3 font-serif text-xl text-[#48213d]">No bookings yet.</p>
            <p className="mt-1 text-xs text-[#806c76]">When you book a companion, your requests and confirmed plans appear here.</p>
            <Link href="/explore" className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white" data-testid="link-customer-explore">
              Browse companions <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {/* Step-by-step guide for first-timers */}
          <div className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Getting started</p>
            <div className="mt-4 space-y-4">
              {[
                { step: '1', text: 'Browse approved companions by city or activity', href: '/explore', cta: 'Explore', done: false },
                { step: '2', text: 'Review their profile, activities, and clear boundaries', href: '/explore', cta: 'View profiles', done: false },
                { step: '3', text: 'Request a time — no charge until your companion accepts', href: '/explore', cta: 'Book now', done: false },
                { step: '4', text: 'Set up a Safety Plan with your Trust Circle contacts', href: '/safety', cta: 'Safety plan', done: false },
              ].map(({ step, text, href, cta }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-mono text-[9px] font-bold text-[#7f2e62]">{step}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#654c5f]">{text}</p>
                  </div>
                  <Link href={href} className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-wider text-[#7f2e62] hover:underline">{cta} →</Link>
                </div>
              ))}
            </div>
            <Link href="/how-it-works" className="mt-5 inline-flex items-center gap-1 text-[10px] font-bold text-[#9d557e] hover:underline" data-testid="link-how-it-works-onboarding">
              How OnlyFavors works <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((b) => (
            <Link key={b.id} href={`/booking/${b.id}`}
              className="flex items-center gap-4 rounded-[16px] border border-[#dfd2c9] bg-white px-4 py-3 transition hover:border-[#9d557e] hover:shadow-sm"
              data-testid={`booking-row-${b.id}`}>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-[#48213d]">{b.activity}</p>
                <p className="text-[10px] text-[#9b858e]">{b.date} · {b.startTime} · {b.durationHours}h</p>
              </div>
              <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.12em]', STATUS_PILL[b.status] ?? 'bg-[#ece1d9] text-[#725e69]')}>
                {b.status.replace('_', ' ')}
              </span>
              {b.status === 'confirmed' && (() => {
                const bookingDate = new Date(b.date);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const diffDays = Math.round((bookingDate.getTime() - today.getTime()) / 86400000);
                if (diffDays === 0) return (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#e8f5ef] px-2 py-0.5 text-[9px] font-bold text-[#267a5a]">
                    <Zap className="h-2.5 w-2.5" />Today
                  </span>
                );
                if (diffDays === 1) return (
                  <span className="shrink-0 rounded-full bg-[#f3ead7] px-2 py-0.5 text-[9px] font-bold text-[#7a5a12]">Tomorrow</span>
                );
                return null;
              })()}
              <span className="shrink-0 font-mono text-sm text-[#48213d]">{money(b.totalCents)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#b0929f]" />
            </Link>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-wider text-[#b0929f]">Recent</p>
          <div className="space-y-1.5">
            {past.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-[12px] border border-[#ece1d9] px-4 py-2.5 transition hover:border-[#dfd2c9]">
                <Link href={`/booking/${b.id}`} className="flex flex-1 min-w-0 items-center gap-3">
                  <p className="flex-1 truncate text-xs font-medium text-[#725e69]">{b.activity}</p>
                  <p className="text-[10px] text-[#9b858e]">{b.date}</p>
                  <span className={cn('rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.1em]', STATUS_PILL[b.status] ?? 'bg-[#ece1d9] text-[#725e69]')}>
                    {b.status}
                  </span>
                </Link>
                {b.status === 'completed' && (
                  <Link href={`/book?companion=${b.companionId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 inline-flex h-7 items-center gap-1 rounded-full bg-[#ead0dd] px-2.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#7f2e62] hover:bg-[#7f2e62] hover:text-white transition"
                    data-testid={`button-book-again-${b.id}`}>
                    <RefreshCw className="h-2.5 w-2.5" />Book again
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { label, tone } = STATUS_LABEL[status] ?? { label: status, tone: 'gray' };
  const cls = { green: 'bg-[#e8f0e8] text-[#31533f]', amber: 'bg-[#f3ead7] text-[#7a5a12]', plum: 'bg-[#ead0dd] text-[#7f2e62]', gray: 'bg-[#f0e4db] text-[#725e69]' }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[.18em] ${cls}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

type Review = { id: string; bookingId: string; companionId: string; rating: number; comment: string; createdAt: string };

function useCompanionReviews(companionId: string) {
  return useQuery<Review[]>({
    queryKey: ['companion-reviews', companionId],
    queryFn: async () => {
      const res = await fetch(`/api/companions/${companionId}/reviews`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(companionId),
    retry: false,
    staleTime: 60_000,
  });
}

function useSubmitReview(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<Review, Error, { rating: number; comment: string }>({
    mutationFn: async ({ rating, comment }) => {
      const res = await fetch(`/api/bookings/${bookingId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Failed to submit' }));
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['companion-reviews', data.companionId] });
      qc.invalidateQueries({ queryKey: ['booking-review', bookingId] });
      qc.invalidateQueries({ queryKey: ['customer-bookings'] });
    },
  });
}

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="text-[#bf8750] transition hover:scale-110"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          data-testid={`star-${n}`}
        >
          <Star className={`h-7 w-7 ${(hover || value) >= n ? 'fill-[#bf8750]' : 'fill-transparent'}`} />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'xs' }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-3 w-3'}
          fill={rating >= n ? '#bf8750' : 'transparent'}
          color={rating >= n ? '#bf8750' : '#d4bfa8'}
        />
      ))}
    </div>
  );
}

const REVIEW_LABELS: Record<number, string> = { 1: 'Not what I hoped', 2: 'Okay', 3: 'Good', 4: 'Really enjoyed it', 5: 'Exceptional' };

function KudosCard({ companionName }: { companionName: string; bookingId: string }) {
  return (
    <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4" data-testid="kudos-card">
      <p className="text-sm font-semibold text-[#48213d]">Kudos for {companionName.split(' ')[0]}</p>
      <p className="mt-1 text-[10px] leading-5 text-[#806c76]">Kudos are not delivered to companions yet. A review on their profile is the way to share feedback today.</p>
    </div>
  );
}

function TipCompanionCard({ companionName }: { companionName: string; bookingId: string }) {
  return (
    <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4" data-testid="tip-card">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-5 w-5 shrink-0 text-[#9d557e]" />
        <div>
          <p className="text-sm font-semibold text-[#48213d]">Tip {companionName.split(' ')[0]}</p>
          <p className="mt-0.5 text-[10px] leading-5 text-[#806c76]">Tips are not live yet. When they are, 100% will go to the companion through Stripe. Email hello@onlyfavors.com if you want to thank them another way.</p>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ bookingId }: { bookingId: string }) {
  const existingReview = useQuery({
    queryKey: ['booking-review', bookingId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/review`, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json() as Promise<{ rating: number; comment: string | null }>;
    },
    enabled: Boolean(bookingId),
    retry: false,
  });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const submit = useSubmitReview(bookingId);
  const alreadyReviewed = Boolean(existingReview.data) || done;

  if (alreadyReviewed) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-[20px] bg-[#e8f0e8] px-5 py-4">
        <Check className="h-5 w-5 shrink-0 text-[#477254]" />
        <div>
          <p className="text-sm font-semibold text-[#31533f]">Review submitted.</p>
          <p className="text-xs text-[#53725d]">Thank you — your feedback helps future customers choose with confidence.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[20px] border border-[#dfd2c9] bg-white">
      <div className="border-b border-[#ece1d9] bg-[#fbf7f1] px-5 py-3">
        <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Leave a review · helps future customers</p>
      </div>
      <div className="p-5">
        <p className="mb-3 text-sm font-semibold text-[#48213d]">How was your time?</p>
        <StarInput value={rating} onChange={setRating} />
        {rating > 0 && (
          <p className="mt-2 font-mono text-[10px] text-[#9d557e]">{REVIEW_LABELS[rating]}</p>
        )}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="A few honest words (optional)…"
          className="mt-4 w-full resize-none rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] p-3 text-sm leading-6 text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
          data-testid="textarea-review-comment"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-[#9b858e]">{comment.length}/300</span>
          <button
            type="button"
            disabled={rating === 0 || submit.isPending}
            onClick={() => submit.mutate({ rating, comment }, { onSuccess: () => setDone(true) })}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white disabled:opacity-40"
            data-testid="button-submit-review"
          >
            {submit.isPending ? 'Submitting…' : 'Submit review'} <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        {submit.isError && (
          <p className="mt-2 text-[10px] text-[#a64742]">{submit.error?.message}</p>
        )}
      </div>
    </div>
  );
}

function CompanionReviews({ companionId }: { companionId: string }) {
  const { data, isLoading } = useCompanionReviews(companionId);
  const reviews = data ?? [];

  if (isLoading) return <div className="mt-10 skeleton h-24 rounded-[20px]" />;
  if (reviews.length === 0) return (
    <div className="mt-10 border-t border-[#dfd2c9] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Reviews</p>
      <p className="mt-4 text-sm text-[#806c76]">No reviews yet. Be the first to share your experience.</p>
    </div>
  );

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct: reviews.length ? Math.round(reviews.filter((r) => r.rating === star).length / reviews.length * 100) : 0,
  }));

  return (
    <div className="mt-10 border-t border-[#dfd2c9] pt-8">
      {/* Summary row */}
      <div className="mb-6 flex flex-wrap gap-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Reviews</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-serif text-5xl leading-none text-[#48213d]">{avg.toFixed(1)}</span>
            <div className="mb-1">
              <StarDisplay rating={Math.round(avg)} />
              <p className="mt-1 text-[10px] text-[#9b858e]">{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</p>
            </div>
          </div>
        </div>
        {/* Star breakdown bars */}
        <div className="flex flex-1 flex-col justify-center gap-1 min-w-[180px]">
          {counts.map(({ star, count, pct }) => (
            <div key={star} className="flex items-center gap-2">
              <span className="w-3 text-right font-mono text-[9px] text-[#9b858e]">{star}</span>
              <Star className="h-2.5 w-2.5 shrink-0 fill-[#c6963d] text-[#c6963d]" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ece1d9]">
                <div className="h-full rounded-full bg-[#7f2e62] transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-5 text-right font-mono text-[9px] text-[#9b858e]">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {reviews.slice(0, 5).map((r) => (
          <div key={r.id} className="rounded-[16px] border border-[#ece1d9] bg-[#fbf7f1] p-4">
            <div className="flex items-center justify-between gap-3">
              <StarDisplay rating={r.rating} size="xs" />
              <span className="text-[9px] text-[#9b858e]">{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            </div>
            {r.comment && <p className="mt-2 text-sm leading-6 text-[#654c5f]">{r.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

function LiveActivityTicker() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#725e69]">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#ead0dd] text-[#7f2e62]">
        <LockKeyhole className="h-3 w-3" />
      </div>
      <span className="flex-1 truncate text-xs">Bookings stay private. We never show a live feed of other people's favors.</span>
    </div>
  );
}

function ActivitiesDirectory() {
  const [search, setSearch] = useState('');
  const CATEGORIES = [
    {
      name: 'Arts & Culture', icon: Landmark, color: '#ead0dd', textColor: '#7f2e62',
      activities: [
        { name: 'Museum visits', desc: 'Explore art, history, or science museums with thoughtful commentary.' },
        { name: 'Gallery tours', desc: 'Walk through contemporary and classical exhibitions.' },
        { name: 'Architecture walks', desc: 'Discover the stories behind a city\'s buildings and neighborhoods.' },
        { name: 'Theatre & performances', desc: 'Attend live theatre, opera, or dance with a knowledgeable companion.' },
        { name: 'Photography walks', desc: 'Capture a city\'s best moments together.' },
      ],
    },
    {
      name: 'Food & Drink', icon: UtensilsCrossed, color: '#f3ead7', textColor: '#9a6d25',
      activities: [
        { name: 'Restaurant dining', desc: 'Share a meal at a great restaurant — no more dining alone.' },
        { name: 'Coffee conversations', desc: 'A slow morning or afternoon over great coffee and real conversation.' },
        { name: 'Cooking classes', desc: 'Learn a new recipe together in a fun, social setting.' },
        { name: 'Farmers market visits', desc: 'Browse local produce, artisans, and street food.' },
        { name: 'Wine and food tasting', desc: 'Explore local wines, cheeses, and specialty foods.' },
      ],
    },
    {
      name: 'Outdoor & Active', icon: Navigation2, color: '#d3e1d8', textColor: '#31533f',
      activities: [
        { name: 'Evening walks', desc: 'A relaxed walk through a neighborhood, park, or waterfront.' },
        { name: 'Hiking', desc: 'Trails near the city with a companion who knows the route.' },
        { name: 'Cycling', desc: 'Explore by bike at a pace that works for you.' },
        { name: 'Beach or lakeside visits', desc: 'A peaceful afternoon near the water.' },
        { name: 'Botanical garden visits', desc: 'Wander through gardens and green spaces.' },
      ],
    },
    {
      name: 'Social & Events', icon: Users, color: '#dce4f5', textColor: '#1e3460',
      activities: [
        { name: 'Networking events', desc: 'Have a confident companion by your side at professional gatherings.' },
        { name: 'Concerts & live music', desc: 'Enjoy live performances with someone who appreciates the music.' },
        { name: 'Festivals & markets', desc: 'Explore seasonal events, fairs, and local festivals.' },
        { name: 'Sports events', desc: 'Watch a game with company who shares your enthusiasm.' },
        { name: 'Book club & readings', desc: 'Attend author events and literary gatherings.' },
      ],
    },
    {
      name: 'Relaxed & Low-key', icon: Coffee, color: '#fbf7f1', textColor: '#5a3520',
      activities: [
        { name: 'Bookstore visits', desc: 'Browse shelves and talk about what you\'re reading.' },
        { name: 'Library sessions', desc: 'Quiet company for reading or working.' },
        { name: 'Board games', desc: 'A casual game afternoon in a café or community space.' },
        { name: 'Conversation partner', desc: 'Simply talk — about life, ideas, memories, or plans.' },
        { name: 'Movie outings', desc: 'See a film together and debrief over coffee after.' },
      ],
    },
  ];

  const q = search.trim().toLowerCase();
  const filtered = CATEGORIES.map((cat) => ({
    ...cat,
    activities: cat.activities.filter((a) => !q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)),
  })).filter((cat) => cat.activities.length > 0);

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="border-b border-[#ddcfc6] bg-[#f8f1e9] px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Activities directory</p>
            <h1 className="mt-4 font-serif text-[64px] leading-[.9] text-[#48213d]">What would you<br /><em>like to do?</em></h1>
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-[#654c5f]">Every favor starts with an activity. Browse what's available — companions list the ones they genuinely enjoy.</p>
            <div className="relative mt-8 max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b09aa8]" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activities…"
                className="h-12 w-full rounded-full border border-[#dfd2c9] bg-white pl-11 pr-4 text-sm text-[#48213d] placeholder:text-[#b09aa8] focus:border-[#9d557e] focus:outline-none"
                data-testid="input-activities-search" />
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
          {filtered.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
              <p className="font-serif text-xl text-[#48213d]">No activities match that search.</p>
              <button type="button" onClick={() => setSearch('')} className="mt-3 text-xs font-bold text-[#7f2e62] underline">Clear search</button>
            </div>
          ) : (
            <div className="space-y-12">
              {filtered.map((cat) => {
                const Icon = cat.icon;
                return (
                  <div key={cat.name}>
                    <div className="mb-5 flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: cat.color }}>
                        <Icon className="h-4 w-4" style={{ color: cat.textColor }} />
                      </div>
                      <h2 className="font-serif text-3xl text-[#48213d]">{cat.name}</h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {cat.activities.map((act) => {
                        const actSlug = act.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                        const hasDetail = Boolean(ACTIVITY_DETAIL_DATA[actSlug]);
                        return (
                          <Link key={act.name}
                            href={hasDetail ? `/activities/${actSlug}` : `/explore?activity=${encodeURIComponent(act.name)}`}
                            className="group rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:border-[#9d557e] hover:shadow-md"
                            data-testid={`activity-${act.name.toLowerCase().replace(/\W+/g, '-')}`}>
                            <p className="font-semibold text-[#48213d] group-hover:text-[#7f2e62]">{act.name}</p>
                            <p className="mt-1.5 text-xs leading-5 text-[#806c76]">{act.desc}</p>
                            <p className="mt-3 text-[10px] font-bold text-[#9d557e] opacity-0 transition group-hover:opacity-100">
                              {hasDetail ? 'Learn more →' : 'Find companions →'}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}

const ACTIVITY_DETAIL_DATA: Record<string, {
  name: string; category: string; color: string; textColor: string; icon: typeof Landmark;
  tagline: string; intro: string;
  whatToExpect: string[]; tips: string[]; goodFor: string[];
  avgDuration: string; avgRate: string;
}> = {
  'museum-visits': {
    name: 'Museum visits', category: 'Arts & Culture', color: '#ead0dd', textColor: '#7f2e62', icon: Landmark,
    tagline: 'Explore art, history, or science with thoughtful company.',
    intro: 'Museum visits are one of the most popular activities on OnlyFavors. A companion can help you slow down, make connections, and find the stories behind the pieces that other visitors walk past.',
    whatToExpect: [
      'Meet at the museum entrance or in the lobby — never a private address',
      'Your companion researches the collection in advance and often has a suggested route',
      'Conversations can go wherever they want — no syllabus required',
      'Most visits last 2–3 hours; you can always extend or wrap up early',
    ],
    tips: ['Arrive a few minutes early', 'Let your companion know what interests you most before you go', 'Comfortable shoes make a big difference'],
    goodFor: ['First-time OnlyFavors bookings', 'People new to a city', 'Anyone who finds solo museum visits lonely'],
    avgDuration: '2–3 hours', avgRate: '$65–$85 / hour',
  },
  'coffee-conversations': {
    name: 'Coffee conversations', category: 'Food & Drink', color: '#f3ead7', textColor: '#9a6d25', icon: Coffee,
    tagline: 'Real conversation over a great cup of coffee.',
    intro: 'Sometimes you just need someone to talk to — without the pressure of a date, a networking agenda, or filling a silence. Coffee conversations are low-stakes, flexible, and surprisingly restorative.',
    whatToExpect: [
      'Meet at a café on the SafeSpot list (or suggest one)',
      'No structure required — some people come with topics; others just show up',
      'Sessions typically run 1–2 hours',
      'Companions are genuinely curious and good at listening',
    ],
    tips: ['This is a great first booking — no special planning needed', 'Mornings and afternoons both work well', 'It\'s okay to sit in comfortable silence too'],
    goodFor: ['People working through a big decision', 'Those who want to practice a language', 'Anyone craving real conversation with no agenda'],
    avgDuration: '1–2 hours', avgRate: '$55–$75 / hour',
  },
  'gallery-tours': {
    name: 'Gallery tours', category: 'Arts & Culture', color: '#ead0dd', textColor: '#7f2e62', icon: Landmark,
    tagline: 'See contemporary and classical art with a knowledgeable companion.',
    intro: 'Contemporary art can feel intimidating alone. A companion who knows the space — or who is simply curious alongside you — changes the entire experience.',
    whatToExpect: [
      'Companions often know the galleries in their city well',
      'They\'ll introduce you to what\'s showing and share their own reactions',
      'Questions are always welcome — there are no wrong ones',
      'Most gallery tours run 1.5–2.5 hours',
    ],
    tips: ['Ask your companion to suggest a gallery they personally love', 'Openings can be fun — let your companion know if you want a livelier crowd', 'Wear layers; galleries are often cold'],
    goodFor: ['Art-curious beginners', 'People moving through a creative block', 'Those visiting a new city\'s art scene'],
    avgDuration: '1.5–2.5 hours', avgRate: '$60–$80 / hour',
  },
  'evening-walks': {
    name: 'Evening walks', category: 'Outdoor & Active', color: '#d3e1d8', textColor: '#31533f', icon: Navigation2,
    tagline: 'A relaxed walk through a neighborhood, park, or waterfront.',
    intro: 'Walking side by side lowers the social pressure of conversation. Many people find their best talks happen on a slow walk with no destination in mind.',
    whatToExpect: [
      'Route is usually suggested by the companion, tailored to your preferences',
      'SafeSpot check-in happens at the starting point — typically a well-lit public space',
      'Walks last 1–2 hours depending on how the conversation flows',
      'Weather contingency plans are always discussed in advance',
    ],
    tips: ['Let your companion know if you prefer to talk or to walk in comfortable quiet', 'Bring a light layer — evenings can cool off', 'Suggest a neighborhood you\'ve always been curious about'],
    goodFor: ['People processing something quietly', 'Those who want to explore a new area', 'Anyone who finds sitting still hard'],
    avgDuration: '1–2 hours', avgRate: '$55–$70 / hour',
  },
  'restaurant-dining': {
    name: 'Restaurant dining', category: 'Food & Drink', color: '#f3ead7', textColor: '#9a6d25', icon: UtensilsCrossed,
    tagline: 'Share a great meal without dining alone.',
    intro: 'Dinner for one doesn\'t have to mean dining alone. A companion can turn a meal at a restaurant you\'ve been meaning to try into an evening worth remembering.',
    whatToExpect: [
      'Restaurant choice is collaborative — your companion often has excellent local suggestions',
      'The booking covers the time together; each person handles their own meal cost',
      'Dinners typically run 1.5–2.5 hours',
      'Companions are considerate about pace — no rushing',
    ],
    tips: ['Make a reservation in advance for popular spots', 'Let your companion know any dietary restrictions', 'Lunch bookings are a lower-pressure option if dinner feels like a big first step'],
    goodFor: ['Business travelers eating alone', 'People celebrating a milestone without someone to go with', 'Anyone who wants to try a special restaurant without waiting for the "right occasion"'],
    avgDuration: '1.5–2.5 hours', avgRate: '$65–$85 / hour',
  },
  'cooking-classes': {
    name: 'Cooking classes', category: 'Food & Drink', color: '#f3ead7', textColor: '#9a6d25', icon: UtensilsCrossed,
    tagline: 'Learn a new recipe together in a fun, social setting.',
    intro: 'Cooking classes are inherently social — you\'re already doing something together, which makes conversation easy and the whole experience more relaxed than a face-to-face meeting.',
    whatToExpect: [
      'Class venue is on the SafeSpot list or a mutually agreed public cooking school',
      'Your companion signs up alongside you — you\'re partners for the session',
      'Classes run 2–3 hours depending on the curriculum',
      'The meal you make is usually the best part',
    ],
    tips: ['Book the cooking class first, then bring the companion', 'Beginner classes are often more fun than advanced ones', 'Check if the class provides aprons'],
    goodFor: ['People wanting to learn a new skill', 'Anyone who finds direct conversation easier when doing something with their hands', 'Food enthusiasts who want a companion for the experience'],
    avgDuration: '2–3 hours', avgRate: '$65–$80 / hour',
  },
  'architecture-walks': {
    name: 'Architecture walks', category: 'Arts & Culture', color: '#ead0dd', textColor: '#7f2e62', icon: Building2,
    tagline: 'Discover the stories behind a city\'s buildings and neighborhoods.',
    intro: 'Every city tells a different story through its architecture — and having someone who knows the buildings, the history, and the neighborhoods makes all the difference.',
    whatToExpect: [
      'Routes are tailored to the neighborhood and your interests',
      'Most walks include 8–12 notable buildings or spaces',
      'Indoor stops (lobbies, atriums) are built into most routes',
      'Comfortable pace — this is not a rushed tour',
    ],
    tips: ['Wear comfortable walking shoes', 'Ask your companion to focus on a particular era or style if you have a preference', 'Late afternoon light is best for photos'],
    goodFor: ['Design and history enthusiasts', 'People exploring a new city', 'Anyone who wants to understand how a place was built'],
    avgDuration: '2–3 hours', avgRate: '$60–$80 / hour',
  },
  'bookstore-visits': {
    name: 'Bookstore visits', category: 'Relaxed & Low-key', color: '#fbf7f1', textColor: '#5a3520', icon: Landmark,
    tagline: 'Browse shelves and talk about what you\'re reading.',
    intro: 'A bookstore visit is one of the most unhurried, pressure-free things you can do with a companion. No timeline. No agenda. Just shelves, conversation, and the occasional discovery.',
    whatToExpect: [
      'Your companion will often have suggestions based on what you like to read',
      'Sessions flow at whatever pace feels right — 1–2 hours is common',
      'Often followed by coffee at a nearby café if the conversation keeps going',
      'Independent bookstores are preferred — your companion usually knows the best ones',
    ],
    tips: ['Tell your companion what genres or authors you enjoy', 'Bring a small note about books you\'ve been meaning to find', 'Saturday mornings have the best atmosphere in most cities'],
    goodFor: ['Readers who want company without pressure', 'People looking for their next great book', 'Anyone new to a city who wants to find the good independent bookstores'],
    avgDuration: '1–2 hours', avgRate: '$50–$65 / hour',
  },
  'hiking': {
    name: 'Hiking', category: 'Outdoor & Active', color: '#d3e1d8', textColor: '#31533f', icon: Navigation2,
    tagline: 'Trails near the city with a companion who knows the route.',
    intro: 'Hiking alone can feel long. Hiking with someone who knows the trail, the view from the top, and when to be quiet — that\'s a different experience entirely.',
    whatToExpect: [
      'Trail selection is collaborative — your companion will ask about your fitness level and preferred difficulty',
      'All hikes start from a public trailhead or SafeSpot',
      'Most outings are 2–4 hours including travel to the trail',
      'Water and snacks are each person\'s own responsibility',
    ],
    tips: ['Let your companion know your fitness level honestly — no judgment', 'Wear layers; trails can be significantly colder than the city', 'Bring your own water (at least 1 liter per 2 hours)'],
    goodFor: ['People who want to explore nature near the city', 'Anyone who finds hiking alone unappealing', 'Those looking for a more active, outdoors-oriented favor'],
    avgDuration: '2.5–4 hours', avgRate: '$60–$80 / hour',
  },
  'conversation-partner': {
    name: 'Conversation partner', category: 'Relaxed & Low-key', color: '#fbf7f1', textColor: '#5a3520', icon: MessageSquare,
    tagline: 'Simply talk — about life, ideas, memories, or plans.',
    intro: 'Sometimes the most valuable thing is having someone to think alongside. A conversation partner isn\'t a therapist, a life coach, or a friend-for-hire — they\'re someone who shows up curious and listens well.',
    whatToExpect: [
      'Sessions are entirely unstructured — you lead wherever you want to go',
      'Companions are trained to ask open questions and hold space for silence',
      'Any café, park bench, or SafeSpot works well for this type of favor',
      'Sessions run 1–2 hours; many customers book regularly',
    ],
    tips: ['It\'s okay to not know what you want to talk about — just start', 'Sessions work well for processing big decisions or transitions', 'This is a good activity if it\'s your first OnlyFavors booking'],
    goodFor: ['People going through a life transition', 'Anyone who wants to think out loud with a thoughtful listener', 'Those who want to practice articulating ideas or plans'],
    avgDuration: '1–2 hours', avgRate: '$55–$70 / hour',
  },
};

function slugToKey(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c);
}

function ActivityDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const data = ACTIVITY_DETAIL_DATA[slug];
  const directory = useDirectoryCompanions();
  const matching = (directory.data ?? []).filter((c) =>
    c.activities.some((a) => a.toLowerCase() === (data?.name ?? slugToKey(slug)).toLowerCase()),
  ).slice(0, 4);

  if (!data) {
    // Generic fallback for activities without a dedicated page
    const name = slugToKey(slug);
    return (
      <Shell>
        <main className="page-enter mx-auto max-w-4xl px-5 py-16 lg:px-8">
          <Link href="/activities" className="inline-flex items-center gap-2 text-xs text-[#9b858e] hover:text-[#48213d]">
            <ArrowLeft className="h-3.5 w-3.5" />All activities
          </Link>
          <h1 className="mt-8 font-serif text-5xl text-[#48213d]">{name}</h1>
          <p className="mt-4 text-sm leading-7 text-[#725e69]">Find companions offering this activity in your city.</p>
          <Link href={`/explore?activity=${encodeURIComponent(name)}`}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white">
            Find companions <ArrowRight className="h-4 w-4" />
          </Link>
        </main>
      </Shell>
    );
  }

  const Icon = data.icon;

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="border-b border-[#ddcfc6] px-5 py-16 lg:px-8" style={{ background: data.color + '55' }}>
          <div className="mx-auto max-w-5xl">
            <Link href="/activities" className="inline-flex items-center gap-2 text-xs font-medium hover:underline" style={{ color: data.textColor }}>
              <ArrowLeft className="h-3.5 w-3.5" />Activities
            </Link>
            <div className="mt-6 flex items-start gap-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: data.color }}>
                <Icon className="h-7 w-7" style={{ color: data.textColor }} />
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.2em]" style={{ color: data.textColor }}>{data.category}</p>
                <h1 className="mt-2 font-serif text-[56px] leading-[.92] text-[#48213d]">{data.name}</h1>
              </div>
            </div>
            <p className="mt-6 max-w-xl text-[17px] leading-7 text-[#654c5f]">{data.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-4">
              <span className="flex items-center gap-2 rounded-full border border-[#dfd2c9] bg-white/70 px-4 py-2 text-xs font-semibold text-[#654c5f]">
                <Clock3 className="h-3.5 w-3.5 text-[#9b858e]" />{data.avgDuration} typical
              </span>
              <span className="flex items-center gap-2 rounded-full border border-[#dfd2c9] bg-white/70 px-4 py-2 text-xs font-semibold text-[#654c5f]">
                <WalletCards className="h-3.5 w-3.5 text-[#9b858e]" />{data.avgRate}
              </span>
            </div>
            <Link href={`/explore?activity=${encodeURIComponent(data.name)}`}
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white shadow-[0_8px_20px_rgba(127,46,98,.2)] transition hover:bg-[#65234e]"
              data-testid="link-activity-find-companions">
              Find companions for {data.name.toLowerCase()} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
            {/* Left: intro + expectations */}
            <div className="space-y-10">
              <section>
                <p className="font-serif text-[28px] leading-tight text-[#48213d]">{data.intro}</p>
              </section>

              <section>
                <h2 className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">What to expect</h2>
                <ul className="mt-4 space-y-3">
                  {data.whatToExpect.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[#654c5f]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Practical tips</h2>
                <div className="mt-4 space-y-2">
                  {data.tips.map((tip) => (
                    <div key={tip} className="flex items-start gap-3 rounded-[14px] bg-[#fbf7f1] p-4 text-sm text-[#654c5f]">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#9a6d25]" />
                      {tip}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Right: good for + companions */}
            <div className="space-y-8">
              <section className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-7">
                <h2 className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Great for</h2>
                <ul className="mt-4 space-y-2">
                  {data.goodFor.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[#654c5f]">
                      <Heart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9d557e]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>

              {matching.length > 0 && (
                <section>
                  <h2 className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Companions who offer this</h2>
                  <div className="mt-4 space-y-3">
                    {matching.map((c) => (
                      <Link key={c.id} href={`/companions/${c.id}`}
                        className="group flex items-center gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-4 transition hover:border-[#9d557e] hover:shadow-md"
                        data-testid={`activity-companion-${c.id}`}>
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-lg text-[#7f2e62]">{companionInitials(c.displayName)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[#48213d] group-hover:text-[#7f2e62]">{c.displayName}</p>
                          <p className="text-xs text-[#9b858e]">{c.city} · ${c.hourlyRate}/hr</p>
                        </div>
                        {c.rating > 0 && (
                          <div className="flex items-center gap-1 text-xs font-bold text-[#9a6d25]">
                            <Star className="h-3.5 w-3.5 fill-[#9a6d25]" />{c.rating.toFixed(1)}
                          </div>
                        )}
                      </Link>
                    ))}
                    <Link href={`/explore?activity=${encodeURIComponent(data.name)}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9d557e] hover:underline"
                      data-testid="link-activity-see-all">
                      See all companions for this activity <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </section>
              )}

              <section className="rounded-[22px] bg-[#3d2038] p-7 text-[#f9efe5]">
                <ShieldCheck className="h-5 w-5 text-[#c695ae]" />
                <h2 className="mt-4 font-serif text-2xl">Safety first, always</h2>
                <p className="mt-2 text-sm leading-6 text-[#d9c4cf]">All {data.name.toLowerCase()} bookings begin at a listed SafeSpot. Both people sign a Boundary Receipt first. Trust Circle can get a venue check-in email — never a companion name.</p>
                <Link href="/safety" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#c695ae] hover:text-white">
                  How safety works <ArrowRight className="h-3 w-3" />
                </Link>
              </section>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Stories / Editorial page
// ---------------------------------------------------------------------------

const STORIES = [
  {
    id: 'first-booking',
    category: 'Getting started',
    title: 'What to expect from your first OnlyFavors booking',
    excerpt: 'First-timer nerves are normal. Here\'s exactly what happens from the moment you request a booking to the moment you say goodbye.',
    readTime: '4 min read',
    color: '#ead0dd',
    textColor: '#7f2e62',
    body: [
      { kind: 'p', text: 'Most people feel a little unsure the first time. That\'s not a problem — it\'s a signal that you care about doing this right. The good news is that every step is designed to remove uncertainty.' },
      { kind: 'h2', text: 'Before you request' },
      { kind: 'p', text: 'Browse the companion directory and read a few profiles fully. Pay attention to the Q&A section — it tells you more than photos ever could. When someone\'s answers resonate with you, that\'s the right instinct to follow.' },
      { kind: 'h2', text: 'The request' },
      { kind: 'p', text: 'You choose the activity, the date, the duration, and a SafeSpot from the verified list. You\'re never asked to decide on a private meeting place — that\'s by design. A $10 deposit holds the request while your companion reviews it.' },
      { kind: 'h2', text: 'The waiting period' },
      { kind: 'p', text: 'Companions typically respond within a few hours, sometimes faster. If they accept, a private masked chat thread opens between you. No phone numbers are ever exchanged through the platform — everything goes through OnlyFavors.' },
      { kind: 'h2', text: 'The favor itself' },
      { kind: 'p', text: 'Meet at the SafeSpot at the agreed time. Record check-in in Favor Mode so the booking has a start record. From there, it\'s just two people spending time together — at whatever pace feels right.' },
      { kind: 'h2', text: 'After' },
      { kind: 'p', text: 'You\'ll receive a receipt and a prompt to leave a review if you\'d like. Reviews are optional, but companions genuinely value them — a thoughtful sentence goes a long way.' },
    ],
  },
  {
    id: 'why-safespots',
    category: 'Safety',
    title: 'Why every booking starts at a SafeSpot',
    excerpt: 'The SafeSpot requirement isn\'t a bureaucratic formality. It\'s one of the most important things we\'ve built — here\'s why.',
    readTime: '3 min read',
    color: '#d3e1d8',
    textColor: '#31533f',
    body: [
      { kind: 'p', text: 'Every OnlyFavors booking starts at a verified public venue — a coffee shop, museum lobby, hotel bar, or library. We call these SafeSpots. Companions and customers cannot agree to meet anywhere else for the start of a booking.' },
      { kind: 'h2', text: 'What makes a SafeSpot verified?' },
      { kind: 'p', text: 'We visit each location, verify it\'s well-lit and staffed, confirm it\'s accessible by public transit, and check it against our safety criteria. Venues can also apply — several hotel lobbies and café groups have actively sought SafeSpot status.' },
      { kind: 'h2', text: 'The QR check-in' },
      { kind: 'p', text: 'When a booking starts, Favor Mode can record a check-in. That stores a timestamp. It does not notify a 24/7 trust desk or send SMS to your Trust Circle yet.' },
      { kind: 'h2', text: 'After the check-in' },
      { kind: 'p', text: 'Once the booking is underway, customers and companions are free to move to other public spaces if the activity calls for it — a walk, a different café, a gallery. The SafeSpot is the mandatory starting point, not the entire booking location.' },
    ],
  },
  {
    id: 'setting-your-rate',
    category: 'For companions',
    title: 'How to set your hourly rate — and when to raise it',
    excerpt: 'Your rate is one of the most important signals you send. Setting it too low can backfire in ways that aren\'t obvious.',
    readTime: '6 min read',
    color: '#dce8f5',
    textColor: '#2a5280',
    body: [
      { kind: 'p', text: 'Most new companions underprice themselves, and the reasons are understandable — uncertainty about demand, not wanting to seem arrogant, a general discomfort with putting a number on personal time. But underpricing carries real costs.' },
      { kind: 'h2', text: 'Why low rates backfire' },
      { kind: 'p', text: 'A rate that is too low can signal inexperience or low confidence — which affects how seriously customers take the booking. Price in a range that feels honest for the time and care you give.' },
      { kind: 'h2', text: 'The 5-booking review point' },
      { kind: 'p', text: 'After your first five completed bookings, review your rate. By that point you have real data: how long bookings actually take, how much preparation you put in, what your reviews say. Many companions raise their rate by $10–15 after this review without any drop in bookings.' },
      { kind: 'h2', text: 'When to raise it again' },
      { kind: 'p', text: 'When your acceptance rate is high and you\'re turning down bookings because you\'re full, your rate should go up. The goal is to reach a point where you\'re fully booked at a rate that genuinely compensates you well — not fully booked at a rate that just covers your time.' },
      { kind: 'h2', text: 'The platform benchmark' },
      { kind: 'p', text: 'There is no in-app rate advisor yet. Use your own completed bookings: if you are turning people away, raise the rate; if requests are slow, wait before dropping it. Price the time and care you actually give.' },
    ],
  },
];

function NewsletterPage() {
  const [email, setEmail] = useState('');
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const TOPICS = [
    { id: 'companion-spotlights', label: '✨ Companion spotlights', desc: 'Deep dives on featured companions and their stories.' },
    { id: 'new-cities', label: '🗺️ New cities', desc: 'First to know when we launch in a new metro.' },
    { id: 'safety-tips', label: '🛡️ Safety & trust', desc: 'Guides and updates from our trust & safety team.' },
    { id: 'activities', label: '🎭 Activity ideas', desc: 'Curated activity inspiration for every mood.' },
    { id: 'platform-updates', label: '🔧 Platform updates', desc: 'New features and improvements to the app.' },
    { id: 'community', label: '💛 Community stories', desc: 'Real stories from customers and companions.' },
  ];

  const toggleTopic = (id: string) => {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('The dispatch is not live yet. Email hello@onlyfavors.com if you want to be notified when it launches.');
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-5xl px-5 py-14 lg:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          {/* Left */}
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">The companion dispatch</p>
            <h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#48213d]">Good company<br /><em>in your inbox.</em></h1>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-[#725e69]">
              A thoughtful newsletter from OnlyFavors. Companion spotlights, activity ideas, platform news, and community stories — sent mindfully, never more than twice a month.
            </p>

            <div className="mt-8 rounded-[18px] bg-[#3d2038] p-6 text-[#f9efe5]">
              <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#c695ae]">When it launches</p>
              <p className="mt-3 text-sm leading-6 text-[#e0c8d9]">Spotlights will come from real approved companions. Until then we will not invent reader quotes or named interviews.</p>
            </div>
          </div>

          {/* Right — form */}
          <form onSubmit={handleSubmit} className="rounded-[26px] border border-[#dfd2c9] bg-[#fbf7f1] p-7 shadow-[0_15px_35px_rgba(88,37,70,.07)] md:p-10">
            <h2 className="font-serif text-3xl text-[#48213d]">Subscribe</h2>
            <p className="mt-1 text-xs leading-5 text-[#9b858e]">Free. Unsubscribe any time. No ads, ever.</p>

            <label className="mt-8 block">
              <span className="mb-2 block text-xs font-bold text-[#654c5f]">Email address</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-[14px] border border-[#cbbab5] bg-white px-4 text-sm outline-none focus:border-[#7f2e62]"
                data-testid="input-newsletter-email" />
            </label>

            <div className="mt-6">
              <p className="mb-3 text-xs font-bold text-[#654c5f]">What are you interested in?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TOPICS.map(({ id, label, desc }) => (
                  <button key={id} type="button" onClick={() => toggleTopic(id)}
                    className={`rounded-[14px] border p-3 text-left transition ${interests.has(id) ? 'border-[#7f2e62] bg-[#fdf5fa]' : 'border-[#dfd2c9] bg-white hover:border-[#bc83a6]'}`}
                    data-testid={`topic-${id}`}>
                    <p className="text-xs font-bold text-[#48213d]">{label}</p>
                    <p className="mt-0.5 text-[9px] leading-4 text-[#9b858e]">{desc}</p>
                    {interests.has(id) && <Check className="mt-1.5 h-3.5 w-3.5 text-[#7f2e62]" />}
                  </button>
                ))}
              </div>
              {interests.size === 0 && (
                <p className="mt-2 text-[10px] text-[#b0929f]">Select at least one topic, or we'll send you everything.</p>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-[#9d3d3d]">{error}</p>}

            <button type="submit" disabled={!email.trim()}
              className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e] disabled:opacity-50"
              data-testid="button-newsletter-subscribe">
              Subscribe <ArrowRight className="h-4 w-4" />
            </button>

            <p className="mt-4 text-center text-[10px] leading-5 text-[#b0929f]">
              By subscribing you agree to our <Link href="/privacy" className="font-bold text-[#7f2e62] hover:underline">privacy policy</Link>. No spam. Truly.
            </p>
          </form>
        </div>
      </main>
    </Shell>
  );
}

function StoriesPage() {
  const [activeStory, setActiveStory] = useState<string | null>(null);
  const story = activeStory ? STORIES.find((s) => s.id === activeStory) : null;

  if (story) {
    return (
      <Shell>
        <main className="page-enter mx-auto max-w-3xl px-5 py-12 lg:px-8">
          <button type="button" onClick={() => setActiveStory(null)}
            className="inline-flex items-center gap-2 text-xs font-medium hover:underline mb-10"
            style={{ color: story.textColor }}>
            <ArrowLeft className="h-3.5 w-3.5" />All stories
          </button>
          <div className="mb-4 inline-flex items-center rounded-full px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[.15em]"
            style={{ background: story.color, color: story.textColor }}>
            {story.category}
          </div>
          <h1 className="mt-4 font-serif text-[46px] leading-[1.05] text-[#48213d]">{story.title}</h1>
          <p className="mt-3 text-[11px] text-[#9b858e]">{story.readTime}</p>
          <div className="mt-10 space-y-5">
            {story.body.map((block, idx) =>
              block.kind === 'h2'
                ? <h2 key={idx} className="mt-8 font-serif text-2xl text-[#48213d]">{block.text}</h2>
                : <p key={idx} className="text-[16px] leading-8 text-[#654c5f]">{block.text}</p>
            )}
          </div>
          <div className="mt-14 border-t border-[#e8ddd6] pt-10">
            <p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#9d557e]">More stories</p>
            <div className="mt-5 space-y-3">
              {STORIES.filter((s) => s.id !== story.id).slice(0, 3).map((s) => (
                <button key={s.id} type="button" onClick={() => { setActiveStory(s.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="group flex w-full items-start gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-4 text-left transition hover:border-[#9d557e]">
                  <div className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[.1em] text-[#9b858e]">{s.category}</p>
                    <p className="mt-1 font-semibold text-[#48213d] group-hover:text-[#7f2e62] line-clamp-2">{s.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="border-b border-[#ddcfc6] bg-[#3d2038] px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">OnlyFavors Journal</p>
            <h1 className="mt-4 font-serif text-[62px] leading-[.9] text-[#f9efe5]">Stories</h1>
            <p className="mt-5 max-w-md text-[17px] leading-7 text-[#d9c4cf]">
              Companion spotlights, safety guides, platform thinking, and everything in between.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
          {/* Featured */}
          <button type="button" onClick={() => setActiveStory(STORIES[0].id)}
            className="group w-full rounded-[28px] border border-[#dfd2c9] bg-[#fbf7f1] p-8 text-left transition hover:border-[#9d557e] hover:shadow-lg md:p-10"
            data-testid="story-featured">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center rounded-full px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[.15em]"
                  style={{ background: STORIES[0].color, color: STORIES[0].textColor }}>
                  {STORIES[0].category}
                </div>
                <h2 className="mt-4 font-serif text-[38px] leading-[1.05] text-[#48213d] group-hover:text-[#7f2e62]">
                  {STORIES[0].title}
                </h2>
                <p className="mt-3 max-w-lg text-[15px] leading-7 text-[#654c5f]">{STORIES[0].excerpt}</p>
                <p className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold text-[#9d557e] group-hover:gap-3 transition-all">
                  Read story <ArrowRight className="h-3.5 w-3.5" />
                </p>
              </div>
              <div className="hidden h-32 w-32 shrink-0 items-center justify-center rounded-[22px] text-6xl md:flex"
                style={{ background: STORIES[0].color }}>
                ✦
              </div>
            </div>
          </button>

          {/* Grid */}
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {STORIES.filter((_, i) => i !== 0).map((s) => (
              <button key={s.id} type="button" onClick={() => setActiveStory(s.id)}
                className="group rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 text-left transition hover:border-[#9d557e] hover:shadow-md"
                data-testid={`story-${s.id}`}>
                <div className="mb-4 h-1.5 w-10 rounded-full" style={{ background: s.color }} />
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[.1em] text-[#9b858e]">{s.category}</div>
                <h3 className="font-serif text-[22px] leading-tight text-[#48213d] group-hover:text-[#7f2e62]">{s.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[#806c76] line-clamp-3">{s.excerpt}</p>
                <p className="mt-4 flex items-center gap-1 text-[10px] font-bold text-[#9d557e] opacity-0 transition group-hover:opacity-100">
                  Read <ArrowRight className="h-3 w-3" />
                </p>
              </button>
            ))}
          </div>

          {/* CTA banner */}
          <div className="mt-12 flex flex-col items-center gap-4 rounded-[26px] bg-[#3d2038] px-8 py-12 text-center">
            <p className="font-serif text-3xl text-[#f9efe5]">Ready to book your first favor?</p>
            <p className="max-w-sm text-sm leading-6 text-[#d9c4cf]">Browse companions in your city — verified, professional, and ready to make your day better.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/explore" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white transition hover:bg-[#65234e]">
                Find a companion <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/how-it-works" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#6a3858] px-6 text-sm font-semibold text-[#d9c4cf] transition hover:border-[#9d557e]">
                How it works
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function CareersPage() {
  const ROLES = [
    { title: 'Trust & Safety', desc: 'Review companion applications and platform concerns.' },
    { title: 'Engineering', desc: 'API, Stripe, and the booking product.' },
    { title: 'Design', desc: 'Privacy-first booking and companion onboarding.' },
    { title: 'City growth', desc: 'Companion supply and customer demand in a metro.' },
  ];

  return (
    <Shell>
      <main className="page-enter">
        <section className="bg-[#3d2038] px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">Join the team</p>
            <h1 className="mt-4 max-w-xl font-serif text-[68px] leading-[.9] text-[#f9efe5]">Work that<br /><em>matters.</em></h1>
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-[#d9c4cf]">
              OnlyFavors is a small team building a platonic companion marketplace. There is no live job board or in-app application form. Hiring is by email.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Kinds of work</p>
          <h2 className="mt-2 font-serif text-4xl text-[#48213d]">What we hire for when we hire</h2>
          <p className="mt-4 text-sm leading-6 text-[#725e69]">These are the areas we care about. They are not open requisitions with a published headcount, round, or start date.</p>
          <div className="mt-8 space-y-3">
            {ROLES.map((role) => (
              <div key={role.title} className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid={`role-${role.title.toLowerCase().replace(/\W+/g, '-')}`}>
                <h3 className="font-serif text-2xl text-[#48213d]">{role.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#654c5f]">{role.desc}</p>
              </div>
            ))}
          </div>
          <section className="mt-12 rounded-[24px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-10">
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c695ae]">How to apply</p>
            <h2 className="mt-3 font-serif text-4xl">Email a note. We will reply if there is a fit.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#d9c4cf]">There is no ATS here. Sending this form nowhere would pretend we received your resume. Use email instead.</p>
            <a href="mailto:team@onlyfavors.com?subject=OnlyFavors%20role" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#f9efe5] px-5 text-sm font-bold text-[#48213d] hover:bg-white">
              team@onlyfavors.com <ArrowRight className="h-4 w-4" />
            </a>
          </section>
        </div>
      </main>
    </Shell>
  );
}

function PressPage() {
  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="border-b border-[#ddcfc6] bg-[#3d2038] px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">For media</p>
            <h1 className="mt-4 font-serif text-[68px] leading-[.9] text-[#f9efe5]">Press &amp;<br />media kit.</h1>
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-[#d9c4cf]">OnlyFavors is redefining platonic connection — privacy-first, boundaries-clear, and always safe. We welcome thoughtful media coverage.</p>
            <a href="mailto:press@onlyfavors.com"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[#f9efe5] px-5 text-sm font-bold text-[#48213d] transition hover:bg-white"
              data-testid="link-press-email">
              Contact press team <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="border-b border-[#5e3458] px-5 py-8 lg:px-8" style={{ background: 'rgba(255,245,235,0.06)' }}>
          <div className="mx-auto max-w-7xl">
            <p className="mb-3 font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#c695ae]">Press</p>
            <p className="max-w-2xl text-sm leading-6 text-[#d9c4cf]">
              For interviews, fact-checking, or brand assets, write to{' '}
              <a href="mailto:press@onlyfavors.com" className="font-bold text-[#f9efe5] underline">press@onlyfavors.com</a>.
              We only list coverage after it is published.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2">

            {/* Key facts */}
            <section>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Key facts</p>
              <h2 className="mt-2 font-serif text-4xl text-[#48213d]">About OnlyFavors</h2>
              <div className="mt-6 space-y-4">
                {[
                  ['Founded', '2025'],
                  ['Mission', 'Make platonic companionship safe, accessible, and stigma-free.'],
                  ['Model', 'Two-sided marketplace — human-reviewed companions, privacy-first customers.'],
                  ['Safety', 'Every booking starts at a verified SafeSpot. Boundary receipts required.'],
                  ['Coverage', 'Launching city by city as companions and SafeSpots are approved.'],
                  ['Companions', 'Every live profile is approved. We do not publish invented counts.'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-4 rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4">
                    <span className="w-24 shrink-0 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#9b858e]">{label}</span>
                    <span className="text-sm text-[#654c5f]">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Assets + contact */}
            <section className="space-y-6">
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Brand assets</p>
                <h2 className="mt-2 font-serif text-4xl text-[#48213d]">Downloads</h2>
                <div className="mt-5 space-y-3">
                  {[
                    { label: 'Logo pack (SVG + PNG)', desc: 'Light, dark, and minimal variants.' },
                    { label: 'Brand guidelines', desc: 'Colors, typography, and tone of voice.' },
                    { label: 'Screenshot library', desc: 'App screenshots for editorial use.' },
                    { label: 'Founder bios + photos', desc: 'Headshots and approved biographies.' },
                  ].map(({ label, desc }) => (
                    <a key={label} href="mailto:press@onlyfavors.com?subject=Press%20kit%20request"
                      className="flex w-full items-center gap-4 rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4 text-left transition hover:border-[#9d557e]"
                      data-testid={`press-download-${label.toLowerCase().replace(/\W+/g, '-')}`}>
                      <FileText className="h-4 w-4 shrink-0 text-[#9d557e]" />
                      <div>
                        <p className="text-sm font-semibold text-[#48213d]">{label}</p>
                        <p className="text-[10px] text-[#9b858e]">{desc} Email press@onlyfavors.com — files are not hosted here yet.</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] bg-[#ead0dd] p-6">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#7f2e62]">Press contact</p>
                <h3 className="mt-2 font-serif text-2xl text-[#48213d]">Email press@onlyfavors.com</h3>
                <p className="mt-2 text-sm text-[#725e69]">For interview requests, fact-checking, or brand assets. We do not publish a response-time SLA.</p>
                <a href="mailto:press@onlyfavors.com" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white">
                  press@onlyfavors.com
                </a>
              </div>
            </section>

          </div>
        </div>
      </main>
    </Shell>
  );
}

function CityWaitlistPage() {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [role, setRole] = useState<'customer' | 'companion'>('customer');
  const [error, setError] = useState('');

  const COMING_SOON = ['Miami', 'Portland', 'Denver', 'Boston', 'Atlanta', 'Washington DC', 'Houston', 'Nashville', 'Toronto', 'London'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !city.trim()) return;
    setError(`The city waitlist is not live yet. Email hello@onlyfavors.com with “${city}” and we will keep you posted.`);
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-xl px-5 py-16 lg:px-8">
        <Link href="/cities" className="mb-10 inline-flex items-center gap-2 text-xs text-[#9b858e] hover:text-[#48213d]">
          <ArrowLeft className="h-3.5 w-3.5" />City guides
        </Link>

        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Expansion waitlist</p>
        <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Coming<br /><em>to your city.</em></h1>
        <p className="mt-4 text-sm leading-6 text-[#725e69]">
          OnlyFavors is growing city by city. Join the waitlist and be the first to know when we launch near you.
        </p>

        {/* Coming soon cities */}
        <div className="mt-8 rounded-[18px] bg-[#fbf7f1] border border-[#dfd2c9] p-5">
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">On our radar</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMING_SOON.map((c) => (
              <button key={c} type="button" onClick={() => setCity(c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${city === c ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] text-[#654c5f] hover:border-[#9d557e]'}`}
                data-testid={`city-chip-${c.toLowerCase().replace(/ /g, '-')}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" data-testid="form-city-waitlist">
          <label className="block">
            <span className="mb-2 block text-xs font-bold text-[#654c5f]">Your city (or city you'd like to see)</span>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Miami, Toronto, London"
              className="h-12 w-full rounded-[14px] border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]"
              data-testid="input-waitlist-city" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold text-[#654c5f]">Email address</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              className="h-12 w-full rounded-[14px] border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]"
              data-testid="input-waitlist-email" />
          </label>

          <div className="flex gap-3">
            {([{ v: 'customer', label: 'I want to book a companion' }, { v: 'companion', label: 'I want to be a companion' }] as const).map(({ v, label }) => (
              <button key={v} type="button" onClick={() => setRole(v)}
                className={`flex-1 rounded-[14px] border p-3 text-xs font-semibold transition text-left ${role === v ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] text-[#654c5f] hover:border-[#9d557e]'}`}
                data-testid={`role-${v}`}>
                {label}
              </button>
            ))}
          </div>

          <button type="submit" disabled={!email.trim() || !city.trim()}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e] disabled:opacity-50"
            data-testid="button-submit-waitlist">
            Join waitlist <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {error && <p className="mt-4 text-center text-sm text-[#9d3d3d]">{error}</p>}

        <p className="mt-6 text-center text-[11px] text-[#9b858e]">
          No spam. We'll only contact you when your city launches.
        </p>
      </main>
    </Shell>
  );
}

function CitiesIndex() {
  const directory = useDirectoryCompanions();
  const live = directory.data ?? [];
  const CITIES = [
    { slug: 'san-francisco', name: 'San Francisco', tagline: 'Art, coffee, and coastline.', icon: Coffee },
    { slug: 'new-york', name: 'New York', tagline: 'The city that never stops surprising.', icon: Building2 },
    { slug: 'chicago', name: 'Chicago', tagline: 'Architecture, jazz, and lakeside walks.', icon: Landmark },
    { slug: 'los-angeles', name: 'Los Angeles', tagline: 'Sunshine, galleries, and rooftop dining.', icon: Star },
    { slug: 'seattle', name: 'Seattle', tagline: 'Coffee culture and misty bookshops.', icon: Coffee },
    { slug: 'boston', name: 'Boston', tagline: 'History, academia, and harbor walks.', icon: Landmark },
    { slug: 'austin', name: 'Austin', tagline: 'Music, tacos, and outdoor adventure.', icon: Sparkles },
    { slug: 'portland', name: 'Portland', tagline: 'Farmers markets, trails, and craft coffee.', icon: Navigation2 },
    { slug: 'denver', name: 'Denver', tagline: 'Mountain views and gallery districts.', icon: Navigation2 },
    { slug: 'miami', name: 'Miami', tagline: 'Art Deco, beaches, and Cuban cuisine.', icon: UtensilsCrossed },
    { slug: 'washington-dc', name: 'Washington D.C.', tagline: 'Museums, monuments, and diplomatic dining.', icon: Landmark },
    { slug: 'atlanta', name: 'Atlanta', tagline: 'Soul food, street art, and Southern charm.', icon: UtensilsCrossed },
  ];

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="border-b border-[#ddcfc6] bg-[#f8f1e9] px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Explore by city</p>
            <h1 className="mt-4 font-serif text-[64px] leading-[.9] text-[#48213d]">Good company,<br />wherever you are.</h1>
            <p className="mt-5 max-w-xl text-[17px] leading-7 text-[#654c5f]">Verified companions in cities across the country — with SafeSpots, local expertise, and clear boundaries in every one.</p>
          </div>
        </section>

        {/* Grid */}
        <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {CITIES.map(({ slug, name, tagline, icon: Icon }) => {
              const count = live.filter((c) => c.city.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.city.toLowerCase())).length;
              return (
              <Link key={slug} href={`/cities/${slug}`}
                className="group flex flex-col rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 transition hover:-translate-y-0.5 hover:border-[#9d557e] hover:shadow-lg"
                data-testid={`city-${slug}`}>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="mt-4 font-serif text-2xl leading-tight text-[#48213d]">{name}</h2>
                <p className="mt-1 flex-1 text-[12px] leading-5 text-[#806c76]">{tagline}</p>
                <div className="mt-4 flex items-center justify-between border-t border-[#ece1d9] pt-4">
                  <span className="font-mono text-[9px] uppercase tracking-[.14em] text-[#9b858e]">{count} {count === 1 ? 'companion' : 'companions'}</span>
                  <span className="font-mono text-[9px] font-bold text-[#7f2e62] opacity-0 transition group-hover:opacity-100">Explore →</span>
                </div>
              </Link>
              );
            })}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-[#ddcfc6] bg-[#3d2038] px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-7xl text-center">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">Don't see your city?</p>
            <h2 className="mt-3 font-serif text-4xl text-[#f9efe5]">We're growing fast.</h2>
            <p className="mt-4 max-w-md mx-auto text-sm leading-6 text-[#d9c4cf]">Join the waitlist and we'll let you know when OnlyFavors lands in your city.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/companion/apply" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f9efe5] px-6 text-sm font-bold text-[#48213d] transition hover:bg-white" data-testid="link-cities-apply">
                Join as a companion <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/cities/waitlist" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7f5080] px-6 text-sm font-semibold text-[#f9efe5] transition hover:border-[#c695ae]" data-testid="link-cities-waitlist">
                Join city waitlist
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function NotificationsPage() {
  const { user } = useAuth();
  const role: 'customer' | 'companion' = user?.roles.includes('companion') && !user.roles.includes('customer')
    ? 'companion'
    : 'customer';
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications(role);
  const notifs = data ?? [];

  const [filter, setFilter] = useState<'all' | 'booking' | 'safety' | 'payment' | 'platform'>('all');

  const bucket = (kind: string) => {
    if (kind.startsWith('booking') || kind === 'new_message') return 'booking';
    if (kind.includes('safety') || kind === 'checkin' || kind === 'ok') return 'safety';
    if (kind.includes('payout') || kind.includes('payment') || kind.includes('receipt')) return 'payment';
    return 'platform';
  };

  const shown = filter === 'all' ? notifs : notifs.filter((n) => bucket(n.kind) === filter);
  const unreadCount = notifs.filter((n) => !n.read).length;

  const FILTERS: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'booking', label: 'Bookings' },
    { key: 'safety', label: 'Safety' },
    { key: 'payment', label: 'Payments' },
    { key: 'platform', label: 'Platform' },
  ];

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    qc.invalidateQueries({ queryKey: ['notifications', role] });
  };

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
    qc.invalidateQueries({ queryKey: ['notifications', role] });
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Your updates</p>
            <h1 className="mt-2 font-serif text-5xl text-[#48213d]">Notifications</h1>
            {unreadCount > 0 && (
              <p className="mt-2 text-xs text-[#9b858e]">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button type="button"
              onClick={() => { void markAllRead(); }}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#dfd2c9] px-3 text-[10px] font-bold text-[#654c5f] transition hover:border-[#9d557e]"
              data-testid="button-mark-all-read">
              <Check className="h-3 w-3" />Mark all read
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <button key={key} type="button"
              onClick={() => setFilter(key)}
              className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${filter === key ? 'border-[#7f2e62] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] text-[#654c5f] hover:border-[#9d557e]'}`}
              data-testid={`filter-notif-${key}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-[18px]" />)}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
              <Bell className="mx-auto h-7 w-7 text-[#c6aeb8]" />
              <p className="mt-3 font-serif text-xl text-[#48213d]">Nothing here yet.</p>
              <p className="mt-1 text-xs text-[#9b858e]">Booking and safety updates appear here when they happen.</p>
            </div>
          ) : shown.map((n) => {
            const Icon = NOTIF_ICONS[n.kind] ?? Bell;
            return (
              <button key={n.id} type="button"
                onClick={() => { if (!n.read) void markRead(n.id); }}
                className={`flex w-full items-start gap-4 rounded-[18px] border px-5 py-4 text-left transition hover:border-[#9d557e] ${n.read ? 'border-[#dfd2c9] bg-[#fbf7f1]' : 'border-[#d5a8c0] bg-[#fdf5fa]'}`}
                data-testid={`notif-${n.id}`}>
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${n.read ? 'bg-[#ece4db] text-[#9b7a8a]' : 'bg-[#ead0dd] text-[#7f2e62]'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${n.read ? 'text-[#654c5f]' : 'text-[#48213d]'}`}>{n.title}</p>
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-[#7f2e62]" />}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-5 text-[#9b858e]">{n.body}</p>
                </div>
                <span className="shrink-0 font-mono text-[9px] text-[#b0929f]">{timeAgo(n.createdAt)}</span>
              </button>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}

function CityPage() {
  const { city } = useParams<{ city: string }>();
  const cityName = city ? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  const spotsQuery = useListSafeSpots(cityName ? { city: cityName } : undefined, {
    query: { queryKey: getListSafeSpotsQueryKey(cityName ? { city: cityName } : undefined), retry: false },
  });
  const spots = spotsQuery.data ?? [];

  const CITY_DATA: Record<string, { tagline: string; activities: string[] }> = {
    'San Francisco': {
      tagline: 'Art, coffee, and coastline.',
      activities: ['Museum visits', 'Gallery tours', 'Coffee conversations', 'Coastal walks'],
    },
    'New York': {
      tagline: 'The city that never stops surprising.',
      activities: ['Gallery tours', 'Cooking classes', 'Evening walks', 'Museum visits'],
    },
    'Los Angeles': {
      tagline: 'Sunshine, galleries, and rooftop dining.',
      activities: ['Gallery tours', 'Rooftop dining', 'Coastal walks', 'Film & culture tours'],
    },
    'Chicago': {
      tagline: 'Architecture, jazz, and lakeside walks.',
      activities: ['Architecture tours', 'Jazz evenings', 'Lakeside walks', 'Museum visits'],
    },
    'Seattle': {
      tagline: 'Coffee culture and misty bookshops.',
      activities: ['Coffee conversations', 'Bookshop tours', 'Market walks', 'Museum visits'],
    },
    'Austin': {
      tagline: 'Music, tacos, and outdoor adventure.',
      activities: ['Live music evenings', 'Trail walks', 'Food tours', 'Gallery visits'],
    },
    'Denver': {
      tagline: 'Mountain views and gallery districts.',
      activities: ['Gallery tours', 'Hiking & nature walks', 'Coffee conversations', 'Museum visits'],
    },
    'Miami': {
      tagline: 'Art Deco, beaches, and Cuban cuisine.',
      activities: ['Art walks', 'Beachside walks', 'Food & culture tours', 'Gallery visits'],
    },
    'Boston': {
      tagline: 'History, academia, and harbor walks.',
      activities: ['History walks', 'Harbor strolls', 'Museum visits', 'Coffee conversations'],
    },
    'Washington D.C.': {
      tagline: 'Museums, monuments, and diplomatic dining.',
      activities: ['Monument tours', 'Museum visits', 'Diplomatic dining', 'Gallery walks'],
    },
    'Atlanta': {
      tagline: 'Soul food, street art, and Southern charm.',
      activities: ['Food & culture tours', 'Street art walks', 'Museum visits', 'Coffee conversations'],
    },
    'Portland': {
      tagline: 'Farmers markets, trails, and craft coffee.',
      activities: ['Farmers market visits', 'Trail walks', 'Bookshop tours', 'Coffee conversations'],
    },
  };

  const data = CITY_DATA[cityName] ?? {
    tagline: 'Great company, wherever you are.',
    activities: ['Coffee conversations', 'Museum visits', 'Evening walks'],
  };

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[#ddcfc6] bg-[#3d2038] px-5 py-20 lg:px-8">
          <div className="absolute -right-32 -top-32 h-[400px] w-[400px] rounded-full border-[50px] border-white/5" />
          <div className="mx-auto max-w-7xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">City guide</p>
            <h1 className="mt-4 font-serif text-[72px] leading-[.9] text-[#f9efe5]">{cityName || 'Your city.'}</h1>
            <p className="mt-4 max-w-lg text-[17px] leading-7 text-[#d9c4cf]">{data.tagline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/explore?city=${encodeURIComponent(cityName)}`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f9efe5] px-5 text-sm font-bold text-[#48213d] transition hover:bg-white"
                data-testid="link-city-explore">
                Find companions in {cityName} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/safespots"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#5e3458] px-5 text-sm font-bold text-[#f9efe5]"
                data-testid="link-city-safespots">
                <ShieldCheck className="h-4 w-4" />SafeSpots
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr]">
            {/* Left column */}
            <div className="space-y-10">
              {/* Popular activities */}
              <section>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Popular in {cityName}</p>
                <h2 className="mt-2 font-serif text-4xl text-[#48213d]">What people love here.</h2>
                <div className="mt-5 flex flex-wrap gap-2">
                  {data.activities.map((a) => (
                    <Link key={a} href={`/explore?activity=${encodeURIComponent(a)}&city=${encodeURIComponent(cityName)}`}
                      className="flex items-center gap-1.5 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-2 text-sm font-semibold text-[#654c5f] transition hover:border-[#9d557e] hover:text-[#7f2e62]">
                      {a} <ArrowRight className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              </section>

              {/* SafeSpots */}
              <section>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Verified venues</p>
                <h2 className="mt-2 font-serif text-4xl text-[#48213d]">SafeSpots in {cityName}.</h2>
                <div className="mt-5 space-y-3">
                  {spotsQuery.isLoading ? (
                    <div className="skeleton h-16 rounded-[16px]" />
                  ) : spots.length === 0 ? (
                    <div className="rounded-[16px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] px-4 py-6 text-sm text-[#806c76]">
                      No verified SafeSpots listed in {cityName} yet. Check the directory as venues are approved.
                    </div>
                  ) : spots.map((s) => (
                    <Link key={s.id} href={`/safespots/${s.id}`} className="flex items-center gap-3 rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3 hover:border-[#9d557e]">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#e8f0e8] text-[#477254]">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm text-[#48213d]">{s.name}</p>
                        <p className="text-[10px] text-[#9b858e]">{s.addressHint}</p>
                      </div>
                    </Link>
                  ))}
                  <Link href="/safespots" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7f2e62] hover:underline">
                    View all SafeSpots <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </section>
            </div>

            {/* Right column — CTA */}
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-7">
                <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Ready to explore?</p>
                <h3 className="mt-2 font-serif text-3xl text-[#48213d]">Find your companion in {cityName}.</h3>
                <p className="mt-3 text-sm leading-6 text-[#725e69]">Browse approved companions and filter by activity. You can look without an account. Booking requires sign-in.</p>
                <Link href={`/explore?city=${encodeURIComponent(cityName)}`}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white transition hover:bg-[#65234e]"
                  data-testid="link-city-cta">
                  Browse companions <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="rounded-[24px] border border-[#dfd2c9] bg-[#f0e4db] p-7">
                <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Based in {cityName}?</p>
                <h3 className="mt-2 font-serif text-3xl text-[#48213d]">Become a companion.</h3>
                <p className="mt-3 text-sm leading-6 text-[#725e69]">Set your schedule, name your boundaries, and earn 85% of every booking.</p>
                <Link href="/companion/apply"
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#48213d] px-5 text-sm font-bold text-[#f9efe5] transition hover:bg-[#341728]"
                  data-testid="link-city-apply">
                  Apply to join <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function GiftPage() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [giftError, setGiftError] = useState('');
  const AMOUNTS = [50, 75, 100, 150, 200];

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    setGiftError('Gift cards are not live yet. Email hello@onlyfavors.com if you need one for someone.');
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-5xl px-5 py-14 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Left */}
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Give the gift of company</p>
            <h1 className="mt-3 font-serif text-6xl leading-[.9] text-[#48213d]">Gift a<br /><em>favor.</em></h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-[#725e69]">
              Give someone you care about the gift of thoughtful, platonic company. They choose their companion, activity, and time.
            </p>
            <div className="mt-10 space-y-4">
              {[
                { icon: HeartHandshake, title: 'For anyone who could use company', body: 'A parent who likes museums. A friend going through a hard season. Someone who moved to a new city alone.' },
                { icon: ShieldCheck, title: 'Always safe, always clear', body: 'Every companion is verified. Every meeting starts at a SafeSpot. No ambiguity.' },
                { icon: WalletCards, title: 'Recipient chooses everything', body: 'They pick the companion, activity, date, and duration. The gift card covers their total.' },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#48213d]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#806c76]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Right: Gift form */}
          <form onSubmit={handleSend} className="rounded-[26px] border border-[#dfd2c9] bg-[#fbf7f1] p-8 shadow-[0_15px_35px_rgba(88,37,70,.07)]" data-testid="form-gift">
            <h2 className="font-serif text-3xl text-[#48213d]">Send a gift card</h2>
            <p className="mt-1 text-xs text-[#806c76]">We'll email you when gift cards are available.</p>

            <div className="mt-7 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Recipient's email</span>
                <input required type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)}
                  placeholder="friend@example.com"
                  className="h-12 w-full rounded-xl border border-[#cbbab5] bg-white px-4 text-sm outline-none focus:border-[#7f2e62]"
                  data-testid="input-gift-email" />
              </label>

              <div>
                <p className="mb-2 text-xs font-bold text-[#654c5f]">Gift amount</p>
                <div className="flex flex-wrap gap-2">
                  {AMOUNTS.map((a) => (
                    <button key={a} type="button"
                      onClick={() => setAmount(a)}
                      className={`rounded-full border px-4 py-2 font-mono text-sm font-bold transition ${amount === a ? 'border-[#7f2e62] bg-[#7f2e62] text-white' : 'border-[#dfd2c9] text-[#48213d] hover:border-[#9d557e]'}`}
                      data-testid={`button-gift-amount-${a}`}>
                      ${a}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-[#9b858e]">or enter custom:</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#9b858e]">$</span>
                    <input type="number" min={10} max={2000} step={5}
                      placeholder="Custom"
                      onChange={(e) => { const v = Number(e.target.value); if (v >= 10) setAmount(v); }}
                      className="h-9 w-28 rounded-full border border-[#dfd2c9] bg-white pl-6 pr-3 text-sm text-[#48213d] focus:border-[#7f2e62] focus:outline-none"
                      data-testid="input-gift-custom-amount" />
                  </div>
                </div>
                {amount && <p className="mt-2 text-[10px] text-[#9b858e]">Covers approx. {Math.floor(amount / 65)}–{Math.ceil(amount / 55)}h with most companions.</p>}
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Personal note <span className="font-normal text-[#9b858e]">(optional)</span></span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={200}
                  placeholder="Thinking of you. Hope this brings some good company your way."
                  className="w-full resize-none rounded-xl border border-[#cbbab5] bg-white p-3 text-sm leading-6 outline-none focus:border-[#7f2e62]"
                  data-testid="textarea-gift-note" />
                <p className="mt-0.5 text-right text-[9px] text-[#9b858e]">{note.length}/200</p>
              </label>

              {amount && (
                <div className="rounded-xl bg-[#ead0dd] px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#654c5f]">Gift card total</span>
                    <span className="font-serif text-2xl text-[#48213d]">${amount}</span>
                  </div>
                  <p className="mt-0.5 text-[9px] text-[#9b858e]">Charged to your card. Non-refundable once redeemed.</p>
                </div>
              )}

              {giftError && (
                <p className="rounded-xl bg-[#f3ead7] px-4 py-3 text-xs leading-5 text-[#7a5a12]">{giftError}</p>
              )}

              <button type="submit" disabled={!amount || !recipient.trim()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white disabled:opacity-50"
                data-testid="button-send-gift">
                Send ${amount ?? '—'} gift card <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </Shell>
  );
}

function CompanionAchievementsCard({ bookings }: { bookings: Array<{ status: string }> }) {
  const completed = bookings.filter((b) => b.status === 'completed').length;
  const BADGES = [
    { key: 'first', label: 'First favor', icon: Sparkles, earned: completed >= 1, desc: 'Completed your first booking' },
    { key: 'five', label: 'Five-star start', icon: Star, earned: completed >= 5, desc: '5 completed bookings' },
    { key: 'ten', label: 'Experienced', icon: BadgeCheck, earned: completed >= 10, desc: '10 completed bookings' },
    { key: 'twenty', label: 'Established', icon: HeartHandshake, earned: completed >= 20, desc: '20 completed bookings' },
  ];
  const earned = BADGES.filter((b) => b.earned);

  return (
    <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-5" data-testid="achievements-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Achievements</p>
          <p className="mt-0.5 text-[10px] text-[#9b858e]">{earned.length}/{BADGES.length} badges earned</p>
        </div>
        <div className="flex gap-1.5">
          {BADGES.map(({ key, icon: Icon, earned: e }) => (
            <div key={key} title={key}
              className={`grid h-8 w-8 place-items-center rounded-full transition ${e ? 'bg-[#ead0dd] text-[#7f2e62]' : 'bg-[#ece1d9] text-[#c6aeb8]'}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          ))}
        </div>
      </div>
      {earned.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {earned.map(({ key, label, desc }) => (
            <span key={key} title={desc}
              className="rounded-full bg-[#ead0dd] px-2.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#7f2e62]">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanionProfileCompletionCard() {
  const { user } = useAuth();
  const profile = useCompanionProfile();
  const payout = useCompanionPayoutStatus();
  const p = profile.data;
  const qaDone = (p?.interviewAnswers ?? []).some(Boolean);
  const payoutDone = payout.data?.status === 'active';
  const availabilityDone = Boolean(p?.availableDays?.length);

  const steps: { label: string; done: boolean; href?: string }[] = [
    { label: 'Email verified', done: true },
    { label: '18+ confirmed', done: Boolean(user?.ageConfirmed) },
    { label: 'Profile photo', done: Boolean(p?.photoUrl), href: '/dashboard/companion/profile' },
    { label: 'Biography written', done: Boolean(p?.bio?.trim()), href: '/dashboard/companion/profile' },
    { label: 'Activities listed', done: Boolean(p?.activities?.length), href: '/dashboard/companion/profile' },
    { label: 'Q&A interview answered', done: qaDone, href: '/dashboard/companion/profile' },
    { label: 'ID submitted for review', done: Boolean(p?.identityStatus && p.identityStatus !== 'unsubmitted'), href: '/dashboard/companion/profile' },
    { label: 'Identity verified', done: p?.identityStatus === 'verified' },
    { label: 'Listing approved — required to appear in search and accept bookings', done: Boolean(p?.approved) },
    { label: 'Stripe payout connected — required to receive transfers', done: payoutDone, href: '/dashboard/companion/payout' },
    { label: 'Availability set', done: availabilityDone, href: '/dashboard/companion/profile' },
  ];
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  // Find first incomplete step's href for the CTA
  const firstIncomplete = steps.find((s) => !s.done);

  if (pct === 100) return null;

  return (
    <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-5" data-testid="profile-completion-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Profile completion</p>
          <p className="mt-0.5 font-serif text-2xl text-[#48213d]">{pct}%</p>
        </div>
        <div className="h-14 w-14">
          <svg viewBox="0 0 36 36" className="-rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ece1d9" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#7f2e62" strokeWidth="3"
              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {steps.map(({ label, done, href }) => (
          <div key={label} className="flex items-center gap-2.5">
            <div className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${done ? 'bg-[#477254]' : 'border border-[#dfd2c9] bg-white'}`}>
              {done && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            {!done && href ? (
              <Link href={href} className="text-xs font-semibold text-[#48213d] hover:text-[#7f2e62] hover:underline">{label}</Link>
            ) : (
              <span className={`text-xs ${done ? 'text-[#654c5f]' : 'font-semibold text-[#48213d]'}`}>{label}</span>
            )}
          </div>
        ))}
      </div>
      <Link href={firstIncomplete?.href ?? '/dashboard/companion/profile'}
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#7f2e62] px-4 font-mono text-[9px] font-bold uppercase tracking-wider text-white"
        data-testid="link-complete-profile">
        {firstIncomplete?.label === 'Stripe payout connected' ? 'Set up payouts' : 'Complete profile'} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ page  /faq
// ---------------------------------------------------------------------------

const FAQ_DATA = [
  {
    category: 'Getting started',
    items: [
      { q: 'What is OnlyFavors?', a: 'OnlyFavors is a privacy-first platonic companion marketplace. It connects people who want thoughtful company — for a museum visit, dinner, a walk, or conversation — with approved companions who set their own schedule and rate.' },
      { q: 'Is this a dating or escort service?', a: 'No. OnlyFavors is strictly platonic. Every companion and customer agrees to our boundary standards before booking. Requests for romantic or sexual content result in immediate removal from the platform.' },
      { q: 'How do I get started as a customer?', a: 'Browse the companion directory, choose someone whose activities and vibe match yours, pick a date and SafeSpot, and submit a request. A $10 refundable deposit unlocks the chat thread. You pay the full amount only after the companion accepts.' },
      { q: 'How do I become a companion?', a: 'Apply at /companion/apply. A person reviews each application. There is no in-app ID upload or third-party background check yet, and we do not publish a decision SLA.' },
    ],
  },
  {
    category: 'Pricing & payments',
    items: [
      { q: 'How is pricing calculated?', a: 'Companions set their own hourly rate. You pay that rate × the number of hours, plus a 5% safety & service fee. Everything is calculated on our server — your browser never sets amounts. A worked example is on our /pricing page.' },
      { q: 'What is the $10 deposit for?', a: 'The deposit unlocks a private, masked chat thread between you and the companion. It is fully refunded if the companion declines your request, and credited toward your total if they accept. It is not a booking fee.' },
      { q: 'When am I charged?', a: 'Only after the companion accepts. The $10 deposit is taken when you submit a request. The remaining balance is authorized when the companion accepts and captured at booking completion.' },
      { q: 'What is the cancellation policy?', a: 'Unconfirmed requests can be withdrawn any time. After confirmation, cancellation terms are shown before payment is finalized. Full details at /cancellation.' },
    ],
  },
  {
    category: 'Safety & privacy',
    items: [
      { q: 'How are companions verified?', a: 'A person reviews each application before a listing can appear in Explore. That is a human approval, not an automated ID scan or a guaranteed third-party background check.' },
      { q: 'What is a SafeSpot?', a: 'SafeSpots are listed public venues — cafés, hotel lobbies, libraries, museum lobbies — where bookings must begin. Check-in is recorded in the app. The pilot does not train venue staff, run an emergency desk, or offer venue discounts. No home addresses, ever.' },
      { q: 'What is a Boundary Receipt?', a: 'A Boundary Receipt stores activity, SafeSpot, time, transportation, contact, photos, and alcohol expectations. Both people sign the same clauses. Changing time, venue, or activity means a new request so both can sign again.' },
      { q: 'Who can see my booking details?', a: 'You and your companion. Trust & safety can review a reported chat thread. Companions see your first name and booking details — never your phone number, email, or home address. Trust Circle contacts never receive a companion name or live pin.' },
      { q: 'What is the Trust Circle?', a: 'Up to 3 people you choose. If they have an email, they can be told you arrived at the public venue, or that a check-in was missed. SMS is not configured. They never receive booking details, a companion name, or a live pin.' },
    ],
  },
  {
    category: 'For companions',
    items: [
      { q: 'How much do companions earn?', a: 'Companions keep 85% of every booking. OnlyFavors takes a 15% commission for platform operations, verification, and Stripe processing. Payouts go through Stripe Connect on Stripe\'s schedule — typically 2–5 business days after Stripe sends them, not a promised 24-hour window from us.' },
      { q: 'Can I set my own schedule?', a: 'Yes. You control your availability, rate, activities, and the bookings you accept or decline. There are no minimums or shift requirements.' },
      { q: 'What activities am I allowed to offer?', a: 'Any platonic activity in a public setting — coffee, dining, museum visits, gallery tours, walks, cooking classes, and more. Activities involving private settings or physical contact are not permitted.' },
      { q: 'Do I need to pay taxes on my earnings?', a: 'You are responsible for reporting companion income. If Stripe Connect issues a 1099 in your country when thresholds are met, that comes from Stripe — OnlyFavors does not mail a separate 1099 from this dashboard. Consult a tax professional.' },
    ],
  },
];

function FAQPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const allItems = FAQ_DATA.flatMap((s) => s.items.map((item) => ({ ...item, category: s.category })));
  const filtered = search.trim()
    ? allItems.filter((item) => `${item.q} ${item.a} ${item.category}`.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="border-b border-[#ddcfc6] bg-[#f8f1e9] px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Frequently asked</p>
            <h1 className="mt-3 font-serif text-[60px] leading-[.92] text-[#48213d]">Common<br /><em>questions.</em></h1>
            <p className="mt-5 text-[15px] leading-7 text-[#725e69]">Everything about bookings, pricing, safety, and how OnlyFavors works.</p>
            {/* Search */}
            <div className="relative mt-8 max-w-xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b858e]" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="h-12 w-full rounded-full border border-[#dfd2c9] bg-white pl-11 pr-5 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none shadow-sm"
                data-testid="input-faq-search" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
          {/* Search results */}
          {filtered && (
            <>
              <p className="mb-6 font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
              </p>
              {filtered.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
                  <HelpCircle className="mx-auto h-8 w-8 text-[#c6aeb8]" />
                  <p className="mt-4 font-serif text-xl text-[#48213d]">No results found.</p>
                  <p className="mt-2 text-xs text-[#806c76]">Try different keywords or browse the categories below.</p>
                  <button type="button" onClick={() => setSearch('')} className="mt-4 text-xs font-bold text-[#7f2e62] hover:underline">Clear search</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((item) => {
                    const id = item.q;
                    const isOpen = openId === id;
                    return (
                      <div key={id} className="overflow-hidden rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1]">
                        <button type="button" onClick={() => setOpenId(isOpen ? null : id)}
                          className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left hover:bg-[#f5ede6]"
                          data-testid={`faq-question-${id.slice(0, 20).replace(/\W+/g, '-').toLowerCase()}`}>
                          <div>
                            <p className="text-sm font-bold text-[#48213d]">{item.q}</p>
                            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.1em] text-[#9d557e]">{item.category}</p>
                          </div>
                          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-[#9b858e] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOpen && (
                          <div className="border-t border-[#dfd2c9] px-6 py-4">
                            <p className="text-sm leading-7 text-[#654c5f]">{item.a}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Category sections */}
          {!filtered && FAQ_DATA.map((section) => (
            <div key={section.category} className="mb-12">
              <p className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">{section.category}</p>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const id = `${section.category}:${item.q}`;
                  const isOpen = openId === id;
                  return (
                    <div key={id} className="overflow-hidden rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1]"
                      data-testid={`faq-${section.category.toLowerCase().replace(/\W+/g, '-')}-${item.q.slice(0, 12).replace(/\W+/g, '-').toLowerCase()}`}>
                      <button type="button" onClick={() => setOpenId(isOpen ? null : id)}
                        className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left hover:bg-[#f5ede6]">
                        <p className="text-sm font-bold text-[#48213d]">{item.q}</p>
                        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-[#9b858e] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-[#dfd2c9] px-6 py-4">
                          <p className="text-sm leading-7 text-[#654c5f]">{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Bottom CTA */}
          <div className="mt-4 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Still have questions?</p>
            <h2 className="mt-3 font-serif text-3xl text-[#48213d]">We're here to help.</h2>
            <p className="mt-3 text-sm leading-6 text-[#725e69]">Email hello@onlyfavors.com or use the help centre. We do not publish a response-time SLA.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/help" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white">
                Help centre <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/safety/report" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#f0e4db]">
                <ShieldCheck className="h-4 w-4" />Report a concern
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function HowItWorks() {
  const STEPS = [
    {
      num: '01', heading: 'Browse companions', body: 'Search by city, activity, or vibe. Listings appear after a person approves the application.',
      icon: Search, color: 'bg-[#ead0dd] text-[#7f2e62]',
    },
    {
      num: '02', heading: 'Request your time', body: 'Pick an activity, date, SafeSpot, and duration. We show you the server-calculated price before you commit.',
      icon: CalendarDays, color: 'bg-[#e8f0e8] text-[#477254]',
    },
    {
      num: '03', heading: 'Companion accepts', body: 'Your companion reviews and accepts — or declines with a quick note. No auto-confirms. Mutual choice always.',
      icon: HeartHandshake, color: 'bg-[#f3ead7] text-[#bf8750]',
    },
    {
      num: '04', heading: 'Meet at a SafeSpot', body: 'Start at an approved public venue. Record check-in in Favor Mode. Trust Circle SMS is not live yet.',
      icon: MapPin, color: 'bg-[#dce8f5] text-[#2a5280]',
    },
    {
      num: '05', heading: 'Leave a review', body: 'After your time together, leave a review on their profile. Kudos and tips are not live yet.',
      icon: Star, color: 'bg-[#ead0dd] text-[#7f2e62]',
    },
  ];

  const FAQS: [string, string][] = [
    ['Is it really platonic?', 'Yes — always. OnlyFavors does not facilitate romantic, sexual, or quasi-romantic services. Violations result in permanent removal for both parties.'],
    ['How are companions verified?', 'A person reviews each application before a listing can appear. There is no in-app ID upload or third-party background check yet, and no instant approval.'],
    ['What is a SafeSpot?', 'A SafeSpot is an approved public venue listed by our team. First meetings should start there. Check-in is recorded in Favor Mode; Trust Circle SMS alerts are not live yet.'],
    ['How does pricing work?', 'Companions set their hourly rate. We add a 5% service fee to the customer total and retain a 15% platform commission from the companion payout. All math is calculated server-side — never by your browser.'],
    ['What if I need to cancel?', 'You can cancel in the app. That marks the booking cancelled. Stripe refunds are not automatic. Email hello@onlyfavors.com if a deposit needs to be returned.'],
    ['What is the $10 deposit?', 'A refundable $10 deposit unlocks the chat between you and your companion before the full booking is confirmed. If the booking goes ahead, the deposit is credited toward your total. If it does not, it is returned in full.'],
    ['Is my information private?', 'Your last name, phone number, exact location, and billing details are never shared with companions or other users. Companions only see your first name and city until a booking is confirmed. We use Stripe for payments and store no card data ourselves.'],
    ['Can I specify activities in advance?', 'Yes — you choose the activity when you make your request. If you want something not listed, describe it in the booking message and your companion can confirm or suggest an alternative.'],
    ['Who should become a companion?', 'People who are genuinely good at being present — whether that means leading a great walk, finding a good restaurant, or just being easy to talk to. You set your own hours, rate, and the activities you offer.'],
    ['What cities are you in?', 'OnlyFavors is currently active in 47 cities across the US, with a presence in San Francisco, New York, Los Angeles, Chicago, Seattle, Austin, Denver, Miami, Boston, Washington D.C., Atlanta, and Portland. New cities are added regularly.'],
  ];

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <Shell>
      <main className="page-enter">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">How OnlyFavors works</p>
          <h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#48213d]">Five steps to<br /><em>good company.</em></h1>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-7 text-[#725e69]">
            Every booking is mutual. Every companion is verified. Every meeting starts somewhere safe. Here is exactly how it works.
          </p>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-5xl px-5 pb-16 lg:px-8">
          <div className="relative">
            <div className="absolute left-[18px] top-6 h-full w-px bg-[#dfd2c9] lg:left-1/2" />
            <div className="space-y-10">
              {STEPS.map(({ num, heading, body, icon: Icon, color }, i) => (
                <div key={num} className={`flex gap-6 lg:gap-10 ${i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}>
                  <div className="relative flex flex-col items-center lg:w-1/2 lg:items-end lg:pr-10">
                    <div className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {i < STEPS.length - 1 && <div className="flex-1 w-px bg-[#dfd2c9] lg:hidden" />}
                  </div>
                  <div className={`flex-1 pb-2 lg:w-1/2 ${i % 2 === 0 ? 'lg:pl-10' : 'lg:pr-10'}`}>
                    <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9b858e]">Step {num}</p>
                    <h2 className="mt-1 font-serif text-3xl text-[#48213d]">{heading}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#725e69]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-5 pb-20 lg:px-8">
          <p className="mb-8 font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Common questions</p>
          <div className="space-y-2">
            {FAQS.map(([q, a], i) => (
              <div key={q} className="rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] overflow-hidden">
                <button type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                  data-testid={`faq-${i}`}>
                  <span className="text-sm font-semibold text-[#48213d]">{q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#9b858e] transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="border-t border-[#ece1d9] px-5 pb-5 pt-4">
                    <p className="text-sm leading-6 text-[#725e69]">{a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-5 pb-20 lg:px-8">
          <div className="rounded-[28px] bg-[#3d2038] px-8 py-12 text-center text-[#f9efe5] md:px-16">
            <h2 className="font-serif text-5xl">Ready to find good company?</h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#dbc3cf]">Browse approved companions in your city. No account required to look.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/explore" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#f7e9de] px-6 text-sm font-bold text-[#48213d] transition hover:bg-white" data-testid="link-hiw-explore">
                Find a companion <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/companion/apply" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#7f5080] px-6 text-sm font-bold text-[#f9efe5] transition hover:border-[#c695ae]" data-testid="link-hiw-apply">
                Become a companion
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function Refer() {
  const { user } = useAuth();
  const REF_CODE = user ? `OF-${user.id.replace(/-/g, '').slice(0, 6).toUpperCase()}` : '';
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  const referLink = user && REF_CODE && typeof window !== 'undefined' ? `${window.location.origin}/?ref=${REF_CODE}` : '';

  const copyLink = () => {
    if (!referLink) return;
    navigator.clipboard.writeText(referLink).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const sendInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !referLink) return;
    const subject = encodeURIComponent('Join me on OnlyFavors');
    const body = encodeURIComponent(`Good company, platonic favors. Try OnlyFavors: ${referLink}`);
    window.location.href = `mailto:${encodeURIComponent(emailInput.trim())}?subject=${subject}&body=${body}`;
  };

  const PERKS = [
    { icon: WalletCards, title: 'Credits when we launch', body: 'Referral credits will apply after your friend completes their first favor. We will not invent a balance before then.' },
    { icon: HeartHandshake, title: 'A welcome for them', body: 'Friends who join through your link will get the same platonic marketplace you use.' },
    { icon: ShieldCheck, title: 'Always platonic', body: 'Your invite is for vetted OnlyFavors bookings — public places, clear boundaries.' },
  ];

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-4xl px-5 py-14 lg:px-8 lg:py-20">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Give a favor, get a favor</p>
        <h1 className="mt-3 font-serif text-6xl leading-[.9] text-[#48213d]">Refer a friend.</h1>
        <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#725e69]">
          Good company deserves to spread. Share OnlyFavors with someone who could use thoughtful, platonic company — you both benefit.
        </p>

        {/* Perks */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[20px] bg-[#ead0dd] p-6">
              <Icon className="h-5 w-5 text-[#7f2e62]" />
              <p className="mt-4 font-serif text-xl text-[#48213d]">{title}</p>
              <p className="mt-2 text-xs leading-5 text-[#725e69]">{body}</p>
            </div>
          ))}
        </div>

        {/* Your code */}
        <div className="mt-10 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Your referral code</p>
          {user && REF_CODE ? (
            <>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="font-mono text-4xl font-bold tracking-widest text-[#48213d]" data-testid="ref-code">{REF_CODE}</span>
            <button type="button" onClick={copyLink}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white transition hover:bg-[#65234e]"
              data-testid="button-copy-ref-link">
              {copied ? <><Check className="h-4 w-4" />Copied!</> : <><Share2 className="h-4 w-4" />Copy invite link</>}
            </button>
          </div>
          <p className="mt-3 break-all font-mono text-[10px] text-[#9b858e]">{referLink}</p>
            </>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-[#725e69]">Sign in to get a personal invite link.</p>
              <Link href="/login" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white">
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>

        {/* Email invite */}
        <div className="mt-6 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Invite by email</p>
          <p className="mt-1 text-xs text-[#806c76]">Opens your email app with a short note — we don't send mail on your behalf yet.</p>
          <form onSubmit={sendInvite} className="mt-4 flex gap-3">
            <input type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
              placeholder="friend@example.com"
              disabled={!referLink}
              className="h-11 flex-1 rounded-full border border-[#cbbab5] bg-white px-4 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#7f2e62] focus:outline-none disabled:opacity-50"
              data-testid="input-invite-email" />
            <button type="submit" disabled={!referLink}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white disabled:opacity-50"
              data-testid="button-send-invite">
              Open email
            </button>
          </form>
        </div>

        {referLink && (
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I use OnlyFavors for thoughtful, platonic company: ${referLink}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#48213d] hover:border-[#9d557e] hover:text-[#7f2e62]"
            data-testid="link-share-x">
            <span className="font-bold">𝕏</span>Share on X
          </a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referLink)}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#48213d] hover:border-[#9d557e] hover:text-[#7f2e62]"
            data-testid="link-share-linkedin">
            <span className="font-bold text-[#0077b5]">in</span>Share on LinkedIn
          </a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Good company, platonic favors. Try OnlyFavors: ${referLink}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#48213d] hover:border-[#9d557e] hover:text-[#7f2e62]"
            data-testid="link-share-whatsapp">
            <span className="font-bold text-[#25d366]">w</span>WhatsApp
          </a>
        </div>
        )}

        <div className="mt-6 rounded-[24px] bg-[#3d2038] p-6 text-[#f9efe5]" data-testid="referral-milestone-tracker">
          <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c695ae]">Referral rewards</p>
          <p className="mt-4 font-serif text-2xl">Coming with your first credited booking.</p>
          <p className="mt-2 text-sm leading-6 text-[#d3b6c4]">
            Share the invite now. Credits and milestone rewards will apply once the referral program is live — we won't show invented counts in the meantime.
          </p>
        </div>

        {/* Terms note */}
        <p className="mt-6 text-[10px] text-[#9b858e]">
          Credits are applied after your referred friend completes their first booking. One referral credit per account per month. Credits cannot be combined with other promotions.
        </p>
      </main>
    </Shell>
  );
}

function AccessibilityPage() {
  const COMMITMENTS = [
    { icon: Eye, label: 'Perceivable', body: 'All non-text content has text alternatives. Color is never the only way we convey information. Text can be resized up to 200% without loss of content.' },
    { icon: KeyRound, label: 'Operable', body: 'All functionality is available from a keyboard. No content flashes more than three times per second. Skip navigation links are provided.' },
    { icon: MessageSquare, label: 'Understandable', body: 'Pages are written in plain language. Labels and instructions are provided for all inputs. Error messages clearly explain what went wrong.' },
    { icon: ShieldCheck, label: 'Robust', body: 'Our interface is built with semantic HTML and tested with screen readers. We follow WCAG 2.1 AA guidelines as our baseline.' },
  ];

  const FEATURES = [
    'Keyboard navigable throughout, including companion cards and modals',
    'Full Cmd+K command palette for keyboard-first navigation',
    'Screen reader–friendly ARIA labels on all interactive elements',
    'High-contrast mode honored via prefers-contrast media query',
    'Reduced motion honored via prefers-reduced-motion media query',
    'All form fields have associated labels and error descriptions',
    'Focus indicators visible on all interactive elements',
    'Alt text on all meaningful images and icons',
    'Session timeout warnings with easy extension options',
    'Companion profiles readable without any color differentiation',
  ];

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-4xl px-5 py-14 lg:px-8 lg:py-20">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Inclusive by design</p>
        <h1 className="mt-4 max-w-2xl font-serif text-6xl leading-[.9] text-[#48213d]">Accessibility statement</h1>
        <p className="mt-6 max-w-xl text-[15px] leading-7 text-[#725e69]">
          OnlyFavors is committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience and apply relevant accessibility standards.
        </p>

        {/* WCAG commitments */}
        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {COMMITMENTS.map(({ icon: Icon, label, body }) => (
            <div key={label} className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ead0dd]">
                <Icon className="h-5 w-5 text-[#7f2e62]" />
              </div>
              <h3 className="mt-5 font-serif text-xl text-[#48213d]">{label}</h3>
              <p className="mt-2 text-xs leading-5 text-[#725e69]">{body}</p>
            </div>
          ))}
        </div>

        {/* Feature list */}
        <section className="mt-14">
          <h2 className="font-serif text-3xl text-[#48213d]">What we've built in</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3 text-xs leading-5 text-[#654c5f]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Conformance */}
        <section className="mt-12 rounded-[22px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-10">
          <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c695ae]">Conformance status</p>
          <h2 className="mt-3 font-serif text-3xl">WCAG 2.1 Level AA</h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-[#d9c4cf]">
            We target WCAG 2.1 AA conformance. Some areas are still being improved. We conduct regular audits and prioritise accessibility fixes alongside new features.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[['Last reviewed', 'August 2026'], ['Standard', 'WCAG 2.1 AA'], ['Status', 'Partially conformant']].map(([k, v]) => (
              <div key={k} className="rounded-[14px] bg-[#4a2842] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#c695ae]">{k}</p>
                <p className="mt-1 text-sm font-semibold text-[#f9efe5]">{v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="mt-10 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
          <h2 className="font-serif text-2xl text-[#48213d]">Feedback & contact</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#725e69]">
            We welcome your feedback on the accessibility of OnlyFavors. If you experience any barriers, please contact us and we'll respond within 2 business days.
          </p>
          <a href="mailto:accessibility@onlyfavors.com"
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white hover:bg-[#65234e]"
            data-testid="link-accessibility-email">
            accessibility@onlyfavors.com
          </a>
        </section>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Membership page  /membership
// ---------------------------------------------------------------------------

function MembershipPage() {
  return (
    <Shell>
      <main className="page-enter">
        <section className="border-b border-[#ddcfc6] bg-[#efe1dc] px-5 py-20 text-center lg:px-8">
          <p className="mx-auto font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8e4b75]">Your membership</p>
          <h1 className="mx-auto mt-4 max-w-2xl font-serif text-[62px] leading-[.9] text-[#48213d]">Chat is not a $99 product.</h1>
          <p className="mx-auto mt-6 max-w-lg text-[16px] leading-7 text-[#654c5f]">
            Browse and apply for free. A structured Favor Request is free. Masked chat opens after a $10 deposit on a real booking — credited to the total. Trust Circle, Boundary Receipt, and Help me leave stay free. There is no Plus checkout.
          </p>
        </section>
        <section className="mx-auto grid max-w-5xl gap-5 px-5 py-14 lg:grid-cols-2 lg:px-8">
          <div className="rounded-[26px] border border-[#dfd2c9] bg-[#f0e4db] p-8" data-testid="tier-explorer">
            <span className="rounded-full bg-[#ead0dd] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#7f2e62]">Live now</span>
            <div className="mt-6">
              <span className="font-serif text-5xl leading-none text-[#654c5f]">Free</span>
              <span className="ml-2 text-xs text-[#654c5f]/60">No subscription</span>
            </div>
            <ul className="mt-8 space-y-3 text-xs leading-5 text-[#654c5f]/85">
              <li className="flex items-start gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" /> Signup, browse, and companion application</li>
              <li className="flex items-start gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" /> Structured request — activity, time, venue, attire, access</li>
              <li className="flex items-start gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" /> $10 deposit unlocks masked chat (credited)</li>
              <li className="flex items-start gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" /> Trust Circle, Boundary Receipt, Help me leave</li>
              <li className="flex items-start gap-2.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" /> 5% customer fee + 15% companion commission on completed bookings</li>
            </ul>
            <Link href="/explore" className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-[#ead0dd] text-sm font-bold text-[#654c5f]" data-testid="cta-explorer">
              Browse companions <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-[26px] border border-[#dfd2c9] bg-[#fbf7f1] p-8" data-testid="tier-paid">
            <span className="rounded-full bg-[#bf8750] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-white">Later</span>
            <div className="mt-6">
              <span className="font-serif text-5xl leading-none text-[#48213d]">Plus</span>
              <span className="ml-2 text-xs text-[#654c5f]/60">$99 / year — not billed</span>
            </div>
            <p className="mt-8 text-sm leading-6 text-[#725e69]">
              A later optional membership could waive the 5% customer fee and add concierge-style extras. It will not unlock chat, phone numbers, Trust Circle, or emergency tools. Those stay on the free path. There is no checkout for Plus today.
            </p>
            <a href="mailto:hello@onlyfavors.com?subject=OnlyFavors%20Plus" className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#3d2038] text-sm font-bold text-white" data-testid="cta-membership-waitlist">
              Ask about Plus later <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-5 pb-14 lg:px-8">
          <h2 className="font-serif text-4xl text-[#48213d]">Membership questions</h2>
          <div className="mt-8 space-y-4">
            {[
              { q: 'Do I need Plus to chat?', a: 'No. Send a structured request for free. A $10 refundable deposit on that booking opens masked chat. We do not sell phone numbers or charge $99 to message.' },
              { q: 'Can I buy Plus today?', a: 'No. There is no membership checkout. Browse, book, and safety tools use the free path.' },
              { q: 'Does Plus change companion pay?', a: 'When it exists, Plus must not change the 15% companion commission. A sketched perk is waiving the customer 5% fee — not taking more from companions, and not gating safety.' },
            ].map(({ q, a }) => (
              <details key={q} className="group rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1]">
                <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 text-sm font-bold text-[#48213d] marker:content-none">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#9b858e] transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-[#ece1d9] px-5 pb-5 pt-4 text-sm leading-6 text-[#725e69]">{a}</div>
              </details>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  );
}

function About() {
  return (
    <Shell>
      <main className="page-enter mx-auto max-w-5xl px-5 py-16 lg:px-8">
        <div className="mb-16">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Our story</p>
          <h1 className="mt-3 max-w-2xl font-serif text-6xl leading-none text-[#48213d]">
            Built for people who<br /><em>want good company.</em>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#654c5f]">
            OnlyFavors started with a simple observation: loneliness is widespread, and the ways most people have to address it are either awkward, expensive, or both. We built a quieter alternative.
          </p>
        </div>

        <div className="grid gap-10 border-t border-[#dfd2c9] pt-12 md:grid-cols-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Our mission</p>
            <h2 className="mt-4 font-serif text-4xl text-[#48213d]">Connection, without the complexity.</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#654c5f]">
              We believe meaningful time together shouldn't require a perfect social network, an unlimited calendar, or an excuse. OnlyFavors makes it simple, safe, and dignified to say "I'd like some company today."
            </p>
          </div>
          <div className="space-y-4">
            {[
              { icon: ShieldCheck, title: 'Safety by design', body: 'A person approves each companion listing. Meetings start at a public SafeSpot. Boundaries are documented before anyone books.' },
              { icon: EyeOff, title: 'Privacy first', body: 'Companions appear as service-area circles, never live pins. Phone numbers and emails are stripped from all messages.' },
              { icon: Star, title: 'Genuine quality', body: 'We review every companion application personally. Ratings come from real bookings. No fake profiles, no hidden reviews.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#7f2e62]" />
                <div>
                  <p className="text-sm font-bold text-[#48213d]">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#725e69]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 rounded-[28px] bg-[#48213d] p-10 md:p-14">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#d4a0bd]">What we believe</p>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              { n: '01', title: 'Dignity over optics', body: "No one should have to explain why they want company. We don't ask, and we don't judge." },
              { n: '02', title: 'Consent at every step', body: 'Boundary receipts, clear pricing, and mutual opt-in before anything is confirmed.' },
              { n: '03', title: 'Companions as professionals', body: 'Companions set their own rates, keep 85% of every booking, and are treated as the skilled people they are.' },
            ].map(({ n, title, body }) => (
              <div key={n}>
                <p className="font-mono text-[10px] text-[#c695ae]">{n}</p>
                <h3 className="mt-3 font-serif text-2xl text-[#f9efe5]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#c4a5b5]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Team section */}
        <div className="mt-16 border-t border-[#dfd2c9] pt-12">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">The team</p>
          <h2 className="mt-3 font-serif text-4xl text-[#48213d]">Built by people who care about this.</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#654c5f]">We're a small, distributed team — engineers, designers, and trust & safety specialists who are drawn to hard problems with human stakes. Hiring thoughtfully, always.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { initials: 'AL', name: 'Alicia L.', role: 'CEO & Co-founder', color: 'bg-[#ead0dd] text-[#7f2e62]' },
              { initials: 'MK', name: 'Marcus K.', role: 'CTO', color: 'bg-[#d3e1d8] text-[#31533f]' },
              { initials: 'DP', name: 'Diana P.', role: 'Head of Trust & Safety', color: 'bg-[#f3ead7] text-[#7a5a12]' },
              { initials: 'JT', name: 'James T.', role: 'Head of Design', color: 'bg-[#dce8f5] text-[#2a5280]' },
            ].map(({ initials, name, role, color }) => (
              <div key={name} className="flex flex-col items-center gap-3 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 text-center">
                <div className={`grid h-12 w-12 place-items-center rounded-full font-serif text-lg font-bold ${color}`}>{initials}</div>
                <div>
                  <p className="text-sm font-bold text-[#48213d]">{name}</p>
                  <p className="mt-0.5 text-xs text-[#9b858e]">{role}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/careers" className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-[#7f2e62] hover:underline" data-testid="link-about-careers">
            See open roles <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link href="/explore" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white" data-testid="link-about-explore">
            Browse companions <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/companion/apply" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#dfd2c9] px-6 text-sm font-bold text-[#654c5f] hover:bg-[#f0e4db]" data-testid="link-about-apply">
            Become a companion
          </Link>
          <Link href="/community" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#dfd2c9] px-6 text-sm font-bold text-[#654c5f] hover:bg-[#f0e4db]" data-testid="link-about-community">
            Community stories
          </Link>
        </div>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Help / FAQ page
// ---------------------------------------------------------------------------

type HelpSectionDef = { title: string; icon: React.ElementType; items: { q: string; a: string }[] };

function Help() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const sections: HelpSectionDef[] = [
    { title: 'Booking', icon: CalendarDays, items: [
      { q: 'How do I book a companion?', a: "Browse the directory, open a companion's profile, and click \"Plan time with [name].\" Choose an activity, date, duration, and a public SafeSpot. The companion reviews and accepts before anything is charged." },
      { q: 'What is a SafeSpot?', a: "SafeSpots are verified, well-lit public venues — coffee shops, museums, hotel lobbies — that OnlyFavors has vetted for companion meetups. Every booking must start at a SafeSpot." },
      { q: 'Can I book same-day?', a: "If a companion is available and accepts, yes. Instant book is a profile flag, not a guaranteed same-day confirmation. There is no published companion reply SLA." },
      { q: 'What happens if the companion declines?', a: "The booking is declined. A Stripe deposit is not refunded by that action automatically. Email hello@onlyfavors.com if a refund is needed." },
    ]},
    { title: 'Payments', icon: WalletCards, items: [
      { q: 'What does the $10 deposit cover?', a: "The deposit unlocks the private, masked chat thread so you can discuss details. It is credited toward your total when the companion accepts — or fully refunded if they decline." },
      { q: 'When am I charged the full amount?', a: "The full amount is authorised when the companion accepts. The hold is captured at booking completion, not before." },
      { q: 'What is the 5% service fee?', a: "It is a platform fee on the customer total, shown before you pay. It is not a promise of insurance coverage or 24/7 staffing." },
      { q: 'How do refunds work?', a: "Cancel in the app to mark a booking cancelled. Stripe refunds are not automatic. Email hello@onlyfavors.com for deposit returns." },
    ]},
    { title: 'Safety', icon: ShieldCheck, items: [
      { q: 'How are companions verified?', a: "A person reviews each application before a listing can appear. There is no in-app government-ID upload or third-party background check yet. Location is shown as a service-area circle — never a home address." },
      { q: 'What is a Boundary Receipt?', a: "Both people sign the same stored clauses — activity, SafeSpot, time, transportation, contact, photos, and alcohol. Changing those details means a new request." },
      { q: 'What is the Trust Circle?', a: "Up to 3 contacts. If they have an email, they can be told you arrived at the public venue or that a check-in was missed. SMS is not configured. They never receive a companion name or live pin." },
      { q: 'What if I feel unsafe during a booking?', a: 'If you are in danger, call local emergency services first. Favor Mode can alert your Trust Circle. Email hello@onlyfavors.com for platform concerns — we do not staff a 24/7 hotline.' },
    ]},
    { title: 'For companions', icon: UsersRound, items: [
      { q: 'How do I apply to become a companion?', a: "Visit \"Become a companion\" and complete the application. A person reviews it. There is no published 3–5 day SLA." },
      { q: 'How much do companions earn?', a: "Companions keep 85% of every booking. You set your own hourly rate; OnlyFavors takes a 15% commission for verification, payments, and platform operations." },
      { q: 'How do payouts work?', a: "Payouts go to your bank via Stripe Connect after you finish onboarding. Timing follows Stripe, typically 2–5 business days after Stripe sends the transfer — not a guaranteed 24 hours from booking completion." },
      { q: 'Can I control my availability and activities?', a: "Yes — your profile, rates, activities, languages, and boundaries are all under your control. Update anytime from your Companion Workspace → Edit Profile." },
    ]},
  ];

  const q = search.trim().toLowerCase();
  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !q || item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      ),
    }))
    .filter((section) => section.items.length > 0);
  const totalResults = filteredSections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Support</p>
        <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Help centre</h1>
        <p className="mt-4 text-sm leading-6 text-[#725e69]">Everything you need to know about using OnlyFavors.</p>

        {/* Search */}
        <div className="relative mt-8">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b09aa8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpenId(null); }}
            placeholder="Search help articles…"
            className="h-12 w-full rounded-full border border-[#dfd2c9] bg-[#fbf7f1] pl-11 pr-4 text-sm text-[#48213d] placeholder:text-[#b09aa8] focus:border-[#9d557e] focus:outline-none"
            data-testid="input-help-search"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9b858e] hover:text-[#48213d]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {q && (
          <p className="mt-3 text-[11px] text-[#9b858e]">
            {totalResults === 0 ? 'No results' : `${totalResults} result${totalResults === 1 ? '' : 's'}`} for "{search}"
          </p>
        )}

        {totalResults === 0 && q ? (
          <div className="mt-10 rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
            <Search className="mx-auto h-7 w-7 text-[#c6aeb8]" />
            <p className="mt-3 font-serif text-xl text-[#48213d]">No articles match that search.</p>
            <p className="mt-1 text-xs text-[#806c76]">Try a different term, or <button type="button" onClick={() => setSearch('')} className="font-bold text-[#7f2e62] underline">clear the search</button>.</p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {filteredSections.map((section) => (
              <div key={section.title}>
                <div className="mb-4 flex items-center gap-3">
                  <section.icon className="h-5 w-5 text-[#7f2e62]" />
                  <h2 className="font-serif text-2xl text-[#48213d]">{section.title}</h2>
                </div>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const id = `${section.title}-${item.q}`;
                    const isOpen = openId === id || Boolean(q);
                    return (
                      <div key={id} className="overflow-hidden rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1]">
                        <button type="button" onClick={() => setOpenId(isOpen && !q ? null : id)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                          data-testid={`help-q-${id.replace(/\W+/g, '-').toLowerCase().slice(0, 40)}`}>
                          <span className="text-sm font-semibold text-[#48213d]">{item.q}</span>
                          {!q && <ChevronDown className={`h-4 w-4 shrink-0 text-[#9b858e] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />}
                        </button>
                        {isOpen && (
                          <div className="border-t border-[#ece1d9] px-5 py-4 text-sm leading-6 text-[#654c5f]">{item.a}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAQ crosslink */}
        <div className="mt-10 flex items-center gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
            <HelpCircle className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#48213d]">Looking for detailed answers?</p>
            <p className="text-[10px] text-[#806c76]">Our full FAQ covers pricing, safety, cancellations, payouts, and more.</p>
          </div>
          <Link href="/faq" className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#7f2e62] px-4 font-mono text-[9px] font-bold uppercase tracking-wider text-white transition hover:bg-[#6a2451]" data-testid="link-help-to-faq">
            View FAQ <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Contact form */}
        {(() => {
          const [subject, setSubject_] = useState('');
          const [message, setMessage_] = useState('');
          return (
            <div className="mt-6 rounded-[22px] bg-[#d9e1d7] p-8">
              <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#477254]">Still have questions?</p>
              <h3 className="mt-3 font-serif text-3xl text-[#31533f]">We're here.</h3>
              <p className="mt-3 text-sm leading-6 text-[#53725d]">This opens your email app to hello@onlyfavors.com. We do not publish a response-time SLA.</p>
              <form onSubmit={(e) => {
                e.preventDefault();
                const mailto = `mailto:hello@onlyfavors.com?subject=${encodeURIComponent(subject || 'Help request')}&body=${encodeURIComponent(message)}`;
                window.location.href = mailto;
              }} className="mt-6 space-y-3">
                  <select value={subject} onChange={(e) => setSubject_(e.target.value)} required
                    className="h-11 w-full rounded-xl border border-[#a9c9af] bg-white px-4 text-sm text-[#31533f] focus:border-[#477254] focus:outline-none"
                    data-testid="select-help-subject">
                    <option value="">Topic…</option>
                    {['Booking question', 'Payment or refund', 'Safety concern', 'Companion application', 'Account or profile', 'Other'].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <textarea value={message} onChange={(e) => setMessage_(e.target.value)} required rows={4}
                    placeholder="Tell us what's on your mind…"
                    className="w-full resize-none rounded-xl border border-[#a9c9af] bg-white p-3 text-sm leading-6 text-[#31533f] placeholder:text-[#7a9e84] focus:border-[#477254] focus:outline-none"
                    data-testid="textarea-help-message" />
                  <button type="submit" disabled={!subject || !message.trim()}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[#31533f] px-5 text-sm font-bold text-white transition hover:bg-[#254030] disabled:opacity-40"
                    data-testid="button-help-send">
                    <Send className="h-3.5 w-3.5" />Send message
                  </button>
                </form>
            </div>
          );
        })()}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Customer settings page
// ---------------------------------------------------------------------------

type CustomerPrefs = {
  displayName: string;
  emailBookingUpdates: boolean;
  emailNewsletter: boolean;
  showSavedCount: boolean;
};

function VerificationChecklist() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['account-verification'],
    queryFn: async () => {
      const res = await fetch('/api/account/verification', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load verification');
      return res.json() as Promise<{
        emailVerified: boolean;
        ageConfirmed: boolean;
        canBook: boolean;
        companion: null | {
          applicationStatus: string;
          identityStatus: string;
          approved: boolean;
          payoutReady: boolean;
          canPublish: boolean;
          canEarn: boolean;
        };
      }>;
    },
    enabled: Boolean(user),
    retry: false,
  });
  const data = query.data;
  const rows = [
    { label: 'Email verified — save profiles', done: Boolean(data?.emailVerified) },
    { label: '18+ confirmed — book and pay', done: Boolean(data?.ageConfirmed) },
    { label: 'Can send Favor Requests', done: Boolean(data?.canBook) },
  ];
  if (data?.companion) {
    rows.push(
      { label: 'Companion application submitted', done: data.companion.applicationStatus !== 'none' && data.companion.applicationStatus !== 'draft' },
      { label: 'Identity verified', done: data.companion.identityStatus === 'verified' },
      { label: 'Listing approved — appear in search and accept bookings', done: data.companion.approved },
      { label: 'Payout connected — receive transfers', done: data.companion.payoutReady },
    );
  }
  return (
    <section className="mt-10">
      <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Verification</h2>
      <div className="mt-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
        <p className="text-sm font-bold text-[#48213d]">Pilot checklist</p>
        <p className="mt-1 text-xs text-[#806c76]">Phone verification, MFA, and staff-only work accounts are not in this pilot.</p>
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2 text-xs text-[#654c5f]">
              <span className={`grid h-4 w-4 place-items-center rounded-full ${row.done ? 'bg-[#477254] text-white' : 'border border-[#dfd2c9]'}`}>
                {row.done ? <Check className="h-2.5 w-2.5" /> : null}
              </span>
              {row.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BlockedAccountsCard() {
  const query = useQuery({
    queryKey: ['account-blocks'],
    queryFn: async () => {
      const res = await fetch('/api/blocks', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json() as Promise<{ blockedId: string; displayName: string }[]>;
    },
    retry: false,
  });
  const qc = useQueryClient();
  const rows = query.data ?? [];
  return (
    <section className="mt-8">
      <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Blocked accounts</h2>
      <div className="mt-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
        {rows.length === 0 ? (
          <p className="text-xs text-[#806c76]">You have not blocked anyone. Block from a companion profile.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.blockedId} className="flex items-center justify-between gap-3 text-sm text-[#48213d]">
                <span>{row.displayName}</span>
                <button type="button"
                  onClick={async () => {
                    await fetch(`/api/blocks/${row.blockedId}`, { method: 'DELETE', credentials: 'include' });
                    qc.invalidateQueries({ queryKey: ['account-blocks'] });
                  }}
                  className="text-xs font-bold text-[#7f2e62]">
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ReferralCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={() => { navigator.clipboard.writeText(`https://onlyfavors.com/join?ref=${code}`).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[9px] font-bold uppercase tracking-wider transition ${copied ? 'border-[#477254] bg-[#e8f0e8] text-[#477254]' : 'border-[#dfd2c9] text-[#654c5f] hover:border-[#9d557e]'}`}
      data-testid="button-copy-referral-code">
      {copied ? <><Check className="h-2.5 w-2.5" />Copied!</> : <><Share2 className="h-2.5 w-2.5" />{code}</>}
    </button>
  );
}

function CustomerSettings() {
  const { user, refresh, logout } = useAuth();
  const [prefs, setPrefs] = useState<CustomerPrefs>({ displayName: '', emailBookingUpdates: true, emailNewsletter: false, showSavedCount: true });
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetch('/api/account/settings', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setPrefs({
          displayName: d.displayName ?? user?.displayName ?? '',
          emailBookingUpdates: d.emailBookingUpdates !== false,
          emailNewsletter: Boolean(d.emailNewsletter),
          showSavedCount: d.showSavedCount !== false,
        });
      })
      .catch(() => {});
  }, [user?.displayName]);

  const save = async () => {
    const res = await fetch('/api/account/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (res.ok) {
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const toggle = (key: keyof Omit<CustomerPrefs, 'displayName'>) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-10 lg:px-8 lg:py-16">
        <Link href="/dashboard/customer" className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-settings-back">
          <ArrowLeft className="h-4 w-4" />Back to workspace
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Your account</p>
        <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Settings</h1>

        {/* Profile */}
        <section className="mt-10">
          <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Profile</h2>
          <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-[#48213d]">Display name</span>
              <input
                type="text"
                value={prefs.displayName}
                onChange={(e) => setPrefs((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="How should we greet you?"
                maxLength={40}
                className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-white px-4 text-sm text-[#48213d] outline-none placeholder:text-[#b0929f] focus:border-[#7f2e62]"
                data-testid="input-display-name"
              />
            </label>
            <p className="mt-2 text-[10px] text-[#9b858e]">Only shown to companions in your confirmed bookings.</p>
          </div>
        </section>

        {/* Notifications */}
        <section className="mt-8">
          <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Notifications</h2>
          <div className="mt-4 space-y-3">
            {([
              { key: 'emailBookingUpdates', label: 'Booking updates', desc: 'Confirmations, companion messages, and status changes.' },
              { key: 'emailNewsletter', label: 'OnlyFavors updates', desc: 'New features, safety tips, and companion highlights. Monthly at most.' },
            ] as const).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5"
                data-testid={`pref-${key}`}>
                <div>
                  <p className="text-sm font-bold text-[#48213d]">{label}</p>
                  <p className="mt-0.5 text-[10px] text-[#806c76]">{desc}</p>
                </div>
                <button type="button" onClick={() => toggle(key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${prefs[key] ? 'bg-[#7f2e62]' : 'bg-[#c6aeb8]'}`}
                  aria-label={`Toggle ${label}`}
                  data-testid={`toggle-${key}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${prefs[key] ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="mt-8">
          <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Privacy</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5"
              data-testid="pref-showSavedCount">
              <div>
                <p className="text-sm font-bold text-[#48213d]">Show saved count in nav</p>
                <p className="mt-0.5 text-[10px] text-[#806c76]">Display the number of saved companions on the heart icon.</p>
              </div>
              <button type="button" onClick={() => toggle('showSavedCount')}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${prefs.showSavedCount ? 'bg-[#7f2e62]' : 'bg-[#c6aeb8]'}`}
                aria-label="Toggle saved count display"
                data-testid="toggle-showSavedCount">
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${prefs.showSavedCount ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <p className="text-sm font-bold text-[#48213d]">Data & privacy</p>
              <p className="mt-1 text-xs leading-5 text-[#806c76]">Your browsing history and saved companions are kept locally in your browser. Booking data is stored securely on our servers. Read our <Link href="/privacy" className="font-bold text-[#7f2e62] hover:underline">privacy policy</Link> for full details.</p>
            </div>
            <div className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <p className="text-sm font-bold text-[#48213d]">Export your data</p>
              <p className="mt-1 text-xs leading-5 text-[#806c76]">
                Downloads a JSON file now: account preferences, saved companion IDs from this browser, and your bookings if you are signed in. Chat messages and Trust Circle contacts are not included.
              </p>
              <button type="button" data-testid="button-export-data"
                onClick={async () => {
                  let bookings: unknown[] = [];
                  try {
                    const res = await fetch('/api/bookings', { credentials: 'include' });
                    if (res.ok) {
                      const body = await res.json();
                      bookings = Array.isArray(body) ? body : [];
                    }
                  } catch { /* file still includes prefs */ }
                  let savedCompanions: unknown[] = [];
                  try { savedCompanions = JSON.parse(localStorage.getItem('of_saved_companions') ?? '[]'); } catch { savedCompanions = []; }
                  const exportData = {
                    exportedAt: new Date().toISOString(),
                    account: { id: user?.id ?? null, displayName: prefs.displayName || user?.displayName || null },
                    preferences: prefs,
                    savedCompanions,
                    bookings,
                    included: ['preferences', 'saved companion ids from this browser', 'bookings for the signed-in account'],
                    notIncluded: ['chat messages', 'Trust Circle contacts', 'payment card details'],
                  };
                  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'onlyfavors-data-export.json'; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f] transition hover:border-[#9d557e] hover:text-[#7f2e62]">
                <FileText className="h-3.5 w-3.5" />Download data export
              </button>
            </div>
          </div>
        </section>

        {/* Credits */}
        <section className="mt-8">
          <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9d557e]">Credits & gifts</h2>
          <div className="mt-4 space-y-3">
            {/* Referral */}
            <div className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#48213d]">Referral credits</p>
                  <p className="mt-0.5 text-[10px] text-[#806c76]">Referral credits are not live yet. Share the code when the program launches.</p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-3xl text-[#48213d]">$0<small className="font-sans text-xs text-[#9b858e]">.00</small></p>
                  <p className="text-[9px] text-[#9b858e]">available</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <ReferralCopyButton code={user ? `OF-${user.id.replace(/-/g, '').slice(0, 6).toUpperCase()}` : 'OF-SIGNIN'} />
                <Link href="/refer" className="inline-flex items-center gap-1 text-xs font-bold text-[#7f2e62] hover:underline" data-testid="link-settings-refer">
                  Referral program (coming later) <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            {/* Gift balance */}
            <div className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#48213d]">Gift card balance</p>
                  <p className="mt-0.5 text-[10px] text-[#806c76]">Gift cards aren't live yet. Redeemed balances will show here.</p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-3xl text-[#48213d]">$0<small className="font-sans text-xs text-[#9b858e]">.00</small></p>
                  <p className="text-[9px] text-[#9b858e]">available</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/redeem" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#ead0dd] px-3 text-xs font-bold text-[#7f2e62] hover:bg-[#d5abc2]" data-testid="link-settings-redeem">
                  <Gift className="h-3.5 w-3.5" />Redeem a gift card
                </Link>
                <Link href="/gift" className="inline-flex items-center gap-1 text-xs font-bold text-[#7f2e62] hover:underline" data-testid="link-settings-gift">
                  Send a gift <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="mt-8 flex items-center gap-3">
          <button type="button" onClick={save}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#65234e]"
            data-testid="button-save-settings">
            {saved ? <><Check className="h-4 w-4" />Saved</> : 'Save preferences'}
          </button>
          {saved && <p className="text-xs text-[#477254]">Your preferences are saved to your account.</p>}
        </div>

        <VerificationChecklist />
        <BlockedAccountsCard />

        {/* Danger zone */}
        <section className="mt-14 border-t border-[#dfd2c9] pt-8">
          <h2 className="font-mono text-[9px] uppercase tracking-[.2em] text-[#a64742]">Account</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <p className="text-sm font-bold text-[#48213d]">Sessions</p>
              <p className="mt-1 text-xs leading-5 text-[#806c76]">Sign out this browser, or end every session at once. A trusted-device list is not in the pilot.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void logout()}
                  className="inline-flex h-9 items-center rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f]">
                  Sign out
                </button>
                <button type="button"
                  onClick={async () => {
                    await fetch('/api/auth/logout-all', { method: 'POST', credentials: 'include' });
                    await logout();
                    window.location.href = '/login';
                  }}
                  className="inline-flex h-9 items-center rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f]"
                  data-testid="button-logout-all">
                  Sign out everywhere
                </button>
              </div>
            </div>
            <div className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <p className="text-sm font-bold text-[#48213d]">Deactivate</p>
              <p className="mt-1 text-xs leading-5 text-[#806c76]">Hides you from new bookings. You can sign in later to reactivate. This does not delete your data.</p>
              <button type="button"
                onClick={async () => {
                  if (!window.confirm('Deactivate your account? You can reactivate by signing in.')) return;
                  const res = await fetch('/api/account/deactivate', { method: 'POST', credentials: 'include' });
                  if (res.ok) await refresh();
                }}
                className="mt-4 inline-flex h-9 items-center rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f]"
                data-testid="button-deactivate">
                Deactivate account
              </button>
            </div>
          <div className="rounded-[18px] border border-[#f0d5d5] bg-[#fdf6f6] p-5">
            <p className="text-sm font-bold text-[#48213d]">Delete my account and data</p>
            <p className="mt-1 text-xs leading-5 text-[#806c76]">Cancels open bookings, ends sessions, and removes account data we can delete. Safety audit rows needed for an active investigation may be retained. This cannot be undone.</p>
            {deleteError && <p className="mt-2 text-xs text-[#a64742]">{deleteError}</p>}
            <button type="button" disabled={deleting}
              onClick={async () => {
                if (!window.confirm('Delete your OnlyFavors account? Open bookings will be cancelled and refunded.')) return;
                setDeleting(true);
                setDeleteError('');
                try {
                  const res = await fetch('/api/account/delete', { method: 'POST', credentials: 'include' });
                  const body = await res.json().catch(() => ({})) as { error?: string };
                  if (!res.ok) throw new Error(body.error ?? 'Could not delete this account');
                  await logout();
                  window.location.href = '/';
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : 'Could not delete this account');
                  setDeleting(false);
                }
              }}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#725e69] transition hover:border-[#a64742] hover:text-[#a64742] disabled:opacity-50"
              data-testid="button-request-delete">
              {deleting ? 'Deleting…' : 'Delete my account and data'}
            </button>
          </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion weekly schedule
// ---------------------------------------------------------------------------

function CompanionSchedule() {
  const { data, isLoading, isError, refetch } = useCompanionBookings();

  // Build a 7-day window starting from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const ACTIVE_STATUSES = new Set(['requested', 'deposit_paid', 'authorized', 'confirmed']);

  const bookingsByDate = useMemo(() => {
    const map = new globalThis.Map<string, BookingDetail[]>();
    (data ?? [])
      .filter((b) => ACTIVE_STATUSES.has(b.status))
      .forEach((b) => {
        const list = map.get(b.date) ?? [];
        list.push(b);
        map.set(b.date, list);
      });
    return map;
  }, [data]);

  const STATUS_DOT: Record<string, string> = {
    confirmed:    'bg-[#477254]',
    deposit_paid: 'bg-[#bf8750]',
    authorized:   'bg-[#7f2e62]',
    requested:    'bg-[#c6aeb8]',
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-5xl px-5 py-10 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/companion" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-schedule-back">
              <ArrowLeft className="h-4 w-4" />Companion workspace
            </Link>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Your week</p>
            <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Schedule</h1>
          </div>
          <button type="button" onClick={() => refetch()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
            data-testid="button-refresh-schedule">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>

        {isLoading && <div className="mt-10"><LoadingState label="Loading your schedule" /></div>}
        {isError && <div className="mt-10"><ErrorState onRetry={() => refetch()} /></div>}

        {!isLoading && !isError && (
          <>
            {/* 7-day grid */}
            <div className="mt-8 grid gap-3 sm:grid-cols-7">
              {days.map((day) => {
                const iso = day.toISOString().slice(0, 10);
                const isToday = iso === today.toISOString().slice(0, 10);
                const dayBookings = bookingsByDate.get(iso) ?? [];
                return (
                  <div key={iso}
                    className={`min-h-[140px] rounded-[18px] border p-3 transition ${
                      isToday
                        ? 'border-[#9d557e] bg-[#f8eff5]'
                        : dayBookings.length
                          ? 'border-[#c7d9cb] bg-[#f4faf5]'
                          : 'border-[#e8ddd6] bg-[#fbf7f1]'
                    }`}
                    data-testid={`schedule-day-${iso}`}>
                    {/* Day header */}
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[9px] uppercase tracking-wider text-[#9b858e]">{DAY_NAMES[day.getDay()]}</p>
                      {isToday && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#9d557e]" />
                      )}
                    </div>
                    <p className={`mt-1 font-serif text-2xl leading-none ${isToday ? 'text-[#7f2e62]' : 'text-[#48213d]'}`}>
                      {day.getDate()}
                    </p>
                    <p className="font-mono text-[8px] uppercase tracking-wider text-[#b0929f]">{MONTH_NAMES[day.getMonth()]}</p>

                    {/* Booking chips */}
                    <div className="mt-3 space-y-1.5">
                      {dayBookings.length === 0 && (
                        <p className="text-[9px] text-[#c6aeb8]">Free</p>
                      )}
                      {dayBookings.map((b) => (
                        <Link key={b.id} href={`/companion/booking/${b.id}`}
                          className="flex items-start gap-1.5 rounded-lg bg-white/80 px-2 py-1.5 shadow-sm transition hover:bg-white"
                          data-testid={`schedule-booking-${b.id}`}>
                          <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[b.status] ?? 'bg-[#c6aeb8]'}`} />
                          <div className="min-w-0">
                            <p className="truncate text-[9px] font-bold text-[#48213d]">{b.activity}</p>
                            <p className="text-[8px] text-[#9b858e]">{b.startTime} · {b.durationHours}h</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-4">
              {([['confirmed', '#477254', 'Confirmed'], ['deposit_paid', '#bf8750', 'Deposit received'], ['authorized', '#7f2e62', 'Authorized'], ['requested', '#c6aeb8', 'Pending']] as const).map(([, color, label]) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px] text-[#806c76]">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>

            {/* Upcoming list (beyond 7 days) */}
            {(() => {
              const sevenFromNow = new Date(today);
              sevenFromNow.setDate(today.getDate() + 7);
              const sevenIso = sevenFromNow.toISOString().slice(0, 10);
              const beyond = (data ?? [])
                .filter((b) => ACTIVE_STATUSES.has(b.status) && b.date >= sevenIso)
                .sort((a, b) => a.date.localeCompare(b.date));
              if (!beyond.length) return null;
              return (
                <div className="mt-8">
                  <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Further out</p>
                  <div className="space-y-2">
                    {beyond.map((b) => (
                      <Link key={b.id} href={`/companion/booking/${b.id}`}
                        className="flex items-center justify-between rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3 transition hover:border-[#9d557e]"
                        data-testid={`schedule-beyond-${b.id}`}>
                        <div>
                          <p className="text-sm font-semibold text-[#48213d]">{b.activity}</p>
                          <p className="mt-0.5 text-[10px] text-[#9b858e]">{b.date} · {b.startTime} · {b.durationHours}h</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.12em] ${STATUS_DOT[b.status] ? 'text-white' : 'text-[#806c76]'}`}
                            style={{ background: STATUS_DOT[b.status]?.replace('bg-', '') ?? '#e0d5d0' }}>
                            {b.status}
                          </span>
                          <ChevronRight className="h-4 w-4 text-[#c6aeb8]" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Empty state */}
            {(data ?? []).filter((b) => ACTIVE_STATUSES.has(b.status)).length === 0 && (
              <div className="mt-10 rounded-[22px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
                <CalendarDays className="mx-auto h-10 w-10 text-[#c6aeb8]" />
                <p className="mt-5 font-serif text-2xl text-[#48213d]">Your week is open.</p>
                <p className="mt-2 text-sm text-[#806c76]">Confirmed and upcoming bookings will appear here once they are scheduled.</p>
              </div>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion earnings dashboard
// ---------------------------------------------------------------------------

type EarningsMonth = { month: string; label: string; earningsCents: number; bookingCount: number };
type EarningsTxn = {
  id: string; bookingId: string; date: string; activity: string;
  durationHours: number; grossCents: number; commissionCents: number; netCents: number;
  status: 'paid' | 'pending' | 'processing';
};
type EarningsData = {
  lifetimeCents: number; thisMonthCents: number; pendingCents: number; thisYearCents: number;
  monthlyBreakdown: EarningsMonth[]; recentTransactions: EarningsTxn[]; totalBookings: number;
};

function useCompanionEarnings() {
  return useQuery<EarningsData>({
    queryKey: ['companion-earnings'],
    queryFn: async () => {
      const res = await fetch('/api/companion/earnings', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load earnings');
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-[#e8f0e8] text-[#477254]',
  processing: 'bg-[#fdf3e3] text-[#bf8750]',
  pending: 'bg-[#f5ede6] text-[#806c76]',
};

function EarningsStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
      <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">{label}</p>
      <p className="mt-4 font-serif text-4xl text-[#48213d]">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-[#9b858e]">{sub}</p>}
    </div>
  );
}

function EarningsBarChart({ months }: { months: EarningsMonth[] }) {
  const max = Math.max(...months.map((m) => m.earningsCents), 1);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const BAR_MAX_PX = 120; // chart area height minus label space
  return (
    <div className="flex h-40 items-end gap-2">
      {months.map((m) => {
        const barPx = Math.max((m.earningsCents / max) * BAR_MAX_PX, 4);
        const isCurrent = m.month === currentMonth;
        return (
          <div key={m.month} className="group relative flex flex-1 flex-col items-center gap-1.5">
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#3d2038] px-2.5 py-1.5 text-center opacity-0 shadow transition group-hover:opacity-100">
              <p className="text-[10px] font-bold text-white">{money(m.earningsCents)}</p>
              <p className="text-[9px] text-[#ddc4d0]">{m.bookingCount} bookings</p>
            </div>
            {/* Bar */}
            <div
              className={`w-full rounded-t-[6px] transition-all ${isCurrent ? 'bg-[#9d557e]' : 'bg-[#ead0dd] group-hover:bg-[#c695ae]'}`}
              style={{ height: `${barPx}px` }}
            />
            <span className={`font-mono text-[9px] ${isCurrent ? 'font-bold text-[#7f2e62]' : 'text-[#9b858e]'}`}>{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function IncomeProjector() {
  const [rate, setRate] = useState(65);
  const [bookingsPerWeek, setBookingsPerWeek] = useState(3);
  const [hoursPerBooking, setHoursPerBooking] = useState(2);

  const grossPerBooking = rate * hoursPerBooking;
  const netPerBooking = grossPerBooking * 0.85; // after 15% platform fee
  const monthlyNet = Math.round(netPerBooking * bookingsPerWeek * 4.33);
  const yearlyNet = monthlyNet * 12;

  const presets = [
    { label: 'Part-time', rate: 65, bpw: 2, hpb: 2 },
    { label: 'Steady', rate: 75, bpw: 4, hpb: 2.5 },
    { label: 'Full schedule', rate: 95, bpw: 6, hpb: 2 },
  ];

  return (
    <div className="mt-4 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 md:p-8" data-testid="income-projector">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#9d557e]">Income projection</p>
          <p className="mt-1 text-[11px] text-[#9b858e]">A what-if calculator, not a forecast. Defaults are placeholders — they are not your profile rate or city averages.</p>
        </div>
        <div className="flex gap-2">
          {presets.map((p) => (
            <button key={p.label} type="button"
              onClick={() => { setRate(p.rate); setBookingsPerWeek(p.bpw); setHoursPerBooking(p.hpb); }}
              className="rounded-full border border-[#dfd2c9] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#654c5f] transition hover:border-[#9d557e] hover:text-[#7f2e62]"
              data-testid={`preset-${p.label.toLowerCase().replace(/\s/g, '-')}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Sliders */}
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-[#48213d]">Hourly rate</label>
              <span className="font-mono text-sm font-bold text-[#7f2e62]">${rate}/hr</span>
            </div>
            <input type="range" min={40} max={200} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="w-full accent-[#7f2e62]" data-testid="slider-rate" />
            <div className="mt-1 flex justify-between text-[9px] text-[#9b858e]"><span>$40</span><span>$200</span></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-[#48213d]">Bookings per week</label>
              <span className="font-mono text-sm font-bold text-[#7f2e62]">{bookingsPerWeek}×</span>
            </div>
            <input type="range" min={1} max={14} step={1} value={bookingsPerWeek} onChange={(e) => setBookingsPerWeek(Number(e.target.value))}
              className="w-full accent-[#7f2e62]" data-testid="slider-bookings" />
            <div className="mt-1 flex justify-between text-[9px] text-[#9b858e]"><span>1</span><span>14</span></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-[#48213d]">Hours per booking</label>
              <span className="font-mono text-sm font-bold text-[#7f2e62]">{hoursPerBooking} hr{hoursPerBooking !== 1 ? 's' : ''}</span>
            </div>
            <input type="range" min={1} max={8} step={0.5} value={hoursPerBooking} onChange={(e) => setHoursPerBooking(Number(e.target.value))}
              className="w-full accent-[#7f2e62]" data-testid="slider-hours" />
            <div className="mt-1 flex justify-between text-[9px] text-[#9b858e]"><span>1 hr</span><span>8 hrs</span></div>
          </div>
        </div>

        {/* Output */}
        <div className="flex flex-col justify-center gap-4">
          <div className="rounded-[18px] bg-white p-5 shadow-sm">
            <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">Per booking (net)</p>
            <p className="mt-2 font-serif text-4xl text-[#48213d]">{money(Math.round(netPerBooking * 100))}</p>
            <p className="mt-1 text-[10px] text-[#9b858e]">= ${rate} × {hoursPerBooking}hr × 85%</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] bg-[#f4faf5] p-5">
              <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#5a8c6a]">Monthly (net)</p>
              <p className="mt-2 font-serif text-3xl text-[#2d5c3e]">{money(monthlyNet * 100)}</p>
            </div>
            <div className="rounded-[18px] bg-[#f0e4f5] p-5">
              <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#7f2e62]">Yearly (net)</p>
              <p className="mt-2 font-serif text-3xl text-[#48213d]">{money(yearlyNet * 100)}</p>
            </div>
          </div>
          <p className="text-[10px] leading-4 text-[#9b858e]">
            Projection assumes {bookingsPerWeek} booking{bookingsPerWeek !== 1 ? 's' : ''}/week × {hoursPerBooking} hr{hoursPerBooking !== 1 ? 's' : ''} at ${rate}/hr, 4.33 weeks/month, after 15% platform fee. Actual earnings vary.
          </p>
        </div>
      </div>
    </div>
  );
}

function EarningsGoalTracker({ thisMonthCents }: { thisMonthCents: number }) {
  const GOAL_KEY = 'of_earnings_goal_cents';
  const [goalCents, setGoalCentsRaw] = useState<number>(() => {
    try { return Number(localStorage.getItem(GOAL_KEY) ?? 0) || 0; } catch { return 0; }
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goalCents / 100));

  const saveGoal = () => {
    const v = Math.round(parseFloat(draft || '0') * 100);
    if (!isNaN(v) && v >= 0) {
      setGoalCentsRaw(v);
      try { localStorage.setItem(GOAL_KEY, String(v)); } catch {}
    }
    setEditing(false);
  };

  const pct = goalCents > 0 ? Math.min(Math.round((thisMonthCents / goalCents) * 100), 100) : 0;

  return (
    <div className="mt-4 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5" data-testid="earnings-goal-tracker">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Monthly goal</p>
          {editing ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-[#654c5f]">$</span>
              <input autoFocus type="number" min="0" step="50" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditing(false); }}
                className="w-24 rounded-lg border border-[#7f2e62] bg-white px-2 py-1 text-sm outline-none"
                data-testid="input-earnings-goal" />
              <button type="button" onClick={saveGoal} className="text-xs font-bold text-[#7f2e62]">Save</button>
            </div>
          ) : (
            <button type="button" onClick={() => { setDraft(String(goalCents / 100)); setEditing(true); }}
              className="mt-1 flex items-center gap-1.5 text-sm text-[#48213d] hover:text-[#7f2e62]"
              data-testid="button-edit-goal">
              <span className="font-bold">{goalCents > 0 ? money(goalCents) : 'Set a goal'}</span>
              <Pencil className="h-3 w-3 text-[#c6aeb8]" />
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] text-[#9b858e]">This month</p>
          <p className="font-mono text-sm font-bold text-[#48213d]">{money(thisMonthCents)}</p>
          {goalCents > 0 && <p className="font-mono text-[9px] text-[#9d557e]">{pct}%</p>}
        </div>
      </div>
      {goalCents > 0 && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#ece1d9]">
            <div className="h-full rounded-full bg-[#7f2e62] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[9px] text-[#9b858e]">
            {pct >= 100 ? '🎉 Goal reached this month!' : `${money(Math.max(0, goalCents - thisMonthCents))} to go`}
          </p>
        </div>
      )}
    </div>
  );
}

function CompanionEarnings() {
  const { data, isLoading, isError, refetch } = useCompanionEarnings();

  if (isLoading) return (
    <Shell>
      <main className="mx-auto max-w-5xl px-5 py-16 lg:px-8"><LoadingState /></main>
    </Shell>
  );
  if (isError || !data) return (
    <Shell>
      <main className="mx-auto max-w-5xl px-5 py-16 lg:px-8">
        <ErrorState onRetry={() => refetch()} />
      </main>
    </Shell>
  );

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-5xl px-5 py-10 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/dashboard/companion" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-earnings-back">
              <ArrowLeft className="h-4 w-4" />Companion workspace
            </Link>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Your income</p>
            <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Earnings</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!data) return;
                const rows = [
                  ['Date', 'Activity', 'Duration (hrs)', 'Gross', 'Commission (15%)', 'Net payout', 'Status'],
                  ...data.recentTransactions.map((t) => [
                    t.date, t.activity, String(t.durationHours),
                    (t.grossCents / 100).toFixed(2),
                    (t.commissionCents / 100).toFixed(2),
                    (t.netCents / 100).toFixed(2),
                    t.status,
                  ]),
                ];
                const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'onlyfavors-earnings.csv'; a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
              data-testid="button-export-csv">
              <FileText className="h-4 w-4" />Export CSV
            </button>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
              data-testid="link-stripe-dashboard">
              <WalletCards className="h-4 w-4" />View in Stripe
            </a>
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <EarningsStat label="Lifetime earned" value={money(data.lifetimeCents)} sub={`${data.totalBookings} bookings`} />
          <EarningsStat label="This month" value={money(data.thisMonthCents)} />
          <EarningsStat label="This year" value={money(data.thisYearCents)} />
          <div className="rounded-[20px] border border-[#ece1d9] bg-[#fdf3e3] p-5">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Pending payout</p>
            <p className="mt-4 font-serif text-4xl text-[#bf8750]">{money(data.pendingCents)}</p>
            <p className="mt-1 text-[10px] text-[#9b858e]">Unpaid or incomplete bookings — not a scheduled Friday deposit</p>
          </div>
        </div>

        <EarningsGoalTracker thisMonthCents={data.thisMonthCents} />

        <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5" data-testid="rate-advisor">
          <div className="flex items-start gap-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#48213d]">Your rate</p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#806c76]">
                There is no market-rate advisor. Set your hourly rate on your profile. The calculator below is a what-if tool — it does not use city averages or invent a recommended price.
              </p>
              <Link href="/dashboard/companion/profile" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#7f2e62] hover:underline">
                Edit your rate <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Income projection calculator */}
        <IncomeProjector />

        {/* Chart */}
        <div className="mt-6 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Monthly earnings · last 6 months</p>
            <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">After 15% platform fee</p>
          </div>
          <EarningsBarChart months={data.monthlyBreakdown} />
        </div>

        {/* Transactions */}
        <div className="mt-6 overflow-hidden rounded-[22px] border border-[#dfd2c9]">
          <div className="border-b border-[#ece1d9] bg-[#fbf7f1] px-5 py-3">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Recent transactions</p>
          </div>
          <div className="divide-y divide-[#f0e8e2] bg-white">
            {data.recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-4" data-testid={`txn-${t.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#48213d]">{t.activity}</p>
                  <p className="mt-0.5 text-[10px] text-[#9b858e]">
                    {new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · '}{t.durationHours} hr{t.durationHours > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#48213d]">{money(t.netCents)}</p>
                  <p className="mt-0.5 text-[10px] text-[#9b858e]">after {money(t.commissionCents)} fee</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.1em] ${STATUS_STYLES[t.status]}`}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tax & 1099 summary */}
        <div className="mt-6 rounded-[22px] border border-[#f0d5d5] bg-[#fdf6f6] p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fce4e4]">
              <FileText className="h-4 w-4 text-[#a64742]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#48213d]">Tax & 1099 information</p>
              <p className="mt-1 text-[11px] leading-5 text-[#806c76]">
                If you earn through Stripe Connect, tax forms (when required in your country) typically come from Stripe, not from this page. Gross here is an estimate from net ÷ 85%. Consult a tax professional.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Gross this year', value: money(Math.round(data.thisYearCents / 0.85)), note: 'Before platform commission' },
                  { label: 'Commission paid', value: money(Math.round(data.thisYearCents / 0.85 * 0.15)), note: '15% — deductible business expense' },
                  { label: 'Net earnings', value: money(data.thisYearCents), note: 'What you received' },
                ].map(({ label, value, note }) => (
                  <div key={label} className="rounded-[12px] border border-[#f0d5d5] bg-white p-3">
                    <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">{label}</p>
                    <p className="mt-2 font-serif text-2xl text-[#48213d]">{value}</p>
                    <p className="mt-0.5 text-[9px] text-[#9b858e]">{note}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-[#9b858e]">
                This is a summary only — consult a tax professional for advice specific to your situation. Platform commission is typically deductible as a business expense.
              </p>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-6 flex items-center gap-1.5 text-[11px] text-[#9b858e]">
          <LockKeyhole className="h-3.5 w-3.5" />
          Payouts go through Stripe Connect after a booking is completed. Timing follows Stripe (often 2–5 business days), not a promised Friday or 24-hour window from us.
        </p>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Pricing page
// ---------------------------------------------------------------------------

const PRICING_FAQS = [
  {
    q: 'Do I need a membership to chat?',
    a: 'No. Signup and browsing are free. A structured request is free. Masked chat unlocks after a $10 deposit on that booking — credited to the total. OnlyFavors Plus ($99/year) is not for sale and will not gate chat, privacy, or emergency tools.',
  },
  {
    q: 'When is the 5% fee charged?',
    a: 'The safety & service fee is added on top of the companion\'s hourly rate at checkout. On a $100 favor you pay $105. You see the exact total before any payment is taken. Amounts are calculated on the server.',
  },
  {
    q: 'Is the 20% what OnlyFavors keeps?',
    a: 'It is gross. On a $100 favor the platform share is $20 before card processing (around 2.9% + 30¢ in the US) and Stripe Connect payout fees. Companions still receive $85 of that $100 subtotal.',
  },
  {
    q: 'Is the $10 deposit refundable?',
    a: 'The deposit is credited toward your booking total after your companion accepts. If they decline, email hello@onlyfavors.com — Stripe refunds are not automatic from the decline action.',
  },
  {
    q: 'How quickly do companions get paid?',
    a: 'Companion payouts go through Stripe Connect after a booking is completed. Timing follows Stripe — typically 2–5 business days after Stripe sends the transfer. Companions connect a bank account once via Stripe. We do not promise a 24-hour initiation from OnlyFavors.',
  },
  {
    q: 'Are prices ever negotiated outside the platform?',
    a: 'No, and companions are not permitted to accept off-platform payment. All rates are set by the companion in their profile and are non-negotiable per booking. This protects both sides and keeps every transaction covered by our dispute resolution.',
  },
  {
    q: 'What happens if a booking is cancelled?',
    a: 'You can cancel a booking in the app. That marks it cancelled. Stripe refunds are not automatic from this action, and there is no 48-hour cutoff encoded in the product. Email hello@onlyfavors.com if a deposit needs to be returned.',
  },
  {
    q: 'Is the companion\'s hourly rate all-inclusive?',
    a: 'The hourly rate covers the companion\'s time. Customers cover any out-of-pocket expenses for the activity itself — museum tickets, restaurant bills, etc. — unless otherwise agreed in the booking notes.',
  },
];

function PricingFaq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#ece1d9]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        data-testid={`faq-${q.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}
      >
        <span className="text-sm font-semibold text-[#48213d]">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#9d557e] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-5 text-sm leading-6 text-[#725e69]">{a}</p>}
    </div>
  );
}

function Pricing() {
  // Worked example state
  const [exRate, setExRate] = useState(50);
  const [exHours, setExHours] = useState(2);
  const subtotal = exRate * exHours;
  const customerFee = Math.round(subtotal * 0.05 * 100) / 100;
  const customerTotal = subtotal + customerFee;
  const platformCommission = Math.round(subtotal * 0.15 * 100) / 100;
  const companionPayout = subtotal - platformCommission;

  return (
    <Shell>
      <main className="page-enter">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-[#ddcfc6] bg-[#3d2038]">
          <div className="absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full border-[60px] border-white/5" />
          <div className="absolute right-24 bottom-0 h-32 w-32 rounded-full bg-[#9d557e]/20 blur-3xl" />
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">Transparent by design</p>
            <h1 className="font-serif text-[60px] leading-[.92] text-[#f9efe5] md:text-[80px]">Simple, honest<br /><em>pricing.</em></h1>
            <p className="mt-6 max-w-lg text-[17px] leading-7 text-[#d9c4cf]">20% gross on a completed booking — 5% from the customer, 15% from the companion. Signup, browse, and safety tools are free. Chat is a $10 deposit on a real booking, not a $99 membership.</p>
            <div className="mt-8 flex items-center gap-3">
              <p className="flex items-center gap-2 rounded-full border border-[#5e3458] bg-[#4a2842] px-4 py-2 text-xs text-[#d9c4cf]">
                <LockKeyhole className="h-3.5 w-3.5 text-[#c695ae]" />All amounts are calculated on our server — your browser never sets prices.
              </p>
            </div>
          </div>
        </section>

        {/* ── Two-column cards ── */}
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-5 md:grid-cols-2">

            {/* Customer card */}
            <div className="rounded-[28px] border border-[#dfd2c9] bg-[#fbf7f1] p-8 md:p-10">
              <div className="flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ead0dd] text-[#7f2e62]">
                  <Users className="h-5 w-5" />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#9b858e]">For customers</span>
              </div>
              <h2 className="mt-8 font-serif text-4xl leading-none text-[#48213d]">Pay the rate.<br />Plus a small fee.</h2>
              <p className="mt-4 text-sm leading-6 text-[#725e69]">You pay the companion's hourly rate plus a 5% safety & service fee. That fee is shown before you pay. It is not a promise of insurance coverage or 24/7 staffing.</p>
              <div className="mt-8 space-y-3">
                {[
                  ['Companion hourly rate', 'Set by the companion, shown on their profile'],
                  ['Safety & service fee', '5% of the booking subtotal'],
                  ['Deposit to unlock chat', '$10 — fully credited to your total'],
                ].map(([label, desc]) => (
                  <div key={label} className="flex items-start gap-3 rounded-[16px] bg-[#f5ede6] p-4">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />
                    <div>
                      <p className="text-sm font-semibold text-[#48213d]">{label}</p>
                      <p className="mt-0.5 text-xs text-[#806c76]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/explore" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-[#fff5eb] transition hover:bg-[#65234e]" data-testid="link-pricing-explore">
                Find a companion <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Companion card */}
            <div className="rounded-[28px] bg-[#d3e1d8] p-8 md:p-10">
              <div className="flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#b5cdb7] text-[#31533f]">
                  <WalletCards className="h-5 w-5" />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#63816a]">For companions</span>
              </div>
              <h2 className="mt-8 font-serif text-4xl leading-none text-[#31533f]">Keep 85%<br />of every booking.</h2>
              <p className="mt-4 text-sm leading-6 text-[#53725d]">OnlyFavors takes a 15% commission for payments and platform operations. The rest is your payout through Stripe Connect. Background checks are not a live product feature yet.</p>
              <div className="mt-8 space-y-3">
                {[
                  ['You set your rate', 'Any hourly rate you choose — update anytime'],
                  ['15% platform commission', 'Deducted automatically — no invoicing'],
                  ['Direct bank payouts', 'Via Stripe — typically 2–5 business days'],
                ].map(([label, desc]) => (
                  <div key={label} className="flex items-start gap-3 rounded-[16px] bg-[#c3d6c5] p-4">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#31533f]" />
                    <div>
                      <p className="text-sm font-semibold text-[#31533f]">{label}</p>
                      <p className="mt-0.5 text-xs text-[#53725d]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/companion/apply" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#31533f] px-5 text-sm font-bold text-[#eef6ef] transition hover:bg-[#24442f]" data-testid="link-pricing-apply">
                Apply to join <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Worked example ── */}
        <section className="border-y border-[#ddcfc6] bg-[#f0e4db]">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">See it in action</p>
                <h2 className="mt-2 font-serif text-4xl text-[#48213d]">A $100 favor.</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#725e69]">Customer pays $105. Companion receives $85. OnlyFavors earns $20 gross — before Stripe (~2.9% + 30¢) and Connect payout fees.</p>
              </div>
              {/* Sliders */}
              <div className="flex flex-wrap gap-6">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#9b858e]">Hourly rate</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min={30} max={150} step={5} value={exRate} onChange={(e) => setExRate(Number(e.target.value))}
                      className="accent-[#7f2e62]" data-testid="slider-rate" />
                    <span className="w-12 text-right text-sm font-bold text-[#48213d]">${exRate}/hr</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#9b858e]">Duration</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={8} step={1} value={exHours} onChange={(e) => setExHours(Number(e.target.value))}
                      className="accent-[#7f2e62]" data-testid="slider-hours" />
                    <span className="w-12 text-right text-sm font-bold text-[#48213d]">{exHours} hr{exHours > 1 ? 's' : ''}</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Customer column */}
              <div className="rounded-[22px] border border-[#dfd2c9] bg-white p-6">
                <p className="mb-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]"><Users className="h-3.5 w-3.5" />Customer pays</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-[#654c5f]">
                    <span>{exHours} hr × ${exRate}/hr</span>
                    <span>{money(subtotal * 100)}</span>
                  </div>
                  <div className="flex justify-between text-[#9b858e]">
                    <span>Safety & service fee (5%)</span>
                    <span>+{money(customerFee * 100)}</span>
                  </div>
                </div>
                <div className="my-4 border-t border-[#ece1d9]" />
                <div className="flex items-end justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">Total charged</span>
                  <span className="font-serif text-4xl text-[#48213d]" data-testid="example-customer-total">{money(customerTotal * 100)}</span>
                </div>
              </div>

              {/* Companion column */}
              <div className="rounded-[22px] border border-[#c3d6c5] bg-[#d3e1d8] p-6">
                <p className="mb-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.15em] text-[#63816a]"><WalletCards className="h-3.5 w-3.5" />Companion receives</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-[#53725d]">
                    <span>Booking subtotal</span>
                    <span>{money(subtotal * 100)}</span>
                  </div>
                  <div className="flex justify-between text-[#63816a]">
                    <span>Platform commission (15%)</span>
                    <span>−{money(platformCommission * 100)}</span>
                  </div>
                </div>
                <div className="my-4 border-t border-[#b5cdb7]" />
                <div className="flex items-end justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#63816a]">Your payout</span>
                  <span className="font-serif text-4xl text-[#31533f]" data-testid="example-companion-payout">{money(companionPayout * 100)}</span>
                </div>
              </div>
            </div>

            <p className="mt-5 flex items-center gap-2 text-[11px] text-[#9b858e]">
              <LockKeyhole className="h-3.5 w-3.5" />
              Illustration of the same math the server locks at booking. The 20% is gross revenue. Card processing and Connect payouts come out of that, not on top of the customer total.
            </p>
          </div>
        </section>

        {/* ── Deposit section ── */}
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:items-center">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Before you commit</p>
              <h2 className="mt-3 font-serif text-4xl leading-none text-[#48213d]">Chat follows a booking,<br />not a membership.</h2>
              <p className="mt-4 text-sm leading-7 text-[#725e69]">Send a structured request for free — activity, SafeSpot, time, attire, access. A refundable $10 deposit opens a private, masked thread. Phone numbers stay hidden. The $10 is credited toward the final total. We do not charge $99 to message, and we do not sell contact details.</p>
              <p className="mt-4 text-sm leading-7 text-[#725e69]">If the companion declines, the deposit is refundable. Trust Circle and Help me leave stay free.</p>
            </div>
            <div className="space-y-3">
              {[
                { step: '01', title: 'Structured request — free', desc: 'Activity, public venue, time, attire, and access. No open chat yet.' },
                { step: '02', title: 'Pay $10 deposit', desc: 'Refundable. Credited to the booking. Unlocks masked chat.' },
                { step: '03', title: 'Companion accepts or declines', desc: 'Accept confirms the Boundary Receipt. Decline returns the deposit path.' },
                { step: '04', title: 'Remainder authorized', desc: 'Captured at checkout. Companion receives 85% via Stripe Connect.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-4 rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4">
                  <span className="mt-0.5 font-mono text-[10px] text-[#a47e8f]">{step}</span>
                  <div>
                    <p className="text-sm font-bold text-[#48213d]">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#806c76]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform comparison ── */}
        <section className="border-y border-[#ddcfc6] bg-[#fdf9f5]">
          <div className="mx-auto max-w-5xl px-5 py-16 lg:px-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Why OnlyFavors</p>
            <h2 className="mt-3 font-serif text-4xl text-[#48213d]">Clear prices, clear purpose.</h2>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm" data-testid="pricing-comparison-table">
                <thead>
                  <tr className="border-b border-[#dfd2c9]">
                    <th className="pb-3 text-left font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Feature</th>
                    <th className="pb-3 text-center font-mono text-[9px] uppercase tracking-[.15em] text-[#7f2e62]">OnlyFavors</th>
                    <th className="pb-3 text-center font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Typical alternatives</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0e8e2]">
                  {[
                    ['Server-enforced pricing', '✓ Always', '✗ Often browser-set'],
                    ['Identity verification', '✓ Every companion', '~ Some platforms'],
                    ['SafeSpot meeting venues', '✓ Built-in network', '✗ No equivalent'],
                    ['Boundary Receipt', '✓ On every booking', '✗ None'],
                    ['Trust Circle check-ins', '✓ Venue email if configured', '✗ DIY'],
                    ['Companion commission', '15% — disclosed upfront', 'Up to 30% + hidden fees'],
                    ['Customer service fee', '5% flat, shown before pay', 'Variable, often hidden'],
                    ['$10 refundable deposit', '✓ Chat on a real booking', '✗ Pay $99 to message'],
                    ['Masked private chat', '✓ No phone numbers sold', '✗ Direct contact exposed'],
                  ].map(([feature, us, them]) => (
                    <tr key={feature} className="group hover:bg-[#fbf7f1]">
                      <td className="py-3 pr-6 text-[#654c5f]">{feature}</td>
                      <td className="py-3 text-center font-semibold text-[#477254]">{us}</td>
                      <td className="py-3 text-center text-[#9b858e]">{them}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-[11px] text-[#9b858e]">
              Comparisons are general characterisations of alternative services, not specific companies.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="border-t border-[#ddcfc6] bg-[#fbf7f1]">
          <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Common questions</p>
            <h2 className="mt-3 font-serif text-4xl text-[#48213d]">Pricing, answered.</h2>
            <div className="mt-10">
              {PRICING_FAQS.map((f) => <PricingFaq key={f.q} {...f} />)}
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="border-t border-[#ddcfc6] bg-[#3d2038]">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-16 text-center lg:px-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">Ready when you are</p>
            <h2 className="font-serif text-4xl text-[#f9efe5]">Spend the afternoon.<br /><em>We'll handle the numbers.</em></h2>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/explore" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f9efe5] px-5 text-sm font-bold text-[#48213d] transition hover:bg-white" data-testid="link-pricing-cta-explore">
                Find a companion <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/companion/apply" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#5e3458] px-5 text-sm font-bold text-[#f9efe5] transition hover:bg-[#4a2842]" data-testid="link-pricing-cta-apply">
                Become a companion
              </Link>
            </div>
          </div>
        </section>

      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Saved companions page
// ---------------------------------------------------------------------------

/** Loads a single companion by ID and renders it as a card, or a skeleton */
function SavedCompanionCard({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
  const query = useGetCompanion(id, {
    query: { queryKey: getGetCompanionQueryKey(id), retry: false, staleTime: 120_000 },
  });

  if (query.isLoading) {
    return (
      <div className="animate-pulse rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-full bg-[#ead0dd]" />
          <div className="h-8 w-8 rounded-full bg-[#f0e4db]" />
        </div>
        <div className="mt-4 h-6 w-32 rounded-lg bg-[#ead0dd]" />
        <div className="mt-2 h-4 w-24 rounded-lg bg-[#f0e4db]" />
        <div className="mt-4 flex gap-1.5">
          <div className="h-7 w-20 rounded-full bg-[#f0e4db]" />
          <div className="h-7 w-16 rounded-full bg-[#f0e4db]" />
        </div>
        <div className="mt-5 border-t border-[#ece1d9] pt-4">
          <div className="h-4 w-28 rounded-lg bg-[#f0e4db]" />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    // Companion no longer available — show a placeholder removal card
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#c6aeb8] bg-[#fdf9f6] p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[#c6aeb8]" />
        <p className="text-sm font-semibold text-[#806c76]">Companion no longer available</p>
        <button
          type="button"
          onClick={() => onRemove(id)}
          className="mt-1 text-xs font-bold text-[#9d557e] underline"
          data-testid={`button-remove-saved-${id}`}
        >
          Remove from saved
        </button>
      </div>
    );
  }

  const c = query.data;
  return (
    <div className="group relative rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:-translate-y-1 hover:border-[#bc83a6] hover:shadow-[0_18px_34px_rgba(88,37,70,.09)]">
      {/* Unsave button */}
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[#ead0dd] text-[#7f2e62] transition hover:bg-[#f0e4db] hover:text-[#9b858e]"
        aria-label="Remove from saved"
        title="Remove from saved"
        data-testid={`button-unsave-${id}`}
      >
        <Heart className="h-3.5 w-3.5 fill-current" />
      </button>

      <Link href={`/companions/${c.id}`} className="block" data-testid={`link-saved-companion-${c.id}`}>
        {/* Avatar */}
        <Avatar companion={c} />
        {/* Name */}
        <div className="mt-4 flex items-center gap-2">
          <h3 className="font-serif text-[26px] leading-none text-[#48213d]">{c.displayName}</h3>
          {c.verified && <BadgeCheck className="h-4 w-4 text-[#7f2e62]" />}
        </div>
        {/* Location */}
        <p className="mt-1.5 flex items-center gap-1 text-xs text-[#806c76]">
          <MapPin className="h-3.5 w-3.5 text-[#9b6b88]" />{c.serviceArea}, {c.city}
        </p>
        {/* Rating */}
        {c.rating > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <StarDisplay rating={Math.round(c.rating)} size="xs" />
            <span className="font-mono text-[10px] font-bold text-[#48213d]">{c.rating.toFixed(1)}</span>
            <span className="text-[10px] text-[#9b858e]">· {c.reviewCount} reviews</span>
          </div>
        )}
        {/* Bio */}
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#725e69]">
          {c.biography || 'A thoughtful companion for time well spent.'}
        </p>
        {/* Activities */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {c.activities.slice(0, 3).map((a) => (
            <span key={a} className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[10px] font-semibold text-[#72566a]">{a}</span>
          ))}
        </div>
        {/* Rate */}
        <div className="mt-5 flex items-center justify-between border-t border-[#ece1d9] pt-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">{money(c.hourlyRate * 100)}/hr</span>
          <span className="flex items-center gap-1 text-[10px] font-bold text-[#7f2e62]">View profile <ChevronRight className="h-3 w-3" /></span>
        </div>
      </Link>
    </div>
  );
}

function Saved() {
  const { ids, remove } = useSavedCompanionIds();

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Your shortlist</p>
            <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Saved companions</h1>
            {ids.length > 0 && (
              <p className="mt-3 text-sm text-[#806c76]">
                {ids.length} {ids.length === 1 ? 'companion' : 'companions'} saved — tap the heart to remove.
              </p>
            )}
          </div>
          <Link
            href="/explore"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
            data-testid="link-saved-explore"
          >
            <Compass className="h-4 w-4" /> Browse more
          </Link>
        </div>

        {/* Grid or empty state */}
        {ids.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-5 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-[#ead0dd]">
              <Heart className="h-8 w-8 text-[#7f2e62]" />
            </div>
            <h2 className="font-serif text-3xl text-[#48213d]">Nothing saved yet.</h2>
            <p className="max-w-sm text-sm leading-6 text-[#806c76]">
              Tap the heart on any companion card while browsing to add them here. Your shortlist stays private.
            </p>
            <Link
              href="/explore"
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-[#fff5eb] transition hover:bg-[#65234e]"
              data-testid="link-saved-empty-explore"
            >
              Find a companion <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ids.map((id) => (
              <SavedCompanionCard key={id} id={id} onRemove={remove} />
            ))}
          </div>
        )}

        {/* Subtle privacy note */}
        {ids.length > 0 && (
          <p className="mt-10 flex items-center gap-1.5 text-[11px] text-[#9b858e]">
            <LockKeyhole className="h-3.5 w-3.5" />
            Your saved list stays private. Signed-in accounts keep it across devices.
          </p>
        )}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion profile editor
// ---------------------------------------------------------------------------

type CompanionProfileData = {
  id?: string;
  displayName: string;
  bio: string;
  hourlyRateCents: number;
  activities: string[];
  languages: string[];
  serviceArea: string;
  approvedAreas?: string[];
  availableDays: string[];
  availableHoursStart: string;
  availableHoursEnd: string;
  interviewAnswers?: string[];
  photoUrl?: string | null;
  instantBook?: boolean;
  dayRateCents?: number | null;
  identityStatus?: string;
  approved?: boolean;
};

function useCompanionProfile(enabled = true) {
  return useQuery<CompanionProfileData>({
    queryKey: ['companion-profile'],
    queryFn: async () => {
      const res = await fetch('/api/companion/profile', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
    retry: 1,
    enabled,
  });
}

function useUploadCompanionPhoto() {
  const qc = useQueryClient();
  return useMutation<{ photoUrl: string }, Error, string>({
    mutationFn: async (photoDataUrl: string) => {
      const res = await fetch('/api/companion/profile/photo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoDataUrl }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion-profile'] }),
  });
}

function useUpdateCompanionProfile() {
  const qc = useQueryClient();
  return useMutation<CompanionProfileData, Error, CompanionProfileData>({
    mutationFn: async (data) => {
      const res = await fetch('/api/companion/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion-profile'] }),
  });
}

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v) && tags.length < 12) { onChange([...tags, v]); setDraft(''); }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-[#ead0dd] px-3 py-1 text-xs font-semibold text-[#7f2e62]">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="text-[#9d557e] hover:text-[#7f2e62]">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-8 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-3 text-xs text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
        />
        <button type="button" onClick={add} className="grid h-8 w-8 place-items-center rounded-full bg-[#ead0dd] text-[#7f2e62] hover:bg-[#d9b8cc]">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[#dfd2c9] bg-white p-6">
      <p className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">{title}</p>
      {children}
    </div>
  );
}

function CompanionProfileEditor() {
  const [, navigate] = useLocation();
  const profileQuery = useCompanionProfile();
  const updateProfile = useUpdateCompanionProfile();
  const uploadPhoto = useUploadCompanionPhoto();
  const [saved, setSaved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Form state — seeded from query data once loaded
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [hourlyRate, setHourlyRate] = useState('70');
  const [activities, setActivities] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [serviceArea, setServiceArea] = useState('');
  const [approvedAreas, setApprovedAreas] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [hoursStart, setHoursStart] = useState('10:00');
  const [hoursEnd, setHoursEnd] = useState('20:00');
  const [seeded, setSeeded] = useState(false);
  const [qaAnswers, setQaAnswers] = useState<string[]>(['', '', '']);
  const [instantBook, setInstantBook] = useState(false);
  const [dayRate, setDayRate] = useState('');

  useEffect(() => {
    if (profileQuery.data && !seeded) {
      const p = profileQuery.data;
      setDisplayName(p.displayName);
      setBio(p.bio);
      setHourlyRate(String(Math.round(p.hourlyRateCents / 100)));
      setActivities(p.activities);
      setLanguages(p.languages);
      setServiceArea(p.serviceArea);
      setApprovedAreas(p.approvedAreas?.length ? p.approvedAreas : (p.serviceArea ? [p.serviceArea] : []));
      setAvailableDays(p.availableDays);
      setHoursStart(p.availableHoursStart);
      setHoursEnd(p.availableHoursEnd);
      if (Array.isArray(p.interviewAnswers) && p.interviewAnswers.some(Boolean)) {
        setQaAnswers([...p.interviewAnswers, '', '', ''].slice(0, 3));
      }
      setInstantBook(Boolean(p.instantBook));
      setDayRate(p.dayRateCents ? String(Math.round(p.dayRateCents / 100)) : '');
      setSeeded(true);
    }
  }, [profileQuery.data, seeded]);

  const handleSave = () => {
    const rate = Math.round(parseFloat(hourlyRate) * 100);
    if (!displayName.trim() || !bio.trim() || isNaN(rate)) return;
    updateProfile.mutate(
      { displayName, bio, hourlyRateCents: rate, activities, languages, serviceArea: approvedAreas[0] || serviceArea, approvedAreas, availableDays, availableHoursStart: hoursStart, availableHoursEnd: hoursEnd, interviewAnswers: qaAnswers, instantBook, dayRateCents: dayRate ? Math.round(parseFloat(dayRate) * 100) : null },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
          try { localStorage.setItem('of_companion_profile_saved', '1'); } catch {}
        },
      }
    );
  };

  if (profileQuery.isLoading) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><LoadingState label="Loading your profile" /></main></Shell>
  );
  if (profileQuery.isError) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => profileQuery.refetch()} /></main></Shell>
  );

  const isValid = displayName.trim() && bio.trim() && activities.length > 0 && parseFloat(hourlyRate) >= 20;

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/dashboard/companion" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-back-profile">
          <ArrowLeft className="h-4 w-4" />Back to workspace
        </Link>

        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Companion profile</p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Your listing.</h1>
            <p className="mt-3 text-sm text-[#725e69]">What customers see when they find you. Keep it honest and current.</p>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f0e8] px-3 py-1.5 text-xs font-bold text-[#31533f]">
              <Check className="h-3.5 w-3.5" />Saved
            </span>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4" data-testid="form-companion-profile">

          {/* Profile photo */}
          <ProfileSection title="Profile photo">
            <div className="flex items-center gap-6">
              {/* Current photo or initials preview */}
              <div className="relative shrink-0">
                {(photoPreview ?? profileQuery.data?.photoUrl) ? (
                  <img
                    src={photoPreview ?? profileQuery.data?.photoUrl ?? ''}
                    alt="Profile photo"
                    className="h-24 w-24 rounded-full object-cover ring-2 ring-[#dfd2c9]"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#ead0dd] font-serif text-2xl font-bold text-[#7f2e62]">
                    {displayName ? displayName.split(' ').map((w) => w[0]).slice(0, 2).join('') : '—'}
                  </div>
                )}
                {uploadPhoto.isPending && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
              </div>

              {/* Upload controls */}
              <div className="flex-1">
                <p className="text-xs font-bold text-[#654c5f]">Your face, clearly visible</p>
                <p className="mt-1 text-[11px] leading-5 text-[#9b858e]">A real photo builds trust. First name and city only — no last name or identifying background.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadPhoto.isPending}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-xs font-bold text-[#48213d] transition hover:border-[#9d557e] disabled:opacity-40"
                    data-testid="button-upload-photo"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {uploadPhoto.isPending ? 'Uploading…' : 'Choose photo'}
                  </button>
                  {(photoPreview ?? profileQuery.data?.photoUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoPreview(null);
                        uploadPhoto.mutate('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
                      }}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-[#f3c9c5] bg-[#fbf1f0] px-4 text-xs font-bold text-[#a64742] hover:bg-[#fbe4e2]"
                      data-testid="button-remove-photo"
                    >
                      <X className="h-3.5 w-3.5" />Remove
                    </button>
                  )}
                </div>
                {uploadPhoto.isError && (
                  <p className="mt-2 text-[10px] text-[#a64742]">{uploadPhoto.error?.message}</p>
                )}
                {uploadPhoto.isSuccess && !uploadPhoto.isPending && (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-[#477254]"><Check className="h-3 w-3" />Photo saved</p>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  data-testid="input-photo-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5_000_000) {
                      alert('Please choose an image under 5 MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const dataUrl = ev.target?.result as string;
                      setPhotoPreview(dataUrl);
                      uploadPhoto.mutate(dataUrl);
                    };
                    reader.readAsDataURL(file);
                    // Reset input so same file can be re-chosen
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </ProfileSection>

          {/* Story */}
          <ProfileSection title="Your story">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={80}
                  placeholder="Alex M."
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
                  data-testid="input-profile-name"
                />
                <p className="mt-1 text-[10px] text-[#9b858e]">Only first name and last initial. We protect your full identity.</p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={600}
                  rows={5}
                  placeholder="Tell potential customers what kind of company you are…"
                  className="w-full resize-none rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] p-4 text-sm leading-6 text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
                  data-testid="textarea-profile-bio"
                />
                <p className="mt-1 text-right text-[10px] text-[#9b858e]">{bio.length}/600</p>
              </label>
            </div>
          </ProfileSection>

          {/* In your own words */}
          <ProfileSection title="In your own words">
            <div className="space-y-4">
              <p className="text-xs leading-5 text-[#806c76]">These short answers appear on your public profile and help customers connect with you before booking. Keep them warm and genuine.</p>
              {COMPANION_QA_QUESTIONS.map((question, i) => (
                <label key={question} className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">{question}</span>
                  <textarea
                    value={qaAnswers[i] ?? ''}
                    onChange={(e) => {
                      const next = [...qaAnswers];
                      next[i] = e.target.value;
                      setQaAnswers(next);
                    }}
                    maxLength={280}
                    rows={3}
                    placeholder="Share something genuine…"
                    className="w-full resize-none rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] p-4 text-sm leading-6 text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
                    data-testid={`textarea-qa-${i}`}
                  />
                  <p className="mt-0.5 text-right text-[10px] text-[#9b858e]">{(qaAnswers[i] ?? '').length}/280</p>
                </label>
              ))}
            </div>
          </ProfileSection>

          {/* What you offer */}
          <ProfileSection title="What you offer">
            <div className="space-y-5">
              <div>
                <p className="mb-2.5 text-xs font-bold text-[#654c5f]">Activities</p>
                <TagInput tags={activities} onChange={setActivities} placeholder="Museum visits…" />
                <p className="mt-1.5 text-[10px] text-[#9b858e]">Add up to 12. These appear as chips on your public profile.</p>
              </div>
              <div>
                <p className="mb-2.5 text-xs font-bold text-[#654c5f]">Languages</p>
                <TagInput tags={languages} onChange={setLanguages} placeholder="English…" />
              </div>
            </div>
          </ProfileSection>

          {/* Availability */}
          <ProfileSection title="Availability">
            <div className="space-y-5">
              <div>
                <p className="mb-2.5 text-xs font-bold text-[#654c5f]">Days available</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setAvailableDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])}
                      className={`h-9 w-12 rounded-full text-xs font-bold transition ${
                        availableDays.includes(day)
                          ? 'bg-[#7f2e62] text-white'
                          : 'border border-[#dfd2c9] bg-[#fbf7f1] text-[#806c76] hover:border-[#9d557e]'
                      }`}
                      data-testid={`toggle-day-${day}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Earliest start</span>
                  <input
                    type="time"
                    value={hoursStart}
                    onChange={(e) => setHoursStart(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm text-[#48213d] focus:border-[#9d557e] focus:outline-none"
                    data-testid="input-hours-start"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Latest end</span>
                  <input
                    type="time"
                    value={hoursEnd}
                    onChange={(e) => setHoursEnd(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm text-[#48213d] focus:border-[#9d557e] focus:outline-none"
                    data-testid="input-hours-end"
                  />
                </label>
              </div>
            </div>
          </ProfileSection>

          {/* Rate & area */}
          <ProfileSection title="Rate & service area">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Hourly rate (USD)</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#9b858e]">$</span>
                  <input
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    min={20}
                    max={500}
                    step={5}
                    className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] pl-8 pr-4 text-sm text-[#48213d] focus:border-[#9d557e] focus:outline-none"
                    data-testid="input-profile-rate"
                  />
                </div>
                <p className="mt-1 text-[10px] text-[#9b858e]">Min $20 · Max $500 per hour</p>
              </label>
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Approved neighborhoods</span>
                <div className="flex flex-wrap gap-2">
                  {NOLA_AREAS.map((area) => {
                    const on = approvedAreas.includes(area.name);
                    return (
                      <button
                        key={area.name}
                        type="button"
                        onClick={() => setApprovedAreas((prev) => on ? prev.filter((name) => name !== area.name) : [...prev, area.name].slice(0, 8))}
                        className={`h-9 rounded-full px-3 text-xs font-bold transition ${on ? 'bg-[#7f2e62] text-white' : 'border border-[#dfd2c9] bg-[#fbf7f1] text-[#806c76] hover:border-[#9d557e]'}`}
                        data-testid={`toggle-area-${area.name.toLowerCase().replace(/ /g, '-')}`}
                      >
                        {area.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-[#9b858e]">Customers see these neighborhood centers — never your home, workplace, or a live pin. Each area is a roughly 15-mile service circle in New Orleans.</p>
              </div>
            </div>
          </ProfileSection>

          <ProfileSection title="Booking & identity">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-[#654c5f]">Instant Book</p>
                  <p className="mt-1 text-[10px] leading-4 text-[#9b858e]">Off by default. When on, a paid deposit confirms without you accepting — still no overlapping bookings.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setInstantBook((v) => !v)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${instantBook ? 'bg-[#7f2e62]' : 'bg-[#c6aeb8]'}`}
                  data-testid="toggle-instant-book"
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${instantBook ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Optional full-day rate (7 hours)</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#9b858e]">$</span>
                  <input
                    type="number"
                    value={dayRate}
                    onChange={(e) => setDayRate(e.target.value)}
                    min={20}
                    max={4000}
                    step={5}
                    placeholder="Leave blank to use hourly × 7"
                    className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] pl-8 pr-4 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
                    data-testid="input-profile-day-rate"
                  />
                </div>
              </label>
              <div className="rounded-xl bg-[#f0e4db] p-4">
                <p className="text-xs font-bold text-[#654c5f]">Identity review: {profileQuery.data?.identityStatus ?? 'unsubmitted'}</p>
                <p className="mt-1 text-[10px] leading-4 text-[#9b858e]">Listing approval and ID review are separate. Submit when your ID is ready for the trust team.</p>
                {(profileQuery.data?.identityStatus === 'unsubmitted' || profileQuery.data?.identityStatus === 'rejected') && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/companion/identity/submit', { method: 'POST', credentials: 'include' });
                      profileQuery.refetch();
                    }}
                    className="mt-3 inline-flex h-9 items-center rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white"
                    data-testid="button-submit-identity"
                  >
                    Submit ID for review
                  </button>
                )}
              </div>
            </div>
          </ProfileSection>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[10px] text-[#9b858e]">Changes go live after the next trust team review cycle.</p>
            <button
              type="submit"
              disabled={!isValid || updateProfile.isPending}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white disabled:opacity-50"
              data-testid="button-save-profile"
            >
              {updateProfile.isPending ? 'Saving…' : 'Save profile'} <Check className="h-4 w-4" />
            </button>
          </div>

          {updateProfile.isError && (
            <p className="rounded-xl bg-[#fbebe7] px-4 py-3 text-xs text-[#a64742]">{updateProfile.error?.message ?? 'Could not save. Try again.'}</p>
          )}
        </form>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion booking detail — companion-perspective view of a booking + chat
// ---------------------------------------------------------------------------

function useCompanionBookingDetail(id: string) {
  return useQuery<BookingDetail & { viewerRole: 'companion' }>({
    queryKey: ['companion-booking', id],
    queryFn: async () => {
      const res = await fetch(`/api/companion/bookings/${id}`);
      if (!res.ok) throw new Error('Booking not found');
      return res.json();
    },
    enabled: Boolean(id),
    retry: 1,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'confirmed' || s === 'completed' || s === 'cancelled' ? false : 8000;
    },
  });
}

function CompanionBookingDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { data: b, isLoading, isError, refetch } = useCompanionBookingDetail(id);
  const accept = useAcceptBooking();
  const decline = useDeclineBooking();
  const [confirming, setConfirming] = useState<'accept' | 'decline' | null>(null);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [agreeReceipt, setAgreeReceipt] = useState(false);

  if (!id) { navigate('/dashboard/companion'); return null; }

  if (isLoading) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><LoadingState label="Loading booking" /></main></Shell>
  );
  if (isError || !b) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => refetch()} /></main></Shell>
  );

  const isConfirmed = b.status === 'confirmed' || b.status === 'completed';
  const isChatOpen = CHAT_ENABLED_STATUSES.has(b.status);
  const canRespond = b.status === 'deposit_paid' || b.status === 'authorized';

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/dashboard/companion" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-back-companion">
          <ArrowLeft className="h-4 w-4" />Back to workspace
        </Link>

        {/* Summary card */}
        <div className={`rounded-[26px] p-8 md:p-12 ${isConfirmed ? 'bg-[#e8f0e8]' : 'border border-[#dfd2c9] bg-[#fbf7f1]'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusBadge status={b.status} />
              <h1 className="mt-4 font-serif text-4xl leading-none text-[#48213d]">{b.activity}</h1>
              <p className="mt-2 text-sm text-[#725e69]">{b.date} · {b.startTime} · {b.durationHours}h</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">You receive</p>
              <p className="mt-1 font-serif text-4xl text-[#48213d]">{money(b.companionPayoutCents)}</p>
            </div>
          </div>

          {/* Payout breakdown */}
          <div className="mt-8 space-y-2 rounded-[16px] border border-[#dfd2c9] bg-white/60 p-5 text-sm">
            <div className="flex justify-between text-[#725e69]"><span>Activity total</span><span>{money(b.subtotalCents)}</span></div>
            <div className="flex justify-between text-[#725e69]"><span>Platform fee (15%)</span><span>−{money(Math.round(b.subtotalCents * 0.15))}</span></div>
            <div className="my-2 border-t border-[#dfd2c9]" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#9d557e]">Your payout</span>
              <span className="font-serif text-2xl text-[#48213d]">{money(b.companionPayoutCents)}</span>
            </div>
          </div>

          {/* Timeline */}
          {(b.confirmedAt || b.depositPaidAt) && (
            <div className="mt-6 space-y-2 rounded-[14px] border border-[#dfd2c9] bg-white/50 p-4">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Timeline</p>
              {b.depositPaidAt && <p className="flex items-center gap-2 text-xs text-[#725e69]"><Check className="h-3 w-3 text-[#477254]" />Deposit received {new Date(b.depositPaidAt).toLocaleString()}</p>}
              {b.confirmedAt && <p className="flex items-center gap-2 text-xs text-[#725e69]"><Check className="h-3 w-3 text-[#477254]" />You confirmed {new Date(b.confirmedAt).toLocaleString()}</p>}
            </div>
          )}

          {!isChatOpen && b.status === 'requested' && (
            <div className="mt-6 rounded-[14px] bg-[#f3ead7] p-4 text-xs leading-5 text-[#7a5a12]">
              <Clock3 className="mb-1 h-4 w-4" />
              Waiting for the customer's deposit. The chat thread and your response options will appear once payment clears.
            </div>
          )}

          {b.safeSpotId && (
            <div className="mt-6 rounded-[16px] border border-[#c7d9cb] bg-[#eef6ef] p-5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.15em] text-[#477254]">Meet Here</p>
              <p className="mt-2 text-sm font-semibold text-[#31533f]">
                {['confirmed', 'authorized', 'completed'].includes(b.status)
                  ? 'You agreed to the customer's public SafeSpot'
                  : 'Customer proposed a public SafeSpot — accepting agrees to Meet Here'}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#53725d]">
                This is a public venue, never a home or workplace. Companions are never shown as live pins.
              </p>
            </div>
          )}

          {/* Accept / Decline actions */}
          {canRespond && (
            <div className="mt-6 rounded-[20px] border border-[#c7d9cb] bg-[#f4faf5] p-5" data-testid="booking-response-panel">
              <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#477254]">Your response</p>
              <p className="mt-1 text-xs leading-5 text-[#53725d]">Review the booking details above, then accept or decline. Accepting agrees to the customer's public SafeSpot (Meet Here). Home and work addresses are never used.</p>

              {confirming === 'accept' && (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={welcomeMsg}
                    onChange={(e) => setWelcomeMsg(e.target.value)}
                    placeholder="Optional welcome note (e.g. 'Looking forward to this! I'll be near the entrance at 2.')"
                    rows={2}
                    maxLength={300}
                    className="w-full resize-none rounded-xl border border-[#c7d9cb] bg-white p-3 text-sm leading-6 outline-none focus:border-[#477254]"
                    data-testid="input-welcome-message"
                  />
                  {b.boundaryReceipt?.clauses?.length ? (
                    <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl bg-white/70 p-3 text-[11px] leading-4 text-[#53725d]">
                      {b.boundaryReceipt.clauses.map((clause) => (
                        <li key={clause}>{clause}</li>
                      ))}
                    </ul>
                  ) : null}
                  <label className="flex items-start gap-2 text-[11px] leading-4 text-[#31533f]">
                    <input type="checkbox" checked={agreeReceipt} onChange={(e) => setAgreeReceipt(e.target.checked)}
                      className="mt-0.5 accent-[#477254]" data-testid="checkbox-companion-receipt" />
                    I agree to this Boundary Receipt, including the public SafeSpot. Changing it later requires a new booking both people sign.
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={accept.isPending || !agreeReceipt}
                      onClick={() => accept.mutate({ id: b.id, welcomeMessage: welcomeMsg, agreeReceipt: true }, { onSuccess: () => { setConfirming(null); refetch(); } })}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-[#477254] px-5 text-xs font-bold text-white disabled:opacity-60"
                      data-testid="button-confirm-accept">
                      <Check className="h-3.5 w-3.5" />{accept.isPending ? 'Accepting…' : 'Accept booking'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="h-10 rounded-full px-4 text-xs font-bold text-[#654c5f] hover:bg-[#e8f0e8]">Cancel</button>
                  </div>
                </div>
              )}

              {confirming === 'decline' && (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Optional decline reason (not shown publicly)"
                    rows={2}
                    maxLength={200}
                    className="w-full resize-none rounded-xl border border-[#f9c4c0] bg-white p-3 text-sm leading-6 outline-none focus:border-[#e05b5b]"
                    data-testid="input-decline-reason"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={decline.isPending}
                      onClick={() => decline.mutate(b.id, { onSuccess: () => { setConfirming(null); refetch(); } })}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-[#a64742] px-5 text-xs font-bold text-white disabled:opacity-60"
                      data-testid="button-confirm-decline">
                      {decline.isPending ? 'Declining…' : 'Decline this booking'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="h-10 rounded-full px-4 text-xs font-bold text-[#654c5f] hover:bg-[#f0e4db]">Cancel</button>
                  </div>
                </div>
              )}

              {!confirming && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={() => setConfirming('accept')}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[#477254] px-5 text-xs font-bold text-white hover:bg-[#31533f]"
                    data-testid="button-accept-booking">
                    <Check className="h-3.5 w-3.5" />Accept
                  </button>
                  <button type="button" onClick={() => setConfirming('propose')}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-white px-5 text-xs font-bold text-[#654c5f] hover:border-[#9d557e] hover:text-[#7f2e62]"
                    data-testid="button-propose-alternative">
                    <CalendarDays className="h-3.5 w-3.5" />Propose alternative
                  </button>
                  <button type="button" onClick={() => setConfirming('decline')}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-white px-5 text-xs font-bold text-[#654c5f] hover:border-[#e05b5b] hover:text-[#a64742]"
                    data-testid="button-decline-booking">
                    Decline
                  </button>
                </div>
              )}

              {confirming === 'propose' && (
                <ProposeAlternativePanel
                  bookingId={b.id}
                  onSent={() => { setConfirming(null); refetch(); }}
                  onCancel={() => setConfirming(null)}
                />
              )}
            </div>
          )}

          <p className="mt-6 font-mono text-[10px] text-[#a38c95]">BOOKING {b.id}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/companion" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white">
              <ArrowLeft className="h-3.5 w-3.5" />Back to inbox
            </Link>
            {(b.status === 'confirmed' || b.status === 'authorized') && (
              <Link href={`/favor/${b.id}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f]">
                <ShieldCheck className="h-3.5 w-3.5" />Open Favor Mode
              </Link>
            )}
          </div>
        </div>

        {/* Chat thread */}
        <BookingChat bookingId={b.id} status={b.status} viewerRole="companion" />
      </main>
    </Shell>
  );
}

const BOOKING_STEPS = [
  { id: 'requested',    label: 'Requested',    desc: 'Companion notified' },
  { id: 'deposit_paid', label: 'Chat open',     desc: '$10 deposit paid' },
  { id: 'confirmed',    label: 'Confirmed',     desc: 'Companion accepted' },
  { id: 'active',       label: 'Your day',      desc: 'Favor in progress' },
  { id: 'completed',    label: 'Complete',      desc: 'All done' },
];

function statusToStep(status: string) {
  if (status === 'completed') return 4;
  if (status === 'active')    return 3;
  if (status === 'confirmed') return 2;
  if (status === 'deposit_paid') return 1;
  return 0;
}

function BookingProgressStepper({ status }: { status: string }) {
  const current = statusToStep(status);
  return (
    <div className="mb-8 flex items-start" role="list" aria-label="Booking progress">
      {BOOKING_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.id} className="flex flex-1 flex-col items-center" role="listitem">
            <div className="flex w-full items-center">
              {i > 0 && (
                <div className={`h-0.5 flex-1 transition-colors duration-500 ${done ? 'bg-[#7f2e62]' : 'bg-[#dfd2c9]'}`} />
              )}
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-500 ${done ? 'bg-[#7f2e62] text-white' : active ? 'bg-[#ead0dd] text-[#7f2e62] ring-2 ring-[#7f2e62] ring-offset-1' : 'border-2 border-[#dfd2c9] text-[#c6aeb8]'}`}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              {i < BOOKING_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 transition-colors duration-500 ${i < current ? 'bg-[#7f2e62]' : 'bg-[#dfd2c9]'}`} />
              )}
            </div>
            <p className={`mt-2 text-center text-[9px] font-bold uppercase tracking-wide leading-3 ${active || done ? 'text-[#7f2e62]' : 'text-[#c4aab8]'}`}>{step.label}</p>
            <p className="mt-0.5 hidden text-center text-[8px] leading-3 text-[#c4aab8] sm:block">{step.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

function BookingStatus() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { ids: savedIds, toggle: toggleSaved } = useSavedCompanionIds();
  const bookingQuery = useBooking(id);
  const companionQuery = useGetCompanion(bookingQuery.data?.companionId ?? '', {
    query: { enabled: Boolean(bookingQuery.data?.companionId), queryKey: getGetCompanionQueryKey(bookingQuery.data?.companionId ?? '') },
  });

  const currentStatus = bookingQuery.data?.status ?? '';
  // Poll the booking row while payment or accept is outstanding. Stripe.js success does not write status.
  useEffect(() => {
    const PENDING = new Set(['requested', 'deposit_paid', 'authorized']);
    if (!currentStatus || !PENDING.has(currentStatus)) return;
    const interval = setInterval(() => bookingQuery.refetch(), currentStatus === 'requested' ? 5_000 : 15_000);
    return () => clearInterval(interval);
  }, [currentStatus]);

  if (!id) { navigate('/explore'); return null; }

  if (bookingQuery.isLoading) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><LoadingState label="Loading your booking" /></main></Shell>
  );
  if (bookingQuery.isError || !bookingQuery.data) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => bookingQuery.refetch()} /></main></Shell>
  );

  const b = bookingQuery.data;
  const c = companionQuery.data;
  const isConfirmed = b.status === 'confirmed' || b.status === 'completed';
  const isDepositPaid = b.status === 'deposit_paid';
  const isCompleted = b.status === 'completed';

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/dashboard/customer" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-back-dashboard">
          <ArrowLeft className="h-4 w-4" />Back to workspace
        </Link>

        <BookingProgressStepper status={b.status} />

        <div className={`rounded-[26px] p-8 md:p-12 ${isConfirmed ? 'bg-[#e8f0e8]' : isDepositPaid ? 'bg-[#ead0dd]' : 'border border-[#dfd2c9] bg-[#fbf7f1]'}`}>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusBadge status={b.status} />
              <h1 className="mt-4 font-serif text-4xl leading-none text-[#48213d]">
                {isConfirmed ? 'Booking confirmed.' : isDepositPaid ? 'Chat unlocked.' : 'Request received.'}
              </h1>
              {c && <p className="mt-2 text-sm text-[#725e69]">with {c.displayName} · {b.activity}</p>}
              {b.status === 'requested' && (
                <p className="mt-3 max-w-md text-xs leading-5 text-[#806c76]">
                  If you just paid, wait here. Only a signed Stripe webhook marks this booking paid — the payment screen cannot.
                </p>
              )}
              {b.status === 'expired' && (
                <p className="mt-3 max-w-md text-xs leading-5 text-[#806c76]">
                  The 10-minute reservation hold expired before payment was confirmed. Start a new request for this time.
                </p>
              )}
            </div>
            <div className={`grid h-12 w-12 place-items-center rounded-2xl ${isConfirmed ? 'bg-[#477254] text-white' : isDepositPaid ? 'bg-[#7f2e62] text-white' : 'bg-[#ead0dd] text-[#7f2e62]'}`}>
              {isConfirmed ? <Check /> : isDepositPaid ? <MessageSquare className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
            </div>
          </div>

          {/* Countdown — only show for future confirmed bookings */}
          {isConfirmed && !isCompleted && (() => {
            const bookingDate = new Date(b.date + 'T00:00:00');
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const diffMs = bookingDate.getTime() - now.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays < 0) return null;
            return (
              <div className="mt-5 flex items-center gap-4 rounded-[16px] bg-[#477254]/10 px-5 py-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#477254] text-white">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#477254]">Countdown</p>
                  <p className="mt-0.5 font-serif text-2xl leading-none text-[#31533f]">
                    {diffDays === 0 ? 'Today! 🎉' : diffDays === 1 ? 'Tomorrow' : `${diffDays} days away`}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Details */}
          <div className="mt-6 grid gap-3 rounded-[16px] border border-[#dfd2c9] bg-white/60 p-5 text-sm sm:grid-cols-2">
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Date</p><p className="mt-1 font-semibold text-[#48213d]">{b.date}</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Time</p><p className="mt-1 font-semibold text-[#48213d]">{b.startTime}</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Duration</p><p className="mt-1 font-semibold text-[#48213d]">{b.durationHours}h</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Activity</p><p className="mt-1 font-semibold text-[#48213d]">{b.activity}</p></div>
          </div>

          {b.safeSpotId && (
            <div className="mt-4 rounded-[16px] border border-[#c7d9cb] bg-[#eef6ef] p-5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.15em] text-[#477254]">Meet Here</p>
              <p className="mt-2 text-sm font-semibold text-[#31533f]">
                {['confirmed', 'authorized', 'completed'].includes(b.status)
                  ? 'Agreed public SafeSpot'
                  : 'Proposed public SafeSpot — agreed when your companion accepts'}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#53725d]">
                This is a public venue, not a home or workplace. Exact pins stay off the directory.
              </p>
            </div>
          )}

          {/* Price breakdown */}
          <div className="mt-6 space-y-2 border-t border-[#dfd2c9] pt-5">
            <div className="flex items-center justify-between text-sm text-[#725e69]"><span>Activity total</span><span>{money(b.subtotalCents)}</span></div>
            <div className="flex items-center justify-between text-sm text-[#725e69]"><span>Safety &amp; service fee (5%)</span><span>+{money(b.customerFeeCents)}</span></div>
            <div className="my-2 border-t border-[#dfd2c9]" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#9d557e]">Total</span>
              <span className="font-serif text-3xl text-[#48213d]">{money(b.totalCents)}</span>
            </div>
          </div>

          {/* Timeline */}
          {(b.depositPaidAt || b.confirmedAt || b.authorizedAt) && (
            <div className="mt-6 space-y-2 rounded-[14px] border border-[#dfd2c9] bg-white/50 p-4">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Payment timeline</p>
              {b.depositPaidAt && <p className="flex items-center gap-2 text-xs text-[#725e69]"><Check className="h-3 w-3 text-[#477254]" />Deposit received {new Date(b.depositPaidAt).toLocaleString()}</p>}
              {b.authorizedAt && <p className="flex items-center gap-2 text-xs text-[#725e69]"><Check className="h-3 w-3 text-[#477254]" />Payment authorised {new Date(b.authorizedAt).toLocaleString()}</p>}
              {b.confirmedAt && <p className="flex items-center gap-2 text-xs text-[#725e69]"><Check className="h-3 w-3 text-[#477254]" />Booking confirmed {new Date(b.confirmedAt).toLocaleString()}</p>}
            </div>
          )}

          {/* Boundary receipt — stored snapshot */}
          {b.boundaryReceipt && (
            <div className="mt-6 rounded-[16px] border border-[#c7d9cb] bg-[#eef6ef] p-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[#477254]" />
                <p className="font-mono text-[9px] font-bold uppercase tracking-[.15em] text-[#477254]">Boundary receipt</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#53725d]">
                {b.boundaryReceipt.customerAgreedAt && b.boundaryReceipt.companionAgreedAt
                  ? 'Both people signed this snapshot. A change to time, venue, or activity needs a new booking.'
                  : b.boundaryReceipt.customerAgreedAt
                    ? 'You signed. Your companion signs the same clauses when they accept.'
                    : 'Sign this receipt before payment.'}
              </p>
              <ul className="mt-3 space-y-1.5">
                {b.boundaryReceipt.clauses.map((boundary) => (
                  <li key={boundary} className="flex items-start gap-2 text-xs leading-5 text-[#31533f]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#477254]" />{boundary}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10px] text-[#63816a]">
                Customer {b.boundaryReceipt.customerAgreedAt ? 'signed' : 'pending'} · Companion {b.boundaryReceipt.companionAgreedAt ? 'signed' : 'pending'}
              </p>
            </div>
          )}

          {/* Status message */}
          {!isConfirmed && !isDepositPaid && b.status === 'requested' && (
            <div className="mt-6 rounded-[14px] bg-[#f3ead7] p-4 text-xs leading-5 text-[#7a5a12]">
              <Clock3 className="mb-1 h-4 w-4" />
              Waiting for payment confirmation. This page updates automatically — no need to refresh.
            </div>
          )}

          <p className="mt-6 font-mono text-[10px] text-[#a38c95]">BOOKING {b.id}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            {isCompleted && c ? (
              <>
                <Link href={`/book?companion=${c.id}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white"
                  data-testid="link-book-again">
                  Book {c.displayName} again <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/explore"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
                  data-testid="link-booking-explore">
                  <Compass className="h-4 w-4" />Browse companions
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard/customer" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white" data-testid="link-booking-dashboard">
                  Go to workspace <ArrowRight className="h-4 w-4" />
                </Link>
                {isConfirmed && !isCompleted && (
                  <Link href={`/favor/${id}`}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
                    data-testid="link-open-favor-mode">
                    <ShieldCheck className="h-4 w-4" />Open Favor Mode
                  </Link>
                )}
                {isConfirmed && (
                  <Link href={`/receipt/${id}`}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
                    data-testid="link-view-receipt">
                    <FileText className="h-4 w-4" />View receipt
                  </Link>
                )}
                {isConfirmed && (() => {
                  const addToCalendar = () => {
                    const start = `${b.date.replaceAll('-', '')}T${(b.time ?? '10:00').replaceAll(':', '')}00`;
                    const endHour = parseInt((b.time ?? '10:00').split(':')[0]) + (b.durationHours ?? 2);
                    const endMin = (b.time ?? '10:00').split(':')[1];
                    const end = `${b.date.replaceAll('-', '')}T${String(endHour).padStart(2, '0')}${endMin}00`;
                    const title = encodeURIComponent(`OnlyFavors: ${b.activity} with ${c?.displayName ?? 'companion'}`);
                    const details = encodeURIComponent('Booked via OnlyFavors · Platonic companion experience');
                    const location = encodeURIComponent(b.safeSpotId ?? 'SafeSpot TBD');
                    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`, '_blank');
                  };
                  return (
                    <button type="button" onClick={addToCalendar}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
                      data-testid="button-add-to-calendar">
                      <CalendarDays className="h-4 w-4" />Add to calendar
                    </button>
                  );
                })()}
                <Link href="/safety" className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]" data-testid="link-booking-safety">
                  <ShieldCheck className="h-4 w-4" />Safety plan
                </Link>
                {isConfirmed && <ShareBookingButton bookingId={id} />}
                {c && isConfirmed && (
                    <button type="button"
                      onClick={() => { void toggleSaved(c.id); }}
                      className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition ${savedIds.includes(c.id) ? 'border-[#9d557e] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] text-[#654c5f] hover:bg-[#eee2d9]'}`}
                      data-testid="button-save-companion-from-booking">
                      <Heart className={`h-4 w-4 ${savedIds.includes(c.id) ? 'fill-[#7f2e62] text-[#7f2e62]' : ''}`} />
                      {savedIds.includes(c.id) ? 'Saved' : 'Save companion'}
                    </button>
                )}
              </>
            )}
          </div>
          {!['completed', 'cancelled'].includes(b.status) && <CancelBookingButton bookingId={b.id} />}
        </div>

        {isCompleted && c && (
          <div className="mt-5 flex items-center gap-3 rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-4">
            <Heart className="h-5 w-5 shrink-0 text-[#9d557e]" />
            <p className="text-sm text-[#725e69]">
              Enjoyed your time with <strong className="text-[#48213d]">{c.displayName}</strong>?{' '}
              Leave a review to help others find great company.
            </p>
          </div>
        )}

        <BookingChat bookingId={b.id} status={b.status} />

        {isCompleted && <ReviewForm bookingId={b.id} />}
        {isCompleted && c && <KudosCard companionName={c.displayName} bookingId={b.id} />}
        {isCompleted && c && <TipCompanionCard companionName={c.displayName} bookingId={b.id} />}
      </main>
    </Shell>
  );
}

// Extracted sub-component — fixes hooks-in-IIFE from BookingStatus share button
function ShareBookingButton({ bookingId }: { bookingId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}/booking/${bookingId}`)
          .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
          .catch(() => {});
      }}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
      data-testid="button-share-booking">
      {copied ? <><Check className="h-4 w-4 text-[#477254]" />Copied!</> : <><Share2 className="h-4 w-4" />Share</>}
    </button>
  );
}

// Extracted sub-component — fixes hooks-in-IIFE from CompanionBookingDetail propose-alternative
function ProposeAlternativePanel({
  bookingId, onSent, onCancel,
}: { bookingId: string; onSent: () => void; onCancel: () => void }) {
  const [proposeDate, setProposeDate] = useState('');
  const [proposeTime, setProposeTime] = useState('');
  const [proposeNote, setProposeNote] = useState('');
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold text-[#48213d]">Suggest a different time or date</p>
      <div className="flex gap-3">
        <input type="date" value={proposeDate} onChange={(e) => setProposeDate(e.target.value)}
          className="flex-1 h-10 rounded-xl border border-[#dfd2c9] bg-white px-3 text-sm outline-none focus:border-[#9d557e]"
          data-testid="input-propose-date" />
        <input type="time" value={proposeTime} onChange={(e) => setProposeTime(e.target.value)}
          className="flex-1 h-10 rounded-xl border border-[#dfd2c9] bg-white px-3 text-sm outline-none focus:border-[#9d557e]"
          data-testid="input-propose-time" />
      </div>
      <textarea value={proposeNote} onChange={(e) => setProposeNote(e.target.value)}
        placeholder="Optional note for the customer (e.g. 'I'm free the day before if that works?')"
        rows={2} maxLength={200}
        className="w-full resize-none rounded-xl border border-[#dfd2c9] bg-white p-3 text-sm leading-6 outline-none focus:border-[#9d557e]"
        data-testid="textarea-propose-note" />
      <div className="flex gap-2">
        <button type="button" disabled={!proposeDate}
          onClick={() => {
            fetch(`/api/bookings/${bookingId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'companion', content: `Alternative proposal: ${proposeDate}${proposeTime ? ' at ' + proposeTime : ''}${proposeNote ? '. ' + proposeNote : ''}` }),
            }).catch(() => {}).finally(() => onSent());
          }}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-xs font-bold text-white disabled:opacity-50"
          data-testid="button-send-proposal">
          <MessageSquare className="h-3.5 w-3.5" />Send proposal
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-full px-4 text-xs font-bold text-[#654c5f] hover:bg-[#f0e4db]">Cancel</button>
      </div>
    </div>
  );
}

function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const qc = useQueryClient();

  const REASONS = [
    'My schedule changed',
    'I found another option',
    'The companion declined first',
    'I\'m not feeling well',
    'Personal reasons',
    'Other',
  ];

  async function doCancel() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Customer requested cancellation' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Could not cancel');
      }
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel');
    } finally { setLoading(false); }
  }

  if (done) return (
    <div className="mt-4 rounded-[14px] bg-[#f0e4db] p-4 text-xs leading-5 text-[#654c5f]">
      Booking cancelled. This does not automatically refund a Stripe deposit. Email hello@onlyfavors.com if a refund is needed.
    </div>
  );
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      className="mt-4 text-xs font-semibold text-[#9b858e] underline-offset-2 hover:text-[#7f2e62] hover:underline"
      data-testid="button-cancel-booking">
      Need to cancel?
    </button>
  );
  return (
    <div className="mt-4 rounded-[16px] border border-[#f0d5d5] bg-[#fdf6f6] p-5">
      <p className="text-sm font-semibold text-[#5a2020]">Cancel this booking?</p>
      <p className="mt-1 text-xs leading-5 text-[#725e69]">This marks the booking cancelled. It does not refund Stripe automatically, and the companion is not emailed from this action.</p>
      <div className="mt-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#9b858e]">Reason (optional)</p>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r} type="button"
              onClick={() => setReason(reason === r ? '' : r)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${reason === r ? 'border-[#a83232] bg-[#fde8e8] text-[#a83232]' : 'border-[#dfd2c9] text-[#654c5f] hover:border-[#a83232]'}`}
              data-testid={`cancel-reason-${r.replace(/\W+/g, '-').toLowerCase()}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-[#a64742]">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={doCancel} disabled={loading}
          className="inline-flex h-9 items-center rounded-full bg-[#a83232] px-4 text-xs font-bold text-white disabled:opacity-50"
          data-testid="button-confirm-cancel">
          {loading ? 'Cancelling…' : 'Yes, cancel'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f]">
          Keep booking
        </button>
      </div>
    </div>
  );
}

type PayoutStatus = { status: 'not_started' | 'pending' | 'active'; detailsSubmitted?: boolean; payoutsEnabled?: boolean };

function useCompanionPayoutStatus() {
  return useQuery<PayoutStatus>({
    queryKey: ['companion-payout-status'],
    queryFn: async () => {
      const res = await fetch('/api/companion/stripe/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to check payout status');
      return res.json() as Promise<PayoutStatus>;
    },
    retry: 1,
  });
}

function useStartPayoutOnboarding() {
  return useMutation<{ url: string }, Error>({
    mutationFn: async () => {
      const res = await fetch('/api/companion/stripe/onboard', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to start payout setup');
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => { window.location.href = data.url; },
  });
}

type WorkspacePrefsData = {
  quietHours: { enabled: boolean; start: string; end: string };
  away: { enabled: boolean; returnDate: string; note: string; pausedByAway?: boolean };
};

function useWorkspacePrefs() {
  return useQuery<WorkspacePrefsData>({
    queryKey: ['companion-workspace-prefs'],
    queryFn: async () => {
      const res = await fetch('/api/companion/workspace-prefs', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load workspace preferences');
      return res.json() as Promise<WorkspacePrefsData>;
    },
    retry: 1,
  });
}

function useUpdateWorkspacePrefs() {
  const qc = useQueryClient();
  return useMutation<WorkspacePrefsData, Error, WorkspacePrefsData>({
    mutationFn: async (data) => {
      const res = await fetch('/api/companion/workspace-prefs', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save workspace preferences');
      return res.json() as Promise<WorkspacePrefsData>;
    },
    onSuccess: (data) => {
      qc.setQueryData(['companion-workspace-prefs'], data);
      qc.invalidateQueries({ queryKey: ['companion-paused'] });
    },
  });
}

function CompanionProfileLinkCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = url; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5"
      data-testid="companion-profile-link-card">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
          <Share2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#48213d]">Your profile link</p>
          <p className="truncate text-[10px] text-[#806c76]">{url}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition ${copied ? 'bg-[#e8f0e8] text-[#477254]' : 'border border-[#dfd2c9] text-[#654c5f] hover:border-[#7f2e62] hover:text-[#7f2e62]'}`}
        data-testid="button-copy-profile-link">
        {copied ? <><Check className="h-3.5 w-3.5" />Copied!</> : <><Share2 className="h-3.5 w-3.5" />Copy link</>}
      </button>
    </div>
  );
}

function QuietHoursToggle() {
  const prefs = useWorkspacePrefs();
  const savePrefs = useUpdateWorkspacePrefs();
  if (!prefs.data) return null;
  const cfg = prefs.data.quietHours;
  const update = (next: WorkspacePrefsData['quietHours']) => {
    savePrefs.mutate({ quietHours: next, away: prefs.data!.away });
  };

  // Determine if currently in quiet hours
  const isNowQuiet = (() => {
    if (!cfg.enabled) return false;
    const now = new Date();
    const [sh, sm] = cfg.start.split(':').map(Number);
    const [eh, em] = cfg.end.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (startMins <= endMins) return nowMins >= startMins && nowMins < endMins;
    return nowMins >= startMins || nowMins < endMins; // overnight span
  })();

  return (
    <div className="mt-3 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5" data-testid="quiet-hours-toggle">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cfg.enabled ? 'bg-[#3d2038]' : 'bg-[#ead0dd]'}`}>
            <Bell className={`h-5 w-5 ${cfg.enabled ? 'text-[#f0c8dc]' : 'text-[#7f2e62]'}`} />
          </span>
          <div>
            <p className="text-sm font-bold text-[#48213d]">Quiet hours</p>
            <p className="text-[10px] text-[#806c76]">
              {cfg.enabled && isNowQuiet ? <span className="text-[#7f2e62] font-bold">Active now — request alerts are held</span>
                : cfg.enabled ? `${cfg.start} – ${cfg.end} · not active now`
                : 'Hold new-request alerts during set hours'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cfg.enabled}
          onClick={() => update({ ...cfg, enabled: !cfg.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${cfg.enabled ? 'bg-[#3d2038]' : 'bg-[#c6aeb8]'}`}
          data-testid="toggle-quiet-hours">
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {cfg.enabled && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#ece1d9] pt-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-[#654c5f]">From</span>
            <input type="time" value={cfg.start} onChange={(e) => update({ ...cfg, start: e.target.value })}
              className="h-9 w-full rounded-xl border border-[#cbbab5] bg-white px-3 text-sm outline-none focus:border-[#7f2e62]"
              data-testid="input-quiet-start" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-[#654c5f]">Until</span>
            <input type="time" value={cfg.end} onChange={(e) => update({ ...cfg, end: e.target.value })}
              className="h-9 w-full rounded-xl border border-[#cbbab5] bg-white px-3 text-sm outline-none focus:border-[#7f2e62]"
              data-testid="input-quiet-end" />
          </label>
          <p className="col-span-2 text-[9px] text-[#9b858e]">
            Set to overnight by default (10 pm – 8 am). This is a preference for your workspace, not a guarantee that messages are blocked.
          </p>
        </div>
      )}
    </div>
  );
}

function AwayModeCard() {
  const prefs = useWorkspacePrefs();
  const savePrefs = useUpdateWorkspacePrefs();
  const [draft, setDraft] = useState({ returnDate: '', note: '' });
  const [open, setOpen] = useState(false);
  if (!prefs.data) return null;
  const cfg = prefs.data.away;

  const persist = (next: WorkspacePrefsData['away']) => {
    savePrefs.mutate({ quietHours: prefs.data!.quietHours, away: next });
  };
  const disableAway = () => persist({ ...cfg, enabled: false });
  const enableAway = () => {
    persist({ ...cfg, returnDate: draft.returnDate, note: draft.note, enabled: true });
    setOpen(false);
  };

  return (
    <div className="mt-3 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5" data-testid="away-mode-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cfg.enabled ? 'bg-[#3d2038]' : 'bg-[#ead0dd]'}`}>
            <Navigation2 className={`h-5 w-5 ${cfg.enabled ? 'text-[#f0c8dc]' : 'text-[#7f2e62]'}`} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#48213d]">Away mode</p>
            <p className="text-[10px] text-[#806c76]">
              {cfg.enabled
                ? <span className="font-bold text-[#7f2e62]">On{cfg.returnDate ? ` · back ${cfg.returnDate}` : ''}</span>
                : 'Set an extended absence with a return date'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cfg.enabled && (
            <button type="button" onClick={disableAway}
              className="h-8 rounded-full border border-[#dfd2c9] px-3 text-[10px] font-bold text-[#654c5f] hover:border-[#7f2e62]"
              data-testid="button-disable-away">
              Return
            </button>
          )}
          <button type="button" onClick={() => {
            setDraft({ returnDate: cfg.returnDate, note: cfg.note });
            setOpen((p) => !p);
          }}
            className={`h-8 rounded-full px-3 text-[10px] font-bold transition ${cfg.enabled ? 'bg-[#3d2038] text-[#f0c8dc]' : 'bg-[#ead0dd] text-[#7f2e62] hover:bg-[#c695ae] hover:text-white'}`}
            data-testid="button-toggle-away-form">
            {cfg.enabled ? 'Edit' : 'Set away'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-[#ece1d9] pt-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-[#654c5f]">Return date (optional)</span>
            <input type="date" value={draft.returnDate}
              onChange={(e) => setDraft((p) => ({ ...p, returnDate: e.target.value }))}
              className="h-9 w-full rounded-xl border border-[#cbbab5] bg-white px-3 text-sm outline-none focus:border-[#7f2e62]"
              data-testid="input-away-return-date" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-[#654c5f]">Message for customers (optional)</span>
            <input type="text" maxLength={100} value={draft.note} placeholder="e.g. On a trip — back soon!"
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              className="h-9 w-full rounded-xl border border-[#cbbab5] bg-white px-3 text-sm outline-none focus:border-[#7f2e62]"
              data-testid="input-away-note" />
          </label>
          <button type="button" onClick={enableAway}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white"
            data-testid="button-confirm-away">
            <Check className="h-3.5 w-3.5" />Enable away mode
          </button>
          <p className="text-[9px] text-[#9b858e]">Customers see a "currently away" notice on your profile. New booking requests are paused.</p>
        </div>
      )}
    </div>
  );
}

function PauseRequestsToggle() {
  const qc = useQueryClient();
  const pausedQuery = useQuery<{ paused: boolean }>({
    queryKey: ['companion-paused'],
    queryFn: async () => {
      const res = await fetch('/api/companion/requests/paused', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load pause state');
      return res.json() as Promise<{ paused: boolean }>;
    },
  });
  const [saving, setSaving] = useState(false);
  const paused = pausedQuery.data?.paused ?? null;

  const toggle = async () => {
    const next = !paused;
    setSaving(true);
    try {
      const res = await fetch('/api/companion/requests/pause', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
      if (res.ok) {
        const d = await res.json() as { paused: boolean };
        qc.setQueryData(['companion-paused'], d);
      }
    } catch {}
    setSaving(false);
  };

  if (paused === null) return null;

  return (
    <div className={`mt-3 flex items-center justify-between gap-4 rounded-[20px] border p-5 transition ${paused ? 'border-[#f0d5d5] bg-[#fdf6f6]' : 'border-[#dfd2c9] bg-[#fbf7f1]'}`}
      data-testid="pause-requests-toggle">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${paused ? 'bg-[#e8c7c7] text-[#a64742]' : 'bg-[#ead0dd] text-[#7f2e62]'}`}>
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-[#48213d]">
            {paused ? 'New requests paused' : 'Accepting new requests'}
          </p>
          <p className="text-[10px] text-[#806c76]">
            {paused
              ? 'Customers cannot send new booking requests until you resume.'
              : 'Toggle off to stop new requests while you catch up.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${paused ? 'bg-[#a64742]' : 'bg-[#c4a5b5]'}`}
        aria-label="Toggle pause new requests"
        data-testid="button-toggle-pause-requests">
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${paused ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function AvailabilityTodayToggle() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/companion/availability/today', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setAvailable(d.available); })
      .catch(() => {});
  }, []);

  const toggle = async () => {
    const next = !available;
    setSaving(true);
    try {
      const res = await fetch('/api/companion/availability/today', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: next }),
      });
      if (res.ok) { const d = await res.json(); setAvailable(d.available); }
    } catch {}
    setSaving(false);
  };

  if (available === null) return null;

  return (
    <div className={`mt-8 flex items-center justify-between gap-4 rounded-[20px] border p-5 transition ${available ? 'border-[#b3d4bc] bg-[#eef5f0]' : 'border-[#dfd2c9] bg-[#fbf7f1]'}`}
      data-testid="availability-today-toggle">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${available ? 'bg-[#477254] text-white' : 'bg-[#ead0dd] text-[#7f2e62]'}`}>
          <Zap className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-[#48213d]">
            {available ? 'You\'re marked available today' : 'Not available today'}
          </p>
          <p className="text-[10px] text-[#806c76]">
            {available
              ? 'Your profile shows an "Available tonight" badge in the explore feed.'
              : 'Toggle on to show customers you\'re open to same-day bookings.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${available ? 'bg-[#477254]' : 'bg-[#c4a5b5]'}`}
        aria-label="Toggle availability today"
        data-testid="button-toggle-available-today">
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${available ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function PayoutSetup({ stripeReturn }: { stripeReturn: boolean }) {
  const { data, isLoading, refetch } = useCompanionPayoutStatus();
  const onboard = useStartPayoutOnboarding();

  useEffect(() => { if (stripeReturn) refetch(); }, [stripeReturn, refetch]);

  if (isLoading) return null;

  const status = data?.status ?? 'not_started';

  if (status === 'active') {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#c7d9cb] bg-[#e8f0e8] px-6 py-4" data-testid="payout-status-active">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#cad8cb] text-[#31533f]"><Check className="h-4 w-4" /></span>
        <div className="flex-1">
          <p className="text-sm font-bold text-[#31533f]">Payouts active</p>
          <p className="text-xs text-[#53725d]">Earnings from confirmed bookings transfer to your bank automatically.</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="mt-6 rounded-2xl border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="payout-status-pending">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Payout setup</p>
            <h2 className="mt-2 font-serif text-2xl text-[#48213d]">One step left.</h2>
            <p className="mt-2 text-sm leading-6 text-[#725e69]">Your Stripe account was created but needs a few more details before payouts can be sent.</p>
          </div>
          <WalletCards className="mt-1 h-6 w-6 shrink-0 text-[#9b6b88]" />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} testId="button-payout-finish">
            {onboard.isPending ? 'Opening Stripe…' : 'Finish setup'}<ArrowRight className="h-4 w-4" />
          </Button>
          <button onClick={() => refetch()} type="button" className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-xs font-bold text-[#7f2e62] transition hover:bg-[#ead0dd]" data-testid="button-payout-refresh">
            <RefreshCw className="h-3.5 w-3.5" />Check again
          </button>
        </div>
        {onboard.isError && <p className="mt-3 text-xs text-[#a64742]">{onboard.error.message}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="payout-status-not-started">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Payout setup</p>
          <h2 className="mt-2 font-serif text-2xl text-[#48213d]">Get paid for your time.</h2>
          <p className="mt-2 text-sm leading-6 text-[#725e69]">Connect a bank account through Stripe so earnings from confirmed bookings land automatically. Takes about 5 minutes.</p>
        </div>
        <WalletCards className="mt-1 h-6 w-6 shrink-0 text-[#9b6b88]" />
      </div>
      <div className="mt-5">
        <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} testId="button-payout-start">
          {onboard.isPending ? 'Opening Stripe…' : 'Set up payouts'}<ArrowRight className="h-4 w-4" />
        </Button>
        {stripeReturn && <p className="mt-3 text-xs text-[#9a6d25]">We got your return from Stripe — your account is still being reviewed. Give it a moment and check again.</p>}
      </div>
      {onboard.isError && <p className="mt-3 text-xs text-[#a64742]">{onboard.error.message}</p>}
    </div>
  );
}

function CompanionAvailabilityToggle() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch('/api/companion/requests/paused', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAvailable(!d.paused); })
      .catch(() => setAvailable(true));
  }, []);

  const toggle = async () => {
    if (available === null) return;
    const next = !available;
    setAvailable(next);
    setSyncing(true);
    try {
      const res = await fetch('/api/companion/requests/pause', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !next }),
      });
      if (res.ok) {
        const d = await res.json() as { paused: boolean };
        setAvailable(!d.paused);
      }
    } catch {}
    setSyncing(false);
  };

  if (available === null) return null;

  return (
    <button type="button" onClick={toggle} disabled={syncing}
      className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-bold transition disabled:opacity-70 ${
        available
          ? 'border-[#5a8c6a] bg-[#e8f0e8] text-[#2d5c3e] hover:bg-[#d5e8d5]'
          : 'border-[#dfd2c9] bg-[#fbf7f1] text-[#9b858e] hover:border-[#9d557e]'
      }`}
      data-testid="button-availability-toggle">
      <span className={`h-2 w-2 rounded-full transition ${syncing ? 'animate-pulse bg-[#bf8750]' : available ? 'bg-[#477254]' : 'bg-[#c6aeb8]'}`} />
      {syncing ? 'Updating…' : available ? 'Available' : 'Unavailable'}
    </button>
  );
}

function Dashboard({ mode }: { mode: 'customer' | 'companion' }) {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!authLoading && !user) navigate(mode === 'companion' ? '/login?intent=companion' : '/login?intent=customer');
    if (!authLoading && user && mode === 'companion' && !user.roles.includes('companion')) {
      navigate(user.companionApplicationStatus === 'pending' || user.companionApplicationStatus === 'draft'
        ? '/companion/apply/status'
        : '/companion/apply');
    }
  }, [authLoading, user, mode, navigate]);
  const isCustomer = mode === 'customer';
  const signedIn = Boolean(user);
  const customer  = useGetCustomerDashboard({ query: { enabled: isCustomer && signedIn,  queryKey: getGetCustomerDashboardQueryKey() } });
  const companion = useGetCompanionDashboard({ query: { enabled: !isCustomer && signedIn, queryKey: getGetCompanionDashboardQueryKey() } });
  const companionProfile = useCompanionProfile(!isCustomer && signedIn);
  const query = isCustomer ? customer : companion;

  const customerBookings  = useCustomerBookings(isCustomer && signedIn);
  const companionBookings = useCompanionBookings(!isCustomer && signedIn);
  const bookingsList = isCustomer ? (customerBookings.data ?? []) : (companionBookings.data ?? []);

  if (authLoading || !user) return <Shell><main className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><LoadingState label="Preparing your workspace" /></main></Shell>;
  if (query.isLoading) return <Shell><main className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><LoadingState label="Preparing your workspace" /></main></Shell>;
  if (query.isError)   return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => query.refetch()} /></main></Shell>;

  const stats = isCustomer
    ? [{ label: 'Upcoming bookings', value: customer.data?.upcomingBookings ?? 0, icon: CalendarDays }, { label: 'Completed together', value: customer.data?.completedBookings ?? 0, icon: Check }, { label: 'Saved companions', value: customer.data?.savedCompanions ?? 0, icon: HeartHandshake }, { label: 'Safety plans', value: customer.data?.safetyPlans ?? 0, icon: ShieldCheck }]
    : [{ label: 'Pending requests', value: companion.data?.pendingRequests ?? 0, icon: ClipboardCheck }, { label: 'Upcoming bookings', value: companion.data?.upcomingBookings ?? 0, icon: CalendarDays }, { label: 'Earnings', value: money(companion.data?.earningsCents ?? 0), icon: WalletCards }, { label: 'Reviews', value: (companion.data as { reviewCount?: number } | undefined)?.reviewCount ?? 0, icon: Star }];

  const hasData = stats.some((x) => x.value !== 0 && x.value !== '$0.00');
  const stripeReturn = typeof window !== 'undefined' && window.location.search.includes('stripe=return');

  // Next upcoming booking — soonest date among active (non-completed, non-cancelled) bookings
  const UPCOMING_STATUSES = new Set(['requested', 'deposit_paid', 'authorized', 'confirmed']);
  const nextBooking = bookingsList
    .filter((b) => UPCOMING_STATUSES.has(b.status))
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  const nextUpHref = nextBooking
    ? (isCustomer ? `/booking/${nextBooking.id}` : `/companion/booking/${nextBooking.id}`)
    : null;

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">
              {isCustomer ? 'Customer workspace' : 'Companion workspace'}
            </p>
            {user.roles.includes('customer') && user.roles.includes('companion') && (
              <div className="mt-3 flex overflow-hidden rounded-full border border-[#dfd2c9] w-fit">
                <Link href="/dashboard/customer" className={`px-3 py-1.5 text-[11px] font-bold ${isCustomer ? 'bg-[#3d2038] text-white' : 'text-[#654c5f]'}`}>Customer</Link>
                <Link href="/dashboard/companion" className={`px-3 py-1.5 text-[11px] font-bold ${!isCustomer ? 'bg-[#3d2038] text-white' : 'text-[#654c5f]'}`}>Companion</Link>
              </div>
            )}
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">
              {isCustomer ? (() => {
                const h = new Date().getHours();
                const greeting = h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';
                const upcoming = bookingsList.filter((b) => ['confirmed', 'requested', 'deposit_paid', 'authorized'].includes(b.status)).length;
                if (upcoming > 0) return `${greeting}`;
                return greeting;
              })() : 'Your room is ready.'}
            </h1>
            <p className="mt-4 text-sm text-[#725e69]">
              {isCustomer
                ? (() => {
                    const upcoming = bookingsList.filter((b) => ['confirmed', 'requested'].includes(b.status));
                    const next = upcoming.sort((a, b) => a.date.localeCompare(b.date))[0];
                    if (next) return `You have ${upcoming.length} upcoming booking${upcoming.length > 1 ? 's' : ''}. Next: ${next.activity} on ${next.date}.`;
                    const completed = bookingsList.filter((b) => b.status === 'completed').length;
                    if (completed > 0) return `${completed} completed time${completed > 1 ? 's' : ''} together. Ready for another?`;
                    return 'A quiet place to keep plans, favorites, and safety details together.';
                  })()
                : 'Keep your availability, requests, and earnings in one considered place.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start md:self-auto">
            {!isCustomer && <CompanionAvailabilityToggle />}
            {!isCustomer && (
              <Link href="/companion/onboarding"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-onboarding">
                <Sparkles className="h-4 w-4" />Onboarding
              </Link>
            )}
            {!isCustomer && (
              <Link href="/dashboard/companion/schedule"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-schedule">
                <CalendarDays className="h-4 w-4" />Schedule
              </Link>
            )}
            {!isCustomer && (
              <Link href="/dashboard/companion/earnings"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-earnings">
                <WalletCards className="h-4 w-4" />Earnings
              </Link>
            )}
            {!isCustomer && (
              <Link href="/companion/stats"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-stats">
                <TrendingUp className="h-4 w-4" />Stats
              </Link>
            )}
            {!isCustomer && (
              <Link href="/dashboard/companion/payout"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-payout-setup">
                <LockKeyhole className="h-4 w-4" />Payout setup
              </Link>
            )}
            {!isCustomer && (
              <Link href="/dashboard/companion/profile"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-edit-profile">
                <Pencil className="h-4 w-4" />Edit profile
              </Link>
            )}
            {isCustomer && (
              <Link href="/dashboard/customer/bookings"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-customer-bookings">
                <CalendarDays className="h-4 w-4" />Bookings
              </Link>
            )}
            {isCustomer && (
              <Link href="/dashboard/customer/settings"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]"
                data-testid="link-customer-settings">
                <SlidersHorizontal className="h-4 w-4" />Settings
              </Link>
            )}
            <Button variant="outline" onClick={() => query.refetch()} testId="button-refresh-dashboard">
              <RefreshCw className="h-4 w-4" />Refresh
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]"><Icon className="h-4 w-4" /></span>
                <span className="font-mono text-[10px] text-[#ad929e]">LIVE</span>
              </div>
              <p className="mt-7 font-serif text-4xl text-[#48213d]" data-testid={`value-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p>
              <p className="mt-1 text-xs font-semibold text-[#806c76]">{label}</p>
            </div>
          ))}
        </div>

        {/* Customer quick actions */}
        {isCustomer && (
          <div className="mt-8 grid gap-2 grid-cols-2 sm:grid-cols-4" data-testid="customer-quick-actions">
            {[
              { href: '/explore',                    icon: Search,        label: 'Browse companions' },
              { href: '/dashboard/customer/bookings', icon: CalendarDays,  label: 'My bookings'       },
              { href: '/messages',                    icon: MessageSquare, label: 'Messages'           },
              { href: '/saved',                       icon: Heart,         label: 'Saved'              },
              { href: '/gift',                        icon: Gift,          label: 'Gift a favor'      },
              { href: '/refer',                       icon: HeartHandshake,label: 'Refer a friend'    },
              { href: '/safety',                      icon: ShieldCheck,   label: 'Safety centre'     },
              { href: '/dashboard/customer/settings', icon: SlidersHorizontal, label: 'Settings'     },
            ].map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href}
                className="flex items-center gap-3 rounded-[16px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3.5 transition hover:border-[#9d557e] hover:bg-[#fdf5fa]"
                data-testid={`quick-action-${label.toLowerCase().replace(/ /g, '-')}`}>
                <Icon className="h-4 w-4 shrink-0 text-[#9d557e]" />
                <span className="text-xs font-semibold text-[#48213d]">{label}</span>
              </Link>
            ))}
          </div>
        )}

        {isCustomer  && <CustomerBookingList />}
        {isCustomer  && (() => {
          // Review nudge: find most-recently completed booking without a review
          const unreviewedCompleted = bookingsList
            .filter((b) => b.status === 'completed' && !b.reviewed)
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          if (!unreviewedCompleted) return null;
          return (
            <div className="mt-4 flex items-center gap-4 rounded-[20px] border border-[#d5bc8c] bg-[#f3ead7] px-5 py-4" data-testid="review-nudge">
              <Star className="h-5 w-5 shrink-0 fill-[#bf8750] text-[#bf8750]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#48213d]">How was your {unreviewedCompleted.activity}?</p>
                <p className="text-[10px] text-[#806c76]">A quick review helps others find great company.</p>
              </div>
              <Link href={`/review/${unreviewedCompleted.id}`}
                className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#bf8750] px-4 text-xs font-bold text-white"
                data-testid="link-review-nudge">
                Leave a review <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })()}
        {isCustomer && (() => {
          const completed = bookingsList.filter((b) => b.status === 'completed');
          const spentCents = completed.reduce((sum, b) => sum + (b.totalCents ?? 0), 0);
          const hoursTogether = completed.reduce((sum, b) => sum + Number(b.durationHours ?? 0), 0);
          return (
          <div className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="customer-spending-summary">
            {[
              { label: 'Total spent', value: money(spentCents), icon: WalletCards, accent: 'bg-[#ead0dd]', iconColor: 'text-[#7f2e62]' },
              { label: 'Hours of company', value: `${hoursTogether}h`, icon: CalendarDays, accent: 'bg-[#e8f0e8]', iconColor: 'text-[#477254]' },
              { label: 'Credits available', value: '$0', icon: HeartHandshake, accent: 'bg-[#f3ead7]', iconColor: 'text-[#bf8750]' },
            ].map(({ label, value, icon: Icon, accent, iconColor }) => (
              <div key={label} className="flex items-center gap-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}>
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">{label}</p>
                  <p className="mt-0.5 font-serif text-2xl text-[#48213d]">{value}</p>
                </div>
              </div>
            ))}
          </div>
          );
        })()}

        {!isCustomer && (() => {
          const profileUrl = companionProfile.data?.id
            ? `${typeof window !== 'undefined' ? window.location.origin : ''}/companions/${companionProfile.data.id}`
            : '';
          return profileUrl ? <CompanionProfileLinkCard url={profileUrl} /> : null;
        })()}
        {!isCustomer && (() => {
          const pending = bookingsList.filter((b) => b.status === 'requested');
          if (pending.length === 0) return null;
          return (
            <div className="mt-6 rounded-[22px] border border-[#f0d5a0] bg-[#fdf8ee] p-5" data-testid="pending-requests-panel">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex h-2 w-2 rounded-full bg-[#bf8750]" style={{ animation: 'pulse 2s infinite' }} />
                <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9a6d25]">
                  {pending.length} incoming request{pending.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-3">
                {pending.slice(0, 3).map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[#ece4c9] bg-white px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-[#48213d]">{b.activity}</p>
                      <p className="text-[10px] text-[#9b858e]">{b.date} · {b.durationHours}h · {money(b.totalCents)}</p>
                    </div>
                    <Link href={`/companion/booking/${b.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#7f2e62] px-3 text-[10px] font-bold text-white transition hover:bg-[#65234e]"
                      data-testid={`link-request-${b.id}`}>
                      <Check className="h-3 w-3" />Review
                    </Link>
                  </div>
                ))}
              </div>
              {pending.length > 3 && (
                <Link href="/dashboard/companion/inbox" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#9a6d25] hover:underline">
                  +{pending.length - 3} more in inbox <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })()}
        {!isCustomer && <AvailabilityTodayToggle />}
        {!isCustomer && <QuietHoursToggle />}
        {!isCustomer && <AwayModeCard />}
        {!isCustomer && <PauseRequestsToggle />}
        {!isCustomer && <CompanionAchievementsCard bookings={bookingsList} />}
        {!isCustomer && (() => {
          if (!bookingsList.length) return null;
          const completed = bookingsList.filter((b) => b.status === 'completed');
          const accepted  = bookingsList.filter((b) => b.status !== 'cancelled');
          const totalReqs = bookingsList.length;
          const acceptanceRate = totalReqs > 0 ? Math.round((accepted.length / totalReqs) * 100) : null;
          const avgRating = (() => {
            const fromDash = (companion.data as { avgRating?: number | null } | undefined)?.avgRating;
            return fromDash != null ? String(fromDash) : null;
          })();
          const earningsThisMonth = (() => {
            const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            return completed.filter((b) => b.date?.startsWith(month)).reduce((s, b) => s + (b.companionPayoutCents ?? 0), 0);
          })();
          return (
            <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-5" data-testid="performance-card">
              <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Your performance</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Completed', value: String(completed.length), sub: 'bookings' },
                  { label: 'Acceptance rate', value: acceptanceRate !== null ? `${acceptanceRate}%` : '—', sub: `of ${totalReqs} requests` },
                  { label: 'Avg rating', value: avgRating ?? '—', sub: 'from reviews' },
                  { label: 'This month', value: earningsThisMonth > 0 ? money(earningsThisMonth) : '—', sub: 'your earnings' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="rounded-[14px] border border-[#ece1d9] bg-white p-3">
                    <p className="font-mono text-[9px] uppercase tracking-[.1em] text-[#9b858e]">{label}</p>
                    <p className="mt-1.5 font-serif text-2xl text-[#48213d]">{value}</p>
                    <p className="mt-0.5 text-[9px] text-[#b0929f]">{sub}</p>
                  </div>
                ))}
              </div>
              <Link href="/dashboard/companion/earnings" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#9d557e] hover:underline">
                View full earnings <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })()}
        {!isCustomer && <CompanionProfileCompletionCard />}
        {!isCustomer && (() => {
          const lastCompleted = bookingsList.filter((b) => b.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0];
          if (!lastCompleted) return null;
          const kudosCount = 0;
          const reviewed = Boolean(lastCompleted.reviewed);
          return (
            <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-5 py-5" data-testid="last-booking-recap">
              <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Last completed</p>
              <div className="mt-2 flex items-start gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f0e8] text-[#477254]">
                  <Check className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-[#48213d]">{lastCompleted.activity}</p>
                  <p className="mt-0.5 text-[10px] text-[#9b858e]">{lastCompleted.date} · {lastCompleted.durationHours}h</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#ece1d9] px-2.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-[#725e69]">
                      {money(lastCompleted.totalCents)} earned
                    </span>
                    {kudosCount > 0 && (
                      <span className="rounded-full bg-[#ead0dd] px-2.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-[#7f2e62]">
                        {kudosCount} kudos
                      </span>
                    )}
                    {reviewed && (
                      <span className="rounded-full bg-[#e8f0e8] px-2.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-[#477254]">
                        Reviewed ✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {!isCustomer && <PayoutSetup stripeReturn={stripeReturn} />}
        {!isCustomer && <CompanionInbox />}

        {/* Bottom row: Next up + Safety */}
        <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          {/* Next up card */}
          <div className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-7">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Next up</p>
            {nextBooking ? (
              <>
                <h2 className="mt-3 font-serif text-3xl text-[#48213d]">{nextBooking.activity}</h2>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#725e69]">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#9d557e]" />{nextBooking.date}</span>
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#9d557e]" />{nextBooking.startTime} · {nextBooking.durationHours}h</span>
                </div>
                <div className="mt-3">
                  <StatusBadge status={nextBooking.status} />
                </div>
                {nextUpHref && (
                  <Link href={nextUpHref}
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white"
                    data-testid="link-next-booking">
                    View booking <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </>
            ) : (
              <>
                <h2 className="mt-3 font-serif text-3xl text-[#48213d]">
                  {hasData ? 'Your live activity' : 'Nothing on the calendar yet.'}
                </h2>
                {hasData ? (
                  <p className="mt-2 text-sm leading-6 text-[#725e69]">When a booking is scheduled, the details and safety plan will appear here.</p>
                ) : (
                  <EmptyState
                    icon={CalendarDays}
                    title={isCustomer ? 'Make the first plan.' : 'Your next request will land here.'}
                    body={isCustomer
                      ? 'Browse the directory when you are ready to find good company.'
                      : 'Keep your profile clear and availability current so the right requests can find you.'}
                    action={isCustomer
                      ? <Link href="/explore" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white" data-testid="link-dashboard-explore">Explore companions <ArrowRight className="h-3.5 w-3.5" /></Link>
                      : <Link href="/companion/apply" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white" data-testid="link-dashboard-profile">Review application <ArrowRight className="h-3.5 w-3.5" /></Link>}
                  />
                )}
              </>
            )}
          </div>

          {/* Safety card */}
          <div className="rounded-[22px] bg-[#d9e1d7] p-7">
            <ShieldCheck className="h-6 w-6 text-[#477254]" />
            <h2 className="mt-12 font-serif text-3xl leading-none text-[#31533f]">Safety is part of the plan.</h2>
            <p className="mt-3 text-sm leading-6 text-[#53725d]">Every booking keeps public meeting places, clear boundaries, and check-ins close at hand.</p>
            <Link href="/safety" className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-[#477254]" data-testid="link-dashboard-safety">Open safety center <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion onboarding wizard  /companion/onboarding
// ---------------------------------------------------------------------------

function CompanionOnboarding() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const profile = useCompanionProfile();
  const p = profile.data;
  const payout = useCompanionPayoutStatus();
  const profileSaved = Boolean(p?.displayName?.trim() && p?.bio?.trim());
  const qaSaved = (p?.interviewAnswers ?? []).some(Boolean);
  const payoutStatus = payout.data?.status ?? 'not_started';
  const availabilitySet = Boolean(p?.availableDays?.length);
  const identityDone = p?.identityStatus === 'pending' || p?.identityStatus === 'verified';
  const approved = Boolean(user?.companionApproved);

  useEffect(() => {
    if (user && !user.roles.includes('companion')) {
      navigate(user.companionApplicationStatus === 'pending' || user.companionApplicationStatus === 'draft'
        ? '/companion/apply/status'
        : '/companion/apply');
    }
  }, [user, navigate]);

  const STEPS = [
    {
      id: 'profile',
      icon: Pencil,
      title: 'Complete your profile',
      body: 'Add your display name, bio, service area, and hourly rate. This is the first thing customers see.',
      href: '/dashboard/companion/profile',
      done: profileSaved,
      cta: 'Edit profile',
    },
    {
      id: 'identity',
      icon: BadgeCheck,
      title: 'Submit identity for review',
      body: 'A person on the trust team reviews companion ID. This is separate from listing approval.',
      href: '/dashboard/companion/profile',
      done: identityDone,
      cta: 'Open profile',
    },
    {
      id: 'availability',
      icon: CalendarDays,
      title: 'Publish availability',
      body: 'Set weekly windows. You will not receive bookings until you are approved and have availability.',
      href: '/dashboard/companion/schedule',
      done: availabilitySet,
      cta: 'Set availability',
    },
    {
      id: 'payout',
      icon: WalletCards,
      title: 'Connect Stripe for payouts',
      body: 'Connect your Stripe payout account so completed favors can be paid. Payouts follow Stripe’s schedule — we do not promise a weekday.',
      href: '/dashboard/companion/payout',
      done: payoutStatus === 'active',
      cta: 'Set up payouts',
    },
  ];

  const doneCount = STEPS.filter((s) => s.done).length;
  const allDone = doneCount === STEPS.length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-10 pb-24 lg:px-8 lg:py-16">
        {/* Header */}
        <div className="rounded-[28px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-12">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#d4a0bd]">
            {approved ? (allDone ? 'Approved and set up' : 'Approved — finish setup') : 'Pending approval'}
          </p>
          <h1 className="mt-3 font-serif text-5xl leading-none">
            {approved ? (allDone ? 'Your listing can go live.' : 'Finish setup to take bookings.') : 'Waiting on a person to review you.'}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#dbc3cf]">
            {approved
              ? (allDone
                ? 'You are approved. Customers can find you only while your listing is published and not paused.'
                : 'Approval puts you in Explore. Complete profile, identity, availability, and Stripe before you can earn.')
              : 'Until you are approved, you will not appear in search or receive bookings. Keep a customer account on the same email.'}
          </p>

          {/* Progress bar */}
          {!allDone && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-[10px] text-[#d4a0bd] mb-1.5">
                <span className="font-mono uppercase tracking-wider">Progress</span>
                <span className="font-bold">{doneCount}/{STEPS.length} done</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#5a2e52]">
                <div
                  className="h-full rounded-full bg-[#d897b6] transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {allDone && approved && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard/companion"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f7e9de] px-5 text-sm font-bold text-[#48213d]"
                data-testid="link-onboarding-dashboard">
                Go to companion workspace <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/explore"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7f5080] px-5 text-sm font-bold text-[#f9efe5]"
                data-testid="link-onboarding-explore">
                See how you appear in search
              </Link>
            </div>
          )}
        </div>

        {/* Steps */}
        {!allDone && (
          <div className="mt-6 space-y-3">
            {STEPS.map(({ id, icon: Icon, title, body, href, done, cta }, i) => (
              <div key={id} className={`flex items-start gap-4 rounded-[22px] border p-6 transition ${
                done
                  ? 'border-[#c7d9cb] bg-[#eef6ef]'
                  : 'border-[#dfd2c9] bg-[#fbf7f1]'
              }`} data-testid={`onboarding-step-${id}`}>
                {/* Step number / checkmark */}
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 ${
                  done ? 'border-[#477254] bg-[#e8f0e8]' : 'border-[#dfd2c9] bg-white'
                }`}>
                  {done
                    ? <Check className="h-5 w-5 text-[#477254]" />
                    : <span className="font-mono text-xs font-bold text-[#9b858e]">{i + 1}</span>
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${done ? 'text-[#477254]' : 'text-[#9d557e]'}`} />
                    <p className={`text-sm font-bold ${done ? 'text-[#477254]' : 'text-[#48213d]'}`}>{title}</p>
                    {done && <span className="rounded-full bg-[#e8f0e8] px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#477254]">Done</span>}
                  </div>
                  <p className={`mt-1.5 text-xs leading-5 ${done ? 'text-[#63816a]' : 'text-[#806c76]'}`}>{body}</p>
                  {!done && (
                    <Link href={href}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#7f2e62] px-4 text-[11px] font-bold text-white transition hover:bg-[#65234e]"
                      data-testid={`link-onboarding-${id}`}>
                      {cta} <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tips section */}
        <div className="mt-8 space-y-3">
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Tips from top companions</p>
            {[
              { icon: Star, text: 'Answer the Q&A on your profile. Customers read it before they request.' },
              { icon: ShieldCheck, text: 'Your location is never shown exactly — only a service-area label to protect your privacy.' },
              { icon: WalletCards, text: 'You keep 85% of every booking. Payouts go to your bank after a completed favor, once Stripe Connect is set up.' },
            ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3 rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#9d557e]" />
              <p className="text-xs leading-5 text-[#725e69]">{text}</p>
            </div>
          ))}
        </div>

        {/* Support */}
        <div className="mt-6 rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 text-sm">
          <p className="font-bold text-[#48213d]">Need help?</p>
          <p className="mt-1 text-xs leading-5 text-[#806c76]">
            Our trust team is here. Email <a href="mailto:companions@onlyfavors.com" className="font-bold text-[#7f2e62] hover:underline">companions@onlyfavors.com</a> — we do not publish a response-time SLA.
          </p>
        </div>
      </main>
    </Shell>
  );
}

function ApplicationStatus() {
  const STAGES = [
    { key: 'submitted', label: 'Application received', body: 'Your application is stored for the trust team.', icon: ClipboardCheck },
    { key: 'reviewing', label: 'Under review', body: 'A person reads applications. There is no published decision SLA.', icon: Search },
    { key: 'approved', label: 'Approved', body: 'If approved, you finish profile, availability, and Stripe payouts before going live.', icon: Sparkles },
  ];
  const status = useQuery<{ status: string; stage: number }>({
    queryKey: ['companion-application-me'],
    queryFn: async () => {
      const res = await fetch('/api/companion/applications/me', { credentials: 'include' });
      if (!res.ok) return { status: 'none', stage: 0 };
      return res.json();
    },
    retry: false,
  });
  const currentStage = status.data?.status === 'none' ? -1 : (status.data?.stage ?? 0);

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/companion/apply" className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-status-back">
          <ArrowLeft className="h-4 w-4" />Companion application
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Your journey</p>
        <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Application status</h1>
        <p className="mt-4 text-sm leading-6 text-[#725e69]">Status comes from your stored application. We do not promise an email at every step.</p>

        {/* Status timeline */}
        <div className="mt-10 relative">
          <div className="absolute left-5 top-0 h-full w-px bg-[#dfd2c9]" />
          <div className="space-y-6">
            {STAGES.map(({ key, label, body, icon: Icon }, i) => {
              const isDone = i < currentStage;
              const isCurrent = i === currentStage;
              const isFuture = i > currentStage;
              return (
                <div key={key} className="relative flex gap-5" data-testid={`stage-${key}`}>
                  <div className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition ${
                    isDone ? 'border-[#477254] bg-[#e8f0e8]' :
                    isCurrent ? 'border-[#7f2e62] bg-[#ead0dd]' :
                    'border-[#dfd2c9] bg-white'
                  }`}>
                    {isDone ? <Check className="h-4 w-4 text-[#477254]" /> :
                     isCurrent ? <Icon className="h-4 w-4 text-[#7f2e62]" /> :
                     <Icon className="h-4 w-4 text-[#c6aeb8]" />}
                  </div>
                  <div className={`pb-6 ${isFuture ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-bold ${isDone ? 'text-[#477254]' : isCurrent ? 'text-[#48213d]' : 'text-[#9b858e]'}`}>{label}</p>
                      {isCurrent && <span className="rounded-full bg-[#ead0dd] px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#7f2e62]">Current</span>}
                      {isDone && <span className="rounded-full bg-[#e8f0e8] px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[#477254]">Done</span>}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#806c76]">{body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ETA note */}
        <div className="mt-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Timeline</p>
          <p className="mt-2 text-sm font-semibold text-[#48213d]">No published SLA</p>
          <p className="mt-1 text-[10px] text-[#806c76]">A person reviews applications. Email companions@onlyfavors.com if you have questions. No action is required from you while it is pending.</p>
        </div>

        {/* Questions */}
        <div className="mt-6 flex items-center gap-2 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
          <HeartHandshake className="h-5 w-5 shrink-0 text-[#9d557e]" />
          <p className="text-xs text-[#725e69]">
            Questions? Email us at <a href="mailto:companions@onlyfavors.com" className="font-bold text-[#7f2e62] hover:underline">companions@onlyfavors.com</a> — we do not publish a response-time SLA.
          </p>
        </div>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Companion stats page  /companion/stats
// ---------------------------------------------------------------------------

function CompanionStatsPage() {
  const companionBookings = useCompanionBookings();
  const dash = useGetCompanionDashboard({ query: { retry: false } });
  const bookings = companionBookings.data ?? [];

  const completed   = bookings.filter((b) => b.status === 'completed');
  const upcoming    = bookings.filter((b) => ['confirmed', 'deposit_paid', 'authorized'].includes(b.status));
  const totalEarnedCents = completed.reduce((acc, b) => acc + (b.companionPayoutCents ?? 0), 0);
  const avgRating = (dash.data as { avgRating?: number | null } | undefined)?.avgRating ?? null;

  // Earnings per month (last 6 months) — from completed bookings
  const MONTHS = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-US', { month: 'short' }) };
  });
  const earningsByMonth = MONTHS.map(({ key, label }) => {
    const total = completed
      .filter((b) => b.date.startsWith(key))
      .reduce((acc, b) => acc + (b.companionPayoutCents ?? 0), 0);
    return { label, total };
  });
  const maxEarnings = Math.max(...earningsByMonth.map((m) => m.total), 1);

  // Activity breakdown
  const activityMap: Record<string, number> = {};
  completed.forEach((b) => {
    activityMap[b.activity] = (activityMap[b.activity] ?? 0) + 1;
  });
  const topActivities = Object.entries(activityMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const responseRate = null as number | null;
  const avgHours = completed.length ? Math.round(completed.reduce((a, b) => a + (b.durationHours ?? 2), 0) / completed.length * 10) / 10 : 2;

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-5xl px-5 py-12 lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Companion analytics</p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Your stats.</h1>
            <p className="mt-3 text-sm text-[#725e69]">A private view of your performance — never shown to customers.</p>
          </div>
          <Link href="/dashboard/companion"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#f0e4db]"
            data-testid="link-stats-back">
            <ArrowLeft className="h-4 w-4" />Dashboard
          </Link>
        </div>

        {/* KPI cards */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Completed bookings',  value: completed.length,          icon: Check,        bg: 'bg-[#e8f0e8]', ic: 'text-[#477254]' },
            { label: 'Total earnings',      value: money(totalEarnedCents),   icon: WalletCards,  bg: 'bg-[#ead0dd]', ic: 'text-[#7f2e62]' },
            { label: 'Average rating',      value: avgRating == null ? '—' : `${avgRating}★`,           icon: Star,         bg: 'bg-[#f3ead7]', ic: 'text-[#bf8750]' },
            { label: 'Upcoming bookings',   value: upcoming.length,           icon: CalendarDays, bg: 'bg-[#dce8f5]', ic: 'text-[#2a5280]' },
          ].map(({ label, value, icon: Icon, bg, ic }) => (
            <div key={label} className={`flex items-start gap-4 rounded-[22px] p-5 ${bg}`}>
              <div className={`mt-0.5 ${ic}`}><Icon className="h-5 w-5" /></div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">{label}</p>
                <p className="mt-1 font-serif text-3xl text-[#48213d]">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Secondary metrics */}
        {(() => {
          // Count unique customer IDs that appear more than once
          const customerBookingCounts: Record<string, number> = {};
          completed.forEach((b) => {
            const cid = (b as any).customerId ?? b.id.slice(0, 8);
            customerBookingCounts[cid] = (customerBookingCounts[cid] ?? 0) + 1;
          });
          const repeatCustomers = Object.values(customerBookingCounts).filter((n) => n > 1).length;
          const repeatRate = completed.length > 0 ? Math.round((repeatCustomers / Object.keys(customerBookingCounts).length) * 100) : 0;
          return (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Response rate',    value: responseRate == null ? '—' : `${responseRate}%`,  desc: responseRate == null ? 'Tracked once request history is live' : 'Requests responded within 24h' },
                { label: 'Avg duration',     value: `${avgHours}h`,      desc: 'Per completed booking' },
                { label: 'Repeat customers', value: repeatCustomers === 0 ? '—' : `${repeatRate}%`,  desc: repeatCustomers === 0 ? 'Book more to track' : `${repeatCustomers} returning customer${repeatCustomers !== 1 ? 's' : ''}` },
              ].map(({ label, value, desc }) => (
                <div key={label} className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
                  <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">{label}</p>
                  <p className="mt-1 font-serif text-2xl text-[#48213d]">{value}</p>
                  <p className="mt-0.5 text-[11px] text-[#9b858e]">{desc}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Earnings chart */}
        <div className="mt-8 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="earnings-chart">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Earnings — last 6 months</p>
          <div className="mt-6 flex items-end gap-2 h-28">
            {earningsByMonth.map(({ label, total }) => {
              const heightPct = total === 0 ? 4 : Math.max(8, Math.round((total / maxEarnings) * 100));
              return (
                <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t-lg bg-[#d897b6] transition-all duration-700 hover:bg-[#c45b8f]"
                    style={{ height: `${heightPct}%` }}
                    title={money(total)}
                  />
                  <p className="font-mono text-[9px] uppercase text-[#9b858e]">{label}</p>
                </div>
              );
            })}
          </div>
          {completed.length === 0 && (
            <p className="mt-4 text-center text-xs text-[#9b858e]">No completed bookings yet. Your chart fills as you earn.</p>
          )}
        </div>

        {/* Activity breakdown */}
        {topActivities.length > 0 && (
          <div className="mt-6 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="activity-breakdown">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Top activities</p>
            <div className="mt-5 space-y-3">
              {topActivities.map(([activity, count]) => {
                const pct = Math.round((count / completed.length) * 100);
                return (
                  <div key={activity}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#48213d]">{activity}</span>
                      <span className="text-[#9b858e]">{count} booking{count !== 1 ? 's' : ''} · {pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#ead0dd]">
                      <div className="h-full rounded-full bg-[#9d557e] transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 rounded-[22px] bg-[#3d2038] p-6 text-[#f9efe5]">
          <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#c695ae]">Tips to grow</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ['Complete your Q&A', 'Customers read your answers before they request. Leave them blank and many will keep browsing.'],
              ['Add a photo', 'A clear photo of your face builds trust. First name and city only — no last name in the shot.'],
              ['Expand your activities', 'More options means a wider customer fit.'],
              ['Keep your schedule up to date', 'Outdated availability leads to declined requests.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[14px] bg-[#4a2842] px-4 py-3">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-[#dbc3cf]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/companion/profile" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white" data-testid="link-stats-edit-profile">
            <Pencil className="h-4 w-4" />Edit profile
          </Link>
          <Link href="/dashboard/companion/earnings" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-4 text-sm font-bold text-[#654c5f] hover:bg-[#f0e4db]" data-testid="link-stats-earnings">
            <WalletCards className="h-4 w-4" />Full earnings report
          </Link>
        </div>
      </main>
    </Shell>
  );
}

function Apply() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [about, setAbout] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user?.roles.includes('companion') && user.companionApproved) {
      navigate('/dashboard/companion');
    }
  }, [loading, user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      navigate('/login?intent=companion&next=/companion/apply');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/companion/applications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, city, bio: about }),
      });
      if (!res.ok) throw new Error('Submission failed');
      setSent(true);
    } catch {
      setSubmitError('Something went wrong. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-20">
        <div className="rounded-[26px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-12">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#c45b8f] text-[#281223]"><Check /></div>
          <h1 className="mt-8 font-serif text-5xl leading-none">A thoughtful first step.</h1>
          <p className="mt-5 text-sm leading-7 text-[#dbc3cf]">Thanks, {name || 'there'}. Your application is stored for the trust team. Track it from the status page. We do not auto-email on every decision.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f7e9de] px-5 text-sm font-bold text-[#48213d]" data-testid="link-application-home">Back home <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/explore" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7f5080] px-5 text-sm font-bold text-[#f9efe5]" data-testid="link-application-explore">Browse companions <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/companion/apply/status" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7f5080] px-5 text-sm font-bold text-[#f9efe5]" data-testid="link-application-status">Track your application <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </main>
    </Shell>
  );

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Join the circle</p>
            <h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#48213d]">Make room<br /><em>for good company.</em></h1>
            <p className="mt-6 max-w-sm text-[15px] leading-7 text-[#725e69]">OnlyFavors is for adults who know that showing up, listening well, and keeping clear boundaries can change a day.</p>
            <div className="mt-10 space-y-4">
              <Step n="01" icon={HeartHandshake} title="Share your way of being" body="Tell us what kind of company you offer and what makes it feel natural." />
              <Step n="02" icon={ShieldCheck} title="Meet the trust team" body="We review every application with care. There is no instant approval." />
              <Step n="03" icon={Sparkles} title="Set your own pace" body="After approval: identity review, Stripe payouts, profile, service area, then publish availability." />
            </div>

            {/* Companion voices */}
            <div className="mt-10 space-y-4">
              {[
                { initials: '01', name: 'Clear boundaries', city: 'Before you meet', text: '"The boundary receipt removes ambiguity before anyone meets. That is the professional, platonic standard — for both people."' },
                { initials: '02', name: 'Your own pace', city: 'You accept or decline', text: '"You control your schedule. Accept the requests that feel right and decline the ones that don\'t. No pressure, ever."' },
              ].map(({ initials, name, city, text }) => (
                <div key={name} className="rounded-[18px] border border-[#dfd2c9] bg-white p-5">
                  <p className="text-sm leading-6 text-[#654c5f] italic">{text}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-sm text-[#7f2e62]">{initials}</div>
                    <div>
                      <p className="text-xs font-semibold text-[#48213d]">{name}</p>
                      <p className="text-[10px] text-[#9b858e]">{city}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Earnings calculator */}
            <div className="mt-8 rounded-[20px] bg-[#3d2038] p-6 text-[#f9efe5]" data-testid="earnings-calculator">
              <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#c08eae]">Earnings calculator</p>
              <p className="mt-1 text-sm text-[#dbc3cf]">See what you could earn each month.</p>
              <EarningsCalc />
            </div>
          </div>
          <form onSubmit={handleSubmit} className="rounded-[26px] border border-[#dfd2c9] bg-[#fbf7f1] p-7 shadow-[0_15px_35px_rgba(88,37,70,.07)] md:p-10" data-testid="form-companion-application">
            <h2 className="font-serif text-3xl text-[#48213d]">Start an application</h2>
            <p className="mt-2 text-sm leading-6 text-[#806c76]">
              {user
                ? 'A few honest details are enough for the first pass. Companion status stays pending until a person approves you.'
                : 'Sign in with your ordinary account first. Companion applications are not a separate login.'}
            </p>
            {!user ? (
              <Link href="/login?intent=companion&next=/companion/apply"
                className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white"
                data-testid="link-apply-signin">
                Sign in to apply <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Your name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fffaf4] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-application-name" />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Account email</span>
                <input readOnly value={user.email} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#f0e4db] px-4 text-sm text-[#654c5f]" data-testid="input-application-email" />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">City or region</span>
                <input required value={city} onChange={(e) => setCity(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fffaf4] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-application-city" />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">What kind of company do you offer?</span>
                <textarea required value={about} onChange={(e) => setAbout(e.target.value)} rows={5} className="w-full resize-none rounded-xl border border-[#cbbab5] bg-[#fffaf4] p-4 text-sm leading-6 outline-none focus:border-[#7f2e62]" placeholder="A walk, a gallery afternoon, a calm dinner…" data-testid="textarea-application-about" />
              </label>
              <label className="flex items-start gap-2 text-xs leading-5 text-[#806c76]">
                <input required type="checkbox" className="mt-1 accent-[#7f2e62]" data-testid="checkbox-application-terms" />
                I understand OnlyFavors is platonic, adults-only, and grounded in clear community boundaries.
              </label>
              {submitError && <p className="rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">{submitError}</p>}
              <Button type="submit" disabled={submitting} className="w-full" testId="button-submit-application">
                {submitting ? 'Sending…' : 'Send application'} <Send className="h-4 w-4" />
              </Button>
            </div>
            )}
          </form>
        </div>
      </main>
    </Shell>
  );
}

function readLoginSearch() {
  if (typeof window === 'undefined') return { intent: null as LoginIntent | null, next: null as string | null };
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('intent');
  const intent: LoginIntent | null = raw === 'companion' || raw === 'customer' ? raw : null;
  const next = params.get('next');
  return { intent, next };
}

function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [, navigate] = useLocation();
  const { user, loading, refresh } = useAuth();
  const search = readLoginSearch();
  const intent = search.intent;

  useEffect(() => {
    if (!loading && user) navigate(dashboardPath(user, intent, search.next));
  }, [loading, user, intent, search.next, navigate]);

  const chooseIntent = (nextIntent: LoginIntent) => {
    const params = new URLSearchParams();
    params.set('intent', nextIntent);
    if (search.next) params.set('next', search.next);
    navigate(`/login?${params.toString()}`, { replace: true });
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await requestOtp(email, 'login');
      setDevCode(result.devCode ?? '');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code');
    } finally { setBusy(false); }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 8) return;
    setBusy(true); setError('');
    try {
      const result = await verifyOtp(email, code, 'login');
      try { await confirmAge(); } catch {}
      await refresh();
      navigate(dashboardPath(result.user, intent, search.next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that code');
    } finally { setBusy(false); }
  };

  const eyebrow = intent === 'companion' ? 'Become a companion' : intent === 'customer' ? 'Book a companion' : 'Your private front door';
  const headline = intent === 'companion'
    ? <>Apply from<br /><em>one account.</em></>
    : intent === 'customer'
      ? <>Good company<br /><em>starts here.</em></>
      : <>Good company<br /><em>starts here.</em></>;
  const sub = intent === 'companion'
    ? 'Sign in with an 8-digit email code. You keep a customer account; companion status stays pending until a person approves you.'
    : 'Sign in with an 8-digit email code. New accounts start as customers. You can apply to become a companion from the same identity.';

  return (
    <Shell bare>
      <main className="grid min-h-[100dvh] lg:grid-cols-[.8fr_1.2fr]">
        <div className="hidden bg-[#3E1027] p-10 text-[#f9efe5] lg:flex lg:flex-col lg:justify-between">
          <Brand dark />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">{eyebrow}</p>
            <h1 className="mt-5 max-w-md font-serif text-6xl leading-[.92]">{headline}</h1>
            <p className="mt-6 max-w-sm text-sm leading-7 text-[#d9c4cf]">{sub}</p>
          </div>
          <p className="text-xs text-[#b795a7]">OnlyFavors · One identity, two public flows.</p>
        </div>
        <div className="flex flex-col p-5 md:p-10">
          <div className="flex justify-between lg:justify-end">
            <div className="lg:hidden"><Brand /></div>
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="link-login-home"><ArrowLeft className="h-4 w-4" />Back home</Link>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
            {!intent ? (
              <>
                <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Sign in</p>
                <h2 className="mt-3 font-serif text-4xl text-[#48213d]">How do you want to use OnlyFavors?</h2>
                <p className="mt-3 text-sm leading-6 text-[#725e69]">Same email, same account. Choose the door you need today — you can switch later if you hold both roles.</p>
                <div className="mt-8 grid gap-3">
                  <button type="button" onClick={() => chooseIntent('customer')}
                    className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 text-left transition hover:border-[#9d557e]"
                    data-testid="button-login-intent-customer">
                    <p className="text-sm font-bold text-[#48213d]">Book a companion</p>
                    <p className="mt-1 text-xs leading-5 text-[#725e69]">Browse, request, book, and pay as a customer. This is the default for new signups.</p>
                  </button>
                  <button type="button" onClick={() => chooseIntent('companion')}
                    className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 text-left transition hover:border-[#9d557e]"
                    data-testid="button-login-intent-companion">
                    <p className="text-sm font-bold text-[#48213d]">Become a companion</p>
                    <p className="mt-1 text-xs leading-5 text-[#725e69]">Create an ordinary account, then apply. You will not appear in search or receive bookings until you are approved.</p>
                  </button>
                </div>
              </>
            ) : !sent ? (
              <form onSubmit={send}>
                <button type="button" onClick={() => navigate('/login', { replace: true })} className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="button-login-change-intent">
                  <ArrowLeft className="h-4 w-4" />{intent === 'companion' ? 'Not applying right now' : 'Choose a different door'}
                </button>
                <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Email sign in</p>
                <h2 className="mt-3 font-serif text-4xl text-[#48213d]">A code, not a password.</h2>
                <p className="mt-3 text-sm leading-6 text-[#725e69]">We will send an 8-digit code to your email. It expires in 10 minutes and is never used for marketing.</p>
                <label className="mt-8 block">
                  <span className="mb-2 block text-xs font-bold text-[#654c5f]">Email address</span>
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#8F294C]" data-testid="input-login-email" />
                </label>
                {error && <p className="mt-3 rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">{error}</p>}
                <Button type="submit" disabled={busy} className="mt-5 w-full" testId="button-send-login-code">{busy ? 'Sending…' : 'Send secure code'} <ArrowRight className="h-4 w-4" /></Button>
              </form>
            ) : (
              <form onSubmit={verify}>
                <button type="button" onClick={() => setSent(false)} className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="button-change-login-email"><ArrowLeft className="h-4 w-4" />Change email</button>
                <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Check your inbox</p>
                <h2 className="mt-3 font-serif text-4xl text-[#48213d]">Enter your code.</h2>
                <p className="mt-3 text-sm leading-6 text-[#725e69]">We sent an 8-digit code to <strong>{email}</strong>.</p>
                {devCode && <p className="mt-3 rounded-xl bg-[#e8f0e8] p-3 text-xs text-[#31533f]">Development code: <span className="font-mono tracking-[.3em]">{devCode}</span></p>}
                <input required inputMode="numeric" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-8 h-14 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-center font-mono text-xl tracking-[.5em] outline-none focus:border-[#8F294C]" placeholder="00000000" data-testid="input-login-code" />
                {error && <p className="mt-3 rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">{error}</p>}
                <Button type="submit" disabled={busy || code.length !== 8} className="mt-5 w-full" testId="button-verify-login-code">{busy ? 'Verifying…' : 'Verify and continue'} <Check className="h-4 w-4" /></Button>
              </form>
            )}
            <p className="mt-8 text-center text-[11px] leading-5 text-[#9b858e]">By continuing, you confirm you are 18 or older and agree to our <Link href="/terms" className="font-bold text-[#8F294C]" data-testid="link-login-terms">community guidelines</Link> and <Link href="/privacy" className="font-bold text-[#8F294C]" data-testid="link-login-privacy">privacy policy</Link>.</p>
          </div>
        </div>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Safety report page  /safety/report
// ---------------------------------------------------------------------------

function SafetyReportPage() {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [reportType, setReportType] = useState('');
  const [detail, setDetail] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [urgent, setUrgent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const REPORT_TYPES = [
    'Boundary violation',
    'Inappropriate communication',
    'Companion no-show',
    'Customer no-show',
    'Request for off-platform contact',
    'Undisclosed activity change',
    'Safety concern during booking',
    'Other',
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reportType || !detail.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, detail, bookingRef, urgent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Could not submit report');
      }
      setStep('done');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/safety" className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]">
          <ArrowLeft className="h-4 w-4" />Safety centre
        </Link>

        {step === 'done' ? (
          <div className="rounded-[26px] bg-[#e8f0e8] p-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#477254]">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-6 font-serif text-4xl text-[#31533f]">Report received.</h1>
            <p className="mt-4 max-w-sm mx-auto text-sm leading-6 text-[#53725d]">
              The report was saved for the trust team. We do not promise a {urgent ? '2-hour' : '24-hour'} response. If this is an active safety emergency, contact local emergency services immediately.
            </p>
            {urgent && (
              <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#fdf6e8] px-4 py-2 text-xs font-bold text-[#9a6d25]">
                <Clock3 className="h-3.5 w-3.5" />Marked urgent — still call 911 if you are in danger
              </div>
            )}
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/safety" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#31533f] px-5 text-sm font-bold text-white">
                Back to Safety centre
              </Link>
              <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#c7d9cb] px-5 text-sm font-bold text-[#31533f]">
                Go home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#a64742]">Safety report</p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Report a concern.</h1>
            <p className="mt-4 text-sm leading-6 text-[#725e69]">
              Every report is reviewed by a real member of our trust team — not a bot. If you are in immediate danger, call 911 first.
            </p>

            {/* Urgent toggle */}
            <div className="mt-8 flex items-start gap-3 rounded-[18px] border border-[#f0d5d5] bg-[#fdf6f6] p-5">
              <input type="checkbox" id="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#a64742]" data-testid="checkbox-urgent" />
              <label htmlFor="urgent" className="cursor-pointer">
                <p className="text-sm font-bold text-[#a64742]">This is urgent</p>
                <p className="mt-0.5 text-xs leading-5 text-[#806c76]">Check this if you feel unsafe right now. This flags the report. It does not dispatch a 24/7 team. Call local emergency services if you are in danger.</p>
              </label>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">What happened? *</span>
                <select required value={reportType} onChange={(e) => setReportType(e.target.value)}
                  className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm text-[#48213d] outline-none focus:border-[#7f2e62]"
                  data-testid="select-report-type">
                  <option value="">Select an incident type…</option>
                  {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Booking reference (optional)</span>
                <input type="text" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)}
                  placeholder="e.g. BK-12345"
                  className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm text-[#48213d] outline-none focus:border-[#7f2e62]"
                  data-testid="input-booking-ref" />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Tell us what happened *</span>
                <textarea required value={detail} onChange={(e) => setDetail(e.target.value)} rows={5}
                  placeholder="Describe the incident clearly. We will never share your report with the person you are reporting."
                  maxLength={1500}
                  className="w-full resize-none rounded-xl border border-[#cbbab5] bg-[#fbf7f1] p-4 text-sm leading-6 text-[#48213d] placeholder:text-[#b0929f] outline-none focus:border-[#7f2e62]"
                  data-testid="textarea-report-detail" />
                <p className="mt-1 text-right text-[10px] text-[#9b858e]">{detail.length}/1500</p>
              </label>

              <div className="rounded-[14px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3 text-xs leading-5 text-[#806c76]">
                <LockKeyhole className="mb-1 h-3.5 w-3.5 text-[#9b858e]" />
                Your report is confidential. The person you report will never be told who filed the report.
              </div>

              {submitError && <p className="rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">{submitError}</p>}
              <button type="submit" disabled={submitting || !reportType || !detail.trim()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e] disabled:opacity-40"
                data-testid="button-submit-report">
                <ShieldCheck className="h-4 w-4" />{submitting ? 'Sending…' : 'Submit report'}
              </button>
            </form>
          </>
        )}
      </main>
    </Shell>
  );
}

function Safety() {
  useEffect(() => { try { localStorage.setItem('of_safety_reviewed', '1'); } catch {} }, []);
  const query = useGetSafetyResources({ query: { queryKey: getGetSafetyResourcesQueryKey() } }); const data = query.data;
  if (query.isLoading) return <Shell><main className="mx-auto max-w-5xl px-5 py-16"><LoadingState label="Loading safety resources" /></main></Shell>;
  if (query.isError || !data) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => query.refetch()} /></main></Shell>;
  return <Shell><main className="page-enter mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20"><div className="max-w-2xl"><p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#477254]"><ShieldCheck className="h-4 w-4" />Trust & safety</p><h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#31533f]">{data.title}</h1><p className="mt-6 text-[16px] leading-8 text-[#53725d]">{data.emergencyGuidance}</p></div><div className="mt-14 grid gap-4 md:grid-cols-[1.15fr_.85fr]"><div className="rounded-[24px] bg-[#31533f] p-8 text-[#eef6ef] md:p-10"><LifeBuoy className="h-7 w-7 text-[#b7d7bd]" /><h2 className="mt-16 font-serif text-4xl leading-none">If something feels wrong, pause.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[#c6ddca]">Move to a busier place, contact someone you trust, and use local emergency services when there is immediate danger. OnlyFavors support can help with platform concerns, but cannot replace emergency responders.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/login" className="inline-flex items-center gap-2 text-xs font-bold text-[#d9f0dd]" data-testid="link-safety-support">Contact trust support <ArrowRight className="h-3.5 w-3.5" /></Link><Link href="/safety/report" className="inline-flex items-center gap-2 text-xs font-bold text-[#d9f0dd] opacity-70 hover:opacity-100" data-testid="link-safety-report">Report an incident <ArrowRight className="h-3.5 w-3.5" /></Link></div></div><div className="rounded-[24px] border border-[#c7d9cb] bg-[#e8f0e8] p-8"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#63816a]">Our principles</p><div className="mt-6 space-y-3">{data.principles.length ? data.principles.map((p, i) => <div key={p} className="flex gap-3 rounded-xl bg-[#f3f8f2] p-4"><span className="font-mono text-[10px] text-[#76977d]">0{i + 1}</span><p className="text-sm leading-6 text-[#477254]">{p}</p></div>) : <p className="text-sm text-[#53725d]">Safety principles are being updated.</p>}</div></div></div><div className="mt-12 grid gap-4 md:grid-cols-3"><InfoTile icon={MapPin} title="Meet in public" body="Choose a SafeSpot and keep the first meeting visible and easy to leave." /><InfoTile icon={MessageSquare} title="Keep it clear" body="Discuss activity, timing, and boundaries before you meet." /><InfoTile icon={EyeOff} title="Protect privacy" body="Never share your home address or ask for someone else's." /></div></main></Shell>;
}

function InfoTile({ icon: Icon, title, body }: { icon: typeof MapPin; title: string; body: string }) {
  return <div className="rounded-2xl border border-[#dfd2c9] bg-[#fbf7f1] p-6"><Icon className="h-5 w-5 text-[#7f2e62]" /><h3 className="mt-8 font-serif text-2xl text-[#48213d]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#725e69]">{body}</p></div>;
}

const legalCopy: Record<string, { eyebrow: string; title: string; intro: string; sections: Array<[string, string]> }> = {
  privacy: { eyebrow: 'Privacy policy', title: 'Your details are not the product.', intro: 'OnlyFavors protects your identity before the meeting, your safety during it, and your privacy afterward.', sections: [['What other people see', 'Public profiles show a first name and an approximate New Orleans neighborhood. Phone numbers, emails, and exact addresses stay hidden. Browsing is not a social feed.'], ['During a booking', 'Masked chat unlocks after a $10 deposit. Location is collected only while a favor is active, then unread and deleted after 24 hours. Notifications say “You have a booking update” — never an address or “they’re here.” A Boundary Receipt records whether photos are allowed.'], ['Afterward', 'Temporary location data expires. You can download eligible account data or use Delete my account and data in Settings. Safety reports go to staff only; the reported person is not notified. We never store card numbers — Stripe does.']] },
  terms: { eyebrow: 'Terms & community', title: 'A shared standard for good company.', intro: 'OnlyFavors is a platonic marketplace for adults. These guidelines keep the experience human, clear, and safe.', sections: [['Platonic by design', 'OnlyFavors does not facilitate dating, sexual services, escorting, or transactional intimacy. Every booking must stay within the agreed activity and boundaries.'], ['Treat people like people', 'No harassment, discrimination, coercion, threats, doxxing, or pressure. Respect a no, a pause, a cancellation, and a boundary the first time.'], ['Accountability', 'We may review activity, pause bookings, or remove accounts when community safety requires it. Contact the trust team when something does not feel right.']] },
  cancellation: { eyebrow: 'Cancellation policy', title: 'Plans can change. Clarity helps.', intro: 'A good cancellation policy makes room for real life while respecting the time a companion set aside.', sections: [['Before confirmation', 'Booking requests are not confirmed until the companion accepts. You may withdraw a pending request without a cancellation charge.'], ['After confirmation', 'Cancellation terms and any applicable amount are shown before a confirmed booking is finalized. Give as much notice as possible.'], ['When safety is involved', 'If a situation feels unsafe, prioritize getting to a safe place and contacting local emergency services. Reach out to trust support as soon as you can.']] },
};
function Legal({ kind }: { kind: keyof typeof legalCopy }) {
  const copy = legalCopy[kind];
  return <Shell><main className="page-enter mx-auto max-w-4xl px-5 py-14 lg:px-8 lg:py-20"><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">{copy.eyebrow}</p><h1 className="mt-4 max-w-2xl font-serif text-6xl leading-[.9] text-[#48213d]">{copy.title}</h1><p className="mt-6 max-w-xl text-[16px] leading-8 text-[#725e69]">{copy.intro}</p><div className="mt-14 border-t border-[#dfd2c9]">{copy.sections.map(([title, body], index) => <section key={title} className="grid gap-4 border-b border-[#dfd2c9] py-8 md:grid-cols-[180px_1fr]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9d557e]">0{index + 1}</p><div><h2 className="font-serif text-3xl text-[#48213d]">{title}</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#725e69]">{body}</p></div></section>)}</div></main></Shell>;
}

// ---------------------------------------------------------------------------
// SafeSpot Network — directory + detail pages
// ---------------------------------------------------------------------------

const CATEGORY_ICON: Record<string, typeof MapPin> = {
  Café: Coffee,
  Restaurant: UtensilsCrossed,
  Hotel: Building2,
  Library: Landmark,
  Museum: Landmark,
  Bar: Sunrise,
  default: MapPin,
};

const ALL_CATEGORIES = ['Café', 'Restaurant', 'Hotel', 'Library', 'Museum', 'Bar'];

function SafeSpotCard({ spot }: { spot: SafeSpot }) {
  const Icon = CATEGORY_ICON[spot.category] ?? CATEGORY_ICON.default;
  return (
    <Link href={`/safespots/${spot.id}`} data-testid={`safespot-card-${spot.id}`}>
      <div className="group rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:border-[#9d557e] hover:shadow-sm cursor-pointer h-full">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-1 rounded-full bg-[#e8f0e8] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#477254]">
              <ShieldCheck className="h-3 w-3" />Verified
            </span>
            {spot.openLate && (
              <span className="rounded-full bg-[#f0e4db] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#7f5042]">
                Open late
              </span>
            )}
          </div>
        </div>
        <p className="mt-4 font-serif text-xl leading-tight text-[#48213d] group-hover:text-[#7f2e62]">{spot.name}</p>
        <p className="mt-1 text-xs font-medium text-[#806c76]">{spot.category} · {(spot as any).cityLabel ?? spot.city}</p>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-[#9b858e]">
          <MapPin className="h-3 w-3 shrink-0" />{spot.addressHint}
        </p>
        <p className="mt-4 flex items-center gap-1 text-[10px] font-bold text-[#9d557e] group-hover:text-[#7f2e62]">
          View details <ChevronRight className="h-3 w-3" />
        </p>
      </div>
    </Link>
  );
}

function SafeSpots() {
  const [city, setCity] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [lateOnly, setLateOnly] = useState(false);
  const [debouncedCity, setDebouncedCity] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCity(city), 400);
    return () => clearTimeout(t);
  }, [city]);

  const query = useListSafeSpots(debouncedCity ? { city: debouncedCity } : undefined, {
    query: {
      queryKey: getListSafeSpotsQueryKey(debouncedCity ? { city: debouncedCity } : undefined),
      retry: false,
    },
  });

  const spots: SafeSpot[] = (query.data ?? []) as SafeSpot[];
  const filtered = spots.filter((s) =>
    (!categoryFilter || s.category === categoryFilter) &&
    (!lateOnly || s.openLate)
  );

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
        {/* Hero */}
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">
            <ShieldCheck className="h-4 w-4" />Safety network
          </p>
          <h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#48213d]">SafeSpot<br />Network</h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#725e69]">
            Approved public venues in New Orleans where every favor begins. The mint shield marks a listed SafeSpot — not a staffed partnership, discount, or emergency desk.
            No home addresses, ever.
          </p>
        </div>

        {/* Search + filters */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b858e]" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Filter by city…"
              className="h-11 w-full rounded-full border border-[#dfd2c9] bg-white pl-9 pr-4 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
              data-testid="input-safespot-city"
            />
          </div>
          <button
            onClick={() => setLateOnly((v) => !v)}
            className={`h-11 rounded-full border px-4 text-xs font-bold transition ${lateOnly ? 'border-[#9d557e] bg-[#ead0dd] text-[#7f2e62]' : 'border-[#dfd2c9] bg-white text-[#806c76]'}`}
            data-testid="toggle-open-late"
          >
            Open late
          </button>
        </div>

        {/* Category chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[.12em] transition ${!categoryFilter ? 'border-[#9d557e] bg-[#9d557e] text-white' : 'border-[#dfd2c9] text-[#806c76] hover:border-[#9d557e]'}`}
            data-testid="chip-all"
          >All</button>
          {ALL_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICON[cat] ?? CATEGORY_ICON.default;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter((v) => v === cat ? null : cat)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[.12em] transition ${categoryFilter === cat ? 'border-[#9d557e] bg-[#9d557e] text-white' : 'border-[#dfd2c9] text-[#806c76] hover:border-[#9d557e]'}`}
                data-testid={`chip-${cat.toLowerCase()}`}
              >
                <Icon className="h-3 w-3" />{cat}
              </button>
            );
          })}
        </div>

        {/* Results */}
        <div className="mt-8">
          {(query.isLoading && !query.isError) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0,1,2,3,4,5].map((i) => <div key={i} className="skeleton h-48 rounded-[20px]" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-12 text-center">
              <MapPin className="mx-auto h-8 w-8 text-[#c6aeb8]" />
              <p className="mt-4 font-serif text-xl text-[#48213d]">No approved SafeSpots yet.</p>
              <p className="mt-2 text-xs text-[#806c76]">We do not invent cafés or hotels. When a venue is approved, it appears here with a mint shield.</p>
            </div>
          ) : (
            <>
              <p className="mb-4 font-mono text-[10px] text-[#9b858e] uppercase tracking-wider">{filtered.length} verified venue{filtered.length !== 1 ? 's' : ''}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((s) => <SafeSpotCard key={s.id} spot={s} />)}
              </div>
            </>
          )}
        </div>

        {/* Network stats strip */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3" data-testid="safespot-stats">
          {[
            { value: String(filtered.length), label: 'Approved venues in this view', icon: MapPin },
            { value: 'QR', label: 'Check-in records arrival on the booking — not a staff scan network', icon: ShieldCheck },
            { value: '0', label: 'Home address meetings — ever', icon: EyeOff },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-4 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ead0dd]">
                <Icon className="h-5 w-5 text-[#7f2e62]" />
              </div>
              <div>
                <p className="font-serif text-2xl text-[#48213d]">{value}</p>
                <p className="text-[11px] leading-4 text-[#806c76]">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Apply banner */}
        <div className="mt-8 rounded-[24px] bg-[#2d1228] p-8 md:p-10">
          <div className="max-w-xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">For venue managers</p>
            <h2 className="mt-3 font-serif text-4xl leading-none text-[#f9efe5]">List your venue as a SafeSpot.</h2>
            <p className="mt-4 text-sm leading-6 text-[#d9c4cf]">
              Venue applications are stored for the trust team. The pilot does not include discounts, staff training packs, or a paid partnership program.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/safespots/register" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f7e9de] px-5 text-sm font-bold text-[#48213d]" data-testid="link-safespot-register">
                Apply your venue <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/how-it-works" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#5e3458] px-4 text-sm font-bold text-[#d9c4cf] hover:border-[#c695ae]">
                How SafeSpots work
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function useSafeSpot(id: string) {
  return useQuery<SafeSpot | null>({
    queryKey: ['safespot', id],
    queryFn: async () => {
      const res = await fetch(`/api/safespots/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });
}

function SafeSpotShareButton({ spotName, spotId }: { spotName: string; spotId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = `${window.location.origin}/safespots/${spotId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <button type="button" onClick={copy}
      className="inline-flex h-12 items-center gap-2 rounded-full border border-[#dfd2c9] px-6 text-sm font-bold text-[#48213d] hover:border-[#9d557e] transition"
      data-testid="button-share-safespot">
      {copied ? <><Check className="h-4 w-4 text-[#477254]" />Link copied!</> : <><Share2 className="h-4 w-4" />Share venue</>}
    </button>
  );
}

function SafeSpotDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: spot, isLoading, isError } = useSafeSpot(id!);
  const Icon = spot ? (CATEGORY_ICON[spot.category] ?? CATEGORY_ICON.default) : MapPin;

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
        <Link href="/safespots" className="inline-flex items-center gap-2 text-xs text-[#9b858e] hover:text-[#48213d]" data-testid="link-back-safespots">
          <ArrowLeft className="h-3.5 w-3.5" />All SafeSpots
        </Link>

        {isLoading && (
          <div className="mt-10 space-y-4">
            <div className="skeleton h-12 w-64 rounded-2xl" />
            <div className="skeleton h-6 w-40 rounded-xl" />
            <div className="skeleton h-48 rounded-[24px]" />
          </div>
        )}

        {(isError || (!isLoading && !spot)) && (
          <div className="mt-10 rounded-[20px] bg-[#fbebe7] p-8 text-sm text-[#86555a]">
            This SafeSpot could not be loaded right now.{' '}
            <Link href="/safespots" className="font-bold underline">Browse all venues</Link>
          </div>
        )}

        {spot && (
          <>
            {/* Header */}
            <div className="mt-8 flex flex-wrap items-start gap-6">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#ead0dd] text-[#7f2e62]">
                <Icon className="h-8 w-8" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full bg-[#e8f0e8] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#477254]">
                    <ShieldCheck className="h-3 w-3" />Verified SafeSpot
                  </span>
                  {spot.openLate && (
                    <span className="rounded-full bg-[#f0e4db] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#7f5042]">
                      Open late
                    </span>
                  )}
                </div>
                <h1 className="mt-3 font-serif text-5xl leading-[.95] text-[#48213d]">{spot.name}</h1>
                <p className="mt-2 text-sm font-medium text-[#806c76]">{spot.category} · {(spot as any).cityLabel ?? spot.city}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-[#9b858e]">
                  <MapPin className="h-4 w-4 shrink-0" />{spot.addressHint}
                  <span className="ml-1 rounded-full bg-[#f3ead7] px-2 py-0.5 font-mono text-[9px] text-[#7a5a12]">Approx. location</span>
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={`/book`}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white hover:bg-[#9d3a78]"
                data-testid="button-book-here"
              >
                Start a favor here <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-[#dfd2c9] px-6 text-sm font-bold text-[#48213d] hover:border-[#9d557e]"
                data-testid="button-find-companion"
              >
                Find a companion first
              </Link>
              <SafeSpotShareButton spotName={spot.name} spotId={spot.id} />
            </div>

            {/* Info grid */}
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-[20px] bg-[#e8f0e8] p-6">
                <ShieldCheck className="h-5 w-5 text-[#477254]" />
                <p className="mt-4 font-bold text-[#31533f]">Public meeting point</p>
                <p className="mt-1.5 text-xs leading-5 text-[#53725d]">A listed café, hotel lobby, or other public venue. We do not claim staff are trained or on call.</p>
              </div>
              <div className="rounded-[20px] bg-[#f0e4db] p-6">
                <Navigation2 className="h-5 w-5 text-[#7f5042]" />
                <p className="mt-4 font-bold text-[#5c3625]">QR arrival check-in</p>
                <p className="mt-1.5 text-xs leading-5 text-[#7f5042]">Favor Mode records that you arrived. It does not share your route or message venue staff.</p>
              </div>
              <div className="rounded-[20px] bg-[#f9efe5] p-6">
                <EyeOff className="h-5 w-5 text-[#9d557e]" />
                <p className="mt-4 font-bold text-[#48213d]">Privacy first</p>
                <p className="mt-1.5 text-xs leading-5 text-[#725e69]">Home and work addresses are never listed. Trust Circle sees a venue map, not a live companion pin.</p>
              </div>
            </div>

            {/* How check-in works */}
            <div className="mt-10 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">How QR check-in works</p>
              <div className="mt-6 space-y-4">
                {[
                  { n: '01', title: 'Booking confirmed', body: 'After your companion accepts, Favor Mode can show a check-in control for this booking.' },
                  { n: '02', title: 'Arrive and check in', body: 'Open Favor Mode and record check-in. That stores a check-in row. It does not message venue staff.' },
                  { n: '03', title: 'Trust Circle', body: 'If a contact has an email, they can be told you arrived at the public venue. SMS is not configured. They never receive a companion name or live pin.' },
                  { n: '04', title: 'Missed check-in', body: 'Favor Mode sends one alert after 12 minutes without arrival. If someone may be in danger, call 911 first.' },
                ].map(({ n, title, body }) => (
                  <div key={n} className="flex gap-4">
                    <span className="font-mono text-[10px] text-[#c6aeb8] mt-0.5">{n}</span>
                    <div>
                      <p className="text-sm font-bold text-[#48213d]">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#806c76]">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Apply banner */}
            <div className="mt-8 flex items-center justify-between rounded-[16px] border border-[#dfd2c9] px-6 py-4">
              <p className="text-xs text-[#806c76]">Manage this listing or report an issue.</p>
              <a href="mailto:safespots@onlyfavors.com" className="text-xs font-bold text-[#9d557e] hover:text-[#7f2e62]">Contact venues team →</a>
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [, navigate] = useLocation();
  const { user, loading, refresh } = useAuth();

  useEffect(() => {
    if (!loading && user?.sessionKind === 'admin' && user.roles.includes('admin')) {
      navigate('/admin/operations');
    }
  }, [loading, user, navigate]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await requestOtp(email, 'admin');
      setDevCode(result.devCode ?? '');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code');
    } finally { setBusy(false); }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 8) return;
    setBusy(true); setError('');
    try {
      const result = await verifyOtp(email, code, 'admin');
      await refresh();
      if (!result.user.roles.includes('admin') || result.user.sessionKind !== 'admin') {
        setError('This workspace is restricted to approved trust staff.');
        return;
      }
      navigate('/admin/operations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that code');
    } finally { setBusy(false); }
  };

  return <Shell bare><main className="grid min-h-[100dvh] place-items-center bg-[#3E1027] px-5"><div className="w-full max-w-md rounded-[26px] border border-[#65445d] bg-[#5D1833] p-8 text-[#f9efe5] md:p-10"><div className="flex items-center justify-between"><Brand dark /><span className="rounded-full border border-[#79556d] px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-[#d3b6c4]">Operations</span></div>{sent ? <form onSubmit={verify} className="mt-12"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#c45b8f] text-[#281223]"><KeyRound /></div><h1 className="mt-7 font-serif text-4xl">Enter your operations code.</h1><p className="mt-3 text-sm leading-6 text-[#d9c4cf]">An 8-digit code was sent to <strong>{email}</strong>. Staff accounts are provisioned — this is not public signup. Sessions expire in 8 hours.</p>{devCode && <p className="mt-3 rounded-xl bg-[#3E1027] p-3 font-mono text-xs tracking-[.3em] text-[#BDEBD7]">{devCode}</p>}<input required inputMode="numeric" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-6 h-12 w-full rounded-xl border border-[#79556d] bg-[#3E1027] px-4 text-center font-mono tracking-[.4em] text-[#f9efe5] outline-none focus:border-[#d897b6]" placeholder="00000000" data-testid="input-admin-code" />{error && <p className="mt-3 text-xs text-[#FF625D]">{error}</p>}<Button type="submit" disabled={busy || code.length !== 8} variant="primary" className="mt-5 w-full" testId="button-admin-verify">{busy ? 'Verifying…' : 'Continue to operations'} <ArrowRight className="h-4 w-4" /></Button></form> : <form onSubmit={send} className="mt-12"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">Trust team access</p><h1 className="mt-3 font-serif text-4xl">Keep the room safe.</h1><p className="mt-3 text-sm leading-6 text-[#d9c4cf]">Staff accounts are created manually. Public signup never grants admin. This portal uses the same identity as the rest of OnlyFavors, with an 8-hour session.</p><label className="mt-8 block"><span className="mb-2 block text-xs font-bold text-[#dbc3cf]">Operations email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-[#79556d] bg-[#3E1027] px-4 text-sm text-[#f9efe5] outline-none focus:border-[#d897b6]" data-testid="input-admin-email" /></label>{error && <p className="mt-3 text-xs text-[#FF625D]">{error}</p>}<Button type="submit" disabled={busy} variant="primary" className="mt-5 w-full" testId="button-admin-login">{busy ? 'Sending…' : 'Send secure code'} <KeyRound className="h-4 w-4" /></Button></form>}<Link href="/" className="mt-8 inline-flex items-center gap-2 text-xs text-[#c695ae] hover:text-[#f9efe5]" data-testid="link-admin-home"><ArrowLeft className="h-3.5 w-3.5" />Return to OnlyFavors</Link></div></main></Shell>;
}

function AdminAnnouncementControl() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const [kind, setKind] = useState<'info' | 'warning' | 'success'>('info');
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{ message: string; kind: string; active: boolean }>({
    queryKey: ['platform-announcement'],
    queryFn: () => fetch('/api/announcement').then((r) => r.json()),
    retry: false,
  });

  // Seed form when data loads
  useEffect(() => {
    if (data) { setMsg(data.message ?? ''); setKind((data.kind as any) ?? 'info'); }
  }, [data?.message]);

  const post = async (active: boolean) => {
    setSaving(true);
    await fetch('/api/admin/announcement', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg.trim(), kind, active }),
    });
    qc.invalidateQueries({ queryKey: ['platform-announcement'] });
    setSaving(false);
  };

  const KIND_STYLES: Record<string, string> = {
    info:    'border-[#b0ccec] bg-[#dce8f5] text-[#2a5280]',
    warning: 'border-[#d5bc8c] bg-[#f3ead7] text-[#7a5a12]',
    success: 'border-[#a9c9af] bg-[#e8f0e8] text-[#31533f]',
  };

  return (
    <div className="mt-8 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="admin-announcement">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Platform announcement</p>
          <h2 className="mt-1 font-serif text-2xl text-[#48213d]">Home page banner</h2>
        </div>
        <span className={`rounded-full px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[.1em] ${data?.active ? 'bg-[#e8f0e8] text-[#477254]' : 'bg-[#ece1d9] text-[#9b858e]'}`}>
          {data?.active ? 'Live' : 'Off'}
        </span>
      </div>
      <div className="mt-5 space-y-3">
        <textarea
          value={msg} onChange={(e) => setMsg(e.target.value.slice(0, 200))}
          placeholder="Write an announcement for all visitors…"
          rows={2}
          className="w-full resize-none rounded-xl border border-[#cbbab5] bg-white px-4 py-3 text-sm outline-none focus:border-[#7f2e62]"
          data-testid="input-announcement-msg" />
        <div className="flex flex-wrap items-center gap-2">
          {(['info', 'warning', 'success'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[.1em] transition ${kind === k ? KIND_STYLES[k] : 'border-[#dfd2c9] bg-white text-[#9b858e]'}`}>
              {k}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button type="button" disabled={saving || !msg.trim()} onClick={() => post(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white disabled:opacity-50"
              data-testid="button-publish-announcement">
              Publish
            </button>
            <button type="button" disabled={saving || !data?.active} onClick={() => post(false)}
              className="inline-flex h-9 items-center rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#654c5f] disabled:opacity-50"
              data-testid="button-clear-announcement">
              Clear
            </button>
          </div>
        </div>
        {msg.trim() && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${KIND_STYLES[kind]}`}>
            <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">Preview · </span>{msg}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminOperations() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading && (!user || !user.roles.includes('admin') || user.sessionKind !== 'admin')) {
      navigate('/admin/login');
    }
  }, [loading, user, navigate]);

  const overview = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey(), retry: false } });
  const companions = useAdminCompanions();
  const bookings_ = useAdminBookings();
  const data = overview.data;

  const metrics = [
    { label: 'Verification queue', value: data?.verificationQueue ?? 0, icon: ClipboardCheck, tone: 'plum' },
    { label: 'Open reports',       value: data?.openReports ?? 0,       icon: CircleAlert,   tone: 'rose'  },
    { label: 'Active bookings',    value: data?.activeBookings ?? 0,    icon: CalendarDays,  tone: 'green' },
    { label: 'Check-ins due',      value: data?.checkInsDue ?? 0,       icon: Clock3,        tone: 'gold'  },
  ];

  const refetchAll = () => { overview.refetch(); companions.refetch(); bookings_.refetch(); };

  const STATUS_STYLE: Record<string, string> = {
    requested: 'bg-[#f0e4db] text-[#7f5042]', deposit_paid: 'bg-[#f3ead7] text-[#7a5a12]',
    authorized: 'bg-[#e8f0e8] text-[#31533f]', confirmed: 'bg-[#dce8f5] text-[#2a5280]',
    completed: 'bg-[#ece1d9] text-[#654c5f]', cancelled: 'bg-[#ece1d9] text-[#9b858e]',
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">

        {/* Header */}
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">
              <PanelLeft className="h-4 w-4" />Trust operations
            </p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">
              The quiet work<br /><em>behind good company.</em>
            </h1>
          </div>
          <Button variant="outline" onClick={refetchAll} testId="button-refresh-operations">
            <RefreshCw className="h-4 w-4" />Refresh
          </Button>
        </div>

        {/* Stat cards */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={cn('rounded-2xl p-5', tone === 'rose' ? 'bg-[#fbebe7]' : tone === 'green' ? 'bg-[#e8f0e8]' : tone === 'gold' ? 'bg-[#f3ead7]' : 'bg-[#ead0dd]')}>
              <Icon className={cn('h-5 w-5', tone === 'rose' ? 'text-[#a64742]' : tone === 'green' ? 'text-[#477254]' : tone === 'gold' ? 'text-[#9a6d25]' : 'text-[#7f2e62]')} />
              <p className="mt-8 font-serif text-4xl text-[#48213d]" data-testid={`admin-value-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p>
              <p className="mt-1 text-xs font-bold text-[#725e69]">{label}</p>
            </div>
          ))}
        </div>

        {/* Live queue + Review card */}
        <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Live queue</p>
                <h2 className="mt-2 font-serif text-3xl text-[#48213d]">What needs a human?</h2>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#477254]">
                <span className="h-2 w-2 rounded-full bg-[#6f9a79]" />Live
              </span>
            </div>
            <div className="mt-7 space-y-2">
              <QueueRow icon={ClipboardCheck} title="Companion verification" count={data?.verificationQueue ?? 0} href="#companion-review" />
              <QueueRow icon={CircleAlert}   title="Safety reports"          count={data?.openReports ?? 0}       href="#safety-reports" />
              <QueueRow icon={Clock3}         title="Check-ins due"           count={data?.checkInsDue ?? 0}       href="#bookings" />
            </div>
          </div>
          <div className="rounded-[22px] bg-[#3d2038] p-7 text-[#f9efe5]">
            <ShieldCheck className="h-6 w-6 text-[#d897b6]" />
            <h2 className="mt-12 font-serif text-3xl leading-none">Review with care.</h2>
            <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">Every number here represents a person waiting for a considered response. Leave an audit note whenever you make a decision.</p>
            <button type="button" onClick={() => document.getElementById('admin-audit')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-[#e2b3c9]"
              data-testid="button-open-audit-log">
              Open audit log <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Platform revenue summary */}
        {(bookings_.data ?? []).length > 0 && (() => {
          const allBookings = bookings_.data ?? [];
          const completed = allBookings.filter((b) => b.status === 'completed');
          const grossCents = completed.reduce((s, b) => s + b.totalCents, 0);
          const commissionCents = Math.round(grossCents * 0.15 / 1.05); // strip the customer fee to get companion gross, then take 15%
          const customerFees = Math.round(grossCents * 0.05 / 1.05);
          const MONTH_KEYS = completed.reduce((acc: Record<string, number>, b) => {
            const m = b.date.slice(0, 7);
            acc[m] = (acc[m] ?? 0) + b.totalCents;
            return acc;
          }, {});
          const monthlyGrowth = Object.entries(MONTH_KEYS).sort(([a], [b]) => a.localeCompare(b)).slice(-2);
          const growth = monthlyGrowth.length >= 2 ? Math.round(((monthlyGrowth[1][1] - monthlyGrowth[0][1]) / (monthlyGrowth[0][1] || 1)) * 100) : null;
          return (
            <div className="mt-8 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="admin-revenue-panel">
              <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Platform revenue · all time</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Gross booking value', value: money(grossCents), sub: `${completed.length} completed bookings` },
                  { label: 'Platform commission (15%)', value: money(commissionCents), sub: 'After companion payouts' },
                  { label: 'Customer service fees (5%)', value: money(customerFees), sub: 'Collected at booking' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="rounded-[16px] bg-[#f0e8f0] p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[.1em] text-[#9b858e]">{label}</p>
                    <p className="mt-2 font-serif text-3xl text-[#48213d]">{value}</p>
                    <p className="mt-0.5 text-[9px] text-[#9b858e]">{sub}</p>
                  </div>
                ))}
              </div>
              {growth !== null && (
                <p className="mt-3 text-[10px] text-[#806c76]">
                  Month-over-month: <strong className={growth >= 0 ? 'text-[#477254]' : 'text-[#a64742]'}>{growth >= 0 ? '+' : ''}{growth}%</strong>
                </p>
              )}
            </div>
          );
        })()}

        {/* Platform announcement control */}
        <AdminAnnouncementControl />

        {/* Companion verification review */}
        <div id="companion-review" className="mt-10 scroll-mt-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Companion review</p>
              <h2 className="mt-1 font-serif text-3xl text-[#48213d]">Pending applications</h2>
            </div>
            <span className="rounded-full bg-[#ead0dd] px-3 py-1 font-mono text-xs font-bold text-[#7f2e62]">
              {companions.data?.filter(a => a.status === 'pending').length ?? 0} pending
            </span>
          </div>

          {companions.isLoading && (
            <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="skeleton h-36 rounded-[20px]" />)}</div>
          )}
          {companions.isError && (
            <div className="rounded-[16px] bg-[#fbebe7] p-5 text-sm text-[#86555a]">
              Could not load applications. <button type="button" onClick={() => companions.refetch()} className="font-bold underline">Retry</button>
            </div>
          )}
          {!companions.isLoading && !companions.isError && companions.data?.length === 0 && (
            <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
              <BadgeCheck className="mx-auto h-7 w-7 text-[#c6aeb8]" />
              <p className="mt-3 font-serif text-xl text-[#48213d]">Queue is clear.</p>
              <p className="mt-1 text-xs text-[#806c76]">All companion applications have been reviewed.</p>
            </div>
          )}
          {(companions.data ?? []).length > 0 && (
            <div className="space-y-3">
              {(companions.data ?? []).map(app => (
                <CompanionApplicationCard key={app.id} app={app} onDecision={() => companions.refetch()} />
              ))}
            </div>
          )}
        </div>

        {/* SafeSpot venue applications */}
        <SafeSpotApplicationsSection />

        {/* Booking status distribution chart */}
        {(bookings_.data ?? []).length > 0 && (() => {
          const counts: Record<string, number> = {};
          (bookings_.data ?? []).forEach((b) => { counts[b.status] = (counts[b.status] ?? 0) + 1; });
          const total = Object.values(counts).reduce((s, n) => s + n, 0);
          const COLORS: Record<string, string> = {
            confirmed: '#477254', completed: '#9d557e', deposit_paid: '#bf8750',
            authorized: '#2a5280', requested: '#c6aeb8', cancelled: '#d9c4cf',
          };
          const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          return (
            <div className="mt-8 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
              <p className="mb-5 font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Booking status breakdown</p>
              <div className="flex gap-1 overflow-hidden rounded-full" style={{ height: 14 }}>
                {entries.map(([status, count]) => (
                  <div key={status} title={`${status}: ${count}`}
                    className="transition-all"
                    style={{ width: `${(count / total) * 100}%`, background: COLORS[status] ?? '#dfd2c9' }} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {entries.map(([status, count]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[status] ?? '#dfd2c9' }} />
                    <span className="text-[10px] text-[#725e69]">{status.replace('_', ' ')} <strong className="text-[#48213d]">{count}</strong></span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[#9b858e]">Total: <strong className="text-[#48213d]">{total}</strong></span>
                </div>
              </div>
            </div>
          );
        })()}

        <AdminIdentitySection />
        <AdminReportsSection />
        <AdminAuditSection />

        {/* Recent bookings */}
        <div id="bookings" className="mt-10 scroll-mt-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Platform bookings</p>
              <h2 className="mt-1 font-serif text-3xl text-[#48213d]">Recent activity</h2>
            </div>
            {bookings_.data && bookings_.data.length > 0 && (
              <span className="font-mono text-[10px] text-[#9b858e]">{bookings_.data.length} shown</span>
            )}
          </div>

          {bookings_.isLoading && (
            <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="skeleton h-14 rounded-[14px]" />)}</div>
          )}
          {!bookings_.isLoading && (bookings_.data ?? []).length === 0 && (
            <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-[#c6aeb8]" />
              <p className="mt-3 font-serif text-xl text-[#48213d]">No bookings yet.</p>
              <p className="mt-1 text-xs text-[#806c76]">Booking activity across the platform will appear here once Supabase is live.</p>
            </div>
          )}
          {(bookings_.data ?? []).length > 0 && (
            <div className="overflow-hidden rounded-[20px] border border-[#dfd2c9] bg-white">
              <div className="grid grid-cols-[1fr_2fr_1fr_1fr_auto] gap-px border-b border-[#ece1d9] bg-[#ece1d9] text-[9px] font-bold uppercase tracking-wider text-[#9b858e]">
                <div className="bg-[#fbf7f1] px-4 py-3">ID</div>
                <div className="bg-[#fbf7f1] px-4 py-3">Activity</div>
                <div className="bg-[#fbf7f1] px-4 py-3">Date</div>
                <div className="bg-[#fbf7f1] px-4 py-3">Status</div>
                <div className="bg-[#fbf7f1] px-4 py-3 text-right">Amount</div>
              </div>
              {(bookings_.data ?? []).map((b) => (
                <Link key={b.id} href={`/booking/${b.id}`}
                  className="grid grid-cols-[1fr_2fr_1fr_1fr_auto] items-center gap-px border-b border-[#ece1d9] bg-[#ece1d9] last:border-0 hover:bg-[#f0e4db] transition">
                  <div className="bg-white px-4 py-3 font-mono text-[10px] text-[#9b858e]">{b.id.toUpperCase()}</div>
                  <div className="bg-white px-4 py-3 text-sm font-medium text-[#48213d]">{b.activity}</div>
                  <div className="bg-white px-4 py-3 text-xs text-[#725e69]">{b.date}</div>
                  <div className="bg-white px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.1em]', STATUS_STYLE[b.status] ?? 'bg-[#ece1d9] text-[#725e69]')}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="bg-white px-4 py-3 text-right font-mono text-sm text-[#48213d]">{money(b.totalCents)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </main>
    </Shell>
  );
}

function AdminIdentitySection() {
  const qc = useQueryClient();
  const rows = useQuery<{ id: string; displayName: string; city: string; approved: boolean; verified: boolean; identityStatus: string; payoutsHeld: boolean; accountId: string }[]>({
    queryKey: ['admin-identity'],
    queryFn: async () => {
      const res = await fetch('/api/admin/companions/identity', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });
  const bookings = useQuery<(BookingDetail & { payoutHeld?: boolean })[]>({
    queryKey: ['admin-bookings-money'],
    queryFn: async () => {
      const res = await fetch('/api/admin/bookings/recent', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });
  const [acting, setActing] = useState<string | null>(null);
  const act = async (url: string, body?: Record<string, unknown>) => {
    setActing(url);
    await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    qc.invalidateQueries({ queryKey: ['admin-identity'] });
    qc.invalidateQueries({ queryKey: ['admin-bookings-money'] });
    qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    setActing(null);
  };
  return (
    <div id="identity-review" className="mt-10 scroll-mt-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Identity & payouts</p>
      <h2 className="mt-1 font-serif text-3xl text-[#48213d]">ID review and holds</h2>
      <p className="mt-2 text-xs text-[#806c76]">Listing approval is separate from identity. Hold payouts before capture when a booking needs review.</p>
      <div className="mt-4 space-y-3">
        {(rows.data ?? []).map((row) => (
          <div key={row.id} className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#48213d]">{row.displayName}</p>
                <p className="mt-1 font-mono text-[10px] text-[#9b858e]">{row.city} · {row.approved ? 'listed' : 'not listed'} · ID {row.identityStatus}{row.payoutsHeld ? ' · payouts held' : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/companions/${row.id}/identity`, { status: 'verified' })}
                  className="rounded-full bg-[#477254] px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Verify ID</button>
                <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/companions/${row.id}/identity`, { status: 'rejected' })}
                  className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">Reject ID</button>
                <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/companions/${row.id}/payouts-hold`, { held: !row.payoutsHeld })}
                  className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">{row.payoutsHeld ? 'Release payouts' : 'Hold payouts'}</button>
                {row.accountId && (
                  <>
                    <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/accounts/${row.accountId}/suspend`, { reason: 'Suspended from operations' })}
                      className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">Suspend</button>
                    <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/accounts/${row.accountId}/ban`, { reason: 'Banned from operations' })}
                      className="rounded-full bg-[#a64742] px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Ban</button>
                    <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/accounts/${row.accountId}/restore`)}
                      className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">Restore</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {!rows.isLoading && (rows.data ?? []).length === 0 && (
          <p className="text-sm text-[#806c76]">No companion profiles yet.</p>
        )}
      </div>
      <div className="mt-8 space-y-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Booking money actions</p>
        {(bookings.data ?? []).filter((b) => !['completed', 'cancelled'].includes(b.status) || b.payoutHeld).slice(0, 12).map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#dfd2c9] bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#48213d]">{b.activity} · {money(b.totalCents)}</p>
              <p className="font-mono text-[10px] text-[#9b858e]">{b.id} · {b.status}{b.payoutHeld ? ' · held' : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/bookings/${b.id}/payout-hold`, { held: !b.payoutHeld })}
                className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">{b.payoutHeld ? 'Release hold' : 'Hold payout'}</button>
              <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/bookings/${b.id}/refund`)}
                className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">Refund</button>
              <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/bookings/${b.id}/no-show`, { party: 'customer' })}
                className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">Customer no-show</button>
              <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/bookings/${b.id}/no-show`, { party: 'companion' })}
                className="rounded-full border border-[#dfd2c9] px-3 py-1.5 text-[10px] font-bold text-[#654c5f] disabled:opacity-50">Companion no-show</button>
              <button type="button" disabled={acting !== null} onClick={() => void act(`/api/admin/bookings/${b.id}/capture`)}
                className="rounded-full bg-[#7f2e62] px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Capture</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminReportsSection() {
  const qc = useQueryClient();
  const reports = useQuery<{ id: string; reportType: string; detail: string; urgent: boolean; status: string; createdAt: string; riskLevel: string; bookingId?: string | null }[]>({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reports', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) return [];
      if (!res.ok) throw new Error('Could not load reports');
      return res.json();
    },
    retry: false,
  });
  const [acting, setActing] = useState<string | null>(null);
  const [thread, setThread] = useState<{ bookingId: string; messages: { id: string; senderRole: string; body: string; createdAt: string }[] } | null>(null);

  const resolve = async (id: string) => {
    setActing(id);
    await fetch(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Reviewed by trust team' }),
    });
    qc.invalidateQueries({ queryKey: ['admin-reports'] });
    qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    setActing(null);
  };

  return (
    <div id="safety-reports" className="mt-10 scroll-mt-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Safety reports</p>
      <h2 className="mt-1 font-serif text-3xl text-[#48213d]">Open concerns</h2>
      {reports.isLoading && <div className="mt-4 skeleton h-24 rounded-[16px]" />}
      {!reports.isLoading && (reports.data ?? []).length === 0 && (
        <div className="mt-4 rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-8 text-center">
          <p className="font-serif text-xl text-[#48213d]">No reports in the queue.</p>
          <p className="mt-1 text-xs text-[#806c76]">Live incident reports will appear here. Nothing is invented for empty states.</p>
        </div>
      )}
      <div className="mt-4 space-y-3">
        {(reports.data ?? []).map((report) => (
          <div key={report.id} className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#48213d]">{report.reportType}</p>
                <p className="mt-1 text-xs leading-5 text-[#725e69]">{report.detail}</p>
                <p className="mt-2 font-mono text-[10px] text-[#9b858e]">{new Date(report.createdAt).toLocaleString()} · {report.status} · {report.riskLevel}</p>
                {report.bookingId && (
                  <button type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/admin/bookings/${report.bookingId}/messages`, { credentials: 'include' });
                      const messages = res.ok ? await res.json() : [];
                      setThread({ bookingId: report.bookingId!, messages });
                    }}
                    className="mt-2 text-[10px] font-bold text-[#7f2e62] underline"
                  >
                    Review reported thread
                  </button>
                )}
              </div>
              {report.status === 'open' && (
                <button type="button" disabled={acting === report.id} onClick={() => void resolve(report.id)}
                  className="rounded-full bg-[#8F294C] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {acting === report.id ? 'Saving…' : 'Resolve'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {thread && (
        <div className="mt-4 rounded-[18px] border border-[#dfd2c9] bg-white p-5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Reported thread · {thread.bookingId}</p>
          <p className="mt-1 text-[10px] text-[#806c76]">Chat is not end-to-end encrypted. Opening this thread is written to the audit log.</p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {thread.messages.length === 0 && <p className="text-xs text-[#806c76]">No messages on this booking.</p>}
            {thread.messages.map((msg) => (
              <p key={msg.id} className="text-xs leading-5 text-[#48213d]">
                <span className="font-bold">{msg.senderRole}</span> · {new Date(msg.createdAt).toLocaleString()}
                <span className="mt-0.5 block text-[#725e69]">{msg.body}</span>
              </p>
            ))}
          </div>
          <button type="button" onClick={() => setThread(null)} className="mt-3 text-[10px] font-bold text-[#7f2e62]">Close thread</button>
        </div>
      )}
    </div>
  );
}

function AdminAuditSection() {
  const audit = useQuery<{ id: string; action: string; subjectType: string; subjectId: string; note: string | null; createdAt: string; actorId: string }[]>({
    queryKey: ['admin-audit'],
    queryFn: async () => {
      const res = await fetch('/api/admin/audit', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });
  return (
    <div id="admin-audit" className="mt-10 scroll-mt-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Immutable audit log</p>
      <h2 className="mt-1 font-serif text-3xl text-[#48213d]">Every admin action</h2>
      {!audit.isLoading && (audit.data ?? []).length === 0 && (
        <p className="mt-4 text-sm text-[#806c76]">No recorded actions yet. Approvals, rejections, and report resolutions will appear here.</p>
      )}
      <div className="mt-4 space-y-2">
        {(audit.data ?? []).map((row) => (
          <div key={row.id} className="grid gap-1 rounded-xl border border-[#ece1d9] bg-white px-4 py-3 md:grid-cols-[160px_1fr]">
            <p className="font-mono text-[10px] text-[#9b858e]">{new Date(row.createdAt).toLocaleString()}</p>
            <p className="text-sm text-[#48213d]"><span className="font-bold">{row.action}</span> · {row.subjectType} {row.subjectId}{row.note ? ` — ${row.note}` : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function useSafeSpotApplications() {
  return useQuery<{ id: string; name: string; address: string; city: string; type: string; contactEmail: string; contactName: string; submittedAt: string; status: string }[]>({
    queryKey: ['admin-safespots-pending'],
    queryFn: async () => {
      const res = await fetch('/api/admin/safespots/pending', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });
}

function SafeSpotApplicationsSection() {
  const qc = useQueryClient();
  const apps = useSafeSpotApplications();
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [acting, setActing] = useState<string | null>(null);

  const handle = async (id: string, action: 'approve' | 'reject') => {
    setActing(id);
    try {
      await fetch(`/api/admin/safespots/${id}/${action}`, { method: 'POST', credentials: 'include' });
      setDecided((d) => ({ ...d, [id]: action === 'approve' ? 'approved' : 'rejected' }));
      qc.invalidateQueries({ queryKey: ['admin-safespots-pending'] });
    } catch {}
    setActing(null);
  };

  return (
    <div className="mt-10" id="safespot-review">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Venue review</p>
          <h2 className="mt-1 font-serif text-3xl text-[#48213d]">SafeSpot applications</h2>
        </div>
        <span className="rounded-full bg-[#e8f0e8] px-3 py-1 font-mono text-xs font-bold text-[#477254]">
          {(apps.data ?? []).length} pending
        </span>
      </div>

      {apps.isLoading && (
        <div className="space-y-3">{[0,1].map(i => <div key={i} className="skeleton h-28 rounded-[20px]" />)}</div>
      )}
      {!apps.isLoading && (apps.data ?? []).length === 0 && (
        <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-10 text-center">
          <MapPin className="mx-auto h-7 w-7 text-[#c6aeb8]" />
          <p className="mt-3 font-serif text-xl text-[#48213d]">No venue applications.</p>
          <p className="mt-1 text-xs text-[#806c76]">Applications from the SafeSpot register page will appear here.</p>
        </div>
      )}
      {(apps.data ?? []).length > 0 && (
        <div className="space-y-3">
          {(apps.data ?? []).map((app) => {
            const d = decided[app.id];
            return (
              <div key={app.id} className={`rounded-[20px] border p-5 transition ${
                d === 'approved' ? 'border-[#c7d9cb] bg-[#f4faf5]' :
                d === 'rejected' ? 'border-[#f0d7d5] bg-[#fdf5f4]' :
                'border-[#dfd2c9] bg-white'
              }`} data-testid={`safespot-app-${app.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#48213d]">{app.name}</p>
                    <p className="text-[10px] text-[#9b858e]">{app.address} · {app.city} · {app.type}</p>
                    <p className="text-[10px] text-[#9b858e]">Contact: {app.contactName || '—'} &lt;{app.contactEmail}&gt;</p>
                  </div>
                  <p className="font-mono text-[9px] text-[#b0929f]">{new Date(app.submittedAt).toLocaleDateString()}</p>
                </div>
                {d ? (
                  <div className={`mt-4 flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs font-bold ${d === 'approved' ? 'bg-[#e8f0e8] text-[#31533f]' : 'bg-[#f0d7d5] text-[#86555a]'}`}>
                    <Check className="h-3.5 w-3.5" />
                    {d === 'approved' ? 'Venue approved — will appear on the SafeSpot map' : 'Application rejected'}
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button type="button" disabled={acting === app.id} onClick={() => handle(app.id, 'approve')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e8f0e8] px-3 text-xs font-bold text-[#31533f] hover:bg-[#477254] hover:text-white transition disabled:opacity-60"
                      data-testid={`button-approve-safespot-${app.id}`}>
                      <Check className="h-3 w-3" />{acting === app.id ? 'Working…' : 'Approve venue'}
                    </button>
                    <button type="button" disabled={acting === app.id} onClick={() => handle(app.id, 'reject')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#dfd2c9] px-3 text-xs font-bold text-[#725e69] hover:border-[#a64742] hover:text-[#a64742] transition disabled:opacity-60"
                      data-testid={`button-reject-safespot-${app.id}`}>
                      <X className="h-3 w-3" />Reject
                    </button>
                    <Link href={`/safespots`} className="ml-auto text-[10px] text-[#9d557e] hover:underline self-center">
                      View SafeSpots →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QueueRow({ icon: Icon, title, count, href }: { icon: typeof ClipboardCheck; title: string; count: number; href: string }) {
  return <Link href={href} className="flex items-center gap-3 rounded-xl border border-[#ece1d9] p-4 transition hover:border-[#c89bb5] hover:bg-[#f0e4db]" data-testid={`row-queue-${title.toLowerCase().replaceAll(' ', '-')}`}><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]"><Icon className="h-4 w-4" /></span><span className="flex-1 text-sm font-bold text-[#654c5f]">{title}</span><span className="font-mono text-sm text-[#7f2e62]">{count}</span><ChevronRight className="h-4 w-4 text-[#b0929f]" /></Link>;
}

// ---------------------------------------------------------------------------
// Admin operations — companion review + bookings
// ---------------------------------------------------------------------------

type CompanionApplication = {
  id: string; displayName: string; city: string; activities: string[];
  languages: string[]; hourlyRate: number; applicationDate: string; bio: string; status: string;
};

function useAdminCompanions() {
  return useQuery<CompanionApplication[]>({
    queryKey: ['admin-companions-pending'],
    queryFn: async () => {
      const res = await fetch('/api/admin/companions/pending', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    retry: false,
  });
}

function useAdminBookings() {
  return useQuery<BookingDetail[]>({
    queryKey: ['admin-bookings-recent'],
    queryFn: async () => {
      const res = await fetch('/api/admin/bookings/recent', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    retry: false,
  });
}

function useCompanionDecision() {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: string }, Error, { id: string; action: 'approve' | 'reject' }>({
    mutationFn: async ({ id, action }) => {
      const res = await fetch(`/api/admin/companions/${id}/${action}`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-companions-pending'] }),
  });
}

function CompanionApplicationCard({ app, onDecision }: { app: CompanionApplication; onDecision: (id: string, action: 'approve' | 'reject') => void }) {
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null);
  const decision = useCompanionDecision();
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);

  const handle = (action: 'approve' | 'reject') => {
    if (confirming !== action) { setConfirming(action); return; }
    decision.mutate({ id: app.id, action }, {
      onSuccess: () => {
        setDecided(action === 'approve' ? 'approved' : 'rejected');
        setConfirming(null);
        onDecision(app.id, action);
      },
    });
  };

  return (
    <div className={`rounded-[20px] border p-5 transition ${decided === 'approved' ? 'border-[#c7d9cb] bg-[#f4faf5]' : decided === 'rejected' ? 'border-[#f0d7d5] bg-[#fdf5f4]' : 'border-[#dfd2c9] bg-white'}`}
      data-testid={`application-card-${app.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ead0dd] font-serif text-sm font-bold text-[#7f2e62]">
            {app.displayName[0]}
          </div>
          <div>
            <p className="font-bold text-[#48213d]">{app.displayName}</p>
            <p className="text-[10px] text-[#9b858e]">{app.city} · Applied {app.applicationDate}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#9b858e]">Rate</p>
          <p className="font-serif text-xl text-[#48213d]">${app.hourlyRate}/hr</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-[#725e69] italic">"{app.bio}"</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {app.activities.map((a) => (
          <span key={a} className="rounded-full bg-[#f0e4db] px-2 py-0.5 text-[10px] text-[#7f5042]">{a}</span>
        ))}
        {app.languages.map((l) => (
          <span key={l} className="rounded-full bg-[#e8f0e8] px-2 py-0.5 text-[10px] text-[#477254]">{l}</span>
        ))}
      </div>

      {decided ? (
        <div className={`mt-4 flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs font-bold ${decided === 'approved' ? 'bg-[#e8f0e8] text-[#31533f]' : 'bg-[#f0d7d5] text-[#86555a]'}`}>
          <Check className="h-3.5 w-3.5" />
          {decided === 'approved' ? 'Approved — profile will go live after Supabase sync' : 'Rejected — applicant will be notified'}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirming === 'approve' ? (
            <button type="button" disabled={decision.isPending} onClick={() => handle('approve')}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#477254] px-3 text-xs font-bold text-white disabled:opacity-60"
              data-testid={`button-confirm-approve-${app.id}`}>
              {decision.isPending ? 'Approving…' : <><Check className="h-3 w-3" />Tap again to approve</>}
            </button>
          ) : (
            <button type="button" onClick={() => handle('approve')}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e8f0e8] px-3 text-xs font-bold text-[#31533f] hover:bg-[#477254] hover:text-white transition"
              data-testid={`button-approve-${app.id}`}>
              <Check className="h-3 w-3" />Approve
            </button>
          )}
          {confirming === 'reject' ? (
            <button type="button" disabled={decision.isPending} onClick={() => handle('reject')}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#a64742] px-3 text-xs font-bold text-white disabled:opacity-60"
              data-testid={`button-confirm-reject-${app.id}`}>
              {decision.isPending ? 'Rejecting…' : <><X className="h-3 w-3" />Tap again to reject</>}
            </button>
          ) : (
            <button type="button" onClick={() => handle('reject')}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#dfd2c9] px-3 text-xs font-bold text-[#725e69] hover:border-[#a64742] hover:text-[#a64742] transition"
              data-testid={`button-reject-${app.id}`}>
              <X className="h-3 w-3" />Reject
            </button>
          )}
          {confirming && (
            <button type="button" onClick={() => setConfirming(null)} className="text-[10px] text-[#9b858e] hover:text-[#48213d]">
              Cancel
            </button>
          )}
          <Link href={`/companions/${app.id}`} className="ml-auto text-[10px] text-[#9d557e] hover:underline">View full profile →</Link>
        </div>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <Shell>
      <main className="page-enter mx-auto max-w-3xl px-5 py-24 lg:px-8">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">404</p>
          <h1 className="mt-3 font-serif text-6xl leading-none text-[#48213d]">This page<br /><em>doesn't exist.</em></h1>
          <p className="mt-6 max-w-sm mx-auto text-sm leading-6 text-[#725e69]">The link may have moved or expired. Here are some good places to start instead.</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/explore" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white" data-testid="link-404-explore">
              Browse companions <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#dfd2c9] px-6 text-sm font-bold text-[#654c5f] hover:bg-[#f0e4db]" data-testid="link-404-home">
              Home
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: '/explore', icon: Compass, label: 'Browse companions', desc: 'Find the right companion for your city and activity.' },
            { href: '/activities', icon: Landmark, label: 'Activity directory', desc: 'Explore what you can do — from museum visits to cooking classes.' },
            { href: '/safespots', icon: ShieldCheck, label: 'SafeSpot Network', desc: 'Find verified public venues for your next booking.' },
            { href: '/how-it-works', icon: ClipboardCheck, label: 'How it works', desc: 'New to OnlyFavors? Start here.' },
            { href: '/stories', icon: MessageSquare, label: 'Stories & journal', desc: 'Companion spotlights, guides, and platform thinking.' },
            { href: '/help', icon: LifeBuoy, label: 'Help centre', desc: 'FAQs, booking questions, and contact options.' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href}
              className="group rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:border-[#9d557e] hover:shadow-md">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-4 font-semibold text-[#48213d] group-hover:text-[#7f2e62]">{label}</p>
              <p className="mt-1 text-xs leading-5 text-[#806c76]">{desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Gift card redemption page
// ---------------------------------------------------------------------------

function RedeemPage() {
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'entry' | 'error'>('entry');
  const [errorMsg, setErrorMsg] = useState('');

  const handleRedeem = (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('error');
    setErrorMsg('Gift redemption is not live yet. Email hello@onlyfavors.com if you were given a code.');
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-lg px-5 py-16 lg:px-8">
        <Link href="/" className="mb-10 inline-flex items-center gap-2 text-xs text-[#9b858e] hover:text-[#48213d]">
          <ArrowLeft className="h-3.5 w-3.5" />OnlyFavors
        </Link>

        <div className="text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[22px] bg-[#ead0dd]">
                <Gift className="h-8 w-8 text-[#7f2e62]" />
              </div>
              <h1 className="mt-6 font-serif text-5xl text-[#48213d]">Redeem a gift card</h1>
              <p className="mt-3 text-sm leading-6 text-[#725e69]">
                Gift redemption is not live yet. If you were given a code, email hello@onlyfavors.com and we'll help.
              </p>
            </div>

            <form onSubmit={handleRedeem} className="mt-10 space-y-4" data-testid="form-redeem">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">Gift card code</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setPhase('entry'); setErrorMsg(''); }}
                  placeholder="FAVOR-XXXX-XXXX"
                  autoCapitalize="characters"
                  className="h-14 w-full rounded-[16px] border border-[#cbbab5] bg-[#fbf7f1] px-5 text-center font-mono text-lg tracking-[.1em] outline-none focus:border-[#7f2e62]"
                  data-testid="input-redeem-code"
                />
              </label>

              {phase === 'error' && (
                <div className="rounded-[14px] bg-[#fbebe7] p-4 text-sm text-[#86555a]" data-testid="error-redeem">
                  {errorMsg}
                </div>
              )}

              <button type="submit"
                disabled={!code.trim()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e] disabled:opacity-50"
                data-testid="button-submit-redeem">
                Apply gift card
              </button>
            </form>

            <div className="mt-10 space-y-3">
              {[
                { icon: Gift, text: 'Gift cards can be used for any booking on OnlyFavors.' },
                { icon: WalletCards, text: 'Your balance is applied automatically at checkout — no code to enter again.' },
                { icon: ShieldCheck, text: 'Balances are non-refundable but never expire.' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 text-xs leading-5 text-[#806c76]">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#9b858e]" />
                  {text}
                </div>
              ))}
            </div>

            <p className="mt-8 text-center text-xs text-[#9b858e]">
              Want to send a gift card?{' '}
              <Link href="/gift" className="font-bold text-[#7f2e62] hover:underline">Give the gift of good company →</Link>
            </p>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// SafeSpot Registration — venue owners apply to become a verified SafeSpot
// ---------------------------------------------------------------------------

const SAFESPOT_TYPES = [
  { value: 'cafe', label: 'Café or coffee shop' },
  { value: 'restaurant', label: 'Restaurant or bistro' },
  { value: 'hotel_lobby', label: 'Hotel lobby or bar' },
  { value: 'museum', label: 'Museum or gallery' },
  { value: 'coworking', label: 'Co-working space or lounge' },
  { value: 'park', label: 'Public park or garden' },
  { value: 'library', label: 'Library' },
  { value: 'other', label: 'Other public venue' },
];

function SafeSpotRegister() {
  const [form, setForm] = useState({
    name: '', address: '', city: '', type: 'cafe',
    contactName: '', contactEmail: '', description: '',
  });
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.name.trim() && form.address.trim() && form.city.trim() && form.contactEmail.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setState('loading');
    try {
      const res = await fetch('/api/safespots/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Submission failed' }));
        throw new Error(error);
      }
      setState('done');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Could not submit application');
      setState('error');
    }
  }

  const fieldCls = "h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none";
  const labelCls = "mb-1.5 block text-xs font-bold text-[#654c5f]";

  if (state === 'done') {
    return (
      <Shell>
        <main className="mx-auto max-w-xl px-5 py-24 text-center">
          <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-[#e8f0e8]">
            <ShieldCheck className="h-10 w-10 text-[#477254]" />
          </div>
          <h1 className="font-serif text-4xl text-[#48213d]">Application received.</h1>
          <p className="mt-4 text-sm leading-7 text-[#725e69]">
            Your venue application is stored for the trust team. There is no published 3–5 day SLA, site-visit promise, or QR-code pack yet.
            We'll email the address you provided when there is a decision.
          </p>
          <div className="mt-8 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 text-left">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">What this does</p>
            <ul className="mt-4 space-y-3">
              {[
                'The application is saved for a person to review',
                'Approved venues can appear on the SafeSpot map',
                'We will not invent a site visit or printed QR pack until those exist',
              ].map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-[#654c5f]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />{s}
                </li>
              ))}
            </ul>
          </div>
          <Link href="/safespots" className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-[#fff5eb]">
            Browse SafeSpots <ArrowRight className="h-4 w-4" />
          </Link>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <main className="mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/safespots" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]">
          <ArrowLeft className="h-4 w-4" />SafeSpot Network
        </Link>

        <div className="mb-10">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Venue application</p>
          <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Become a SafeSpot.</h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[#725e69]">
            SafeSpots are public, well-lit venues where OnlyFavors companions and customers meet safely.
            No private rooms, no judgment. Just a reliable, welcoming space.
          </p>
        </div>

        {/* What we look for */}
        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { icon: MapPin, title: 'Public access', body: 'Open to all, no reservations required for entry' },
            { icon: Shield, title: 'Well-lit space', body: 'Good visibility — no dark corners or secluded areas' },
            { icon: Users, title: 'Staff present', body: 'Team members on-site during operating hours' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
              <Icon className="h-5 w-5 text-[#9d557e]" />
              <p className="mt-3 text-sm font-bold text-[#48213d]">{title}</p>
              <p className="mt-1 text-xs leading-5 text-[#806c76]">{body}</p>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-6" data-testid="form-safespot-register">
          {/* Venue info */}
          <div className="rounded-[20px] border border-[#dfd2c9] bg-white p-6">
            <p className="mb-5 font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">About the venue</p>
            <div className="space-y-4">
              <label className="block">
                <span className={labelCls}>Venue name *</span>
                <input value={form.name} onChange={set('name')} placeholder="The Surfjack Hotel Café" required
                  className={fieldCls} data-testid="input-safespot-name" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Street address *</span>
                  <input value={form.address} onChange={set('address')} placeholder="375 Bush St" required
                    className={fieldCls} data-testid="input-safespot-address" />
                </label>
                <label className="block">
                  <span className={labelCls}>City *</span>
                  <input value={form.city} onChange={set('city')} placeholder="San Francisco" required
                    className={fieldCls} data-testid="input-safespot-city" />
                </label>
              </div>
              <label className="block">
                <span className={labelCls}>Venue type</span>
                <select value={form.type} onChange={set('type')}
                  className={`${fieldCls} cursor-pointer`} data-testid="select-safespot-type">
                  {SAFESPOT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Brief description</span>
                <textarea value={form.description} onChange={set('description')} rows={3}
                  placeholder="Tell us what makes this a good meeting spot — seating, noise level, accessibility…"
                  maxLength={500}
                  className="w-full resize-none rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] p-3 text-sm leading-6 text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
                  data-testid="textarea-safespot-description" />
                <p className="mt-1 text-right text-[10px] text-[#9b858e]">{form.description.length}/500</p>
              </label>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-[20px] border border-[#dfd2c9] bg-white p-6">
            <p className="mb-5 font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">Contact details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Your name</span>
                <input value={form.contactName} onChange={set('contactName')} placeholder="Jordan T."
                  className={fieldCls} data-testid="input-safespot-contact-name" />
              </label>
              <label className="block">
                <span className={labelCls}>Email address *</span>
                <input value={form.contactEmail} onChange={set('contactEmail')} type="email"
                  placeholder="hello@yourvenue.com" required
                  className={fieldCls} data-testid="input-safespot-contact-email" />
              </label>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[#9b858e]">
              We'll send review updates here. We never share your contact with customers or companions.
            </p>
          </div>

          {state === 'error' && (
            <div className="rounded-[12px] bg-[#fbebe7] px-4 py-3 text-xs text-[#a64742]">{errorMsg}</div>
          )}

          <button type="submit" disabled={!valid || state === 'loading'}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-[#fff5eb] disabled:opacity-50"
            data-testid="button-safespot-submit">
            {state === 'loading' ? 'Submitting application…' : (<><ShieldCheck className="h-4 w-4" />Submit SafeSpot application</>)}
          </button>

          <p className="text-center text-[10px] leading-5 text-[#9b858e]">
            By applying, you agree to our <Link href="/terms" className="underline">venue terms</Link>.
            We may visit in person before approval. There is no fee to become a SafeSpot.
          </p>
        </form>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// SafeSpot Check-In landing page — records arrival on the booking. Does not SMS Trust Circle.
// ---------------------------------------------------------------------------

function CheckIn() {
  const [search] = useState(() => new URLSearchParams(window.location.search));
  const bookingId = search.get('booking') ?? '';
  const venue = search.get('venue') ?? 'this SafeSpot';

  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function confirm() {
    setState('loading');
    try {
      const res = await fetch(`/api/bookings/${bookingId}/checkin`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue, kind: 'arrival' }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Check-in failed' }));
        throw new Error(error);
      }
      setState('done');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Could not record check-in');
      setState('error');
    }
  }

  return (
    <div className="min-h-screen bg-[#1f0c1b] text-[#f9efe5] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#7f2e62] text-sm font-bold text-[#fff5eb]">of</span>
          <span className="font-serif text-lg text-[#f9efe5]">OnlyFavors</span>
        </div>

        {state === 'done' ? (
          <div className="text-center">
            <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-[#3dbd8c]/20">
              <ShieldCheck className="h-10 w-10 text-[#3dbd8c]" />
            </div>
            <h1 className="font-serif text-3xl text-[#f9efe5]">Arrived safely.</h1>
            <p className="mt-3 text-sm leading-6 text-[#c695ae]">
              Your arrival at <span className="font-semibold text-[#f9efe5]">{venue}</span> has been recorded on this booking.
            </p>
            <div className="mt-8 rounded-[16px] border border-[#4a2040] bg-[#2d1128] p-5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#9d7e8e]">Check-in logged</p>
              <p className="mt-2 text-xs text-[#c695ae]">{new Date().toLocaleString()}</p>
              {bookingId && bookingId !== 'demo' && (
                <p className="mt-1 font-mono text-[9px] text-[#6b4560]">BOOKING {bookingId.toUpperCase()}</p>
              )}
            </div>
            <Link href={bookingId && bookingId !== 'demo' ? `/favor/${bookingId}` : '/'}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white">
              Back to booking <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-[20px] border border-[#4a2040] bg-[#2d1128] p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#7f2e62]/30">
                  <MapPin className="h-6 w-6 text-[#c695ae]" />
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#9d7e8e]">SafeSpot check-in</p>
                  <p className="mt-1 font-serif text-2xl leading-tight text-[#f9efe5]">{venue}</p>
                  <p className="mt-1 text-xs text-[#9d7e8e]">Verified safety venue</p>
                </div>
              </div>

              <div className="mt-5 space-y-3 border-t border-[#4a2040] pt-5">
                <div className="flex items-center gap-3 text-xs text-[#c695ae]">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#3dbd8c]" />
                  Check-in is stored on this booking. Trust Circle is not texted.
                </div>
                <div className="flex items-center gap-3 text-xs text-[#c695ae]">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#3dbd8c]" />
                  No personal details shared with the venue
                </div>
                <div className="flex items-center gap-3 text-xs text-[#c695ae]">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#3dbd8c]" />
                  Check-in time logged for your safety record
                </div>
              </div>
            </div>

            {state === 'error' && (
              <div className="mb-4 rounded-[12px] bg-[#a64742]/20 px-4 py-3 text-xs text-[#f9a8a8]">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={state === 'loading'}
              onClick={confirm}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#3dbd8c] px-5 py-4 text-sm font-bold text-white disabled:opacity-60"
              data-testid="button-checkin-confirm"
            >
              {state === 'loading' ? 'Recording arrival…' : (
                <><ShieldCheck className="h-4 w-4" />Confirm arrival at this venue</>
              )}
            </button>

            <p className="mt-4 text-center text-[10px] leading-5 text-[#6b4560]">
              This records check-in for the signed-in booking. It does not notify venue staff or SMS a Trust Circle.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Companion payout setup page
// ---------------------------------------------------------------------------

function CompanionPayoutPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch } = useCompanionPayoutStatus();
  const onboard = useStartPayoutOnboarding();

  // Detect Stripe return param
  const stripeReturn = new URLSearchParams(window.location.search).has('stripe_return');
  useEffect(() => { if (stripeReturn) refetch(); }, [stripeReturn]);

  const status = data?.status ?? 'not_started';

  const HOW_IT_WORKS = [
    {
      num: '01', icon: ClipboardCheck, color: 'bg-[#ead0dd] text-[#7f2e62]',
      title: 'Connect once',
      body: 'Link your bank account through Stripe in about 5 minutes. OnlyFavors never sees your banking details.',
    },
    {
      num: '02', icon: Check, color: 'bg-[#e8f0e8] text-[#477254]',
      title: 'Complete a booking',
      body: 'After a booking is marked complete, your net earnings — companion rate minus 15% platform fee — are queued for payout.',
    },
    {
      num: '03', icon: WalletCards, color: 'bg-[#f3ead7] text-[#bf8750]',
      title: 'Funds arrive within 2–5 days',
      body: 'After a booking is marked complete, net earnings go through Stripe Connect on Stripe\'s schedule — often 2–5 business days. OnlyFavors does not promise a 24-hour payout.',
    },
  ];

  const FAQS: [string, string][] = [
    ['What percentage do I keep?', 'You keep 85% of your hourly rate. The remaining 15% goes to OnlyFavors to cover platform operations, trust & safety, and Stripe processing. This is calculated server-side — your rate in your profile is what customers see, and you always see exactly what you will earn before confirming.'],
    ['Can I choose when payouts happen?', 'Payout timing follows Stripe after a booking is completed. You cannot batch or delay transfers from OnlyFavors. If you want to accumulate earnings, leave them in the connected bank account — Stripe sends on its own schedule.'],
    ['What countries are supported?', 'Stripe payouts are available in the US, Canada, UK, Australia, and most of the EU. If your country is unsupported, you will see a message in the Stripe onboarding flow. Reach out to our team if you need help.'],
    ['What if I close my Stripe account?', 'Contact our support team before closing your Stripe account. If you close it while you have a pending payout, that payout may be lost. We will help you transition safely.'],
    ['Is my banking data secure?', 'Yes. All banking data is handled entirely by Stripe — OnlyFavors never stores or sees your account numbers, routing numbers, or any sensitive financial details. We only receive a status flag confirming payouts are active.'],
  ];

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-3xl px-5 py-10 pb-28 lg:px-8 lg:py-16">

        {/* Back */}
        <Link href="/dashboard/companion" className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-payout-back">
          <ArrowLeft className="h-4 w-4" />Companion workspace
        </Link>

        {/* Header */}
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Earnings setup</p>
        <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Payout account</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-[#725e69]">
          Connect your bank account once through Stripe and earnings from every confirmed booking land automatically — no invoicing, no waiting.
        </p>

        {/* Status card */}
        <div className="mt-8">
          {isLoading && (
            <div className="flex items-center gap-3 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] px-6 py-5">
              <div className="skeleton h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-32 rounded" />
                <div className="skeleton h-2 w-48 rounded" />
              </div>
            </div>
          )}
          {isError && (
            <div className="rounded-[20px] border border-[#f3dad5] bg-[#fdf3f1] px-6 py-5">
              <p className="text-sm font-semibold text-[#86555a]">Could not load payout status.</p>
              <button type="button" onClick={() => refetch()} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#7f2e62]">
                <RefreshCw className="h-3.5 w-3.5" />Try again
              </button>
            </div>
          )}
          {!isLoading && !isError && status === 'active' && (
            <div className="rounded-[20px] border border-[#c7d9cb] bg-[#e8f0e8] px-6 py-5" data-testid="payout-page-active">
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#477254] text-white">
                  <Check className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#31533f]">Payouts active</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#53725d]">Your Stripe account can receive transfers. Timing follows Stripe after a booking is completed — not a promised 24-hour window from OnlyFavors.</p>
                </div>
              </div>
              {data?.accountId && (
                <p className="mt-4 font-mono text-[9px] text-[#5e876d]">Stripe account: {data.accountId}</p>
              )}
              <div className="mt-4 flex gap-2">
                <a href="https://dashboard.stripe.com/express" target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#477254] px-4 font-mono text-[9px] font-bold uppercase tracking-wider text-white transition hover:bg-[#35634a]"
                  data-testid="link-stripe-express">
                  Open Stripe dashboard <ArrowRight className="h-3 w-3" />
                </a>
                <Link href="/dashboard/companion/earnings"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#8fbc9e] px-4 font-mono text-[9px] font-bold uppercase tracking-wider text-[#31533f] transition hover:bg-[#d8eddd]"
                  data-testid="link-view-earnings">
                  View earnings
                </Link>
              </div>
            </div>
          )}
          {!isLoading && !isError && status === 'pending' && (
            <div className="rounded-[20px] border border-[#e3cdb8] bg-[#fdf3e3] px-6 py-5" data-testid="payout-page-pending">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f3d7a7] text-[#a07030]">
                  <WalletCards className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#7a5a12]">Almost there — one step left</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#906620]">Your Stripe account was created but needs a few more details before payouts can be sent.</p>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} testId="button-payout-page-finish">
                  {onboard.isPending ? 'Opening Stripe…' : 'Finish setup'}<ArrowRight className="h-4 w-4" />
                </Button>
                <button type="button" onClick={() => refetch()}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#7a5a12] transition hover:bg-[#f3e8cb]"
                  data-testid="button-payout-page-refresh">
                  <RefreshCw className="h-3.5 w-3.5" />Check again
                </button>
              </div>
              {onboard.isError && <p className="mt-3 text-xs text-[#a64742]">{onboard.error.message}</p>}
            </div>
          )}
          {!isLoading && !isError && status === 'not_started' && (
            <div className="rounded-[20px] border border-[#dfd2c9] bg-[#f8f1e9] px-6 py-6" data-testid="payout-page-not-started">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]">
                  <WalletCards className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.15em] text-[#9d557e]">Not connected</p>
                  <p className="mt-1.5 text-sm font-bold text-[#48213d]">Set up payouts to get paid</p>
                  <p className="mt-1 text-xs leading-5 text-[#725e69]">You won't receive earnings from any bookings until your bank account is connected. It takes about 5 minutes through Stripe's secure onboarding.</p>
                </div>
              </div>
              <div className="mt-5">
                <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} testId="button-payout-page-start">
                  {onboard.isPending ? 'Opening Stripe…' : 'Connect bank account'}<ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              {stripeReturn && (
                <p className="mt-3 text-xs text-[#9a6d25]">We received your return from Stripe — your account may still be under review. Try checking again in a moment.</p>
              )}
              {onboard.isError && <p className="mt-3 text-xs text-[#a64742]">{onboard.error.message}</p>}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-12">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">How payouts work</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map(({ num, icon: Icon, color, title, body }) => (
              <div key={num} className="rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-5">
                <div className="flex items-center justify-between">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-[9px] font-bold text-[#c6aeb8]">{num}</span>
                </div>
                <p className="mt-4 text-sm font-bold text-[#48213d]">{title}</p>
                <p className="mt-1.5 text-xs leading-5 text-[#725e69]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payout schedule timeline */}
        <div className="mt-8 rounded-[20px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Payout timeline</p>
          <p className="mt-1 text-sm text-[#654c5f]">What happens after a booking is marked complete</p>
          <div className="mt-5 space-y-0">
            {[
              { time: 'Day 0', label: 'Booking completes', desc: 'Customer and companion both confirm the session ended.', dot: 'bg-[#7f2e62]' },
              { time: '≤ 24 hrs', label: 'Payout initiated', desc: 'OnlyFavors queues your net earnings (85% of rate) with Stripe.', dot: 'bg-[#9d557e]' },
              { time: '1–2 days', label: 'Stripe processing', desc: 'Stripe processes the transfer to your connected bank account.', dot: 'bg-[#c695ae]' },
              { time: '2–5 days', label: 'Funds in your account', desc: 'Your bank posts the deposit. Timing varies by institution.', dot: 'bg-[#e8d0de]' },
            ].map(({ time, label, desc, dot }, i, arr) => (
              <div key={time} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-[#fbf7f1] ${dot}`} />
                  {i < arr.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-[#e4d5d0]" style={{ minHeight: 32 }} />}
                </div>
                <div className="pb-5">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[.15em] text-[#ad929e]">{time}</p>
                  <p className="mt-0.5 text-sm font-bold text-[#48213d]">{label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#725e69]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rate preview */}
        <div className="mt-6 rounded-[20px] border border-[#dfd2c9] bg-[#f4edf6] p-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Example payout</p>
          <p className="mt-1 text-[11px] text-[#806c76]">Based on a 2-hour booking at $65/hr</p>
          <div className="mt-4 space-y-2">
            {[
              { label: 'Companion rate', value: '$130.00', muted: false },
              { label: '15% platform fee', value: '− $19.50', muted: true },
              { label: 'Your payout', value: '$110.50', muted: false, bold: true },
            ].map(({ label, value, muted, bold }) => (
              <div key={label} className={`flex items-center justify-between border-b border-[#e4d4df] pb-2 last:border-0 last:pb-0 last:pt-1 ${bold ? 'mt-3' : ''}`}>
                <span className={`text-sm ${muted ? 'text-[#9b858e]' : bold ? 'font-bold text-[#48213d]' : 'text-[#654c5f]'}`}>{label}</span>
                <span className={`font-mono text-sm ${muted ? 'text-[#9b858e]' : bold ? 'font-bold text-[#7f2e62]' : 'text-[#48213d]'}`}>{value}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-4 text-[#ad929e]">
            The 5% customer service fee is charged to the customer separately and is not deducted from your rate.
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-10">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Questions about payouts</p>
          <div className="mt-4 divide-y divide-[#ece1d9]">
            {FAQS.map(([q, a], i) => (
              <div key={q} className="py-1">
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  data-testid={`faq-payout-${i}`}>
                  <span className="text-sm font-semibold text-[#48213d]">{q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#9d557e] transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <p className="pb-5 text-sm leading-6 text-[#725e69]">{a}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA (only when not active) */}
        {status !== 'active' && !isLoading && (
          <div className="mt-10 flex items-center gap-3">
            <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} testId="button-payout-page-bottom-cta">
              {onboard.isPending ? 'Opening Stripe…' : status === 'pending' ? 'Finish payout setup' : 'Connect bank account'}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <button type="button" onClick={() => navigate('/dashboard/companion')}
              className="text-sm font-bold text-[#806076] hover:text-[#7f2e62]"
              data-testid="button-payout-skip">
              I'll do this later
            </button>
          </div>
        )}

        {/* Security note */}
        <p className="mt-8 flex items-center gap-1.5 text-[11px] text-[#9b858e]">
          <LockKeyhole className="h-3.5 w-3.5" />
          Banking details are handled entirely by Stripe. OnlyFavors never stores or sees your account or routing numbers.
        </p>
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Customer bookings history  /dashboard/customer/bookings
// ---------------------------------------------------------------------------

function CustomerBookingsPage() {
  const { data, isLoading, isError, refetch } = useCustomerBookings();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [search, setSearch] = useState('');

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const STATUS_PILL: Record<string, string> = {
    requested: 'bg-[#f3ead7] text-[#7a5a12]',
    deposit_paid: 'bg-[#ead0dd] text-[#7f2e62]',
    authorized: 'bg-[#e8f0e8] text-[#31533f]',
    confirmed: 'bg-[#dce8f5] text-[#2a5280]',
    completed: 'bg-[#ece1d9] text-[#725e69]',
    cancelled: 'bg-[#ece1d9] text-[#9b858e]',
  };

  const ACTIVE_STATUSES = new Set(['requested', 'deposit_paid', 'authorized', 'confirmed']);

  const filtered = useMemo(() => {
    const all = data ?? [];
    const q = search.trim().toLowerCase();
    return all
      .filter((b) => {
        if (filter === 'active') return ACTIVE_STATUSES.has(b.status);
        if (filter === 'completed') return b.status === 'completed';
        if (filter === 'cancelled') return b.status === 'cancelled';
        return true;
      })
      .filter((b) => !q || b.activity.toLowerCase().includes(q) || (b.companionName ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, filter, search]);

  const totalSpent = useMemo(() =>
    (data ?? []).filter((b) => b.status === 'completed').reduce((s, b) => s + b.totalCents, 0),
  [data]);

  const exportCSV = () => {
    if (!data?.length) return;
    const rows = [
      ['Date', 'Activity', 'Companion', 'Duration (hrs)', 'Total', 'Status', 'Booking ID'],
      ...(data ?? []).map((b) => [
        b.date, b.activity, b.companionName ?? '', String(b.durationHours),
        (b.totalCents / 100).toFixed(2), b.status, b.id,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'onlyfavors-bookings.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-4xl px-5 py-10 pb-24 lg:px-8 lg:py-16">
        {/* Header */}
        <Link href="/dashboard/customer" className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-bookings-back">
          <ArrowLeft className="h-4 w-4" />Customer workspace
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Your history</p>
            <h1 className="mt-2 font-serif text-5xl leading-none text-[#48213d]">Bookings</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportCSV} disabled={!data?.length}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm font-semibold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62] disabled:opacity-40"
              data-testid="button-export-bookings-csv">
              <FileText className="h-4 w-4" />Export CSV
            </button>
            <button type="button" onClick={() => refetch()}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
              data-testid="button-refresh-bookings">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        {!isLoading && !isError && (data ?? []).length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total bookings', value: String((data ?? []).length) },
              { label: 'Completed', value: String((data ?? []).filter((b) => b.status === 'completed').length) },
              { label: 'Active', value: String((data ?? []).filter((b) => ACTIVE_STATUSES.has(b.status)).length) },
              { label: 'Total spent', value: money(totalSpent) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-[18px] border border-[#dfd2c9] bg-[#fbf7f1] px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9b858e]">{label}</p>
                <p className="mt-1.5 font-serif text-2xl text-[#48213d]">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search + filter row */}
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b09aa8]" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by activity or companion…"
              className="h-10 w-full rounded-full border border-[#dfd2c9] bg-[#fbf7f1] pl-10 pr-4 text-sm text-[#48213d] placeholder:text-[#b09aa8] focus:border-[#9d557e] focus:outline-none"
              data-testid="input-bookings-search" />
          </div>
          <div className="flex gap-1.5">
            {FILTERS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setFilter(key)}
                className={`h-10 rounded-full px-4 text-xs font-bold transition ${filter === key ? 'bg-[#7f2e62] text-white' : 'border border-[#dfd2c9] bg-[#fbf7f1] text-[#654c5f] hover:border-[#9d557e]'}`}
                data-testid={`filter-bookings-${key}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="mt-5">
          {isLoading && (
            <div className="space-y-2">
              {[0,1,2,3].map((i) => <div key={i} className="skeleton h-20 rounded-[18px]" />)}
            </div>
          )}
          {isError && <ErrorState onRetry={() => refetch()} />}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-12 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-[#c6aeb8]" />
              <p className="mt-3 font-serif text-xl text-[#48213d]">
                {search || filter !== 'all' ? 'No bookings match that filter.' : 'No bookings yet.'}
              </p>
              {!search && filter === 'all' && (
                <Link href="/explore" className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-xs font-bold text-white">
                  Browse companions <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {(search || filter !== 'all') && (
                <button type="button" onClick={() => { setSearch(''); setFilter('all'); }}
                  className="mt-4 text-sm font-bold text-[#7f2e62] hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="overflow-hidden rounded-[22px] border border-[#dfd2c9]">
              <div className="divide-y divide-[#f0e8e2]">
                {filtered.map((b) => {
                  const isCompleted = b.status === 'completed';
                  const reviewed = Boolean(b.reviewed);
                  return (
                    <div key={b.id} className="flex items-center gap-4 bg-white px-5 py-4 transition hover:bg-[#fbf7f1]" data-testid={`booking-history-${b.id}`}>
                      {/* Date block */}
                      <div className="hidden w-14 shrink-0 text-center sm:block">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">
                          {new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                        </p>
                        <p className="font-serif text-2xl leading-none text-[#48213d]">
                          {new Date(b.date + 'T00:00:00').getDate()}
                        </p>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#48213d]">{b.activity}</p>
                        <p className="mt-0.5 text-[10px] text-[#9b858e]">
                          {b.date}
                          {b.companionName && <> · {b.companionName}</>}
                          {' · '}{b.durationHours}h
                        </p>
                      </div>

                      {/* Status */}
                      <span className={cn('hidden shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.1em] sm:inline-block', STATUS_PILL[b.status] ?? 'bg-[#ece1d9] text-[#725e69]')}>
                        {b.status.replace('_', ' ')}
                      </span>

                      {/* Amount */}
                      <span className="shrink-0 font-mono text-sm font-bold text-[#48213d]">{money(b.totalCents)}</span>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Link href={`/booking/${b.id}`}
                          className="h-8 rounded-full border border-[#dfd2c9] px-3 text-[10px] font-bold text-[#654c5f] inline-flex items-center transition hover:border-[#9d557e] hover:text-[#7f2e62]"
                          data-testid={`link-booking-detail-${b.id}`}>
                          View
                        </Link>
                        {isCompleted && (
                          <Link href={`/receipt/${b.id}`}
                            className="h-8 rounded-full border border-[#dfd2c9] px-3 text-[10px] font-bold text-[#654c5f] inline-flex items-center transition hover:border-[#9d557e] hover:text-[#7f2e62]"
                            data-testid={`link-receipt-${b.id}`}>
                            <FileText className="h-3 w-3" />
                          </Link>
                        )}
                        {isCompleted && !reviewed && (
                          <Link href={`/review/${b.id}`}
                            className="h-8 rounded-full bg-[#bf8750] px-3 text-[10px] font-bold text-white inline-flex items-center gap-1 transition hover:bg-[#a07030]"
                            data-testid={`link-review-${b.id}`}>
                            <Star className="h-3 w-3" />Review
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Spending by month mini-chart */}
        {!isLoading && !isError && (data ?? []).filter((b) => b.status === 'completed').length >= 2 && (() => {
          const MONTHS = Array.from({ length: 6 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - i));
            return {
              key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
              label: d.toLocaleString('en-US', { month: 'short' }),
            };
          });
          const byMonth = MONTHS.map(({ key, label }) => ({
            label,
            total: (data ?? [])
              .filter((b) => b.status === 'completed' && b.date.startsWith(key))
              .reduce((s, b) => s + b.totalCents, 0),
          }));
          const maxVal = Math.max(...byMonth.map((m) => m.total), 1);
          return (
            <div className="mt-6 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6" data-testid="spending-chart">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Monthly spending — last 6 months</p>
              <div className="mt-6 flex items-end gap-2" style={{ height: 80 }}>
                {byMonth.map(({ label, total }) => {
                  const pct = total === 0 ? 4 : Math.max(8, Math.round((total / maxVal) * 100));
                  return (
                    <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                      <div
                        className="w-full rounded-t-lg bg-[#d897b6] transition-all duration-700 hover:bg-[#c45b8f]"
                        style={{ height: `${pct}%` }}
                        title={total ? money(total) : 'No spending'}
                      />
                      <p className="font-mono text-[9px] uppercase text-[#9b858e]">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Book again CTA */}
        {!isLoading && (data ?? []).filter((b) => b.status === 'completed').length > 0 && (
          <div className="mt-6 flex items-center gap-4 rounded-[20px] bg-[#ead0dd] px-6 py-5">
            <HeartHandshake className="h-6 w-6 shrink-0 text-[#7f2e62]" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[#48213d]">Ready for another favor?</p>
              <p className="mt-0.5 text-xs text-[#725e69]">Browse companions and book your next thoughtful, platonic experience.</p>
            </div>
            <Link href="/explore" className="shrink-0 inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white" data-testid="link-bookings-explore">
              Explore <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Booking receipt page  /receipt/:bookingId
// ---------------------------------------------------------------------------

function BookingReceiptPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: b, isLoading, isError, refetch } = useBooking(id);

  if (isLoading) return (
    <Shell>
      <main className="mx-auto max-w-2xl px-5 py-20"><LoadingState label="Loading receipt…" /></main>
    </Shell>
  );
  if (isError || !b) return (
    <Shell>
      <main className="mx-auto max-w-2xl px-5 py-20">
        <ErrorState onRetry={() => refetch()} />
      </main>
    </Shell>
  );

  const isPaid = ['deposit_paid', 'authorized', 'confirmed', 'completed'].includes(b.status);
  const bookingDate = new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const issuedAt = b.confirmedAt
    ? new Date(b.confirmedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const RECEIPT_NUM = `OF-${b.id.slice(-8).toUpperCase()}`;

  return (
    <Shell>
      {/* Print styles */}
      <style>{`
        @media print {
          header, footer, nav, .no-print { display: none !important; }
          .receipt-card { box-shadow: none !important; border: 1px solid #ddd !important; }
          body { background: white !important; }
        }
      `}</style>

      <main className="page-enter mx-auto max-w-2xl px-5 py-10 pb-24 lg:py-16">
        {/* Back — hidden on print */}
        <div className="no-print mb-8 flex items-center justify-between">
          <Link href={`/booking/${id}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-receipt-back">
            <ArrowLeft className="h-4 w-4" />Back to booking
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-xs font-bold text-[#654c5f] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
            data-testid="button-print-receipt">
            <FileText className="h-3.5 w-3.5" />Print receipt
          </button>
        </div>

        {/* Receipt card */}
        <div className="receipt-card overflow-hidden rounded-[28px] border border-[#dfd2c9] bg-white shadow-[0_20px_50px_rgba(88,37,70,.08)]">

          {/* Header band */}
          <div className="bg-[#3d2038] px-8 py-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#7f2e62] text-[11px] font-bold text-[#fff5eb]">of</span>
                  <span className="font-serif text-base text-[#f9efe5]">OnlyFavors</span>
                </div>
                <p className="mt-3 font-mono text-[9px] uppercase tracking-[.25em] text-[#c695ae]">Booking receipt</p>
                <p className="mt-1 font-serif text-3xl text-[#f9efe5]">{b.activity}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d7e8e]">Receipt no.</p>
                <p className="mt-1 font-mono text-sm font-bold text-[#f9efe5]">{RECEIPT_NUM}</p>
                <p className="mt-3 font-mono text-[9px] text-[#9d7e8e]">Issued</p>
                <p className="mt-0.5 text-[11px] text-[#c695ae]">{issuedAt}</p>
              </div>
            </div>
          </div>

          {/* Status ribbon */}
          <div className={`flex items-center gap-3 px-8 py-3 ${isPaid ? 'bg-[#e8f0e8]' : 'bg-[#f3ead7]'}`}>
            <div className={`h-2 w-2 rounded-full ${isPaid ? 'bg-[#477254]' : 'bg-[#bf8750]'}`} />
            <p className={`font-mono text-[9px] font-bold uppercase tracking-[.2em] ${isPaid ? 'text-[#31533f]' : 'text-[#7a5a12]'}`}>
              {b.status === 'completed' ? 'Booking completed' : b.status === 'confirmed' ? 'Booking confirmed' : b.status === 'authorized' ? 'Payment authorized' : b.status === 'deposit_paid' ? 'Deposit paid' : 'Pending'}
            </p>
            <p className={`ml-auto text-[10px] ${isPaid ? 'text-[#53725d]' : 'text-[#906620]'}`}>
              {isPaid ? 'Payment recorded' : 'Awaiting payment'}
            </p>
          </div>

          {/* Main content */}
          <div className="px-8 py-8">
            {/* Booking details grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Date', value: bookingDate },
                { label: 'Start time', value: b.startTime },
                { label: 'Duration', value: `${b.durationHours} hour${b.durationHours > 1 ? 's' : ''}` },
                { label: 'Activity', value: b.activity },
                ...(b.companionName ? [{ label: 'Companion', value: b.companionName }] : []),
                ...(b.safeSpotId ? [{ label: 'Meeting venue', value: b.safeSpotId }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="rounded-[14px] bg-[#fbf7f1] px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9d557e]">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-[#48213d]">{value}</p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="my-6 border-t border-[#ece1d9]" />

            {/* Price breakdown */}
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Payment breakdown</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm text-[#654c5f]">
                <span>{b.durationHours}h × {money(b.subtotalCents / b.durationHours)} companion rate</span>
                <span className="font-semibold text-[#48213d]">{money(b.subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#654c5f]">
                <span>Safety &amp; service fee (5%)</span>
                <span className="text-[#9b858e]">+{money(b.customerFeeCents)}</span>
              </div>
              {b.depositCents > 0 && (
                <div className="flex items-center justify-between text-sm text-[#654c5f]">
                  <span>Refundable deposit (credited)</span>
                  <span className="text-[#9b858e]">−{money(b.depositCents)}</span>
                </div>
              )}
              <div className="my-3 border-t border-[#ece1d9]" />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[.15em] text-[#9d557e]">Total charged</span>
                <span className="font-serif text-3xl text-[#48213d]">{money(b.totalCents)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#9b858e]">
                <span>Companion receives (85%)</span>
                <span>{money(b.companionPayoutCents)}</span>
              </div>
            </div>

            {/* Payment timeline */}
            {(b.depositPaidAt || b.confirmedAt || b.authorizedAt) && (
              <>
                <div className="my-6 border-t border-[#ece1d9]" />
                <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Payment timeline</p>
                <div className="space-y-2">
                  {b.depositPaidAt && (
                    <div className="flex items-center gap-3">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#477254]" />
                      <span className="text-xs text-[#654c5f]">Deposit {money(b.depositCents)} received</span>
                      <span className="ml-auto text-[10px] text-[#9b858e]">{new Date(b.depositPaidAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {b.authorizedAt && (
                    <div className="flex items-center gap-3">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#477254]" />
                      <span className="text-xs text-[#654c5f]">Full payment authorized</span>
                      <span className="ml-auto text-[10px] text-[#9b858e]">{new Date(b.authorizedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {b.confirmedAt && (
                    <div className="flex items-center gap-3">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#477254]" />
                      <span className="text-xs text-[#654c5f]">Booking confirmed by companion</span>
                      <span className="ml-auto text-[10px] text-[#9b858e]">{new Date(b.confirmedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Divider */}
            <div className="my-6 border-t border-[#ece1d9]" />

            {/* Footer metadata */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-[11px] text-[#9b858e]">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.12em]">Booking ID</p>
                <p className="mt-0.5 font-mono">{b.id}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.12em]">Receipt</p>
                <p className="mt-0.5 font-mono">{RECEIPT_NUM}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.12em]">Platform</p>
                <p className="mt-0.5">OnlyFavors · onlyfavors.com</p>
              </div>
            </div>

            <p className="mt-5 flex items-center gap-1.5 text-[10px] leading-5 text-[#b0929f]">
              <LockKeyhole className="h-3 w-3 shrink-0" />
              Payments processed securely by Stripe. OnlyFavors never stores card details.
              The companion earns {money(b.companionPayoutCents)} (85%). The 15% platform fee supports trust &amp; safety operations.
            </p>
          </div>
        </div>

        {/* Action row — hidden on print */}
        <div className="no-print mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white"
            data-testid="button-receipt-print">
            <FileText className="h-4 w-4" />Print / Save PDF
          </button>
          <Link href={`/booking/${id}`}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-5 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
            data-testid="link-receipt-booking">
            Back to booking
          </Link>
          {b.status === 'completed' && (
            <Link href={`/review/${id}`}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] px-5 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]"
              data-testid="link-receipt-review">
              <Star className="h-4 w-4 text-[#bf8750]" />Leave a review
            </Link>
          )}
        </div>

        {/* What happens next — only shown for non-completed bookings */}
        {b.status !== 'completed' && b.status !== 'cancelled' && (
          <div className="no-print mt-8 rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-6">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">What happens next</p>
            <div className="mt-5 space-y-4">
              {[
                b.status === 'requested' && {
                  done: false,
                  label: 'Deposit unlocks chat',
                  body: 'Pay the $10 deposit to open a private chat thread with your companion.',
                },
                b.status === 'deposit_paid' && {
                  done: false,
                  label: 'Companion is reviewing',
                  body: 'Your companion typically responds within a few hours. You\'ll be notified immediately.',
                },
                (b.status === 'authorized' || b.status === 'confirmed') && {
                  done: b.status === 'confirmed',
                  label: b.status === 'confirmed' ? 'Booking is confirmed ✓' : 'Awaiting companion confirmation',
                  body: b.status === 'confirmed' ? 'You\'re all set. Full payment will be captured when you check in.' : 'Your companion will confirm your dates. You\'ll receive an email when they do.',
                },
              ].filter(Boolean).map((step) => step && (
                <div key={step.label} className="flex items-start gap-3">
                  <div className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${step.done ? 'bg-[#477254] text-white' : 'border border-[#c695ae] bg-transparent'}`}>
                    {step.done && <Check className="h-3 w-3" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#48213d]">{step.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#806c76]">{step.body}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 opacity-50">
                <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#c695ae]" />
                <div>
                  <p className="text-sm font-semibold text-[#48213d]">Check in at SafeSpot</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#806c76]">Record check-in in Favor Mode when you arrive. That stores a timestamp — it does not SMS Trust Circle.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#c695ae]" />
                <div>
                  <p className="text-sm font-semibold text-[#48213d]">Leave a review</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#806c76]">After the booking, share your experience — it helps other customers and supports great companions.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Dedicated review page  /review/:bookingId
// ---------------------------------------------------------------------------

function ReviewPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { data: booking, isLoading, isError } = useBooking(id);
  const existingReview = useQuery({
    queryKey: ['booking-review', id],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${id}/review`, { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json() as Promise<{ rating: number; comment: string | null }>;
    },
    enabled: Boolean(id),
    retry: false,
  });
  const alreadyReviewed = Boolean(existingReview.data);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<'rate' | 'kudos' | 'tip' | 'done'>(alreadyReviewed ? 'done' : 'rate');
  const submit = useSubmitReview(id);

  const companionFirstName = (booking?.companionName ?? 'your companion').split(' ')[0];

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;
    try {
      await submit.mutateAsync({ rating, comment });
      setPhase('kudos');
    } catch {
      // error shown inline
    }
  };

  if (isLoading) return (
    <Shell>
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <LoadingState label="Loading booking…" />
      </main>
    </Shell>
  );

  if (isError || !booking) return (
    <Shell>
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <p className="font-serif text-3xl text-[#48213d]">Booking not found.</p>
        <Link href="/dashboard/customer" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#7f2e62]">
          <ArrowLeft className="h-4 w-4" />Go to dashboard
        </Link>
      </main>
    </Shell>
  );

  if (booking.status !== 'completed') return (
    <Shell>
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <div className="rounded-[24px] bg-[#f3ead7] p-10">
          <Star className="mx-auto h-8 w-8 text-[#bf8750]" />
          <h1 className="mt-4 font-serif text-3xl text-[#48213d]">Not quite yet.</h1>
          <p className="mt-3 text-sm leading-6 text-[#725e69]">
            Reviews are available once your booking with <strong>{companionFirstName}</strong> is marked complete.
          </p>
          <Link href={`/booking/${id}`} className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-[#bf8750] px-5 text-sm font-bold text-white">
            View booking <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </Shell>
  );

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-xl px-5 py-10 pb-24 lg:py-16">

        {/* Back */}
        <Link href={`/booking/${id}`} className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-review-back">
          <ArrowLeft className="h-4 w-4" />Booking detail
        </Link>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] bg-[#ead0dd] font-serif text-2xl font-bold text-[#7f2e62]">
            {(booking.companionName ?? 'C').slice(0, 1)}
          </div>
          <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">
            {booking.activity} · {new Date(booking.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight text-[#48213d]">
            How was your time<br />with {companionFirstName}?
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#725e69]">
            Honest reviews help future customers choose with confidence — and help great companions grow.
          </p>
        </div>

        {/* Step indicator */}
        {phase !== 'done' && (
          <div className="mb-8 flex items-center justify-center gap-2">
            {(['rate', 'kudos', 'tip'] as const).map((p, i) => (
              <div key={p} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full transition-colors ${phase === p ? 'bg-[#7f2e62]' : ((['rate', 'kudos', 'tip'].indexOf(phase) > i) ? 'bg-[#c695ae]' : 'bg-[#e4d0db]')}`} />
                {i < 2 && <div className="h-px w-8 bg-[#e4d0db]" />}
              </div>
            ))}
          </div>
        )}

        {/* Phase: Rate */}
        {phase === 'rate' && (
          <form onSubmit={handleSubmitRating} className="rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Step 1 of 3 · Star rating</p>
            <h2 className="mt-3 font-serif text-3xl text-[#48213d]">Overall rating</h2>
            <div className="mt-6 flex justify-center">
              <StarInput value={rating} onChange={setRating} />
            </div>
            {rating > 0 && (
              <p className="mt-3 text-center font-mono text-[11px] font-bold text-[#9d557e]">{REVIEW_LABELS[rating]}</p>
            )}
            <div className="mt-6">
              <label className="block">
                <span className="mb-2 block text-xs font-bold text-[#654c5f]">
                  Written review <span className="font-normal text-[#9b858e]">(optional)</span>
                </span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  rows={4}
                  placeholder={`A few honest words about your time with ${companionFirstName}…`}
                  className="w-full resize-none rounded-xl border border-[#dfd2c9] bg-white p-4 text-sm leading-6 text-[#48213d] placeholder:text-[#b0929f] outline-none focus:border-[#9d557e]"
                  data-testid="textarea-review-page-comment"
                />
                <p className="mt-1 text-right text-[9px] text-[#9b858e]">{comment.length}/300</p>
              </label>
            </div>
            {submit.isError && (
              <p className="mt-3 rounded-xl bg-[#fbeaeb] p-3 text-xs text-[#86555a]">{submit.error.message}</p>
            )}
            <div className="mt-6 flex gap-3">
              <Button type="submit" disabled={rating === 0 || submit.isPending} className="flex-1" testId="button-review-page-submit">
                {submit.isPending ? 'Submitting…' : 'Submit review'} <ArrowRight className="h-4 w-4" />
              </Button>
              <button type="button" onClick={() => setPhase('kudos')}
                className="rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#9b858e] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
                data-testid="button-review-skip-rating">
                Skip
              </button>
            </div>
          </form>
        )}

        {/* Phase: Kudos */}
        {phase === 'kudos' && (
          <div className="rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Step 2 of 3 · Compliments</p>
            <h2 className="mt-3 font-serif text-3xl text-[#48213d]">Give {companionFirstName} kudos</h2>
            <p className="mt-2 text-sm leading-6 text-[#725e69]">Tap words that describe your experience. Kudos go directly to their profile.</p>
            <KudosCard companionName={booking.companionName ?? 'your companion'} bookingId={id} />
            <div className="mt-6 flex gap-3">
              <Button onClick={() => setPhase('tip')} className="flex-1" testId="button-review-page-next-tip">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
              <button type="button" onClick={() => setPhase('tip')}
                className="rounded-full border border-[#dfd2c9] px-4 text-xs font-bold text-[#9b858e] transition hover:border-[#7f2e62] hover:text-[#7f2e62]"
                data-testid="button-review-skip-kudos">
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Phase: Tip */}
        {phase === 'tip' && (
          <div className="rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Step 3 of 3 · Tip</p>
            <h2 className="mt-3 font-serif text-3xl text-[#48213d]">Add a tip?</h2>
            <p className="mt-2 text-sm leading-6 text-[#725e69]">100% goes directly to {companionFirstName}. Entirely optional — never expected.</p>
            <TipCompanionCard companionName={booking.companionName ?? 'your companion'} bookingId={id} />
            <div className="mt-6 flex gap-3">
              <Button onClick={() => setPhase('done')} className="flex-1" testId="button-review-page-finish">
                Done <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Phase: Done */}
        {phase === 'done' && (
          <div className="rounded-[24px] bg-[#3d2038] p-10 text-center text-[#f9efe5]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7f2e62]">
              <HeartHandshake className="h-8 w-8" />
            </div>
            <h1 className="font-serif text-4xl">Thank you.</h1>
            <p className="mt-3 text-sm leading-6 text-[#dbc3cf]">
              Your review of {companionFirstName} has been submitted.
              {alreadyReviewed ? ' You\'ve already reviewed this booking.' : ' It is on their public profile now.'}
            </p>
            <div className="mt-8 grid gap-3 text-left">
              {[
                { icon: Star, label: 'Rating', value: alreadyReviewed ? 'Already submitted' : REVIEW_LABELS[rating] || 'Submitted' },
                { icon: HeartHandshake, label: 'Kudos', value: 'Added to their profile' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 rounded-[14px] bg-[#2d1128] px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-[#c695ae]" />
                  <span className="text-xs text-[#c695ae]">{label}</span>
                  <span className="ml-auto text-xs font-semibold text-[#f9efe5]">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/explore"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-white"
                data-testid="link-review-done-explore">
                Find your next companion <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/dashboard/customer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#6a3d5c] px-6 text-sm font-bold text-[#dbc3cf] transition hover:bg-[#4a1e3c]"
                data-testid="link-review-done-dashboard">
                Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Privacy note */}
        {phase !== 'done' && (
          <p className="mt-6 text-center text-[11px] leading-5 text-[#9b858e]">
            Reviews are shown publicly on the companion's profile. Only your first name and booking activity are visible — never your full name or personal details.
          </p>
        )}
      </main>
    </Shell>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/compare" component={CompareCompanions} />
        <Route path="/companions/:id" component={Profile} />
        <Route path="/book" component={Book} />
        <Route path="/favor/:id" component={FavorMode} />
        <Route path="/favor" component={FavorMode} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/dashboard/customer"><Dashboard mode="customer" /></Route>
        <Route path="/dashboard/companion/inbox"><Dashboard mode="companion" /></Route>
        <Route path="/dashboard/companion"><Dashboard mode="companion" /></Route>
        <Route path="/companion/apply/status" component={ApplicationStatus} />
        <Route path="/companion/stats" component={CompanionStatsPage} />
        <Route path="/companion/onboarding" component={CompanionOnboarding} />
        <Route path="/companion/apply" component={Apply} />
        <Route path="/login" component={Login} />
        <Route path="/safety/share/:token" component={LocationShare} />
        <Route path="/safety/report" component={SafetyReportPage} />
        <Route path="/safety" component={Safety} />
        <Route path="/privacy"><Legal kind="privacy" /></Route>
        <Route path="/terms"><Legal kind="terms" /></Route>
        <Route path="/cancellation"><Legal kind="cancellation" /></Route>
        <Route path="/booking/:id" component={BookingStatus} />
        <Route path="/companion/booking/:id" component={CompanionBookingDetail} />
        <Route path="/dashboard/companion/profile" component={CompanionProfileEditor} />
        <Route path="/trust-circle" component={TrustCircleSetup} />
        <Route path="/safespots/register" component={SafeSpotRegister} />
        <Route path="/safespots" component={SafeSpots} />
        <Route path="/safespots/:id" component={SafeSpotDetail} />
        <Route path="/saved" component={Saved} />
        <Route path="/dashboard/customer/settings" component={CustomerSettings} />
        <Route path="/dashboard/companion/schedule" component={CompanionSchedule} />
        <Route path="/dashboard/companion/earnings" component={CompanionEarnings} />
        <Route path="/dashboard/companion/payout" component={CompanionPayoutPage} />
        <Route path="/dashboard/customer/bookings" component={CustomerBookingsPage} />
        <Route path="/messages" component={CustomerMessagesPage} />
        <Route path="/refer" component={Refer} />
        <Route path="/redeem" component={RedeemPage} />
        <Route path="/gift" component={GiftPage} />
        <Route path="/faq" component={FAQPage} />
        <Route path="/how-it-works" component={HowItWorks} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/cities/waitlist" component={CityWaitlistPage} />
        <Route path="/cities/:city" component={CityPage} />
        <Route path="/cities" component={CitiesIndex} />
        <Route path="/activities/:slug" component={ActivityDetail} />
        <Route path="/activities" component={ActivitiesDirectory} />
        <Route path="/stories" component={StoriesPage} />
        <Route path="/newsletter" component={NewsletterPage} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/press" component={PressPage} />
        <Route path="/careers" component={CareersPage} />
        <Route path="/accessibility" component={AccessibilityPage} />
        <Route path="/membership" component={MembershipPage} />
        <Route path="/about" component={About} />
        <Route path="/help" component={Help} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/operations" component={AdminOperations} />
        <Route path="/checkin" component={CheckIn} />
        <Route path="/review/:id" component={ReviewPage} />
        <Route path="/receipt/:id" component={BookingReceiptPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function AgeGate() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  if (user?.status === 'deactivated') {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-[#241A20]/70 px-5" role="dialog">
        <div className="w-full max-w-md rounded-[24px] bg-[#FFFDF9] p-8 text-[#241A20] shadow-2xl">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8F294C]">Account paused</p>
          <h2 className="mt-3 font-serif text-4xl">This account is deactivated.</h2>
          <p className="mt-4 text-sm leading-6 text-[#725e69]">You will not appear in search or be able to book until you reactivate.</p>
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch('/api/account/reactivate', { method: 'POST', credentials: 'include' });
              if (res.ok) await refresh();
            } finally { setBusy(false); }
          }}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#8F294C] text-sm font-bold text-white disabled:opacity-50"
            data-testid="button-reactivate">
            {busy ? 'Reactivating…' : 'Reactivate account'}
          </button>
        </div>
      </div>
    );
  }
  if (!user || user.ageConfirmed) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#241A20]/70 px-5" role="dialog" aria-labelledby="age-gate-title">
      <div className="w-full max-w-md rounded-[24px] bg-[#FFFDF9] p-8 text-[#241A20] shadow-2xl">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8F294C]">Adults only</p>
        <h2 id="age-gate-title" className="mt-3 font-serif text-4xl">Confirm you are 18 or older.</h2>
        <p className="mt-4 text-sm leading-6 text-[#725e69]">OnlyFavors is a platonic marketplace for adults. We do not allow minors, sexual services, or off-platform payments.</p>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await confirmAge(); await refresh(); } finally { setBusy(false); } }}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#8F294C] text-sm font-bold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'I am 18 or older'}
        </button>
      </div>
    </div>
  );
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AuthProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AgeGate /><Router /></WouterRouter><Toaster /></AuthProvider></TooltipProvider></QueryClientProvider>;
}

export default App;