import Link from "next/link";

import { parseRows, type Block } from "@/lib/site-blocks";
import { formatDate } from "@/lib/utils";

export type NewsItem = { id: string; title: string; summary: string | null; publishedAt: Date | null };

/**
 * The public renderer for a page's blocks.
 *
 * Every value is rendered as text through JSX, never through
 * dangerouslySetInnerHTML. That is what keeps a school's public site safe from
 * whatever ends up typed into a content field.
 */
export function RenderBlock({ block, news }: { block: Block; news: NewsItem[] }) {
  const props = block.props ?? {};

  switch (block.type) {
    case "hero":
      return (
        <section
          className="relative flex min-h-[420px] items-center justify-center overflow-hidden px-6 py-24 text-center text-white"
          style={{
            background: props.imageUrl
              ? `linear-gradient(rgba(15,23,42,.62), rgba(15,23,42,.62)), url('${encodeURI(props.imageUrl)}') center/cover`
              : "linear-gradient(168deg,#3d7ae4,#2c66ce 42%,#1e4c9e 78%,#163a7a)",
          }}
        >
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              {props.heading}
            </h1>
            {props.subheading ? (
              <p className="mx-auto mt-4 max-w-xl text-base text-white/85 sm:text-lg">
                {props.subheading}
              </p>
            ) : null}
            {props.ctaLabel && props.ctaHref ? (
              <Link
                href={props.ctaHref}
                className="mt-7 inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-[#1e4c9e] transition-opacity hover:opacity-90"
              >
                {props.ctaLabel}
              </Link>
            ) : null}
          </div>
        </section>
      );

    case "richText":
      return (
        <section className="mx-auto max-w-3xl px-6 py-14">
          {props.heading ? (
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">
              {props.heading}
            </h2>
          ) : null}
          <div className="space-y-4 text-[15px] leading-relaxed text-[var(--text-muted)]">
            {(props.body ?? "").split(/\n{2,}/).filter(Boolean).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      );

    case "imageText": {
      const imageFirst = (props.imagePosition ?? "left").toLowerCase() !== "right";
      return (
        <section className="mx-auto grid max-w-5xl items-center gap-8 px-6 py-14 md:grid-cols-2">
          {props.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.imageUrl}
              alt={props.heading || ""}
              className={`w-full rounded-2xl object-cover ${imageFirst ? "" : "md:order-2"}`}
            />
          ) : null}
          <div>
            {props.heading ? (
              <h2 className="mb-3 text-2xl font-semibold tracking-tight">
                {props.heading}
              </h2>
            ) : null}
            <div className="space-y-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
              {(props.body ?? "").split(/\n{2,}/).filter(Boolean).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "gallery": {
      const images = (props.images ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      return (
        <section className="mx-auto max-w-6xl px-6 py-14">
          {props.heading ? (
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              {props.heading}
            </h2>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={src}
                alt=""
                className="aspect-4/3 w-full rounded-xl object-cover"
              />
            ))}
          </div>
        </section>
      );
    }

    case "cards": {
      const rows = parseRows(props.items);
      return (
        <section className="mx-auto max-w-6xl px-6 py-14">
          {props.heading ? (
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              {props.heading}
            </h2>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(([title, description, href], index) => {
              const inner = (
                <>
                  <h3 className="text-base font-semibold">{title}</h3>
                  {description ? (
                    <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                      {description}
                    </p>
                  ) : null}
                </>
              );

              return href ? (
                <Link
                  key={index}
                  href={href}
                  className="rounded-2xl border border-[var(--border)] p-5 transition-colors hover:border-[var(--primary)]"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={index}
                  className="rounded-2xl border border-[var(--border)] p-5"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    case "stats": {
      const rows = parseRows(props.items);
      return (
        <section className="bg-[var(--bg-subtle)] px-6 py-14">
          <div className="mx-auto max-w-5xl">
            {props.heading ? (
              <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">
                {props.heading}
              </h2>
            ) : null}
            <div className="grid gap-6 text-center sm:grid-cols-3">
              {rows.map(([value, label], index) => (
                <div key={index}>
                  <p className="numeric text-3xl font-semibold text-[var(--primary)] sm:text-4xl">
                    {value}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "quote":
      return (
        <section className="mx-auto max-w-3xl px-6 py-14 text-center">
          <blockquote className="text-xl leading-relaxed font-medium text-balance italic sm:text-2xl">
            &ldquo;{props.quote}&rdquo;
          </blockquote>
          {props.attribution ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              — {props.attribution}
            </p>
          ) : null}
        </section>
      );

    case "cta":
      return (
        <section className="px-6 py-14">
          <div className="mx-auto max-w-4xl rounded-3xl bg-[var(--primary)] px-8 py-12 text-center text-white">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {props.heading}
            </h2>
            {props.body ? (
              <p className="mx-auto mt-3 max-w-xl text-white/85">{props.body}</p>
            ) : null}
            {props.ctaLabel && props.ctaHref ? (
              <Link
                href={props.ctaHref}
                className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-[var(--primary)] hover:opacity-90"
              >
                {props.ctaLabel}
              </Link>
            ) : null}
          </div>
        </section>
      );

    case "contact":
      return (
        <section className="mx-auto max-w-4xl px-6 py-14">
          {props.heading ? (
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              {props.heading}
            </h2>
          ) : null}
          <dl className="grid gap-5 sm:grid-cols-2">
            {props.address ? (
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                  Address
                </dt>
                <dd className="mt-1 text-sm whitespace-pre-wrap">{props.address}</dd>
              </div>
            ) : null}
            {props.phone ? (
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                  Phone
                </dt>
                <dd className="mt-1 text-sm">
                  <a href={`tel:${props.phone}`} className="hover:underline">
                    {props.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {props.email ? (
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                  Email
                </dt>
                <dd className="mt-1 text-sm">
                  <a href={`mailto:${props.email}`} className="hover:underline">
                    {props.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {props.hours ? (
              <div>
                <dt className="text-xs font-medium tracking-wide text-[var(--text-subtle)] uppercase">
                  Opening hours
                </dt>
                <dd className="mt-1 text-sm">{props.hours}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      );

    case "news":
      return (
        <section className="mx-auto max-w-5xl px-6 py-14">
          {props.heading ? (
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">
              {props.heading}
            </h2>
          ) : null}
          {news.length ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {news.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--border)] p-5"
                >
                  <p className="text-xs text-[var(--text-subtle)]">
                    {formatDate(item.publishedAt)}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">{item.title}</h3>
                  {item.summary ? (
                    <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                      {item.summary}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No announcements have been published yet.
            </p>
          )}
        </section>
      );

    default:
      return null;
  }
}
