import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  Clock,
  Globe2,
  GraduationCap,
  Heart,
  Lightbulb,
  Mail,
  MapPin,
  Phone,
  Play,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

import { parseRows, propText, type Block } from "@/lib/site-blocks";
import { formatDate } from "@/lib/utils";

import { EnquiryForm } from "./enquiry-form";

export type NewsItem = {
  id: string;
  title: string;
  summary: string | null;
  publishedAt: Date | null;
};

/**
 * Link targets typed into content fields, allowed by shape.
 *
 * Anything a page relatively links, plus the schemes a school legitimately
 * uses. "javascript:" and friends come out as nothing — a content field on a
 * public website must never become a script vector, and the person typing
 * into it is not always the person who set the site up.
 */
function safeHref(value: string): string {
  const href = value.trim();
  if (!href) return "";
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return "";
}

/** The theme colours every block draws from, resolved once in the frame. */
export type SiteTheme = {
  /** Links and general interactive colour. */
  primary: string;
  /** The deep brand colour — bands, headings, the footer. */
  navy: string;
  /** The warm highlight — second heading lines, tags, the apply button. */
  gold: string;
  /**
   * The highlight darkened for text on light backgrounds. Gold that reads on
   * navy fails WCAG on white — #E9A319 on white is barely 2:1 — so small text
   * and heading accents on light surfaces use this instead, derived in the
   * frame from whatever highlight the school picked.
   */
  goldText: string;
  /** The soft wash behind alternating sections. */
  cream: string;
};

/**
 * A translucent tint of a theme colour, safe for any colour a school types.
 *
 * Appending a hex alpha ("#E9A31926") only works on six-digit hex and turns
 * "goldenrod" into an invalid value that silently kills the background.
 * color-mix handles every colour CSS itself accepts.
 */
export function tint(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
}

/**
 * The public renderer for a page's blocks.
 *
 * Every value is rendered as text through JSX, never through
 * dangerouslySetInnerHTML. That is what keeps a school's public site safe from
 * whatever ends up typed into a content field.
 *
 * The look is the classic international-school template: serif display
 * headings in the deep brand colour with a gold second line, navy bands for
 * features and figures, photographs with a soft radius. All of it derives
 * from four theme colours a school can change, so "fully customisable" means
 * the colours, the type and every word — not a fixed picture of someone
 * else's school.
 */
