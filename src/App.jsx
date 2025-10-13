import React, {useEffect, useState, useCallback} from "react";

// EDHREC Commander Rank Guessing Game
// Single-file React component. Default export at bottom.
// Tailwind CSS assumed available in the host project.

// Behavior summary (how it works):
// 1. Fetch a JSON list of commanders from EDHREC's unofficial JSON pages endpoints.
// 2. Pick two distinct random commanders and fetch their card art from Scryfall.
// 3. Show both full-art images to the user. User guesses which has a higher (better) rank.
//    - EDHREC ranks: lower number is "higher" (Rank #1 is the top commander).
// 4. When guess is made, reveal ranks and update streak. Wrong guess resets streak to 0.

// NOTE: This component uses two external sources at runtime:
// - EDHREC JSON endpoint(s) (unofficial): e.g. https://json.edhrec.com/pages/commanders/year.json
// - Scryfall API for card images: https://api.scryfall.com/cards/named?exact=...
// Both are public but not guaranteed. The component includes basic fallbacks.

const EDHREC_COMMANDERS_LIST_URLS = [
  // Try these in order until one works
  "https://json.edhrec.com/pages/commanders/year.json",
  "https://json.edhrec.com/pages/commanders/year-past2years-1.json",
  "https://json.edhrec.com/pages/commanders/month.json",
  "https://json.edhrec.com/pages/commanders/week.json",
];

function useCommandersList() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function tryFetch() {
      setLoading(true);
      setError(null);
      for (const url of EDHREC_COMMANDERS_LIST_URLS) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const j = await res.json();
          // The JSON structure varies; try to extract slugs/names and ranks.
          // Many pages return an array 'items' or 'commanders' or 'panels'. We'll attempt a few heuristics.

          const commanders = extractCommandersFromEdhrecPage(j);
          if (commanders && commanders.length > 10) {
            if (!cancelled) {
              setList(commanders);
              setLoading(false);
            }
            return;
          }
        } catch (e) {
          // try next URL
        }
      }
      if (!cancelled) {
        setError("Failed to fetch commanders list from EDHREC JSON endpoints.");
        setLoading(false);
      }
    }
    tryFetch();
    return () => (cancelled = true);
  }, []);

  return {list, loading, error};
}

function extractCommandersFromEdhrecPage(json) {
  // Heuristics to extract commander list with their slug/name and rank if available.
  // Updated to handle EDHREC JSON with cardlists[0].cardviews[] structure.
  try {
    // EDHREC main commander list: json.container.json_dict.cardlists[0].cardviews[]
    if (
      json.container &&
      json.container.json_dict &&
      Array.isArray(json.container.json_dict.cardlists)
      && json.container.json_dict.cardlists[0]
      && Array.isArray(json.container.json_dict.cardlists[0].cardviews)
    ) {
      const arr = json.container.json_dict.cardlists[0].cardviews.map((c) => {
        // Use sanitized (slug), name, rank, num_decks
        return {
          slug: c.sanitized || c.sanitized_wo || slugify(c.name),
          name: c.name,
          rank: typeof c.rank === 'number' ? c.rank : (c.rank ? Number(c.rank) : undefined),
          num_decks: typeof c.num_decks === 'number' ? c.num_decks : (c.inclusion ? Number(c.inclusion) : undefined),
        };
      });
      if (arr.length) return arr;
    }

    // Fallbacks for other formats (legacy heuristics)
    if (Array.isArray(json)) {
      const arr = json
        .map((it) => {
          if (typeof it === "string") return { slug: it, name: it };
          if (it.slug || it.url || it.name) {
            return { slug: it.slug || it.url || it.name, name: it.name || it.slug || it.url };
          }
          return null;
        })
        .filter(Boolean);
      if (arr.length) return arr;
    }

    if (json.items && Array.isArray(json.items)) {
      const arr = json.items.map((it) => {
        if (typeof it === "string") return { slug: it, name: it };
        if (it.slug || it.url || it.name) {
          return { slug: it.slug || it.url || it.name, name: it.name || it.slug || it.url };
        }
        if (it.title) return { slug: slugify(it.title), name: it.title };
        return null;
      }).filter(Boolean);
      if (arr.length) return arr;
    }

    if (json.commanders && Array.isArray(json.commanders)) {
      const arr = json.commanders.map((c) => {
        if (typeof c === "string") return { slug: slugify(c), name: c };
        if (c.name) return { slug: slugify(c.name), name: c.name };
        return null;
      }).filter(Boolean);
      if (arr.length) return arr;
    }

    if (json.panels && json.panels.commanders && Array.isArray(json.panels.commanders)) {
      return json.panels.commanders.map((c) => ({ slug: c, name: c }));
    }
  } catch (e) {
    return null;
  }
  return null;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/["'!\?\(\):,\.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchScryfallArtForName(name) {
  // Use Scryfall named endpoint. If double-faced, pick first face art.
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Scryfall fetch failed");
  const j = await res.json();
  // Prefer art_crop when available; otherwise use large or normal.
  const getArt = (card) => {
    if (card.image_uris && card.image_uris.art_crop) return card.image_uris.art_crop;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris.art_crop)
      return card.card_faces[0].image_uris.art_crop;
    if (card.image_uris && card.image_uris.large) return card.image_uris.large;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris.large)
      return card.card_faces[0].image_uris.large;
    // Last resort use svg or png
    if (card.image_uris && card.image_uris.png) return card.image_uris.png;
    return null;
  };
  const art = getArt(j);
  return { art, scryfall: j };
}

