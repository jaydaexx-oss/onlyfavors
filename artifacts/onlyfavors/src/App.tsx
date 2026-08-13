import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe, type Stripe as StripeType } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Bell, Building2, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleAlert, ClipboardCheck, Clock3, Coffee, Compass, EyeOff, FileText, Heart, HeartHandshake,
  KeyRound, Landmark, LifeBuoy, LockKeyhole, LogIn, Map, MapPin, Menu, MessageSquare,
  Navigation2, PanelLeft, Pencil, Plus, RefreshCw, Search, Send, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Star, Sunrise, UserPlus, Users, UsersRound, UtensilsCrossed, WalletCards, X, Zap, Lock,
} from 'lucide-react';
import SafeSpotMap from '@/components/safe-spot-map';
import FavorMode from '@/pages/favor-mode';
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
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className={cn('inline-flex items-center gap-2.5 group', dark ? 'text-[#f9efe5]' : 'text-[#48213d')} data-testid="link-brand">
    <span className={cn('grid h-9 w-9 place-items-center rounded-[13px] text-sm font-bold transition-transform group-hover:rotate-6', dark ? 'bg-[#c45b8f] text-[#281223]' : 'bg-[#7f2e62] text-[#fff5eb]')}>of</span>
    <span className="font-serif text-[25px] leading-none tracking-tight">OnlyFavors</span>
  </Link>;
}