export function RenderBlock({
  block,
  news,
  contact,
  theme,
}: {
  block: Block;
  news: NewsItem[];
  /** The site's own contact details, used when a contact block carries none. */
  contact?: Record<string, string>;
  theme: SiteTheme;
}) {
  const raw = (block.props ?? {}) as Record<string, unknown>;
  const props = new Proxy(raw, {
    get: (target, key) => propText(target[key as string]),
  }) as Record<string, string>;

  // A call to action has been stored both flat and nested. Accepting both
  // costs three lines and means an older page still renders its button.
  // Only when the flat keys were never written: a school that clears a
  // button field must get no button, not the value from two schemas ago.
  const nestedCta = (raw.cta ?? {}) as Record<string, unknown>;
  const ctaLabel =
    raw.ctaLabel === undefined ? propText(nestedCta.label) : propText(raw.ctaLabel);
  const ctaHref = safeHref(
    raw.ctaHref === undefined ? propText(nestedCta.href) : propText(raw.ctaHref),
  );

  const heading = { fontFamily: "var(--heading-font)" } as const;

  /** The small gold label above a heading. */
  const eyebrow = (text: string) =>
    text ? (
      <p
        className="mb-2 text-xs font-bold tracking-[0.2em] uppercase"
        style={{ color: theme.goldText }}
      >
        {text}
      </p>
    ) : null;

  const goldButton = (label: string, href: string) =>
    label && href ? (
      <Link
        href={href}
        className="inline-flex h-11 items-center rounded-md px-6 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
        style={{ background: theme.gold, color: theme.navy }}
      >
        {label}
        <ArrowRight className="ml-1.5 size-4" />
      </Link>
    ) : null;

  const navyButton = (label: string, href: string) =>
    label && href ? (
      <Link
        href={href}
        className="inline-flex h-11 items-center rounded-md px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: theme.navy }}
      >
        {label}
        <ArrowRight className="ml-1.5 size-4" />
      </Link>
    ) : null;

  const outlineButton = (label: string, href: string) =>
    label && href ? (
      <Link
        href={href}
        className="inline-flex h-11 items-center rounded-md border-2 px-6 text-sm font-semibold transition-colors"
        style={{ borderColor: theme.navy, color: theme.navy }}
      >
        {label}
      </Link>
    ) : null;

  switch (block.type) {
    case "hero": {
      const imageUrl = props.imageUrl;
      return (
        <section style={{ background: theme.cream }}>
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-20">
            <div>
              <h1
                className="text-4xl leading-tight font-bold sm:text-5xl"
                style={{ ...heading, color: theme.navy }}
              >
                {props.heading}
                {props.headingAccent ? (
                  <>
                    <br />
                    <span style={{ color: theme.goldText }}>{props.headingAccent}</span>
                  </>
                ) : null}
              </h1>
              {props.subheading ? (
                <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
                  {props.subheading}
                </p>
              ) : null}
              <div className="mt-8 flex flex-wrap gap-3">
                {navyButton(ctaLabel, ctaHref)}
                {props.secondaryCtaLabel && safeHref(props.secondaryCtaHref) ? (
                  <Link
                    href={safeHref(props.secondaryCtaHref)}
                    className="inline-flex h-11 items-center gap-2 rounded-md border-2 px-6 text-sm font-semibold transition-colors"
                    style={{ borderColor: theme.navy, color: theme.navy }}
                  >
                    <span
                      className="flex size-6 items-center justify-center rounded-full"
                      style={{ background: tint(theme.navy, 10) }}
                    >
                      <Play className="size-3" fill="currentColor" />
                    </span>
                    {props.secondaryCtaLabel}
                  </Link>
                ) : null}
              </div>
            </div>

            {imageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="aspect-[4/3] w-full rounded-2xl object-cover shadow-lg"
                />
                {props.badgeTitle || props.badgeText ? (
                  <div className="absolute -bottom-5 right-6 flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-lg">
                    <span
                      className="flex size-10 items-center justify-center rounded-full"
                      style={{ background: tint(theme.gold, 15), color: theme.goldText }}
                    >
                      <Award className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs text-slate-500">{props.badgeTitle}</p>
                      <p
                        className="text-sm font-bold"
                        style={{ ...heading, color: theme.navy }}
                      >
                        {props.badgeText}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      );
    }

    case "features": {
      // Icons rotate through a fixed set — a school edits the words, and the
      // pictures stay tasteful without anyone choosing them.
      const icons = [GraduationCap, Users, Lightbulb, Globe2, ShieldCheck];
      const rows = parseRows(raw.items, ["title", "description"]);
      if (!rows.length) return null;

      return (
        <section style={{ background: theme.navy }}>
          <div
            className="mx-auto grid max-w-6xl gap-x-6 gap-y-8 px-6 py-10"
            style={{
              gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))`,
            }}
          >
            {rows.map((row, index) => {
              const Icon = icons[index % icons.length];
              return (
                <div
                  key={index}
                  className={"flex items-start gap-3 lg:pl-6" + (index === 0 ? " lg:pl-0" : " lg:border-l lg:border-white/15")}
                >
                  <span
                    className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full"
                    style={{ border: "1.5px solid rgb(255 255 255 / 0.35)", color: theme.gold }}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{row[0]}</p>
                    {row[1] ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-white/65">
                        {row[1]}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    case "richText":
      return (
        <section className="mx-auto max-w-3xl px-6 py-14">
          {eyebrow(props.eyebrow)}
          {props.heading ? (
            <h2
              className="mb-4 text-3xl font-bold"
              style={{ ...heading, color: theme.navy }}
            >
              {props.heading}
            </h2>
          ) : null}
          <div className="space-y-4 text-[15px] leading-relaxed whitespace-pre-line text-slate-600">
            {props.body}
          </div>
        </section>
      );

    case "imageText": {
      const imageLeft = props.imagePosition === "left";
      const stats = parseRows(raw.stats, ["value", "label"]);
      const facts = parseRows(raw.facts, ["value", "label"]);
      const factIcons = [GraduationCap, Users, Globe2, Award];

      return (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div
            className={`grid items-center gap-10 lg:grid-cols-2 ${
              imageLeft ? "" : "lg:[direction:rtl]"
            }`}
          >
            {/* Image side, with fact cards stacked beside it. */}
            <div className="lg:[direction:ltr]">
              <div className="flex gap-4">
                {props.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={props.imageUrl}
                    alt=""
                    className="min-w-0 flex-1 self-start rounded-2xl object-cover shadow-md"
                  />
                ) : null}
                {facts.length ? (
                  <div className="flex w-44 shrink-0 flex-col gap-3">
                    {facts.map((fact, index) => {
                      const Icon = factIcons[index % factIcons.length];
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                        >
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: tint(theme.gold, 12), color: theme.goldText }}
                          >
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p
                              className="numeric text-sm leading-tight font-bold"
                              style={{ color: theme.navy }}
                            >
                              {fact[0]}
                            </p>
                            <p className="text-[11px] leading-tight text-slate-500">
                              {fact[1]}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Copy side */}
            <div className="lg:[direction:ltr]">
              {eyebrow(props.eyebrow)}
              <h2
                className="text-3xl leading-tight font-bold"
                style={{ ...heading, color: theme.navy }}
              >
                {props.heading}
                {props.headingAccent ? (
                  <>
                    <br />
                    <span style={{ color: theme.goldText }}>{props.headingAccent}</span>
                  </>
                ) : null}
              </h2>
              {props.body ? (
                <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-slate-600">
                  {props.body}
                </p>
              ) : null}
              {ctaLabel && ctaHref ? (
                <div className="mt-6">
                  <Link
                    href={ctaHref}
                    className="inline-flex h-11 items-center gap-1.5 rounded-md border-2 px-6 text-sm font-semibold transition-colors"
                    style={{ borderColor: theme.navy, color: theme.navy }}
                  >
                    {ctaLabel}
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              ) : null}

              {stats.length ? (
                <div className="mt-8 flex flex-wrap gap-y-4 border-t border-slate-200 pt-6">
                  {stats.map((stat, index) => {
                    const StatIcon = [Users, Heart, Trophy, BookOpen][index % 4];
                    return (
                      <div
                        key={index}
                        className={"flex items-center gap-2.5 pr-6" + (index === 0 ? "" : " border-l border-slate-200 pl-6")}
                      >
                        <StatIcon className="size-6 shrink-0" style={{ color: theme.goldText }} />
                        <div>
                          <p
                            className="numeric text-2xl leading-tight font-bold"
                            style={{ ...heading, color: theme.navy }}
                          >
                            {stat[0]}
                          </p>
                          <p className="text-xs text-slate-500">{stat[1]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    case "gallery": {
      const images = parseRows(raw.images)
        .map((row) => row[0])
        .filter(Boolean);
      if (!images.length) return null;

      return (
        <section className="mx-auto max-w-6xl px-6 py-14">
          {props.heading ? (
            <h2
              className="mb-6 text-center text-3xl font-bold"
              style={{ ...heading, color: theme.navy }}
            >
              {props.heading}
            </h2>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={url}
                alt=""
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            ))}
          </div>
        </section>
      );
    }

    case "cards": {
      const rows = parseRows(raw.items, ["title", "description", "href", "imageUrl", "tag"]);
      if (!rows.length) return null;

      return (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow(props.eyebrow)}
            {props.heading ? (
              <h2
                className="text-3xl font-bold"
                style={{ ...heading, color: theme.navy }}
              >
                {props.heading}
              </h2>
            ) : null}
            {props.intro ? (
              <p className="mt-2 text-sm text-slate-500">{props.intro}</p>
            ) : null}
          </div>

          <div
            className="mt-8 grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
          >
            {rows.map((row, index) => {
              const [title, description, rawHref, imageUrl, tag] = row;
              const href = safeHref(rawHref ?? "");
              const body = (
                <article className="group h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div
                      className="flex aspect-[4/3] w-full items-center justify-center"
                      style={{ background: theme.cream }}
                    >
                      <GraduationCap className="size-8" style={{ color: theme.goldText }} />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-sm font-bold" style={{ color: theme.navy }}>
                      {title}
                    </h3>
                    {description ? (
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {description}
                      </p>
                    ) : null}
                    {tag ? (
                      <p
                        className="mt-2 text-xs font-semibold"
                        style={{ color: theme.goldText }}
                      >
                        {tag}
                      </p>
                    ) : null}
                  </div>
                </article>
              );

              return href ? (
                <Link key={index} href={href}>
                  {body}
                </Link>
              ) : (
                <div key={index}>{body}</div>
              );
            })}
          </div>

          {ctaLabel && ctaHref ? (
            <div className="mt-8 text-center">{navyButton(ctaLabel, ctaHref)}</div>
          ) : null}
        </section>
      );
    }

    case "stats": {
      const rows = parseRows(raw.items, ["value", "label"]);
      if (!rows.length) return null;

      return (
        <section style={{ background: theme.navy }}>
          <div className="mx-auto max-w-6xl px-6 py-12">
            {props.heading ? (
              <h2
                className="mb-8 text-center text-2xl font-bold text-white"
                style={heading}
              >
                {props.heading}
              </h2>
            ) : null}
            <div
              className="grid gap-8 text-center"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
            >
              {rows.map((row, index) => {
                const BandIcon = [GraduationCap, Users, Award, Trophy, BookOpen][index % 5];
                return (
                  <div key={index} className="flex items-center justify-center gap-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-full"
                      style={{ border: "1.5px solid rgb(255 255 255 / 0.3)", color: theme.gold }}
                    >
                      <BandIcon className="size-5" />
                    </span>
                    <div className="text-left">
                      <p
                        className="numeric text-3xl leading-tight font-bold"
                        style={{ ...heading, color: theme.gold }}
                      >
                        {row[0]}
                      </p>
                      <p className="text-xs text-white/70">{row[1]}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    case "quote":
      if (!props.quote) return null;
      return (
        <section style={{ background: theme.cream }}>
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <p
              className="text-6xl leading-none"
              style={{ ...heading, color: theme.gold }}
              aria-hidden
            >
              “
            </p>
            <blockquote
              className="text-xl leading-relaxed font-medium"
              style={{ ...heading, color: theme.navy }}
            >
              {props.quote}
            </blockquote>
            {props.attribution ? (
              <p className="mt-4 text-sm font-semibold" style={{ color: theme.goldText }}>
                — {props.attribution}
              </p>
            ) : null}
          </div>
        </section>
      );

    case "cta": {
      // With a photograph it is a split banner; without one, a navy band.
      if (props.imageUrl) {
        return (
          <section style={{ background: theme.cream }}>
            <div className="mx-auto grid max-w-6xl items-stretch gap-0 overflow-hidden px-6 py-16 lg:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={props.imageUrl}
                alt=""
                className="h-full max-h-96 w-full rounded-t-2xl object-cover lg:rounded-t-none lg:rounded-l-2xl"
              />
              <div className="flex flex-col justify-center rounded-b-2xl bg-white p-8 shadow-sm lg:rounded-b-none lg:rounded-r-2xl lg:p-12">
                {eyebrow(props.eyebrow)}
                <h2
                  className="text-3xl leading-tight font-bold"
                  style={{ ...heading, color: theme.navy }}
                >
                  {props.heading}
                </h2>
                {props.body ? (
                  <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                    {props.body}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  {goldButton(ctaLabel, ctaHref)}
                  {outlineButton(props.secondaryCtaLabel, safeHref(props.secondaryCtaHref))}
                </div>
              </div>
            </div>
          </section>
        );
      }

      return (
        <section className="px-6 py-14">
          <div
            className="mx-auto max-w-4xl rounded-3xl px-8 py-12 text-center"
            style={{ background: theme.navy }}
          >
            {props.eyebrow ? (
              <p
                className="mb-2 text-xs font-bold tracking-[0.2em] uppercase"
                style={{ color: theme.gold }}
              >
                {props.eyebrow}
              </p>
            ) : null}
            <h2 className="text-3xl font-bold text-white" style={heading}>
              {props.heading}
            </h2>
            {props.body ? (
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/75">{props.body}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {goldButton(ctaLabel, ctaHref)}
              {/* The catalogue offers a second button unconditionally, so the
                  band variant honours it too — white outline on the navy. */}
              {props.secondaryCtaLabel && safeHref(props.secondaryCtaHref) ? (
                <Link
                  href={safeHref(props.secondaryCtaHref)}
                  className="inline-flex h-11 items-center rounded-md border-2 border-white/70 px-6 text-sm font-semibold text-white transition-colors hover:border-white"
                >
                  {props.secondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      );
    }

    case "contact": {
      const details = [
        { icon: MapPin, value: props.address || contact?.address },
        { icon: Phone, value: props.phone || contact?.phone },
        { icon: Mail, value: props.email || contact?.email },
        { icon: Clock, value: props.hours },
      ].filter((entry) => entry.value);

      return (
        <section className="mx-auto max-w-4xl px-6 py-14">
          {props.heading ? (
            <h2
              className="mb-6 text-center text-3xl font-bold"
              style={{ ...heading, color: theme.navy }}
            >
              {props.heading}
            </h2>
          ) : null}
          <dl
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
          >
            {details.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: tint(theme.gold, 12), color: theme.goldText }}
                  >
                    <Icon className="size-4" />
                  </span>
                  <dd className="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">
                    {entry.value}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      );
    }

    case "news":
      return (
        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow(props.eyebrow)}
            {props.heading ? (
              <h2
                className="text-3xl font-bold"
                style={{ ...heading, color: theme.navy }}
              >
                {props.heading}
              </h2>
            ) : null}
          </div>
          {news.length ? (
            <div
              className="mt-8 grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
            >
              {news.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-xs font-semibold" style={{ color: theme.goldText }}>
                    {formatDate(item.publishedAt)}
                  </p>
                  <h3
                    className="mt-1 text-base font-bold"
                    style={{ color: theme.navy }}
                  >
                    {item.title}
                  </h3>
                  {item.summary ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                      {item.summary}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-slate-500">
              No announcements have been published yet.
            </p>
          )}
        </section>
      );

    case "admissionForm": {
      const levels = parseRows(raw.levels)
        .map((row) => row[0])
        .filter(Boolean);

      return (
        <section className="mx-auto max-w-3xl px-6 py-14">
          {props.heading ? (
            <h2
              className="mb-2 text-3xl font-bold"
              style={{ ...heading, color: theme.navy }}
            >
              {props.heading}
            </h2>
          ) : null}
          {props.intro ? (
            <p className="mb-6 text-sm text-slate-500">{props.intro}</p>
          ) : null}
          <EnquiryForm
            levels={levels.length ? levels : ["Nursery", "Primary", "JHS"]}
            thanks={
              props.thanks ||
              "Thank you — your enquiry has been received. The admissions office will contact you shortly."
            }
            accent={theme.primary}
          />
        </section>
      );
    }

    default:
      return null;
  }
}
