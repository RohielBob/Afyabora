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
    <section className="animate-enter flex max-w-3xl flex-col gap-4">
      <h1 className="text-[28px] font-bold tracking-[-0.5px] text-ink">{title}</h1>
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-5">
        <p className="text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
          À réaliser : {ticket}
        </p>
        <p className="mt-2 text-[15px] text-muted">{description}</p>
      </div>
    </section>
  );
}
