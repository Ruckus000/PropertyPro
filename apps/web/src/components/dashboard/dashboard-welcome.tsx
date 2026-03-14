interface DashboardWelcomeProps {
  firstName: string;
  communityName: string;
}

export function DashboardWelcome({ firstName, communityName }: DashboardWelcomeProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-base text-gray-600">{communityName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-gray-900">Welcome back, {firstName}</h1>
      <p className="mt-2 text-base text-gray-700">
        Here are your latest announcements and upcoming meetings.
      </p>
    </section>
  );
}
