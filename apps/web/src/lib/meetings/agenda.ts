/**
 * A meeting's agenda: plain text, posted with the notice.
 *
 * §718.111(12)(g)2.m–n and §720.303(4)(b)1.l–m require the agenda to be posted
 * with the meeting notice. The API caps it here and the form reads the same cap,
 * so the field never accepts text the server will refuse.
 */
export const MEETING_AGENDA_MAX_LENGTH = 10_000;
