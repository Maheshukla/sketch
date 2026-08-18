export const CATEGORIES = [
  "Sketch", "Painting", "Crafting", "Design", "Animation", "Digital Art",
  "Handmade", "Events", "Wedding", "Gifts", "Supplies", "Software", "Templates",
];

export default function CategoryBar({ value, onChange }) {
  const active = value || "All";
  return (
    <div className="sticky top-16 z-40 -mx-4 sm:-mx-8 px-4 sm:px-8 bg-background/85 backdrop-blur-xl border-b border-border/60" data-testid="category-bar">
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-3">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            data-testid={`cat-${c.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => onChange(c === "All" ? "" : c)}
            className={`shrink-0 font-meta text-[10px] px-4 py-2 border transition-colors ${
              active === c
                ? "border-primary text-primary bg-primary/5"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
