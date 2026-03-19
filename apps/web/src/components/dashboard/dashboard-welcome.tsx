interface DashboardWelcomeProps {
  firstName: string;
  communityName: string;
}

export function DashboardWelcome({ firstName, communityName }: DashboardWelcomeProps) {
  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <p className="text-base text-content-secondary">{communityName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-content">Welcome back, {firstName}</h1>
      <p className="mt-2 text-base text-content-secondary">
        Here are your latest announcements and upcoming meetings.
      </p>
    </section>
  );
}
