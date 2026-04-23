export const registry = [
  {
    id: 'page-maintenance',
    // BAD: operations surface without communityId — this is the exact bug we're guarding against.
    href: '/maintenance/submit',
  },
];