function pickTwoDistinct(arr) {
  if (!arr || arr.length < 2) return null;
  const a = Math.floor(Math.random() * arr.length);
  let b = Math.floor(Math.random() * (arr.length - 1));
  if (b >= a) b += 1;
  return [arr[a], arr[b]];
}

export default function CommanderGuessGame() {
  const {list, loading, error} = useCommandersList();
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [leftMeta, setLeftMeta] = useState(null);
  const [rightMeta, setRightMeta] = useState(null);
  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState(null); // 'left' | 'right' | 'tie' | null
  const [loadingPair, setLoadingPair] = useState(false);

  const loadNewPair = useCallback(async () => {
    if (!list || list.length < 2) return;
    setResult(null);
    setLeftMeta(null);
    setRightMeta(null);
    setLoadingPair(true);
    // pick 2 distinct commander candidates
    const [c1, c2] = pickTwoDistinct(list);
    setLeft(c1);
    setRight(c2);
    // Fetch EDHREC JSON for each commander to read the rank if available
    try {
      const [lRank, rRank] = await Promise.all([
        fetchEdhrecCommanderRank(c1.slug || c1.name),
        fetchEdhrecCommanderRank(c2.slug || c2.name),
      ]);

      // Fetch scryfall art
      const [lArt, rArt] = await Promise.allSettled([
        fetchScryfallArtForName(c1.name || c1.slug),
        fetchScryfallArtForName(c2.name || c2.slug),
      ]);

      // Prefer rank from commander list (c1.rank/c2.rank), fallback to fetched rank
      setLeftMeta({
        rank: typeof c1.rank === 'number' ? c1.rank : (typeof lRank === 'number' ? lRank : null),
        art: lArt.status === 'fulfilled' ? lArt.value.art : null,
        scryfall: lArt.status === 'fulfilled' ? lArt.value.scryfall : null
      });
      setRightMeta({
        rank: typeof c2.rank === 'number' ? c2.rank : (typeof rRank === 'number' ? rRank : null),
        art: rArt.status === 'fulfilled' ? rArt.value.art : null,
        scryfall: rArt.status === 'fulfilled' ? rArt.value.scryfall : null
      });
    } catch (e) {
      // Ignore; we'll still show images if available
    } finally {
      setLoadingPair(false);
    }
  }, [list]);

  useEffect(() => {
    if (list && !left && !right) {
      loadNewPair();
    }
  }, [list, left, right, loadNewPair]);

  const makeGuess = async (side) => {
    if (!leftMeta || !rightMeta) return; // wait until ranks available
    // lower rank number = better. If rank missing for one, tie-break using deck counts if available.
    const lRank = typeof leftMeta.rank === 'number' ? leftMeta.rank : Number.POSITIVE_INFINITY;
    const rRank = typeof rightMeta.rank === 'number' ? rightMeta.rank : Number.POSITIVE_INFINITY;
    let correct = null;
    if (lRank === rRank) correct = 'tie';
    else if (lRank < rRank) correct = 'left';
    else correct = 'right';

    if (correct === side) {
      setStreak((s) => s + 1);
    } else if (correct === 'tie') {
      // treat tie as neither correct nor incorrect — do not change streak
    } else {
      setStreak(0);
    }
    setResult(correct);
  };

  const next = () => {
    setLeft(null);
    setRight(null);
    loadNewPair();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">Commander Rank Guess — EDHREC</h1>
      <p className="mb-4 text-slate-300 max-w-xl text-center">Guess which commander has a better rank on EDHREC. Ranks are revealed after guessing. Your streak increases for each correct guess and resets to 0 on a wrong guess.</p>

      <div className="mb-4 flex items-center gap-4">
        <div className="bg-slate-700 px-4 py-2 rounded">Streak: <span className="font-semibold">{streak}</span></div>
        <button className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500" onClick={() => { setStreak(0); }}>Reset Streak</button>
        <button className="px-3 py-2 rounded bg-green-600 hover:bg-green-500" onClick={() => next()}>New Pair</button>
      </div>

      {loading && <div className="text-slate-400">Loading commanders list...</div>}
      {error && <div className="text-red-400">{error}</div>}

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left */}
        <div className="bg-slate-900 rounded-lg p-4 flex flex-col items-center">
          <div className="w-full h-96 bg-black rounded overflow-hidden flex items-center justify-center">
            {leftMeta && leftMeta.art ? (
              // Use background image to cover and center art
              <img src={leftMeta.art} alt={left?.name || left?.slug} className="h-full object-cover w-full" />
            ) : (
              <div className="text-slate-500">{loadingPair ? 'Loading art...' : 'No art available'}</div>
            )}
          </div>
          <div className="w-full flex items-center justify-between mt-3">
            <div>
              <div className="font-semibold">{left?.name || left?.slug}</div>
              <div className="text-sm text-slate-400">{leftMeta && leftMeta.scryfall ? leftMeta.scryfall.set_name : ''}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => makeGuess('left')} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Pick</button>
              <div className="text-slate-300">{result ? (result === 'left' ? 'Correct' : (result === 'tie' ? 'Tie' : 'Wrong')) : ''}</div>
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-400">{result && leftMeta && (typeof leftMeta.rank === 'number' ? `Rank #${leftMeta.rank}` : 'Rank unavailable')}</div>
        </div>

        {/* Right */}
        <div className="bg-slate-900 rounded-lg p-4 flex flex-col items-center">
          <div className="w-full h-96 bg-black rounded overflow-hidden flex items-center justify-center">
            {rightMeta && rightMeta.art ? (
              <img src={rightMeta.art} alt={right?.name || right?.slug} className="h-full object-cover w-full" />
            ) : (
              <div className="text-slate-500">{loadingPair ? 'Loading art...' : 'No art available'}</div>
            )}
          </div>
          <div className="w-full flex items-center justify-between mt-3">
            <div>
              <div className="font-semibold">{right?.name || right?.slug}</div>
              <div className="text-sm text-slate-400">{rightMeta && rightMeta.scryfall ? rightMeta.scryfall.set_name : ''}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => makeGuess('right')} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Pick</button>
              <div className="text-slate-300">{result ? (result === 'right' ? 'Correct' : (result === 'tie' ? 'Tie' : 'Wrong')) : ''}</div>
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-400">{result && rightMeta && (typeof rightMeta.rank === 'number' ? `Rank #${rightMeta.rank}` : 'Rank unavailable')}</div>
        </div>
      </div>

      <div className="mt-6 text-sm text-slate-400 max-w-3xl text-center">When a commander lacks a rank in the EDHREC JSON, it will show "Rank unavailable" — in those cases the result may be decided as unavailable or tie. If you want deterministic behavior (e.g. only choose commanders with ranks), tweak the list filtering in useCommandersList.</div>

    </div>
  );
}

// Helper: fetch EDHREC commander JSON and parse rank
async function fetchEdhrecCommanderRank(slugOrName) {
  // Accept either a slug (like 'uril-the-miststalker') or a name. Prefer slug.
  const slug = slugOrName && slugOrName.includes("-") ? slugOrName : slugify(slugOrName || "");
  const urlsToTry = [
    `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}.json`,
    `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}-1.json`,
  ];
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const j = await res.json();
      // Look for rank in common locations
      if (j.rank) return Number(j.rank);
      if (j.stats && j.stats.rank) return Number(j.stats.rank);
      if (j.meta && j.meta.rank) return Number(j.meta.rank);
      // Some pages include panels or items with rank metadata
      if (j.items && Array.isArray(j.items)) {
        // items might be objects with title and rank -- attempt to find the commander item
        for (const it of j.items) {
          if (it && typeof it === 'object' && (it.rank || it.stats?.rank)) {
            return Number(it.rank || it.stats?.rank);
          }
        }
      }
    } catch (e) {
      // try next
    }
  }
  return null;
}