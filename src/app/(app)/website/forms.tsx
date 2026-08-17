"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";

import { ImageField } from "@/components/image-field";
import { SearchableSelect } from "@/components/select-search";
import { Alert, Button, CardBody, Field, Input, Textarea } from "@/components/ui";

import { createPageAction, updateSiteAction, type SiteState } from "./actions";

export type SiteValues = {
  id: string;
  name: string;
  nameCaption: string;
  tagline: string;
  domain: string;
  metaTitle: string;
  metaDescription: string;
  logoUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  googleAnalyticsId: string;
  primary: string;
  secondary: string;
  accent: string;
  wash: string;
  headingFont: string;
  address: string;
  phone: string;
  email: string;
  facebook: string;
  instagram: string;
  x: string;
  youtube: string;
};

export function SiteSettingsForm({ values }: { values: SiteValues }) {
  const [state, action] = useActionState<SiteState, FormData>(updateSiteAction, {});

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        <input type="hidden" name="id" value={values.id} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Site name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={values.name} required />
        </Field>

        <Field
          label="Name caption"
          htmlFor="nameCaption"
          hint="The small line under the school name in the header — e.g. INTERNATIONAL SCHOOL."
        >
          <Input id="nameCaption" name="nameCaption" defaultValue={values.nameCaption} />
        </Field>

        <Field
          label="Tagline"
          htmlFor="tagline"
          hint="Shown in the footer — e.g. Inspiring minds. Shaping futures."
        >
          <Input id="tagline" name="tagline" defaultValue={values.tagline} />
        </Field>

        <Field
          label="Custom domain"
          htmlFor="domain"
          hint="Leave blank to serve at /site."
        >
          <Input id="domain" name="domain" defaultValue={values.domain} placeholder="www.school.edu.gh" />
        </Field>

        {/* Four colours drive the whole public design: primary carries links,
            the deep colour paints bands and the footer, the highlight carries
            tags and the Apply button, and the wash sits behind alternating
            sections. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary colour" htmlFor="primary" hint="The admission enquiry form.">
            <Input id="primary" name="primary" defaultValue={values.primary} />
          </Field>
          <Field label="Deep colour" htmlFor="secondary" hint="Bands, headings, footer.">
            <Input id="secondary" name="secondary" defaultValue={values.secondary} />
          </Field>
          <Field label="Highlight" htmlFor="accent" hint="Tags and the Apply button.">
            <Input id="accent" name="accent" defaultValue={values.accent} />
          </Field>
          <Field label="Background wash" htmlFor="wash" hint="Behind soft sections.">
            <Input id="wash" name="wash" defaultValue={values.wash} />
          </Field>
        </div>

        <Field label="Heading style" htmlFor="headingFont">
          <SearchableSelect
            id="headingFont"
            name="headingFont"
            clearable={false}
            defaultValue={values.headingFont}
            options={[
              { value: "serif", label: "Serif — classic, collegiate" },
              { value: "sans", label: "Sans-serif — modern, plain" },
            ]}
          />
        </Field>

        {/* These load for visitors with no session, so they are uploaded to
            the media library rather than filed privately. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Logo" htmlFor="logoUrl">
            <ImageField id="logoUrl" name="logoUrl" defaultValue={values.logoUrl} />
          </Field>
          <Field label="Favicon" htmlFor="faviconUrl">
            <ImageField id="faviconUrl" name="faviconUrl" defaultValue={values.faviconUrl} />
          </Field>
        </div>

        <Field label="Search engine title" htmlFor="metaTitle">
          <Input id="metaTitle" name="metaTitle" defaultValue={values.metaTitle} />
        </Field>

        <Field
          label="Search engine description"
          htmlFor="metaDescription"
          hint="About 155 characters is what Google shows."
        >
          <Textarea
            id="metaDescription"
            name="metaDescription"
            rows={2}
            defaultValue={values.metaDescription}
          />
        </Field>

        <Field label="Sharing image" htmlFor="ogImageUrl" hint="Shown when a link is shared.">
          <Input id="ogImageUrl" name="ogImageUrl" defaultValue={values.ogImageUrl} />
        </Field>

        <Field label="Google Analytics ID" htmlFor="googleAnalyticsId">
          <Input
            id="googleAnalyticsId"
            name="googleAnalyticsId"
            defaultValue={values.googleAnalyticsId}
            placeholder="G-XXXXXXXXXX"
          />
        </Field>

        <Field label="Address" htmlFor="address">
          <Textarea id="address" name="address" rows={2} defaultValue={values.address} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values.phone} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" defaultValue={values.email} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Facebook" htmlFor="facebook">
            <Input id="facebook" name="facebook" defaultValue={values.facebook} />
          </Field>
          <Field label="Instagram" htmlFor="instagram">
            <Input id="instagram" name="instagram" defaultValue={values.instagram} />
          </Field>
          <Field label="X" htmlFor="x">
            <Input id="x" name="x" defaultValue={values.x} />
          </Field>
          <Field label="YouTube" htmlFor="youtube">
            <Input id="youtube" name="youtube" defaultValue={values.youtube} />
          </Field>
        </div>

        <SubmitButton icon="save" label="Save site settings" />
      </CardBody>
    </form>
  );
}

export function PageForm({ siteId }: { siteId: string }) {
  const [state, action] = useActionState<SiteState, FormData>(createPageAction, {});

  return (
    <form action={action}>
      <CardBody className="space-y-3">
        <input type="hidden" name="siteId" value={siteId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <Field label="Page title" htmlFor="title" required>
          <Input id="title" name="title" required placeholder="Admissions" />
        </Field>
        <Field label="Address" htmlFor="slug" hint="Derived from the title if blank.">
          <Input id="slug" name="slug" placeholder="admissions" />
        </Field>

        <SubmitButton icon="plus" label="Create page" />
      </CardBody>
    </form>
  );
}

function SubmitButton({ icon, label }: { icon: "save" | "plus"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {icon === "save" ? <Save className="size-4" /> : <Plus className="size-4" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}
