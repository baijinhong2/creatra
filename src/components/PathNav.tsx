export function PathNav({
 step,
 total,
 title,
}: {
 step: number;
 total: number;
 title: string;
}) {
 return (
 <div>
 <div className="mb-3 flex items-center gap-1.5">
 {Array.from({ length: total }).map((_, i) => (
 <div
 key={i}
 className={`h-1.5 flex-1 rounded-full ${
 i < step ?'bg-amber-400':'bg-zinc-200'}`}
 />
 ))}
 </div>
 <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
 </div>
 );
}
