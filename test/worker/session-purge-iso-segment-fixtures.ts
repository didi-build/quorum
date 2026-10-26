/** Canonical 24-char base; each malformed value breaks exactly one `sessionTimestampIsoSqlMatch` check. */
export const SESSION_ISO_SEGMENT_MALFORMS: ReadonlyArray<{
  segment: string;
  expiresAt: string;
}> = [
  { segment: "separator-pos-5", expiresAt: "2020/01-15T12:30:45.678Z" },
  { segment: "separator-pos-8", expiresAt: "2020-01X15T12:30:45.678Z" },
  { segment: "separator-pos-11-T", expiresAt: "2020-01-15X12:30:45.678Z" },
  { segment: "separator-pos-14-colon", expiresAt: "2020-01-15T12X30:45.678Z" },
  { segment: "separator-pos-17-colon", expiresAt: "2020-01-15T12:30X45.678Z" },
  { segment: "separator-pos-20-dot", expiresAt: "2020-01-15T12:30:45X678Z" },
  { segment: "separator-pos-24-Z", expiresAt: "2020-01-15T12:30:45.678X" },
  { segment: "digit-glob-year", expiresAt: "202X-01-15T12:30:45.678Z" },
  { segment: "digit-glob-month", expiresAt: "2020-0X-15T12:30:45.678Z" },
  { segment: "digit-glob-day", expiresAt: "2020-01-1XT12:30:45.678Z" },
  { segment: "digit-glob-hour", expiresAt: "2020-01-15T1X:30:45.678Z" },
  { segment: "digit-glob-minute", expiresAt: "2020-01-15T12:3X:45.678Z" },
  { segment: "digit-glob-second", expiresAt: "2020-01-15T12:30:4X.678Z" },
  { segment: "digit-glob-millis", expiresAt: "2020-01-15T12:30:45.6X8Z" },
];

export const SESSION_ISO_SEGMENT_MALFORM_LENGTH = 24;
