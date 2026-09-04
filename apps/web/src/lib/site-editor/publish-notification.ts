/**
 * Shared limits for the publish-time resident notification (launch blocker #6).
 *
 * Deliberately dependency-free and separate from
 * `lib/services/site-publish-notification.ts`, which imports `@propertypro/db`.
 * The publish sheet is a `'use client'` component, so importing the constant
 * from the service would pull the database client into the browser bundle.
 */

/**
 * Longest summary a PM may attach to a publish.
 *
 * The summary becomes the announcement TITLE, which is the whole message in a
 * notification list and in most mail clients' preview line — so this is a
 * readability limit, not a storage one.
 */
export const SITE_PUBLISH_SUMMARY_MAX_LENGTH = 200;