function Header() {
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-40 border-b border-[#ddcfc6] bg-[#f8f1e9]/90 backdrop-blur-md">
    <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-5 lg:px-8">
      <Brand />
      <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
        <Link href="/explore" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-explore">Explore</Link>
        <Link href="/safety" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-safety">Safety</Link>
        <Link href="/safespots" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-safespots">SafeSpots</Link>
        <Link href="/companion/apply" className="text-[13px] font-semibold text-[#654c5f] transition-colors hover:text-[#7f2e62]" data-testid="link-apply">Become a companion</Link>
      </nav>
      <div className="hidden items-center gap-3 md:flex">
        <Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-[#654c5f] transition hover:bg-[#eee2d9]" data-testid="link-login"><LogIn className="h-4 w-4" />Sign in</Link>
        <Link href="/explore" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-[13px] font-bold text-[#fff5eb] shadow-[0_7px_18px_rgba(127,46,98,.18)] transition hover:-translate-y-0.5 hover:bg-[#65234e]" data-testid="link-find-companion">Find a companion <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="rounded-xl p-2 text-[#48213d] md:hidden" data-testid="button-mobile-menu" aria-label="Open menu">{open ? <X /> : <Menu />}</button>
    </div>
    {open && <div className="border-t border-[#ddcfc6] bg-[#f8f1e9] px-5 py-4 md:hidden">
      <div className="flex flex-col gap-1">
        <Link href="/explore" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-explore">Explore companions</Link>
        <Link href="/safety" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-safety">Safety center</Link>
        <Link href="/safespots" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-safespots">SafeSpot Network</Link>
        <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-[#eee2d9]" data-testid="mobile-link-login">Sign in</Link>
      </div>
    </div>}
  </header>;
}

function Footer() {
  return <footer className="border-t border-[#ddcfc6] bg-[#f0e4db]">
    <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
      <div><Brand /><p className="mt-4 max-w-xs text-sm leading-6 text-[#725e69]">Good company for the moments that matter. Built with privacy at the center.</p></div>
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#9a7d8c]">Discover</p><div className="space-y-2 text-sm text-[#654c5f]"><Link href="/explore" className="block hover:text-[#7f2e62]" data-testid="footer-link-explore">Explore</Link><Link href="/safety" className="block hover:text-[#7f2e62]" data-testid="footer-link-safety">Safety center</Link><Link href="/safespots" className="block hover:text-[#7f2e62]" data-testid="footer-link-safespots">SafeSpot Network</Link><Link href="/companion/apply" className="block hover:text-[#7f2e62]" data-testid="footer-link-apply">Apply to join</Link></div></div>
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#9a7d8c]">Policies</p><div className="space-y-2 text-sm text-[#654c5f]"><Link href="/privacy" className="block hover:text-[#7f2e62]" data-testid="footer-link-privacy">Privacy</Link><Link href="/terms" className="block hover:text-[#7f2e62]" data-testid="footer-link-terms">Terms & community</Link><Link href="/cancellation" className="block hover:text-[#7f2e62]" data-testid="footer-link-cancellation">Cancellations</Link></div></div>
      <div><p className="mb-3 font-mono text-[10px] uppercase tracking-[.18em] text-[#9a7d8c]">Need a hand?</p><div className="space-y-2 text-sm text-[#654c5f]"><p>Our trust team is here every day.</p><Link href="/login" className="inline-flex items-center gap-1 font-bold text-[#7f2e62]" data-testid="footer-link-support">Contact support <ArrowRight className="h-3.5 w-3.5" /></Link></div></div>
    </div>
    <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-[#ddcfc6] px-5 py-5 text-[11px] text-[#927e87] md:flex-row md:justify-between lg:px-8"><span>© 2025 OnlyFavors, Inc.</span><span>Private by design. Human by nature.</span></div>
  </footer>;
}

function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  return <div className="noise min-h-[100dvh] bg-[#f8f1e9]">{!bare && <Header />}{children}{!bare && <Footer />}</div>;
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

function HomeFeaturedCard({ id, initials, name, city, state, rating, reviewCount, rate, activities, tag }: {
  id: string; initials: string; name: string; city: string; state: string;
  rating: number; reviewCount: number; rate: number; activities: string[]; tag?: string;
}) {
  return (
    <Link href={`/companions/${id}`} className="group block rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition hover:-translate-y-1 hover:border-[#bc83a6] hover:shadow-[0_18px_34px_rgba(88,37,70,.09)]" data-testid={`home-companion-${id}`}>
      <div className="flex items-start justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ead0dd] font-serif text-xl text-[#7f2e62]">{initials}</div>
        {tag && <span className="rounded-full bg-[#e8f0e8] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-[#477254]">{tag}</span>}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="font-serif text-[26px] leading-none text-[#48213d]">{name}</h3>
        <BadgeCheck className="h-4 w-4 text-[#7f2e62]" />
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-[#806c76]"><MapPin className="h-3.5 w-3.5 text-[#9b6b88]" />{city}, {state}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <StarDisplay rating={Math.round(rating)} size="xs" />
        <span className="font-mono text-[10px] font-bold text-[#48213d]">{rating.toFixed(1)}</span>
        <span className="text-[10px] text-[#9b858e]">· {reviewCount} reviews</span>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {activities.slice(0, 3).map((a) => <span key={a} className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[10px] font-semibold text-[#72566a]">{a}</span>)}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-[#ece1d9] pt-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">${rate}/hr</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#7f2e62] group-hover:underline">View profile <ChevronRight className="h-3 w-3" /></span>
      </div>
    </Link>
  );
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

function Home() {
  const health = useHealthCheck();
  return (
    <Shell>
      <main className="page-enter">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-[#ddcfc6] bg-[#efe1dc]">
          <div className="absolute -right-36 -top-44 h-[560px] w-[560px] rounded-full border-[55px] border-[#d8afc4]/50" />
          <div className="absolute right-12 top-24 h-20 w-20 rounded-full bg-[#dd8caf]/30 blur-2xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 md:min-h-[650px] md:grid-cols-[1.02fr_.98fr] md:py-24 lg:px-8">
            <div className="relative z-10 max-w-xl">
              <p className="mb-5 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#8e4b75]"><span className="h-2 w-2 rounded-full bg-[#a75c87]" />A more human kind of marketplace</p>
              <h1 className="font-serif text-[62px] leading-[.9] tracking-[-.04em] text-[#48213d] md:text-[88px]">Good company,<br /><em className="text-[#8e416e]">on your terms.</em></h1>
              <p className="mt-7 max-w-md text-[17px] leading-7 text-[#654c5f]">Book thoughtful, verified companions for the things you would rather not do alone. Dinner, a museum, a long walk — always platonic, always clear.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/explore" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#7f2e62] px-6 text-sm font-bold text-[#fff5eb] shadow-[0_10px_24px_rgba(127,46,98,.2)] transition hover:-translate-y-0.5 hover:bg-[#65234e]" data-testid="link-hero-explore">Find your kind of company <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/safety" className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-bold text-[#654c5f] transition hover:bg-[#e6d4d2]" data-testid="link-hero-safety"><ShieldCheck className="h-4 w-4" />See how safety works</Link>
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs text-[#856c79]"><LockKeyhole className="h-3.5 w-3.5" />Your exact location is never shared publicly.</p>
            </div>
            <div className="relative mx-auto h-[390px] w-full max-w-[450px] md:h-[480px]">
              <div className="absolute left-5 top-12 h-[310px] w-[275px] rotate-[-7deg] rounded-[28px] bg-[#d2a9bb] shadow-[0_24px_50px_rgba(85,38,71,.13)] md:h-[370px] md:w-[330px]" />
              <div className="absolute bottom-5 right-3 h-[265px] w-[255px] rotate-[8deg] rounded-[28px] bg-[#b7c4b3] shadow-[0_24px_50px_rgba(49,74,57,.13)] md:h-[310px] md:w-[290px]" />
              <div className="float-slow absolute left-14 top-1 z-10 w-[290px] rounded-[25px] border border-[#f4e4dc] bg-[#fbf4ed] p-5 shadow-[0_25px_55px_rgba(66,29,56,.18)] md:left-20 md:w-[330px]">
                <div className="flex items-center justify-between"><span className="rounded-full bg-[#e9d0df] px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-[#7f2e62]">Verified companion</span><HeartHandshake className="h-5 w-5 text-[#7f2e62]" /></div>
                <div className="mt-7 flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-full bg-[#e1b1bd] font-serif text-2xl text-[#7f2e62]">M</div><div><p className="font-serif text-2xl text-[#48213d]">Maya</p><p className="flex items-center gap-1 text-xs text-[#806b76]"><MapPin className="h-3 w-3" />San Francisco, CA</p></div></div>
                <div className="mt-3 flex items-center gap-1"><StarDisplay rating={5} size="xs" /><span className="ml-1 font-mono text-[10px] font-bold text-[#48213d]">4.9</span><span className="text-[10px] text-[#9b858e]">· 3 reviews</span></div>
                <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-[#f0e4db] px-3 py-1.5 text-xs text-[#654c5f]">Museum visits</span><span className="rounded-full bg-[#f0e4db] px-3 py-1.5 text-xs text-[#654c5f]">Coffee</span><span className="rounded-full bg-[#f0e4db] px-3 py-1.5 text-xs text-[#654c5f]">Gallery tours</span></div>
                <div className="mt-6 flex items-center justify-between border-t border-[#e8dcd5] pt-4"><span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">$65 / hour</span><span className="flex items-center gap-1 text-xs font-bold text-[#7f2e62]">View profile <ChevronRight className="h-3.5 w-3.5" /></span></div>
              </div>
              <div className="absolute bottom-7 left-0 z-20 flex items-center gap-2 rounded-full border border-[#f4e4dc] bg-[#fbf4ed] px-4 py-3 shadow-lg"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#cad8cb] text-[#376448]"><Check className="h-4 w-4" /></span><span className="text-xs font-semibold text-[#543d50]">Safety plan included</span></div>
            </div>
          </div>
        </section>

        {/* ── The difference ── */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <SectionIntro eyebrow="The OnlyFavors difference" title="Connection without the guesswork." body="A considered way to find company — not a feed to scroll, a profile to perform, or a stranger to decode." />
          <div className="grid gap-4 md:grid-cols-[1.15fr_.85fr]">
            <div className="min-h-[270px] rounded-[24px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-10"><div className="flex items-start justify-between"><Shield className="h-7 w-7 text-[#d897b6]" /><span className="font-mono text-[10px] uppercase tracking-widest text-[#c695ae]">01 / Private by default</span></div><h3 className="mt-16 max-w-md font-serif text-4xl leading-none">Approximate areas.<br />No public addresses.</h3><p className="mt-4 max-w-sm text-sm leading-6 text-[#d9c4cf]">We reveal only what helps you choose. Exact meeting details stay between you, your companion, and our trust team.</p></div>
            <div className="min-h-[270px] rounded-[24px] bg-[#d9e1d7] p-8 text-[#31533f] md:p-10"><div className="flex items-start justify-between"><BadgeCheck className="h-7 w-7 text-[#477254]" /><span className="font-mono text-[10px] uppercase tracking-widest text-[#63816a]">02 / Carefully verified</span></div><h3 className="mt-16 max-w-md font-serif text-4xl leading-none">Real people.<br />Clear boundaries.</h3><p className="mt-4 max-w-sm text-sm leading-6 text-[#53725d]">Every approved companion shares their way of working, the activities they enjoy, and what stays out of bounds.</p></div>
          </div>
        </section>

        {/* ── Featured companions ── */}
        <section className="border-t border-[#ddcfc6] bg-[#f8f2eb] py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionIntro eyebrow="Meet a few" title={"Good company,\ncloser than you think."} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <HomeFeaturedCard id="companion-maya" initials="MR" name="Maya R." city="San Francisco" state="CA" rating={4.9} reviewCount={3} rate={65} activities={["Museum visits", "Coffee conversations", "Gallery tours"]} tag="Most popular" />
              <HomeFeaturedCard id="companion-jordan" initials="JK" name="Jordan K." city="New York" state="NY" rating={4.8} reviewCount={12} rate={75} activities={["Gallery tours", "Cooking classes", "Evening walks"]} />
              <Link href="/explore" className="group flex flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#c6aeb8] bg-transparent p-8 text-center transition hover:border-[#9d557e] hover:bg-[#f0e4db]" data-testid="link-home-explore-all">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ead0dd] text-[#7f2e62]"><Compass className="h-5 w-5" /></div>
                <p className="font-serif text-2xl text-[#48213d]">Browse all companions</p>
                <p className="text-xs text-[#806c76]">Filter by city, activity, language, and more.</p>
                <span className="mt-2 flex items-center gap-1 text-xs font-bold text-[#7f2e62]">Explore <ArrowRight className="h-3.5 w-3.5" /></span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── SafeSpot Network ── */}
        <section className="border-y border-[#ddcfc6] bg-[#3d2038]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 md:grid-cols-[1fr_1fr] lg:px-8">
            <div>
              <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]"><ShieldCheck className="h-4 w-4" />Safety network</p>
              <h2 className="font-serif text-5xl leading-[.93] text-[#f9efe5]">Every favor starts<br /><em>at a SafeSpot.</em></h2>
              <p className="mt-6 max-w-sm text-[15px] leading-7 text-[#d9c4cf]">Verified public venues in every city — staff-aware, well-lit, and easy to leave. We never share exact addresses publicly.</p>
              <div className="mt-6 flex items-center gap-6">
                <div><p className="font-serif text-4xl text-[#f9efe5]">6+</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">Verified venues</p></div>
                <div className="h-10 w-px bg-[#5e3458]" />
                <div><p className="font-serif text-4xl text-[#f9efe5]">6</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">Cities</p></div>
                <div className="h-10 w-px bg-[#5e3458]" />
                <div><p className="font-serif text-4xl text-[#f9efe5]">∞</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">QR check-ins</p></div>
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
                  <p className="mt-1 text-[10px] text-[#c695ae]">Staff-aware · Easy exit</p>
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
              <Step n="02" icon={ClipboardCheck} title="Set boundaries together" body="Boundary receipts confirm what the favor includes before anything is booked." />
              <Step n="03" icon={MessageSquare} title="Chat once the deposit clears" body="A private, masked thread opens — phone numbers and emails are blocked automatically." />
              <Step n="04" icon={MapPin} title="Meet at a SafeSpot" body="Choose a verified public venue and keep the plan visible to your Trust Circle." />
            </div>
          </div>
        </section>

        {/* ── Trust pillars ── */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <SectionIntro eyebrow="Built-in safety" title="Four layers that protect every favor." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <HomeTrustPillar icon={ShieldCheck} title="SafeSpot Network" body="Every booking starts at a verified public venue — no private addresses, ever." accent="bg-[#e8f0e8] text-[#477254]" />
            <HomeTrustPillar icon={ClipboardCheck} title="Boundary Receipt" body="Both sides agree in writing before any booking is confirmed." accent="bg-[#ead0dd] text-[#7f2e62]" />
            <HomeTrustPillar icon={Users} title="Trust Circle" body="Share your plan with up to 5 emergency contacts before you go." accent="bg-[#f3ead7] text-[#7a5a12]" />
            <HomeTrustPillar icon={Star} title="Verified Reviews" body="Honest ratings from real bookings, written by the customers who were there." accent="bg-[#fdf3e3] text-[#bf8750]" />
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

        {/* ── Footer bar ── */}
        <div className="border-t border-[#ddcfc6] bg-[#3d2038] px-5 py-5 text-center text-xs text-[#ddc4d0]">
          <span className="inline-flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" />OnlyFavors is for platonic connection. We do not facilitate dating or sexual services.</span>
          <span className="ml-4 inline-flex items-center gap-1.5 text-[#c695ae]" data-testid="status-health"><span className="h-1.5 w-1.5 rounded-full bg-[#8fc69a]" />{health.data?.status === 'ok' ? 'Systems online' : 'Privacy systems ready'}</span>
        </div>

      </main>
    </Shell>
  );
}

function Step({ n, icon: Icon, title, body }: { n: string; icon: typeof Compass; title: string; body: string }) {
  return <div className="group flex items-center gap-4 rounded-2xl border border-[#dfd2c9] bg-[#f8f1e9] p-4 transition hover:-translate-y-0.5 hover:border-[#c89bb5]"><span className="font-mono text-[10px] text-[#a47e8f]">{n}</span><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]"><Icon className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-[#543d50]">{title}</h3><p className="mt-0.5 text-xs leading-5 text-[#806c76]">{body}</p></div><ChevronRight className="ml-auto h-4 w-4 text-[#b0929f] transition group-hover:translate-x-1" /></div>;
}

function CompanionCard({ companion, saved = false, onSave }: { companion: Companion; saved?: boolean; onSave?: (id: string) => void }) {
  return (
    <Link href={`/companions/${companion.id}`} className="group relative block rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-5 transition duration-300 hover:-translate-y-1 hover:border-[#bc83a6] hover:shadow-[0_18px_34px_rgba(88,37,70,.09)]" data-testid={`card-companion-${companion.id}`}>
      {/* Avatar + save */}
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
      {/* Name */}
      <div className="mt-4 flex items-center gap-2">
        <h3 className="font-serif text-[26px] leading-none text-[#48213d]">{companion.displayName}</h3>
        {companion.verified && <BadgeCheck className="h-4 w-4 text-[#7f2e62]" />}
      </div>
      {/* Location */}
      <p className="mt-1.5 flex items-center gap-1 text-xs text-[#806c76]">
        <MapPin className="h-3.5 w-3.5 text-[#9b6b88]" />{companion.serviceArea}, {companion.city}
      </p>
      {/* Availability + response time */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(companion as any).availableNow && (
          <span className="flex items-center gap-1 rounded-full bg-[#e8f5ef] px-2.5 py-1 text-[10px] font-bold text-[#267a5a]">
            <Zap className="h-3 w-3" />Available tonight
          </span>
        )}
        <span className="text-[10px] text-[#9b858e]">Replies {companion.responseTime}</span>
      </div>
      {/* Bio */}
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#725e69]">{companion.biography || 'A thoughtful companion for time well spent.'}</p>
      {/* Activities */}
      <div className="mt-4 flex min-h-[28px] flex-wrap gap-1.5">
        {companion.activities.slice(0, 3).map((a) => <span key={a} className="rounded-full bg-[#f0e4db] px-2.5 py-1 text-[10px] font-semibold text-[#72566a]">{a}</span>)}
      </div>
      {/* Pricing */}
      <div className="mt-5 flex items-center justify-between border-t border-[#ece1d9] pt-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">{money(companion.hourlyRate * 100)}/hr</span>
          <span className="ml-2 text-[10px] text-[#b0929f]">· {money(companion.hourlyRate * 7 * 100)}/day</span>
        </div>
        {companion.instantBook && <span className="flex items-center gap-1 text-[10px] font-bold text-[#477254]"><Check className="h-3 w-3" />Instant book</span>}
      </div>
    </Link>
  );
}

function Explore() {
  // Filters
  const [city, setCity] = useState('');
  const [activity, setActivity] = useState('');
  const [language, setLanguage] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [instant, setInstant] = useState(false);
  const [availNow, setAvailNow] = useState(false);
  const [timeWindow, setTimeWindow] = useState<'now' | 'tonight' | 'weekend' | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('of_saved_companions') ?? '[]')); }
    catch { return new Set(); }
  });
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [filters, setFilters] = useState(false);

  // View: list or map
  const [view, setView] = useState<'list' | 'map'>('list');

  // Near Me: geolocation
  const [nearMe, setNearMe] = useState(false);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const detectedCity = nearMe && city ? city : nearMe ? 'your area' : null;

  const handleNearMe = useCallback(() => {
    if (nearMe) { setNearMe(false); setUserCoords(null); setLocError(null); return; }
    if (!navigator.geolocation) { setLocError('Your browser does not support location.'); return; }
    setLocLoading(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords([pos.coords.latitude, pos.coords.longitude]);
        setNearMe(true); setLocLoading(false); setView('map');
      },
      () => { setLocError('Location access denied.'); setLocLoading(false); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [nearMe]);

  const handleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setSaveToast(id);
        setTimeout(() => setSaveToast((t) => (t === id ? null : t)), 3500);
      }
      try { localStorage.setItem('of_saved_companions', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const params = useMemo(() => ({
    ...(city ? { city } : {}),
    ...(activity ? { activity } : {}),
    ...(language ? { language } : {}),
    ...(maxRate ? { maxRate: Number(maxRate) } : {}),
    ...(instant ? { instantBook: true } : {}),
  }), [city, activity, language, maxRate, instant]);

  const query = useListCompanions(params, { query: { queryKey: getListCompanionsQueryKey(params) } });
  const spotsQuery = useListSafeSpots(city ? { city } : undefined, {
    query: { queryKey: getListSafeSpotsQueryKey(city ? { city } : undefined) },
  });

  const companions = query.data ?? [];
  const safeSpots = spotsQuery.data ?? [];

  const shownCompanions = (availNow || timeWindow)
    ? companions.filter((c) => (c as any).availableNow)
    : companions;

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">

        {/* Header row */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">The directory</p>
            <h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d] md:text-6xl">
              Find your kind<br /><em>of company.</em>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#725e69]">
              Browse approved companions by approximate area. Take your time — there is no public popularity contest here.
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
                    onClick={() => { setTimeWindow(timeWindow === key ? null : key); setCustomDate(''); }}
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
                placeholder={nearMe ? `Near ${detectedCity ?? 'you'}` : 'City or region'}
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[#a38c95]"
                data-testid="input-city" />
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
              <select value={maxRate} onChange={(e) => setMaxRate(e.target.value)}
                className="h-10 rounded-xl border border-[#dfd2c9] bg-[#fffaf4] px-3 text-sm text-[#654c5f] outline-none"
                data-testid="select-max-rate">
                <option value="">Any hourly rate</option>
                <option value="30">Up to $30/hour</option>
                <option value="50">Up to $50/hour</option>
                <option value="80">Up to $80/hour</option>
              </select>
              <label className="flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[#654c5f]">
                <input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)}
                  className="accent-[#7f2e62]" data-testid="checkbox-instant-book" /> Instant book only
              </label>
            </div>
          )}
        </div>

        {/* Results header */}
        <div className="mt-8 flex items-center justify-between border-b border-[#dfd2c9] pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9b858e]">
            {query.isLoading ? 'Searching…'
              : view === 'map' ? `${safeSpots.length} SafeSpots · ${shownCompanions.length} companions`
              : `${shownCompanions.length} approved companions`}
          </p>
          {(city || activity || language || maxRate || instant || nearMe || availNow || timeWindow || customDate) && (
            <button type="button"
              onClick={() => { setCity(''); setActivity(''); setLanguage(''); setMaxRate(''); setInstant(false); setNearMe(false); setAvailNow(false); setUserCoords(null); setTimeWindow(null); setCustomDate(''); }}
              className="text-xs font-bold text-[#7f2e62]" data-testid="button-clear-filters">
              Clear all
            </button>
          )}
        </div>

        {/* Map view */}
        {view === 'map' && (
          <div className="mt-7">
            {/* Available now rail */}
            {shownCompanions.filter((c) => (c as any).availableNow).length > 0 && (
              <div className="mb-5">
                <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e] flex items-center gap-2">
                  <Zap className="h-3 w-3" />Available this evening
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {shownCompanions.filter((c) => (c as any).availableNow).map((c) => (
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
              defaultCity={city || 'honolulu'}
              height="560px"
            />
            <div className="mt-4 flex items-start gap-2 rounded-[16px] bg-[#f0e4db] p-4 text-xs leading-5 text-[#725e69]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />
              Companions appear as service-area circles — never as live pins. SafeSpot venues are exact.
              Your location is used only to center the map and is never shared or stored.
            </div>
          </div>
        )}

        {/* List view */}
        {view === 'list' && (
          <div className="mt-7">
            {query.isLoading
              ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><LoadingState /><LoadingState /><LoadingState /></div>
              : query.isError
              ? <ErrorState onRetry={() => query.refetch()} />
              : shownCompanions.length === 0
              ? <EmptyState icon={UsersRound} title="A quiet directory, for now."
                  body={availNow
                    ? 'No one has flagged availability tonight yet. Try removing the "Available now" filter.'
                    : 'We do not fill this space with invented profiles. Try another area or check back as new companions are approved.'}
                  action={<Button variant="outline" onClick={() => { setCity(''); setActivity(''); setAvailNow(false); }} testId="button-browse-all">Browse all areas</Button>} />
              : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {shownCompanions.map((companion) => (
                    <CompanionCard key={companion.id} companion={companion} saved={savedIds.has(companion.id)} onSave={handleSave} />
                  ))}
                </div>
            }
          </div>
        )}
      </main>

      {/* Save toast */}
      {saveToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#3d2038] px-5 py-3 text-xs font-semibold text-[#f9efe5] shadow-xl">
          Saved ·{' '}
          <Link href="/login" className="pointer-events-auto underline text-[#d897b6]">Sign in</Link>{' '}
          to keep your list across devices
        </div>
      )}
    </Shell>
  );
}

function Profile() {
  const { id = '' } = useParams<{ id: string }>();
  const query = useGetCompanion(id, { query: { queryKey: getGetCompanionQueryKey(id), enabled: Boolean(id) } });
  if (query.isLoading) return <Shell><main className="mx-auto max-w-6xl px-5 py-16"><LoadingState /></main></Shell>;
  if (query.isError || !query.data) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => query.refetch()} /></main></Shell>;
  const c = query.data;
  return <Shell><main className="page-enter mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-16"><Link href="/explore" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-back-explore"><ArrowLeft className="h-4 w-4" />Back to explore</Link><div className="grid gap-10 lg:grid-cols-[1fr_340px]"><div><div className="flex flex-wrap items-center gap-5"><Avatar companion={c} large /><div><div className="flex items-center gap-2"><h1 className="font-serif text-5xl leading-none text-[#48213d]">{c.displayName}</h1>{c.verified && <BadgeCheck className="h-5 w-5 text-[#7f2e62]" />}</div><p className="mt-2 flex items-center gap-1.5 text-sm text-[#806c76]"><MapPin className="h-4 w-4 text-[#9b6b88]" />{c.serviceArea}, {c.city}</p><p className="mt-2 flex items-center gap-2 text-xs text-[#806c76]"><Star className="h-3.5 w-3.5 fill-[#bf8750] text-[#bf8750]" />{c.rating > 0 ? `${c.rating.toFixed(1)} from ${c.reviewCount} reviews` : 'New to OnlyFavors'}<span className="text-[#c6aeb8]">·</span><Clock3 className="h-3.5 w-3.5" />Replies {c.responseTime}</p></div></div><div className="mt-12 border-t border-[#dfd2c9] pt-8"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">A little about {c.displayName}</p><p className="mt-4 max-w-2xl whitespace-pre-line text-[16px] leading-8 text-[#654c5f]">{c.biography || 'This companion has not added a biography yet.'}</p></div><div className="mt-10 grid gap-8 border-t border-[#dfd2c9] pt-8 sm:grid-cols-2"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">They enjoy</p><div className="mt-4 flex flex-wrap gap-2">{c.activities.length ? c.activities.map((x) => <span key={x} className="rounded-full bg-[#ead0dd] px-3 py-2 text-xs font-semibold text-[#7f2e62]">{x}</span>) : <p className="text-sm text-[#806c76]">No activities listed yet.</p>}</div><p className="mt-7 font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Languages</p><p className="mt-3 text-sm text-[#654c5f]">{c.languages.length ? c.languages.join(' · ') : 'Not listed'}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Clear boundaries</p><ul className="mt-4 space-y-3">{(c.boundaries?.length ? c.boundaries : ['Platonic connection only', 'Public meeting places only', 'Mutual respect at every step']).map((x) => <li key={x} className="flex items-start gap-2 text-sm leading-5 text-[#654c5f]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />{x}</li>)}</ul></div></div><CompanionReviews companionId={c.id} /></div><aside className="h-fit rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-6 shadow-[0_15px_35px_rgba(88,37,70,.07)] lg:sticky lg:top-28"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-wider text-[#9b858e]">Starting at</span><span className="font-serif text-3xl text-[#48213d]">{money(c.hourlyRate * 100)}<small className="font-sans text-xs text-[#806c76]"> / hr</small></span></div><div className="my-6 space-y-3 border-y border-[#e9ddd6] py-5 text-sm text-[#654c5f]"><p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#477254]" />Identity verified by OnlyFavors</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#477254]" />SafeSpot meeting options</p><p className="flex items-center gap-2"><EyeOff className="h-4 w-4 text-[#477254]" />Approximate area only</p></div><Link href={`/book?companion=${c.id}`} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-[#fff5eb] transition hover:bg-[#65234e]" data-testid="link-book-companion">Plan time with {c.displayName.split(' ')[0]} <ArrowRight className="h-4 w-4" /></Link><p className="mt-4 text-center text-[11px] leading-5 text-[#9b858e]">You will choose an activity, date, and public SafeSpot next.</p></aside></div></main></Shell>;
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
          {busy ? 'Processing…' : `Pay ${money(amountCents)} · ${label}`}
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
};

function useCompanionBookings() {
  return useQuery<BookingDetail[]>({
    queryKey: ['companion-bookings'],
    queryFn: async () => {
      const res = await fetch('/api/companion/bookings');
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json() as Promise<BookingDetail[]>;
    },
    refetchInterval: 30_000,
  });
}

function useAcceptBooking() {
  const qc = useQueryClient();
  return useMutation<BookingDetail, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/bookings/${id}/accept`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to accept');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companion-bookings'] }),
  });
}

function useDeclineBooking() {
  const qc = useQueryClient();
  return useMutation<BookingDetail, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/bookings/${id}/decline`, { method: 'POST' });
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

  const active = (data ?? []).filter((b) => !['completed', 'cancelled'].includes(b.status));
  const past   = (data ?? []).filter((b) =>  ['completed', 'cancelled'].includes(b.status)).slice(0, 3);

  const handleAction = (id: string, action: 'accept' | 'decline') => {
    if (action === 'accept') {
      accept.mutate(id, { onSuccess: () => setConfirming(null) });
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
                  <div className="mt-4 flex flex-wrap gap-2">
                    {s.canAccept && (
                      confirming?.id === b.id && confirming.action === 'accept' ? (
                        <button type="button" disabled={isActing} onClick={() => handleAction(b.id, 'accept')}
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-[#477254] px-4 text-xs font-bold text-white disabled:opacity-60"
                          data-testid={`button-confirm-accept-${b.id}`}>
                          {isActing ? 'Confirming…' : 'Tap again to confirm'} <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => setConfirming({ id: b.id, action: 'accept' })}
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-[#e8f0e8] px-4 text-xs font-bold text-[#31533f] hover:bg-[#477254] hover:text-white transition"
                          data-testid={`button-accept-${b.id}`}>
                          <Check className="h-3.5 w-3.5" />Accept booking
                        </button>
                      )
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
                    {confirming?.id === b.id && (
                      <button type="button" onClick={() => setConfirming(null)}
                        className="text-xs text-[#9b858e] hover:text-[#48213d]">
                        Cancel
                      </button>
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
                <p className="mt-3 font-mono text-[9px] text-[#b0929f]">BOOKING {b.id.slice(-8).toUpperCase()}</p>
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

type TrustContact = { id: string; name: string; phone: string; relation: string };

function useTrustCircle() {
  const [contacts, setContacts] = useState<TrustContact[]>(() => {
    try { return JSON.parse(localStorage.getItem('of_trust_circle') ?? '[]'); }
    catch { return []; }
  });
  const add = useCallback((c: Omit<TrustContact, 'id'>) => {
    setContacts((prev) => {
      const next = [...prev, { ...c, id: crypto.randomUUID() }].slice(0, 3);
      try { localStorage.setItem('of_trust_circle', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    setContacts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try { localStorage.setItem('of_trust_circle', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return { contacts, add, remove };
}

/** Inline panel shown on the booking confirmation screen. */
function TrustCircleBookingPanel() {
  const [contacts] = useState<TrustContact[]>(() => {
    try { return JSON.parse(localStorage.getItem('of_trust_circle') ?? '[]'); }
    catch { return []; }
  });
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
          Your Trust Circle is notified when the favor starts. Add at least one contact for a safer booking.
        </p>
      )}
    </div>
  );
}

function TrustCircleSetup() {
  const { contacts, add, remove } = useTrustCircle();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('Friend');
  const [addedName, setAddedName] = useState<string | null>(null);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || contacts.length >= 3) return;
    add({ name: name.trim(), phone: phone.trim(), relation });
    setAddedName(name.trim());
    setName(''); setPhone(''); setRelation('Friend');
    setTimeout(() => setAddedName(null), 3500);
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
          Add up to 3 people who care about you. They get a quiet notification when your favor begins and an alert if you miss a check-in. No booking details are ever shared with them.
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
                  <p className="text-xs text-[#806c76]">{c.relation} · {c.phone}</p>
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
                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (808) 555-0123"
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-white px-4 text-sm outline-none focus:border-[#7f2e62]"
                  data-testid="input-trust-phone" />
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
            { icon: Bell, label: 'Favor starts', desc: 'A quiet text goes out — no companion name, route, or booking details shared' },
            { icon: Clock3, label: 'Hourly check-in', desc: 'You tap "I\'m safe" and they see your status update without location data' },
            { icon: AlertTriangle, label: 'Missed check-in', desc: 'An alert fires automatically if you don\'t respond within the agreed window' },
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
  const boundaries = companion.boundaries?.length ? companion.boundaries : DEFAULT_BOUNDARIES;
  const firstName = companion.displayName.split(' ')[0];
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
          Read the agreements below. By signing, you confirm you understand how this time works and that you will respect every boundary.
          A timestamped receipt is attached to your booking and visible to both parties.
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
            <p className="mt-1.5 font-semibold text-[#48213d]">{booking.date} · {booking.startTime}</p>
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
            {boundaries.map((b, i) => (
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
              'Companion\'s location is approximate — never a precise address',
              'Payment is held until companion confirms SafeSpot check-in',
              'Trust Circle contacts notified when the favor begins',
              'Either party can reach the OnlyFavors safety team at any time',
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
          <button type="button" disabled={!agreed}
            onClick={() => onAgree(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#7f2e62] text-sm font-bold text-white transition hover:bg-[#65234e] disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-boundary-continue">
            Sign receipt and continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 text-center font-mono text-[10px] text-[#a38c95]">
          RECEIPT FOR BOOKING {booking.id.slice(-8).toUpperCase()} · PENDING SIGNATURE
        </p>
      </main>
    </Shell>
  );
}

function Book() {
  const search = new URLSearchParams(window.location.search); const companionId = search.get('companion') || '';
  const [, navigate] = useLocation();
  const companionQuery = useGetCompanion(companionId, { query: { queryKey: getGetCompanionQueryKey(companionId), enabled: Boolean(companionId) } });
  const companion = companionQuery.data;
  const spotsQuery = useListSafeSpots(companion?.city ? { city: companion.city } : undefined, { query: { queryKey: getListSafeSpotsQueryKey(companion?.city ? { city: companion.city } : undefined), enabled: Boolean(companion?.city) } });
  const [activity, setActivity] = useState(''); const [date, setDate] = useState(''); const [time, setTime] = useState(''); const [duration, setDuration] = useState('2'); const [spot, setSpot] = useState(''); const [created, setCreated] = useState<Booking | null>(null);
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
  const openDeposit = () => { if (!created) return; depositMutation.mutate({ id: created.id }, { onSuccess: (r) => { setCheckoutLabel('$10 refundable deposit'); setCheckoutAmount(1000); setCheckoutSecret(r.clientSecret); } }); };
  const openFullPayment = () => { if (!created) return; authorizeMutation.mutate({ id: created.id }, { onSuccess: (r) => { setCheckoutLabel('Full payment'); setCheckoutAmount(created.totalCents); setCheckoutSecret(r.clientSecret); } }); };
  if (companionQuery.isLoading) return <Shell><main className="mx-auto max-w-5xl px-5 py-16"><LoadingState label="Opening booking details" /></main></Shell>;
  if (!companionId || companionQuery.isError || !companion) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><EmptyState icon={CalendarDays} title="Start with a companion." body="Choose an approved companion first, then come back here to plan your time together." action={<Link href="/explore" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-[#fff5eb]" data-testid="link-book-explore">Explore companions <ArrowRight className="h-4 w-4" /></Link>} /></main></Shell>;
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
                <p className="text-sm font-bold text-white">Pay {money(created.totalCents)} · Confirm now</p>
                <p className="mt-0.5 text-xs text-white/60">Skip chat and go straight to a confirmed booking.</p>
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
  return <Shell><main className="page-enter mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-16"><Link href={`/companions/${companion.id}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="link-back-profile"><ArrowLeft className="h-4 w-4" />Back to profile</Link><div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">A thoughtful plan</p><h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">Book time with<br /><em>{companion.displayName}.</em></h1><p className="mt-4 max-w-lg text-sm leading-6 text-[#725e69]">Tell us the shape of your time together. We will confirm the price and keep the details clear for everyone.</p><form onSubmit={submit} className="mt-10 space-y-5" data-testid="form-booking"><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">What would you like to do?</span><select required value={activity} onChange={(e) => setActivity(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-booking-activity"><option value="">Choose an activity</option>{companion.activities.map((x) => <option key={x} value={x}>{x}</option>)}</select></label><div className="grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Date</span><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-booking-date" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Start time</span><input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-booking-time" /></label></div><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">How long?</span><select required value={duration} onChange={(e) => setDuration(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-booking-duration"><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option></select></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Choose a SafeSpot in {companion.city}</span>{spotsQuery.isLoading ? <div className="skeleton h-12 rounded-xl" /> : spotsQuery.isError ? <p className="rounded-xl bg-[#fbebe7] p-3 text-xs text-[#86555a]">SafeSpots are unavailable. Try again in a moment.</p> : spots.length === 0 ? <p className="rounded-xl border border-dashed border-[#cbbab5] p-3 text-xs text-[#806c76]">No public SafeSpots are listed for this area yet.</p> : <select required value={spot} onChange={(e) => setSpot(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="select-safe-spot"><option value="">Choose a public place</option>{spots.map((s: SafeSpot) => <option key={s.id} value={s.id}>{s.name} · {s.addressHint}{s.openLate ? ' · Open late' : ''}</option>)}</select>}</label><div className="flex items-start gap-2 rounded-xl bg-[#f0e4db] p-4 text-xs leading-5 text-[#725e69]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#477254]" />Your booking is only a request until your companion accepts. Exact details stay private.</div><Button type="submit" disabled={mutation.isPending || spots.length === 0} className="w-full sm:w-auto" testId="button-submit-booking">{mutation.isPending ? 'Pricing your request…' : 'Review server-priced request'} <ArrowRight className="h-4 w-4" /></Button>{mutation.isError && <p className="text-sm text-[#a64742]" data-testid="status-booking-error">We could not create this request. Please check the details and try again.</p>}</form></div><aside className="h-fit rounded-[24px] bg-[#3d2038] p-7 text-[#f9efe5] lg:sticky lg:top-28"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">Your companion</p><div className="mt-5 flex items-center gap-3"><Avatar companion={companion} /><div><p className="font-serif text-2xl">{companion.displayName}</p><p className="text-xs text-[#d3b6c4]">{companion.serviceArea}, {companion.city}</p></div></div><div className="mt-7 rounded-[16px] border border-[#65445d] bg-[#4a2842] p-5">{quoteQuery.isLoading ? <><div className="skeleton h-3 w-24 rounded-full opacity-30" /><div className="skeleton mt-3 h-8 w-32 rounded-full opacity-30" /><div className="skeleton mt-2 h-3 w-full rounded-full opacity-20" /></> : quote ? <><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#c695ae]">Price estimate</p><div className="mt-4 space-y-2 text-xs text-[#d8c1cc]"><div className="flex items-center justify-between"><span>{duration} hr × {money(companion.hourlyRate * 100)}/hr</span><span>{money(quote.subtotalCents)}</span></div><div className="flex items-center justify-between text-[#b39dad]"><span>Safety &amp; service fee (5%)</span><span>+{money(quote.customerFeeCents)}</span></div></div><div className="my-3 border-t border-[#65445d]" /><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-wider text-[#c695ae]">You pay</span><span className="font-serif text-3xl text-[#f9efe5]" data-testid="value-quote-total">{money(quote.totalCents)}</span></div><p className="mt-1 text-right text-[10px] text-[#b39dad]">Companion receives {money(quote.companionPayoutCents)}</p><div className="mt-4 rounded-[10px] border border-[#8a4070] bg-[#5a2550] p-3"><div className="flex items-start gap-2"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#df9cbd]" /><p className="text-[10px] leading-4 text-[#dbc3cf]">Or pay a <strong className="text-[#f0c8dc]">$10 deposit</strong> to unlock chat first — credited toward your booking total.</p></div></div></> : <p className="text-xs text-[#b39dad]">Select a duration to see your price.</p>}</div><div className="mt-5 border-t border-[#65445d] pt-5"><p className="flex items-center gap-2 text-xs leading-5 text-[#d8c1cc]"><LockKeyhole className="h-4 w-4 text-[#df9cbd]" />All prices are calculated server-side. Your browser never sets amounts.</p></div></aside></div></main></Shell>;
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
      const res = await fetch(`/api/bookings/${id}`);
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
        <p className="mt-1 text-xs text-[#806c76]">Pay the $10 deposit to open a private thread with your companion.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[20px] border border-[#dfd2c9] bg-white shadow-sm">
      {/* Banner */}
      <div className="flex items-center gap-2 border-b border-[#ece1d9] bg-[#fbf7f1] px-4 py-2.5">
        <Lock className="h-3 w-3 shrink-0 text-[#9d557e]" />
        <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#9b858e]">Private · Phone numbers and emails are blocked</p>
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

function useCustomerBookings() {
  return useQuery<BookingDetail[]>({
    queryKey: ['customer-bookings'],
    queryFn: async () => {
      const res = await fetch('/api/bookings');
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
    refetchInterval: 30_000,
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
        <div className="rounded-[20px] border border-dashed border-[#dfd2c9] bg-[#fbf7f1] p-8 text-center">
          <CalendarDays className="mx-auto h-7 w-7 text-[#c6aeb8]" />
          <p className="mt-3 font-serif text-xl text-[#48213d]">No bookings yet.</p>
          <p className="mt-1 text-xs text-[#806c76]">When you book a companion, your requests and confirmed plans appear here.</p>
          <Link href="/explore" className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white" data-testid="link-customer-explore">
            Browse companions <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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
              <Link key={b.id} href={`/booking/${b.id}`}
                className="flex items-center gap-3 rounded-[12px] border border-[#ece1d9] px-4 py-2.5 transition hover:border-[#dfd2c9]">
                <p className="flex-1 truncate text-xs font-medium text-[#725e69]">{b.activity}</p>
                <p className="text-[10px] text-[#9b858e]">{b.date}</p>
                <span className={cn('rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.1em]', STATUS_PILL[b.status] ?? 'bg-[#ece1d9] text-[#725e69]')}>
                  {b.status}
                </span>
              </Link>
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
      localStorage.setItem(`of_reviewed_${bookingId}`, '1');
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

function ReviewForm({ bookingId }: { bookingId: string }) {
  const alreadyReviewed = Boolean(localStorage.getItem(`of_reviewed_${bookingId}`));
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(alreadyReviewed);
  const submit = useSubmitReview(bookingId);

  if (done) {
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

  return (
    <div className="mt-10 border-t border-[#dfd2c9] pt-8">
      <div className="mb-5 flex items-center gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Reviews</p>
        <div className="flex items-center gap-2">
          <StarDisplay rating={Math.round(avg)} />
          <span className="font-mono text-[11px] font-bold text-[#48213d]">{avg.toFixed(1)}</span>
          <span className="text-[10px] text-[#9b858e]">from {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span>
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
// Companion profile editor
// ---------------------------------------------------------------------------

type CompanionProfileData = {
  displayName: string;
  bio: string;
  hourlyRateCents: number;
  activities: string[];
  languages: string[];
  serviceArea: string;
  availableDays: string[];
  availableHoursStart: string;
  availableHoursEnd: string;
};

function useCompanionProfile() {
  return useQuery<CompanionProfileData>({
    queryKey: ['companion-profile'],
    queryFn: async () => {
      const res = await fetch('/api/companion/profile');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
    retry: 1,
  });
}

function useUpdateCompanionProfile() {
  const qc = useQueryClient();
  return useMutation<CompanionProfileData, Error, CompanionProfileData>({
    mutationFn: async (data) => {
      const res = await fetch('/api/companion/profile', {
        method: 'PUT',
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
  const [saved, setSaved] = useState(false);

  // Form state — seeded from query data once loaded
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [hourlyRate, setHourlyRate] = useState('70');
  const [activities, setActivities] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [serviceArea, setServiceArea] = useState('');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [hoursStart, setHoursStart] = useState('10:00');
  const [hoursEnd, setHoursEnd] = useState('20:00');
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (profileQuery.data && !seeded) {
      const p = profileQuery.data;
      setDisplayName(p.displayName);
      setBio(p.bio);
      setHourlyRate(String(Math.round(p.hourlyRateCents / 100)));
      setActivities(p.activities);
      setLanguages(p.languages);
      setServiceArea(p.serviceArea);
      setAvailableDays(p.availableDays);
      setHoursStart(p.availableHoursStart);
      setHoursEnd(p.availableHoursEnd);
      setSeeded(true);
    }
  }, [profileQuery.data, seeded]);

  const handleSave = () => {
    const rate = Math.round(parseFloat(hourlyRate) * 100);
    if (!displayName.trim() || !bio.trim() || isNaN(rate)) return;
    updateProfile.mutate(
      { displayName, bio, hourlyRateCents: rate, activities, languages, serviceArea, availableDays, availableHoursStart: hoursStart, availableHoursEnd: hoursEnd },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
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
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#654c5f]">Service area</span>
                <input
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  placeholder="San Francisco, CA"
                  maxLength={100}
                  className="h-11 w-full rounded-xl border border-[#dfd2c9] bg-[#fbf7f1] px-4 text-sm text-[#48213d] placeholder:text-[#b0929f] focus:border-[#9d557e] focus:outline-none"
                  data-testid="input-profile-area"
                />
                <p className="mt-1 text-[10px] text-[#9b858e]">Shown as an approximate region, never your exact location.</p>
              </label>
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

  if (!id) { navigate('/dashboard/companion'); return null; }

  if (isLoading) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><LoadingState label="Loading booking" /></main></Shell>
  );
  if (isError || !b) return (
    <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => refetch()} /></main></Shell>
  );

  const isConfirmed = b.status === 'confirmed' || b.status === 'completed';
  const isChatOpen = CHAT_ENABLED_STATUSES.has(b.status);

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
              Waiting for the customer's deposit. The chat thread opens once payment clears.
            </div>
          )}

          <p className="mt-6 font-mono text-[10px] text-[#a38c95]">BOOKING {b.id}</p>

          <div className="mt-4">
            <Link href="/dashboard/companion" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white">
              <ArrowLeft className="h-3.5 w-3.5" />Back to inbox
            </Link>
          </div>
        </div>

        {/* Chat thread */}
        <BookingChat bookingId={b.id} status={b.status} viewerRole="companion" />
      </main>
    </Shell>
  );
}

function BookingStatus() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const bookingQuery = useBooking(id);
  const companionQuery = useGetCompanion(bookingQuery.data?.companionId ?? '', {
    query: { enabled: Boolean(bookingQuery.data?.companionId), queryKey: getGetCompanionQueryKey(bookingQuery.data?.companionId ?? '') },
  });

  // Trigger Stripe reconciliation on mount so a delayed webhook doesn't leave status stale
  useEffect(() => {
    if (id) fetch(`/api/stripe/booking/${id}/status`).catch(() => {});
  }, [id]);

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

  return (
    <Shell>
      <main className="page-enter mx-auto max-w-2xl px-5 py-14 lg:px-8 lg:py-20">
        <Link href="/dashboard/customer" className="mb-10 inline-flex items-center gap-2 text-xs font-bold text-[#806076] hover:text-[#7f2e62]" data-testid="link-back-dashboard">
          <ArrowLeft className="h-4 w-4" />Back to workspace
        </Link>

        <div className={`rounded-[26px] p-8 md:p-12 ${isConfirmed ? 'bg-[#e8f0e8]' : isDepositPaid ? 'bg-[#ead0dd]' : 'border border-[#dfd2c9] bg-[#fbf7f1]'}`}>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusBadge status={b.status} />
              <h1 className="mt-4 font-serif text-4xl leading-none text-[#48213d]">
                {isConfirmed ? 'Booking confirmed.' : isDepositPaid ? 'Chat unlocked.' : 'Request received.'}
              </h1>
              {c && <p className="mt-2 text-sm text-[#725e69]">with {c.displayName} · {b.activity}</p>}
            </div>
            <div className={`grid h-12 w-12 place-items-center rounded-2xl ${isConfirmed ? 'bg-[#477254] text-white' : isDepositPaid ? 'bg-[#7f2e62] text-white' : 'bg-[#ead0dd] text-[#7f2e62]'}`}>
              {isConfirmed ? <Check /> : isDepositPaid ? <MessageSquare className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
            </div>
          </div>

          {/* Details */}
          <div className="mt-8 grid gap-3 rounded-[16px] border border-[#dfd2c9] bg-white/60 p-5 text-sm sm:grid-cols-2">
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Date</p><p className="mt-1 font-semibold text-[#48213d]">{b.date}</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Time</p><p className="mt-1 font-semibold text-[#48213d]">{b.startTime}</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Duration</p><p className="mt-1 font-semibold text-[#48213d]">{b.durationHours}h</p></div>
            <div><p className="font-mono text-[9px] uppercase tracking-wider text-[#9d557e]">Activity</p><p className="mt-1 font-semibold text-[#48213d]">{b.activity}</p></div>
          </div>

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

          {/* Status message */}
          {!isConfirmed && !isDepositPaid && b.status === 'requested' && (
            <div className="mt-6 rounded-[14px] bg-[#f3ead7] p-4 text-xs leading-5 text-[#7a5a12]">
              <Clock3 className="mb-1 h-4 w-4" />
              Waiting for payment confirmation. This page updates automatically — no need to refresh.
            </div>
          )}

          <p className="mt-6 font-mono text-[10px] text-[#a38c95]">BOOKING {b.id}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/customer" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#7f2e62] px-5 text-sm font-bold text-white" data-testid="link-booking-dashboard">
              Go to workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/safety" className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-[#654c5f] hover:bg-[#eee2d9]" data-testid="link-booking-safety">
              <ShieldCheck className="h-4 w-4" />Safety plan
            </Link>
          </div>
        </div>

        <BookingChat bookingId={b.id} status={b.status} />
      </main>
    </Shell>
  );
}

type PayoutStatus = { status: 'not_started' | 'pending' | 'active'; detailsSubmitted?: boolean; payoutsEnabled?: boolean };

function useCompanionPayoutStatus() {
  return useQuery<PayoutStatus>({
    queryKey: ['companion-payout-status'],
    queryFn: async () => {
      const res = await fetch('/api/companion/stripe/status');
      if (!res.ok) throw new Error('Failed to check payout status');
      return res.json() as Promise<PayoutStatus>;
    },
    retry: 1,
  });
}

function useStartPayoutOnboarding() {
  return useMutation<{ url: string }, Error>({
    mutationFn: async () => {
      const res = await fetch('/api/companion/stripe/onboard', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start payout setup');
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => { window.location.href = data.url; },
  });
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

function Dashboard({ mode }: { mode: 'customer' | 'companion' }) {
  const isCustomer = mode === 'customer'; const customer = useGetCustomerDashboard({ query: { enabled: isCustomer, queryKey: getGetCustomerDashboardQueryKey() } }); const companion = useGetCompanionDashboard({ query: { enabled: !isCustomer, queryKey: getGetCompanionDashboardQueryKey() } }); const query = isCustomer ? customer : companion;
  if (query.isLoading) return <Shell><main className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><LoadingState label="Preparing your workspace" /></main></Shell>;
  if (query.isError) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => query.refetch()} /></main></Shell>;
  const stats = isCustomer
    ? [{ label: 'Upcoming bookings', value: customer.data?.upcomingBookings ?? 0, icon: CalendarDays }, { label: 'Completed together', value: customer.data?.completedBookings ?? 0, icon: Check }, { label: 'Saved companions', value: customer.data?.savedCompanions ?? 0, icon: HeartHandshake }, { label: 'Safety plans', value: customer.data?.safetyPlans ?? 0, icon: ShieldCheck }]
    : [{ label: 'Pending requests', value: companion.data?.pendingRequests ?? 0, icon: ClipboardCheck }, { label: 'Upcoming bookings', value: companion.data?.upcomingBookings ?? 0, icon: CalendarDays }, { label: 'Earnings', value: money(companion.data?.earningsCents ?? 0), icon: WalletCards }, { label: 'Profile views', value: companion.data?.profileViews ?? 0, icon: EyeOff }];
  const hasData = stats.some((x) => x.value !== 0 && x.value !== '$0.00');
  const stripeReturn = typeof window !== 'undefined' && window.location.search.includes('stripe=return');
  return <Shell><main className="page-enter mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">{isCustomer ? 'Customer workspace' : 'Companion workspace'}</p><h1 className="mt-3 font-serif text-5xl leading-none text-[#48213d]">{isCustomer ? 'Your time, kept simple.' : 'Your room is ready.'}</h1><p className="mt-4 text-sm text-[#725e69]">{isCustomer ? 'A quiet place to keep plans, favorites, and safety details together.' : 'Keep your availability, requests, and earnings in one considered place.'}</p></div><div className="flex shrink-0 items-center gap-2 self-start md:self-auto">{!isCustomer && <Link href="/dashboard/companion/profile" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dfd2c9] bg-transparent px-4 text-[13px] font-bold text-[#542642] transition hover:border-[#7f2e62] hover:bg-[#f0e4db]" data-testid="link-edit-profile"><Pencil className="h-4 w-4" />Edit profile</Link>}<Button variant="outline" onClick={() => query.refetch()} testId="button-refresh-dashboard"><RefreshCw className="h-4 w-4" />Refresh</Button></div></div><div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-[#dfd2c9] bg-[#fbf7f1] p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ead0dd] text-[#7f2e62]"><Icon className="h-4 w-4" /></span><span className="font-mono text-[10px] text-[#ad929e]">LIVE</span></div><p className="mt-7 font-serif text-4xl text-[#48213d]" data-testid={`value-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p><p className="mt-1 text-xs font-semibold text-[#806c76]">{label}</p></div>)}</div>{isCustomer && <CustomerBookingList />}{!isCustomer && <PayoutSetup stripeReturn={stripeReturn} />}{!isCustomer && <CompanionInbox />}<div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><div className="rounded-[22px] border border-[#dfd2c9] bg-[#fbf7f1] p-7"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Next up</p><h2 className="mt-3 font-serif text-3xl text-[#48213d]">{hasData ? 'Your live activity' : 'Nothing on the calendar yet.'}</h2>{hasData ? <p className="mt-2 text-sm leading-6 text-[#725e69]">When a booking is scheduled, the details and safety plan will appear here.</p> : <EmptyState icon={CalendarDays} title={isCustomer ? 'Make the first plan.' : 'Your next request will land here.'} body={isCustomer ? 'Browse the directory when you are ready to find good company.' : 'Keep your profile clear and availability current so the right requests can find you.'} action={isCustomer ? <Link href="/explore" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white" data-testid="link-dashboard-explore">Explore companions <ArrowRight className="h-3.5 w-3.5" /></Link> : <Link href="/companion/apply" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#7f2e62] px-4 text-xs font-bold text-white" data-testid="link-dashboard-profile">Review application <ArrowRight className="h-3.5 w-3.5" /></Link>} />}</div><div className="rounded-[22px] bg-[#d9e1d7] p-7"><ShieldCheck className="h-6 w-6 text-[#477254]" /><h2 className="mt-12 font-serif text-3xl leading-none text-[#31533f]">Safety is part of the plan.</h2><p className="mt-3 text-sm leading-6 text-[#53725d]">Every booking keeps public meeting places, clear boundaries, and check-ins close at hand.</p><Link href="/safety" className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-[#477254]" data-testid="link-dashboard-safety">Open safety center <ArrowRight className="h-3.5 w-3.5" /></Link></div></div></main></Shell>;
}

function Apply() {
  const [sent, setSent] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [city, setCity] = useState(''); const [about, setAbout] = useState('');
  if (sent) return <Shell><main className="page-enter mx-auto max-w-2xl px-5 py-20"><div className="rounded-[26px] bg-[#3d2038] p-8 text-[#f9efe5] md:p-12"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#c45b8f] text-[#281223]"><Check /></div><h1 className="mt-8 font-serif text-5xl leading-none">A thoughtful first step.</h1><p className="mt-5 text-sm leading-7 text-[#dbc3cf]">Thanks, {name || 'there'}. Our trust team will review your application and reach out to {email || 'your email'} with next steps.</p><Link href="/" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#f7e9de] px-5 text-sm font-bold text-[#48213d]" data-testid="link-application-home">Back home <ArrowRight className="h-4 w-4" /></Link></div></main></Shell>;
  return <Shell><main className="page-enter mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20"><div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr]"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">Join the circle</p><h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#48213d]">Make room<br /><em>for good company.</em></h1><p className="mt-6 max-w-sm text-[15px] leading-7 text-[#725e69]">OnlyFavors is for adults who know that showing up, listening well, and keeping clear boundaries can change a day.</p><div className="mt-10 space-y-4"><Step n="01" icon={HeartHandshake} title="Share your way of being" body="Tell us what kind of company you offer and what makes it feel natural." /><Step n="02" icon={ShieldCheck} title="Meet the trust team" body="We review every application with care. There is no instant approval." /><Step n="03" icon={Sparkles} title="Set your own pace" body="Choose your activities, availability, and boundaries once you are approved." /></div></div><form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="rounded-[26px] border border-[#dfd2c9] bg-[#fbf7f1] p-7 shadow-[0_15px_35px_rgba(88,37,70,.07)] md:p-10" data-testid="form-companion-application"><h2 className="font-serif text-3xl text-[#48213d]">Start an application</h2><p className="mt-2 text-sm leading-6 text-[#806c76]">A few honest details are enough for the first pass.</p><div className="mt-8 space-y-5"><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Your name</span><input required value={name} onChange={(e) => setName(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fffaf4] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-application-name" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fffaf4] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-application-email" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">City or region</span><input required value={city} onChange={(e) => setCity(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fffaf4] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-application-city" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">What kind of company do you offer?</span><textarea required value={about} onChange={(e) => setAbout(e.target.value)} rows={5} className="w-full resize-none rounded-xl border border-[#cbbab5] bg-[#fffaf4] p-4 text-sm leading-6 outline-none focus:border-[#7f2e62]" placeholder="A walk, a gallery afternoon, a calm dinner…" data-testid="textarea-application-about" /></label><label className="flex items-start gap-2 text-xs leading-5 text-[#806c76]"><input required type="checkbox" className="mt-1 accent-[#7f2e62]" data-testid="checkbox-application-terms" />I understand OnlyFavors is platonic, adults-only, and grounded in clear community boundaries.</label><Button type="submit" className="w-full" testId="button-submit-application">Send application <Send className="h-4 w-4" /></Button></div></form></div></main></Shell>;
}

function Login() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [code, setCode] = useState('');
  return <Shell bare><main className="grid min-h-[100dvh] lg:grid-cols-[.8fr_1.2fr]"><div className="hidden bg-[#3d2038] p-10 text-[#f9efe5] lg:flex lg:flex-col lg:justify-between"><Brand dark /><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">Your private front door</p><h1 className="mt-5 max-w-md font-serif text-6xl leading-[.92]">Good company<br /><em>starts here.</em></h1><p className="mt-6 max-w-sm text-sm leading-7 text-[#d9c4cf]">Sign in with an email code. No passwords to remember, no social profile to connect.</p></div><p className="text-xs text-[#b795a7]">OnlyFavors · Private by design.</p></div><div className="flex flex-col p-5 md:p-10"><div className="flex justify-between lg:justify-end"><div className="lg:hidden"><Brand /></div><Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="link-login-home"><ArrowLeft className="h-4 w-4" />Back home</Link></div><div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center"><div className="mb-8 lg:hidden"><h1 className="font-serif text-5xl leading-none text-[#48213d]">Welcome back.</h1><p className="mt-3 text-sm text-[#725e69]">Your private front door to good company.</p></div>{!sent ? <form onSubmit={(e) => { e.preventDefault(); setSent(true); }}><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Email sign in</p><h2 className="mt-3 font-serif text-4xl text-[#48213d]">A code, not a password.</h2><p className="mt-3 text-sm leading-6 text-[#725e69]">We will send a one-time code to your email. It expires shortly and is never used for marketing.</p><label className="mt-8 block"><span className="mb-2 block text-xs font-bold text-[#654c5f]">Email address</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-sm outline-none focus:border-[#7f2e62]" data-testid="input-login-email" /></label><Button type="submit" className="mt-5 w-full" testId="button-send-login-code">Send secure code <ArrowRight className="h-4 w-4" /></Button></form> : <form onSubmit={(e) => e.preventDefault()}><button type="button" onClick={() => setSent(false)} className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[#806076]" data-testid="button-change-login-email"><ArrowLeft className="h-4 w-4" />Change email</button><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9d557e]">Check your inbox</p><h2 className="mt-3 font-serif text-4xl text-[#48213d]">Enter your code.</h2><p className="mt-3 text-sm leading-6 text-[#725e69]">We sent a six-character code to <strong>{email}</strong>.</p><input required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="mt-8 h-14 w-full rounded-xl border border-[#cbbab5] bg-[#fbf7f1] px-4 text-center font-mono text-xl tracking-[.5em] outline-none focus:border-[#7f2e62]" placeholder="000000" data-testid="input-login-code" /><Button type="submit" disabled={code.length < 6} className="mt-5 w-full" testId="button-verify-login-code">Verify and continue <Check className="h-4 w-4" /></Button></form>}<p className="mt-8 text-center text-[11px] leading-5 text-[#9b858e]">By continuing, you agree to our <Link href="/terms" className="font-bold text-[#7f2e62]" data-testid="link-login-terms">community guidelines</Link> and <Link href="/privacy" className="font-bold text-[#7f2e62]" data-testid="link-login-privacy">privacy policy</Link>.</p></div></div></main></Shell>;
}

function Safety() {
  const query = useGetSafetyResources({ query: { queryKey: getGetSafetyResourcesQueryKey() } }); const data = query.data;
  if (query.isLoading) return <Shell><main className="mx-auto max-w-5xl px-5 py-16"><LoadingState label="Loading safety resources" /></main></Shell>;
  if (query.isError || !data) return <Shell><main className="mx-auto max-w-2xl px-5 py-20"><ErrorState onRetry={() => query.refetch()} /></main></Shell>;
  return <Shell><main className="page-enter mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20"><div className="max-w-2xl"><p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#477254]"><ShieldCheck className="h-4 w-4" />Trust & safety</p><h1 className="mt-4 font-serif text-6xl leading-[.9] text-[#31533f]">{data.title}</h1><p className="mt-6 text-[16px] leading-8 text-[#53725d]">{data.emergencyGuidance}</p></div><div className="mt-14 grid gap-4 md:grid-cols-[1.15fr_.85fr]"><div className="rounded-[24px] bg-[#31533f] p-8 text-[#eef6ef] md:p-10"><LifeBuoy className="h-7 w-7 text-[#b7d7bd]" /><h2 className="mt-16 font-serif text-4xl leading-none">If something feels wrong, pause.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[#c6ddca]">Move to a busier place, contact someone you trust, and use local emergency services when there is immediate danger. OnlyFavors support can help with platform concerns, but cannot replace emergency responders.</p><Link href="/login" className="mt-7 inline-flex items-center gap-2 text-xs font-bold text-[#d9f0dd]" data-testid="link-safety-support">Contact trust support <ArrowRight className="h-3.5 w-3.5" /></Link></div><div className="rounded-[24px] border border-[#c7d9cb] bg-[#e8f0e8] p-8"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#63816a]">Our principles</p><div className="mt-6 space-y-3">{data.principles.length ? data.principles.map((p, i) => <div key={p} className="flex gap-3 rounded-xl bg-[#f3f8f2] p-4"><span className="font-mono text-[10px] text-[#76977d]">0{i + 1}</span><p className="text-sm leading-6 text-[#477254]">{p}</p></div>) : <p className="text-sm text-[#53725d]">Safety principles are being updated.</p>}</div></div></div><div className="mt-12 grid gap-4 md:grid-cols-3"><InfoTile icon={MapPin} title="Meet in public" body="Choose a SafeSpot and keep the first meeting visible and easy to leave." /><InfoTile icon={MessageSquare} title="Keep it clear" body="Discuss activity, timing, and boundaries before you meet." /><InfoTile icon={EyeOff} title="Protect privacy" body="Never share your home address or ask for someone else's." /></div></main></Shell>;
}

function InfoTile({ icon: Icon, title, body }: { icon: typeof MapPin; title: string; body: string }) {
  return <div className="rounded-2xl border border-[#dfd2c9] bg-[#fbf7f1] p-6"><Icon className="h-5 w-5 text-[#7f2e62]" /><h3 className="mt-8 font-serif text-2xl text-[#48213d]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#725e69]">{body}</p></div>;
}

const legalCopy: Record<string, { eyebrow: string; title: string; intro: string; sections: Array<[string, string]> }> = {
  privacy: { eyebrow: 'Privacy policy', title: 'Your details are not the product.', intro: 'OnlyFavors is built around a simple promise: share only what is useful for a safe, respectful booking.', sections: [['What we collect', 'We collect the account, booking, and application details needed to operate the marketplace. Approximate service areas are shown publicly; exact addresses are not.'], ['How we use it', 'We use information to verify companions, facilitate requests, provide support, and keep the community safe. We do not sell personal information.'], ['Your choices', 'You can ask us to access, correct, or delete eligible account information by contacting support through your signed-in workspace.']] },
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

const DEMO_SAFESPOTS: SafeSpot[] = [
  { id: 'ss-demo-1', name: 'The Commons Café', category: 'Café', city: 'San Francisco', addressHint: 'Near Union Square, downtown', openLate: false },
  { id: 'ss-demo-2', name: 'Grand Central Lounge', category: 'Bar', city: 'New York', addressHint: 'Midtown East, ground floor', openLate: true },
  { id: 'ss-demo-3', name: 'Riverside Public Library', category: 'Library', city: 'Chicago', addressHint: 'River North branch', openLate: false },
  { id: 'ss-demo-4', name: 'Ember & Oak', category: 'Restaurant', city: 'Austin', addressHint: 'Downtown, street level', openLate: true },
  { id: 'ss-demo-5', name: 'The Garden Hotel Lobby', category: 'Hotel', city: 'Los Angeles', addressHint: 'West Hollywood, lobby level', openLate: true },
  { id: 'ss-demo-6', name: 'Meridian Museum Café', category: 'Museum', city: 'Seattle', addressHint: 'Capitol Hill, ground floor', openLate: false },
];

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
        <p className="mt-1 text-xs font-medium text-[#806c76]">{spot.category} · {spot.city}</p>
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

  const spots: SafeSpot[] = (query.data && query.data.length > 0) ? query.data as SafeSpot[] : DEMO_SAFESPOTS;
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
            Verified public venues where every favor begins. Staff-aware, well-lit, and easy to leave.
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
              <p className="mt-4 font-serif text-xl text-[#48213d]">No SafeSpots match those filters.</p>
              <p className="mt-2 text-xs text-[#806c76]">Try a different city or clear the category filter.</p>
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

        {/* Apply banner */}
        <div className="mt-16 rounded-[24px] bg-[#2d1228] p-8 md:p-10">
          <div className="max-w-xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#c695ae]">For venue managers</p>
            <h2 className="mt-3 font-serif text-4xl leading-none text-[#f9efe5]">List your venue as a SafeSpot.</h2>
            <p className="mt-4 text-sm leading-6 text-[#d9c4cf]">
              OnlyFavors partners with cafés, hotel lobbies, libraries, and other public spaces to build
              a network people can trust. No special equipment — just a staff-friendly environment.
            </p>
            <a href="mailto:safespots@onlyfavors.com" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#f7e9de] px-5 text-sm font-bold text-[#48213d]">
              Apply your venue <ArrowRight className="h-4 w-4" />
            </a>
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
      if (!res.ok) {
        // Return from demo set as fallback
        return DEMO_SAFESPOTS.find((s) => s.id === id) ?? null;
      }
      return res.json();
    },
  });
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
                <p className="mt-2 text-sm font-medium text-[#806c76]">{spot.category} · {spot.city}</p>
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
            </div>

            {/* Info grid */}
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-[20px] bg-[#e8f0e8] p-6">
                <ShieldCheck className="h-5 w-5 text-[#477254]" />
                <p className="mt-4 font-bold text-[#31533f]">Staff aware</p>
                <p className="mt-1.5 text-xs leading-5 text-[#53725d]">Venue staff know OnlyFavors customers may use their space. You're never out of place.</p>
              </div>
              <div className="rounded-[20px] bg-[#f0e4db] p-6">
                <Navigation2 className="h-5 w-5 text-[#7f5042]" />
                <p className="mt-4 font-bold text-[#5c3625]">Easy to find and leave</p>
                <p className="mt-1.5 text-xs leading-5 text-[#7f5042]">Public entrances, multiple exits. Never feel locked in.</p>
              </div>
              <div className="rounded-[20px] bg-[#f9efe5] p-6">
                <EyeOff className="h-5 w-5 text-[#9d557e]" />
                <p className="mt-4 font-bold text-[#48213d]">Privacy first</p>
                <p className="mt-1.5 text-xs leading-5 text-[#725e69]">Your exact location is never shared. Your Trust Circle only knows a SafeSpot is involved.</p>
              </div>
            </div>

            {/* How check-in works */}
            <div className="mt-10 rounded-[24px] border border-[#dfd2c9] bg-[#fbf7f1] p-8">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#9d557e]">How QR check-in works</p>
              <div className="mt-6 space-y-4">
                {[
                  { n: '01', title: 'Booking confirmed', body: 'Once your companion accepts, a unique QR code is generated for your booking.' },
                  { n: '02', title: 'Arrive and check in', body: 'Open your favor screen and tap Check In. Your QR code appears — show it to venue staff or scan the SafeSpot code.' },
                  { n: '03', title: 'Trust Circle notified', body: 'A quiet message goes out. No names, no details — just "arrived safely at a SafeSpot."' },
                  { n: '04', title: 'Hourly check-in', body: 'If a scheduled check-in is missed, your Trust Circle is alerted automatically.' },
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
  const [sent, setSent] = useState(false);
  return <Shell bare><main className="grid min-h-[100dvh] place-items-center bg-[#3d2038] px-5"><div className="w-full max-w-md rounded-[26px] border border-[#65445d] bg-[#48243f] p-8 text-[#f9efe5] md:p-10"><div className="flex items-center justify-between"><Brand dark /><span className="rounded-full border border-[#79556d] px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-[#d3b6c4]">Operations</span></div>{sent ? <div className="mt-12"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#c45b8f] text-[#281223]"><Check /></div><h1 className="mt-7 font-serif text-4xl">Check your inbox.</h1><p className="mt-3 text-sm leading-6 text-[#d9c4cf]">A secure operations code is on its way. This workspace is restricted to approved trust staff.</p><Link href="/admin/operations" className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[#f7e9de] px-5 text-sm font-bold text-[#48213d]" data-testid="link-admin-operations">Continue to operations <ArrowRight className="h-4 w-4" /></Link></div> : <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="mt-12"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#c695ae]">Trust team access</p><h1 className="mt-3 font-serif text-4xl">Keep the room safe.</h1><label className="mt-8 block"><span className="mb-2 block text-xs font-bold text-[#dbc3cf]">Operations email</span><input required type="email" className="h-12 w-full rounded-xl border border-[#79556d] bg-[#3d2038] px-4 text-sm text-[#f9efe5] outline-none focus:border-[#d897b6]" data-testid="input-admin-email" /></label><Button type="submit" variant="primary" className="mt-5 w-full" testId="button-admin-login">Send secure code <KeyRound className="h-4 w-4" /></Button></form>}<Link href="/" className="mt-8 inline-flex items-center gap-2 text-xs text-[#c695ae] hover:text-[#f9efe5]" data-testid="link-admin-home"><ArrowLeft className="h-3.5 w-3.5" />Return to OnlyFavors</Link></div></main></Shell>;
}

function AdminOperations() {
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
              <QueueRow icon={CircleAlert}   title="Safety reports"          count={data?.openReports ?? 0}       href="/safety" />
              <QueueRow icon={Clock3}         title="Check-ins due"           count={data?.checkInsDue ?? 0}       href="#bookings" />
            </div>
          </div>
          <div className="rounded-[22px] bg-[#3d2038] p-7 text-[#f9efe5]">
            <ShieldCheck className="h-6 w-6 text-[#d897b6]" />
            <h2 className="mt-12 font-serif text-3xl leading-none">Review with care.</h2>
            <p className="mt-3 text-sm leading-6 text-[#d9c4cf]">Every number here represents a person waiting for a considered response. Leave an audit note whenever you make a decision.</p>
            <button type="button" onClick={() => window.alert('Audit log is ready for your next review.')}
              className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-[#e2b3c9]"
              data-testid="button-open-audit-log">
              Open audit log <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

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
                  <div className="bg-white px-4 py-3 font-mono text-[10px] text-[#9b858e]">{b.id.slice(-8).toUpperCase()}</div>
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
      const res = await fetch('/api/admin/companions/pending');
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
      const res = await fetch('/api/admin/bookings/recent');
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
      const res = await fetch(`/api/admin/companions/${id}/${action}`, { method: 'POST' });
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

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/companions/:id" component={Profile} />
        <Route path="/book" component={Book} />
        <Route path="/favor/:id" component={FavorMode} />
        <Route path="/favor" component={FavorMode} />
        <Route path="/dashboard/customer"><Dashboard mode="customer" /></Route>
        <Route path="/dashboard/companion"><Dashboard mode="companion" /></Route>
        <Route path="/companion/apply" component={Apply} />
        <Route path="/login" component={Login} />
        <Route path="/safety" component={Safety} />
        <Route path="/privacy"><Legal kind="privacy" /></Route>
        <Route path="/terms"><Legal kind="terms" /></Route>
        <Route path="/cancellation"><Legal kind="cancellation" /></Route>
        <Route path="/booking/:id" component={BookingStatus} />
        <Route path="/companion/booking/:id" component={CompanionBookingDetail} />
        <Route path="/dashboard/companion/profile" component={CompanionProfileEditor} />
        <Route path="/trust-circle" component={TrustCircleSetup} />
        <Route path="/safespots" component={SafeSpots} />
        <Route path="/safespots/:id" component={SafeSpotDetail} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/operations" component={AdminOperations} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;