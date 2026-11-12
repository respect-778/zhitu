import {
  array, boolean, checked, enumeration, ensure, httpUrl, identifier, instant, isDate, isInstant,
  nonnegative, nullable, object, optional, text, type Infer,
} from './validation.ts';

export const EmploymentTypeSchema = enumeration(['internship', 'full_time', 'part_time', 'unknown']);
export const RecruitmentChannelSchema = enumeration(['campus', 'social', 'unknown']);
export const RecruitmentStatusSchema = enumeration(['open', 'closed', 'expired', 'unknown']);
export const VerificationStatusSchema = enumeration(['verified', 'pending', 'unreachable', 'parse_failed']);
export const VisibilitySchema = enumeration(['published', 'review', 'hidden']);
export const ApplicationMethodSchema = enumeration(['web_form', 'email', 'offline', 'instructions', 'unknown']);
export type EmploymentType = Infer<typeof EmploymentTypeSchema>;
export type RecruitmentChannel = Infer<typeof RecruitmentChannelSchema>;
export type RecruitmentStatus = Infer<typeof RecruitmentStatusSchema>;
export type VerificationStatus = Infer<typeof VerificationStatusSchema>;
export type Visibility = Infer<typeof VisibilitySchema>;

export const SourceConfigSchema = checked(object({
  sourceId: identifier, kind: enumeration(['enterprise', 'announcement']), adapter: identifier,
  entryUrl: httpUrl, allowedHosts: array(identifier, 1), scopeKey: identifier,
  recruitmentChannel: RecruitmentChannelSchema, company: nullable(text), enabled: boolean,
}), (source, path) => {
  for (const host of source.allowedHosts) {
    ensure(host.length <= 253 && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
      `${path}.allowedHosts`, 'expected lowercase exact hostnames without wildcards, schemes, or ports');
  }
  ensure(new Set(source.allowedHosts).size === source.allowedHosts.length, `${path}.allowedHosts`, 'duplicate host');
  ensure(source.allowedHosts.includes(new URL(source.entryUrl).hostname), `${path}.entryUrl`, 'entry hostname is outside allowedHosts');
});
export type SourceConfig = Infer<typeof SourceConfigSchema>;

// A null object means absent; a null value preserves an observed but unparsed raw date.
export const SourceDateSchema = checked(object({
  raw: text, value: nullable(text), precision: nullable(enumeration(['day', 'second'])), timezone: nullable(text),
}), (date, path) => {
  ensure((date.value === null) === (date.precision === null), path, 'value and precision must both be present or both null');
  if (date.precision === 'day') ensure(isDate(date.value!), `${path}.value`, 'expected a real YYYY-MM-DD date');
  if (date.precision === 'second') {
    ensure(isInstant(date.value!) && !date.value!.includes('.'), `${path}.value`, 'expected a timestamp at second precision');
  }
});
export type SourceDate = Infer<typeof SourceDateSchema>;

export const EvidenceSchema = object({
  sourceUrl: httpUrl, observedAt: instant, parserVersion: identifier,
  artifactId: optional(identifier), locator: optional(text),
});
export type Evidence = Infer<typeof EvidenceSchema>;
export const ReviewedMetadataSchema = object({
  batchId: identifier, industry: text, companyType: text, graduateYear: text, graduateStatus: text,
  graduateQuote: nullable(text),
  graduateSourceUrl: nullable(checked(httpUrl, (value, path) => {
    ensure(new URL(value).protocol === 'https:', path, 'expected an HTTPS URL');
  })),
});
export type ReviewedMetadata = Infer<typeof ReviewedMetadataSchema>;
const SalarySchema = checked(object({
  min: nullable(nonnegative), max: nullable(nonnegative), currency: identifier,
  period: enumeration(['hour', 'day', 'month', 'year']),
}), (salary, path) => {
  ensure(salary.min !== null || salary.max !== null, path, 'at least one salary bound is required');
  ensure(salary.min === null || salary.max === null || salary.min <= salary.max, path, 'salary min exceeds max');
  ensure(/^[A-Z]{3}$/.test(salary.currency), `${path}.currency`, 'expected a three-letter uppercase currency code');
});

export const JobReferenceSchema = object({ sourceId: identifier, sourceJobId: identifier, detailUrl: nullable(httpUrl) });
export type JobReference = Infer<typeof JobReferenceSchema>;
export const JobSchema = checked(object({
  sourceId: identifier, sourceJobId: identifier, company: text, title: text,
  employmentType: EmploymentTypeSchema, recruitmentChannel: RecruitmentChannelSchema,
  responsibilities: nullable(text), requirements: nullable(text), applicationInstructions: nullable(text),
  sourceUrl: httpUrl, detailUrl: nullable(httpUrl), applyUrl: nullable(httpUrl), applicationMethod: ApplicationMethodSchema,
  locationRaw: nullable(text), cityCodes: optional(array(identifier)), educationRaw: nullable(text),
  reviewedMetadata: optional(nullable(ReviewedMetadataSchema)),
  minimumDegree: optional(enumeration(['none', 'secondary', 'associate', 'bachelor', 'master', 'doctorate'])),
  salaryRaw: nullable(text), salary: optional(SalarySchema),
  publishedAt: nullable(SourceDateSchema), sourceUpdatedAt: nullable(SourceDateSchema), deadlineAt: nullable(SourceDateSchema),
  firstSeenAt: instant, lastSeenAt: instant, lastVerifiedAt: nullable(instant), closedAt: nullable(instant),
  recruitmentStatus: RecruitmentStatusSchema, verificationStatus: VerificationStatusSchema, visibility: VisibilitySchema,
  evidence: array(EvidenceSchema, 1),
}), (job, path) => {
  ensure(Date.parse(job.firstSeenAt) <= Date.parse(job.lastSeenAt), `${path}.lastSeenAt`, 'lastSeenAt precedes firstSeenAt');
  ensure(job.verificationStatus !== 'verified' || job.lastVerifiedAt !== null,
    `${path}.lastVerifiedAt`, 'verified records require the actual verification timestamp');
  ensure(job.recruitmentStatus !== 'open' || job.closedAt === null, `${path}.closedAt`, 'open records cannot retain closedAt');
  if (job.visibility === 'published') {
    ensure(!['closed', 'expired'].includes(job.recruitmentStatus), `${path}.visibility`, 'closed or expired jobs cannot be published');
    ensure(job.detailUrl !== null || job.applicationInstructions !== null, path, 'published jobs need details or application instructions');
  }
  ensure((job.applicationMethod === 'web_form') === (job.applyUrl !== null), `${path}.applyUrl`, 'web_form requires an explicit applyUrl; other methods use instructions');
  if (['email', 'offline', 'instructions'].includes(job.applicationMethod)) {
    ensure(job.applicationInstructions !== null, `${path}.applicationInstructions`, 'the application method requires source instructions');
  }
  ensure(job.salary === undefined || job.salaryRaw !== null, `${path}.salaryRaw`, 'normalized salary requires source wording');
  ensure(job.minimumDegree === undefined || job.educationRaw !== null, `${path}.educationRaw`, 'normalized degree requires source wording');
  ensure(!job.cityCodes?.length || job.locationRaw !== null, `${path}.locationRaw`, 'normalized cities require source wording');
});
export type Job = Infer<typeof JobSchema>;
