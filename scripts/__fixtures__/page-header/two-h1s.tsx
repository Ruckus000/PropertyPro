export default function TwoBranchPage({ ok }: { ok: boolean }) {
  if (!ok) {
    return <h1>Residents</h1>;
  }
  return (
    <section>
      <h1
        className="text-2xl"
      >
        Residents
      </h1>
    </section>
  );
}
