// Page provisoire : indique le ticket à réaliser. À SUPPRIMER au fil du développement.
export function Stub({
  title,
  ticket,
  description,
}: {
  title: string;
  ticket: string;
  description: string;
}) {
  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">À réaliser : {ticket}</p>
        <p className="mt-2">{description}</p>
      </div>
    </section>
  );
}
